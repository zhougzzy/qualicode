import { z } from "zod";
import type { EvidenceSearchRequest, EvidenceSearchResponse } from "@/lib/api-contract";
import { enforceRateLimit, jsonError, jsonOk, requireAccess } from "@/lib/api-utils";
import { MAX_TEXT_LENGTH } from "@/lib/limits";
import { chunkText, retrieveEvidence } from "@/lib/rag";
import { createTextVersion } from "@/lib/text-version";

const requestSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  textLocked: z.literal(true),
  textVersion: z.string().min(1),
  query: z.string().min(1).max(500),
  topK: z.number().int().min(1).max(8).optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;
  const rateLimitError = enforceRateLimit(request, "evidence");
  if (rateLimitError) return rateLimitError;

  try {
    const payload = requestSchema.parse(await request.json()) as EvidenceSearchRequest;
    if (payload.textVersion !== createTextVersion(payload.text)) {
      return jsonError("TEXT_VERSION_MISMATCH", "文本版本不一致，请刷新当前会话后重试。", 409);
    }

    const chunks = chunkText(payload.text);
    const evidence = retrieveEvidence(payload.query, chunks, payload.topK ?? 5);
    return jsonOk<EvidenceSearchResponse>({ chunks, evidence });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("INVALID_REQUEST", "证据检索请求格式不正确。", 400);
    return jsonError("EVIDENCE_SEARCH_FAILED", "临时证据检索失败，请稍后重试。", 500);
  }
}
