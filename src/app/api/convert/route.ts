import { enforceRateLimit, jsonError, jsonOk, requireAccess } from "@/lib/api-utils";
import { DocumentParseError, parseUploadedFile, type UploadedFileLike } from "@/lib/document-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;
  const rateLimitError = enforceRateLimit(request, "convert");
  if (rateLimitError) return rateLimitError;

  try {
    const formData = await request.formData();
    const fileEntries = formData.getAll("file");

    if (fileEntries.length !== 1 || typeof fileEntries[0] === "string") {
      return jsonError("FILE_REQUIRED", "请一次上传一个 .docx 或文字型 .pdf 文件。", 400);
    }

    const file = fileEntries[0] as unknown as UploadedFileLike;
    if (!file.name || typeof file.arrayBuffer !== "function") {
      return jsonError("INVALID_FILE", "上传内容不是有效文件。", 400);
    }

    const result = await parseUploadedFile(file);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof DocumentParseError) {
      return jsonError(error.code, error.message, error.status);
    }
    return jsonError("CONVERT_FAILED", "文件转换失败，请稍后重试。", 500);
  }
}
