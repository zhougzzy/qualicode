import { z } from "zod";
import type { AxialCodingRequest, AxialCodingResult } from "@/lib/api-contract";
import type { AxialAnalysis, Evidence, UnanchoredEvidence } from "@/lib/domain-types";
import { enforceRateLimit, jsonError, jsonOk, requireAccess } from "@/lib/api-utils";
import { getServerConfig } from "@/lib/server-config";
import { MAX_TEXT_LENGTH } from "@/lib/limits";
import { createTextVersion } from "@/lib/text-version";
import { locateQuote } from "@/lib/open-coding";
import { chunkText, retrieveEvidence } from "@/lib/rag";
import {
  axialModelResponseSchema,
  createAxialCodingPrompt,
  createAxialCategory,
  createRelation,
} from "@/lib/axial-coding";

const requestSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  textLocked: z.literal(true),
  textVersion: z.string().min(1),
  confirmedOpenCodes: z.array(z.object({
    id: z.string().min(1),
    sourceQuote: z.string().min(1),
    editedQuote: z.string().optional(),
    sourceSpan: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
    name: z.string().min(1),
    kind: z.literal("open"),
    status: z.enum(["accepted", "edited"]),
    explanation: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    spans: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })),
    evidenceIds: z.array(z.string()),
    editHistory: z.array(z.unknown()),
  })).min(1).max(100),
  researchQuestion: z.string().max(500).optional(),
});

export const runtime = "nodejs";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function validateConfirmedOpenCodes(text: string, codes: AxialCodingRequest["confirmedOpenCodes"]): string | null {
  const ids = new Set<string>();
  for (const code of codes) {
    if (ids.has(code.id)) return "已确认开放编码不能包含重复 ID。";
    ids.add(code.id);
    if (code.sourceSpan.end <= code.sourceSpan.start || code.sourceSpan.end > text.length) {
      return "开放编码的原文位置超出锁定文本范围。";
    }
    if (!text.includes(code.sourceQuote)) {
      return "开放编码原文证据与锁定文本不一致。";
    }
    for (const span of code.spans) {
      if (span.end <= span.start || span.end > text.length || !text.slice(span.start, span.end)) {
        return "开放编码包含无效的原文位置。";
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  try {
    const payload = requestSchema.parse(await request.json()) as AxialCodingRequest;
    if (payload.textVersion !== createTextVersion(payload.text)) {
      return jsonError("TEXT_VERSION_MISMATCH", "文本版本不一致，请刷新当前会话后重试。", 409);
    }

    const codeValidationError = validateConfirmedOpenCodes(payload.text, payload.confirmedOpenCodes);
    if (codeValidationError) return jsonError("INVALID_REQUEST", codeValidationError, 400);

    const { deepSeekApiKey } = getServerConfig();
    if (!deepSeekApiKey) {
      return jsonError("DEEPSEEK_NOT_CONFIGURED", "服务端尚未配置 DeepSeek API Key。请先配置 DEEPSEEK_API_KEY。", 503);
    }
    const rateLimitError = enforceRateLimit(request, "ai-axial");
    if (rateLimitError) return rateLimitError;

    const codeIds = new Set(payload.confirmedOpenCodes.map((code) => code.id));
    const chunks = chunkText(payload.text);
    const retrievalQuery = payload.confirmedOpenCodes.map((code) => code.name + " " + code.sourceQuote).join(" ");
    const retrievedContext = retrieveEvidence(retrievalQuery, chunks, 8);
    const prompt = [
      createAxialCodingPrompt(payload.text, payload.confirmedOpenCodes, payload.researchQuestion),
      "临时证据上下文（只用于排序和核对，不替代原文）：",
      JSON.stringify(retrievedContext),
    ].join("\n\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + deepSeekApiKey },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你是严谨的心理学质性研究助理。轴心编码必须保留原文证据，并将关系表述为待确认假设。" },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return jsonError("DEEPSEEK_REQUEST_FAILED", "DeepSeek 轴心编码请求失败，请稍后重试。", response.status === 429 ? 429 : 502);
    const responseBody = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
    const content = responseBody.choices?.[0]?.message?.content;
    if (!content) return jsonError("DEEPSEEK_EMPTY_RESPONSE", "DeepSeek 没有返回可用的轴心编码结果。", 502);

    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return jsonError("DEEPSEEK_INVALID_JSON", "DeepSeek 返回的轴心编码结果不是有效 JSON。", 502); }
    const modelResult = axialModelResponseSchema.safeParse(parsed);
    if (!modelResult.success) return jsonError("DEEPSEEK_INVALID_RESULT", "DeepSeek 返回的轴心编码格式不符合要求。", 502);

    const evidence: Evidence[] = [];
    const evidenceByKey = new Map<string, Evidence>();
    const unanchoredEvidence: UnanchoredEvidence[] = [];
    const evidenceForQuotes = (quotes: string[], prefix: string, relevance: string): string[] => quotes.flatMap((quote, quoteIndex) => {
      const span = locateQuote(payload.text, quote);
      if (!span) {
        unanchoredEvidence.push({ id: prefix + "-unanchored-" + (quoteIndex + 1), quote, relevance });
        return [];
      }
      const key = span.start + ":" + span.end + ":" + quote;
      const item = evidenceByKey.get(key) ?? { id: prefix + "-evidence-" + (quoteIndex + 1), start: span.start, end: span.end, quote, relevance };
      if (!evidenceByKey.has(key)) {
        evidenceByKey.set(key, item);
        evidence.push(item);
      }
      return [item.id];
    });

    const categories = modelResult.data.categories.map((category, index) => {
      const validCodeIds = category.codeIds.filter((id) => codeIds.has(id));
      const evidenceIds = evidenceForQuotes(category.evidenceQuotes, "category-" + (index + 1), "轴心类别支持证据");
      return createAxialCategory({ ...category, codeIds: validCodeIds, evidenceIds }, index);
    });
    const relations = modelResult.data.relations.map((relation, index) => {
      const evidenceIds = evidenceForQuotes(relation.evidenceQuotes, "relation-" + (index + 1), "轴心关系支持证据");
      return createRelation({
        sourceCodeId: relation.sourceCodeId && codeIds.has(relation.sourceCodeId) ? relation.sourceCodeId : undefined,
        targetCodeId: relation.targetCodeId && codeIds.has(relation.targetCodeId) ? relation.targetCodeId : undefined,
        relation: relation.relation,
        statement: relation.statement.trim(),
        evidenceIds,
        confidence: relation.confidence,
      }, index);
    });
    categories.forEach((category) => {
      category.relationIds = relations.filter((relation) => category.codeIds.includes(relation.sourceCodeId ?? "") || category.codeIds.includes(relation.targetCodeId ?? "")).map((relation) => relation.id);
    });
    const counterEvidence = modelResult.data.counterEvidence.flatMap((item, index) => {
      const span = locateQuote(payload.text, item.quote);
      if (!span) {
        unanchoredEvidence.push({ id: "counter-unanchored-" + (index + 1), quote: item.quote, relevance: item.relevance });
        return [];
      }
      const key = span.start + ":" + span.end + ":" + item.quote;
      const evidenceItem = evidenceByKey.get(key) ?? { id: "counter-evidence-" + (index + 1), start: span.start, end: span.end, quote: item.quote, relevance: item.relevance };
      if (!evidenceByKey.has(key)) {
        evidenceByKey.set(key, evidenceItem);
        evidence.push(evidenceItem);
      }
      return [evidenceItem];
    });
    const analysis: AxialAnalysis = {
      categories,
      relations,
      counterEvidence,
      reviewQuestions: modelResult.data.reviewQuestions,
      unanchoredEvidence,
      generatedAt: new Date().toISOString(),
    };
    return jsonOk<AxialCodingResult>({ analysis, evidence, usage: { promptTokens: responseBody.usage?.prompt_tokens, completionTokens: responseBody.usage?.completion_tokens, totalTokens: responseBody.usage?.total_tokens } });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("INVALID_REQUEST", "轴心编码请求格式不正确。", 400);
    if (error instanceof DOMException && error.name === "AbortError") return jsonError("DEEPSEEK_TIMEOUT", "DeepSeek 轴心编码分析超时，请稍后重试。", 504);
    return jsonError("AXIAL_CODING_FAILED", "轴心编码分析失败，请稍后重试。", 500);
  }
}
