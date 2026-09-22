import { z } from "zod";
import type { CodeEditResult } from "@/lib/api-contract";
import { enforceRateLimit, jsonError, jsonOk, requireAccess } from "@/lib/api-utils";
import type { CodeEdit, CodeLabel } from "@/lib/domain-types";
import { createTextVersion } from "@/lib/text-version";

const requestSchema = z.object({
  text: z.string().min(1),
  textVersion: z.string().min(1),
  codeId: z.string().min(1),
  originalQuote: z.string().min(1),
  editedQuote: z.string().optional(),
  editedLabel: z.string().optional(),
  currentStage: z.enum(["OPEN_CODING", "OPEN_REVIEW", "AXIAL_REVIEW", "SELECTIVE_CODING"]),
});

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;
  const rateLimitError = enforceRateLimit(request, "codes-edit");
  if (rateLimitError) return rateLimitError;

  try {
    const payload = requestSchema.parse(await request.json());
    const expectedVersion = createTextVersion(payload.text);

    if (payload.textVersion !== expectedVersion) {
      return jsonError("TEXT_VERSION_MISMATCH", "文本版本不一致，请刷新当前会话后重试。", 409);
    }

    const start = payload.text.indexOf(payload.originalQuote);
    if (start < 0) {
      return jsonError("ORIGINAL_QUOTE_NOT_FOUND", "原文证据不在当前确认文本中，不能修改该编码。", 422);
    }

    if (payload.editedQuote && !payload.text.includes(payload.editedQuote)) {
      return jsonError("EDITED_QUOTE_NOT_FOUND", "修订片段必须来自当前确认文本，不能写入文本外的新证据。", 422);
    }

    const invalidatedStages: ("AXIAL" | "SELECTIVE")[] =
    payload.currentStage === "OPEN_CODING" || payload.currentStage === "OPEN_REVIEW"
      ? []
      : ["AXIAL", "SELECTIVE"];
    const editId = `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const edit: CodeEdit = {
      id: editId,
      codeId: payload.codeId,
      originalQuote: payload.originalQuote,
      editedQuote: payload.editedQuote,
      originalLabel: "待从当前会话补充",
      editedLabel: payload.editedLabel,
      editedAt: new Date().toISOString(),
      invalidatedStages,
      beforeStage: payload.currentStage,
    };

    const code: CodeLabel = {
      id: payload.codeId,
      sourceQuote: payload.originalQuote,
      editedQuote: payload.editedQuote,
      sourceSpan: { start, end: start + payload.originalQuote.length },
      name: payload.editedLabel?.trim() || "未命名开放编码",
      kind: "open",
      status: "edited",
      explanation: "该响应只负责验证原文证据和返回修订契约，真实会话状态由浏览器保存。",
      confidence: "medium",
      spans: [{ start, end: start + payload.originalQuote.length }],
      evidenceIds: [],
      editHistory: [edit],
    };

    const result: CodeEditResult = {
      code,
      edit,
      invalidatedStages,
      beforeStage: payload.currentStage,
      analysisFreshness: {
        axial: invalidatedStages.includes("AXIAL") ? "stale" : "fresh",
        selective: invalidatedStages.includes("SELECTIVE") ? "stale" : "fresh",
      },
    };

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("INVALID_REQUEST", "编码修订请求格式不正确。", 400);
    }
    return jsonError("INVALID_JSON", "无法读取请求内容。", 400);
  }
}
