import { z } from "zod";
import type { OpenCodingRequest, OpenCodingResult } from "@/lib/api-contract";
import type { Evidence } from "@/lib/domain-types";
import { enforceRateLimit, jsonError, jsonOk, requireAccess } from "@/lib/api-utils";
import { getServerConfig } from "@/lib/server-config";
import {
  createOpenCodingPrompt,
  locateQuote,
  openCodingModelResponseSchema,
  toCodeLabel,
} from "@/lib/open-coding";
import { createTextVersion } from "@/lib/text-version";
import { MAX_TEXT_LENGTH } from "@/lib/limits";

const requestSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  textLocked: z.literal(true),
  textVersion: z.string().min(1),
  researchQuestion: z.string().max(500).optional(),
  options: z.object({
    maxSuggestions: z.number().int().min(1).max(12).optional(),
    language: z.literal("zh-CN").optional(),
  }).optional(),
});

export const runtime = "nodejs";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  try {
    const payload = requestSchema.parse(await request.json()) as OpenCodingRequest;
    if (payload.textVersion !== createTextVersion(payload.text)) {
      return jsonError("TEXT_VERSION_MISMATCH", "文本版本不一致，请刷新当前会话后重试。", 409);
    }

    const { deepSeekApiKey } = getServerConfig();
    if (!deepSeekApiKey) {
      return jsonError("DEEPSEEK_NOT_CONFIGURED", "服务端尚未配置 DeepSeek API Key。请先配置 DEEPSEEK_API_KEY。", 503);
    }
    const rateLimitError = enforceRateLimit(request, "ai-open");
    if (rateLimitError) return rateLimitError;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepSeekApiKey}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "你是严谨的心理学质性研究助理。必须遵守用户给定的 JSON 格式和证据边界。",
            },
            { role: "user", content: createOpenCodingPrompt(payload.text, payload.researchQuestion) },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return jsonError("DEEPSEEK_REQUEST_FAILED", "DeepSeek 分析请求失败，请稍后重试。", response.status === 429 ? 429 : 502);
    }

    const responseBody = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = responseBody.choices?.[0]?.message?.content;
    if (!content) return jsonError("DEEPSEEK_EMPTY_RESPONSE", "DeepSeek 没有返回可用分析结果。", 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return jsonError("DEEPSEEK_INVALID_JSON", "DeepSeek 返回的结果不是有效 JSON。", 502);
    }

    const modelResult = openCodingModelResponseSchema.safeParse(parsed);
    if (!modelResult.success) {
      return jsonError("DEEPSEEK_INVALID_RESULT", "DeepSeek 返回的开放编码格式不符合要求。", 502);
    }

    const suggestions = modelResult.data.suggestions.slice(0, payload.options?.maxSuggestions ?? 12);
    const anchored: OpenCodingResult["suggestions"] = [];
    const evidence: Evidence[] = [];
    const unanchoredSuggestions = [];
    for (const [index, rawSuggestion] of suggestions.entries()) {
      const suggestion = { ...rawSuggestion, id: `suggestion-${index + 1}` };
      const span = locateQuote(payload.text, suggestion.quote);
      if (!span) {
        unanchoredSuggestions.push({ ...suggestion, id: `unanchored-${index + 1}`, needsManualSelection: true });
        continue;
      }
      const code = toCodeLabel(suggestion, span, index);
      const sourceEvidence: Evidence = {
        id: `evidence-${index + 1}-source`,
        start: span.start,
        end: span.end,
        quote: suggestion.quote,
        relevance: "开放编码的锁定原文证据",
      };
      // Open coding evidence must be directly traceable to the model-selected
      // quote. Do not present lexical RAG hits as supporting evidence here:
      // similar words in another chunk are not proof for this code.
      evidence.push(sourceEvidence);
      anchored.push({ ...code, evidenceIds: [sourceEvidence.id] });
    }

    return jsonOk<OpenCodingResult>({
      suggestions: anchored,
      unanchoredSuggestions,
      evidence,
      usage: {
        promptTokens: responseBody.usage?.prompt_tokens,
        completionTokens: responseBody.usage?.completion_tokens,
        totalTokens: responseBody.usage?.total_tokens,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("INVALID_REQUEST", "开放编码请求格式不正确。", 400);
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return jsonError("DEEPSEEK_TIMEOUT", "DeepSeek 分析超时，请稍后重试。", 504);
    }
    return jsonError("OPEN_CODING_FAILED", "开放编码分析失败，请稍后重试。", 500);
  }
}
