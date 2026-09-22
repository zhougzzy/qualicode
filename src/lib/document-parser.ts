import { randomUUID } from "node:crypto";
import mammoth from "mammoth";
// Import the implementation directly. The package entry point runs a debug
// fixture when loaded by some CommonJS test runners.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { FileType, ParseWarning, SourceDocument } from "@/lib/domain-types";
import { MAX_FILE_SIZE_BYTES, MAX_TEXT_LENGTH } from "@/lib/limits";

const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const PDF_MIME_TYPES = new Set(["application/pdf"]);

export interface UploadedFileLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface DocumentParseResult {
  document: SourceDocument;
  rawExtractedText: string;
  warnings: ParseWarning[];
}

export class DocumentParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DocumentParseError";
  }
}

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateFileMetadata(file: Pick<UploadedFileLike, "name" | "type" | "size">): {
  fileType: FileType;
  warnings: ParseWarning[];
} {
  const fileName = file.name.trim();
  const lowerName = fileName.toLowerCase();
  const fileType: FileType | null = lowerName.endsWith(".docx")
    ? "docx"
    : lowerName.endsWith(".pdf")
      ? "pdf"
      : null;

  if (!fileName || !fileType) {
    throw new DocumentParseError("UNSUPPORTED_FILE_TYPE", "只支持 .docx 和文字型 .pdf 文件。", 415);
  }

  if (file.size <= 0) {
    throw new DocumentParseError("EMPTY_FILE", "上传文件为空，无法转换文本。", 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new DocumentParseError("FILE_TOO_LARGE", "文件超过 10 MB 大小限制。", 413);
  }

  const mimeType = file.type.trim().toLowerCase();
  const allowedMimeTypes = fileType === "docx" ? DOCX_MIME_TYPES : PDF_MIME_TYPES;
  const isGenericMime = mimeType === "" || mimeType === "application/octet-stream";
  if (!isGenericMime && !allowedMimeTypes.has(mimeType)) {
    throw new DocumentParseError("MIME_TYPE_MISMATCH", "文件扩展名与 MIME 类型不匹配。", 415);
  }

  const warnings: ParseWarning[] = [];
  if (isGenericMime) {
    warnings.push({
      code: "MIME_TYPE_UNSPECIFIED",
      message: "浏览器没有提供明确 MIME 类型，系统已根据文件扩展名继续解析。",
    });
  }

  return { fileType, warnings };
}

async function extractDocx(buffer: Buffer): Promise<{ text: string; warnings: ParseWarning[] }> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      warnings: result.messages.map((message) => ({
        code: `DOCX_${message.type.toUpperCase()}`,
        message: message.message,
      })),
    };
  } catch {
    throw new DocumentParseError("DOCX_PARSE_FAILED", "DOCX 文件无法解析，请确认文件没有损坏。", 422);
  }
}

async function extractPdf(buffer: Buffer): Promise<{ text: string; pageCount: number; warnings: ParseWarning[] }> {
  try {
    const result = await pdfParse(buffer);
    return {
      text: result.text,
      pageCount: result.numpages,
      warnings: [],
    };
  } catch {
    throw new DocumentParseError("PDF_PARSE_FAILED", "PDF 文件无法解析，请确认文件是文字型 PDF 且没有损坏。", 422);
  }
}

export async function parseUploadedFile(file: UploadedFileLike): Promise<DocumentParseResult> {
  const { fileType, warnings } = validateFileMetadata(file);
  let buffer: Buffer;

  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new DocumentParseError("FILE_READ_FAILED", "无法读取上传文件，请重试。", 400);
  }

  if (buffer.length === 0) {
    throw new DocumentParseError("EMPTY_FILE", "上传文件为空，无法转换文本。", 400);
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new DocumentParseError("FILE_TOO_LARGE", "文件超过 10 MB 大小限制。", 413);
  }

  let extractedText = "";
  let pageCount: number | undefined;

  if (fileType === "docx") {
    const result = await extractDocx(buffer);
    extractedText = result.text;
    warnings.push(...result.warnings);
  } else {
    const result = await extractPdf(buffer);
    extractedText = result.text;
    pageCount = result.pageCount;
    warnings.push(...result.warnings);
  }

  const normalizedText = normalizeExtractedText(extractedText);
  if (!normalizedText) {
    if (fileType === "pdf") {
      throw new DocumentParseError(
        "SCANNED_PDF_UNSUPPORTED",
        "该 PDF 没有可提取的文字，可能是扫描版 PDF。第一版不支持 OCR，请上传文字型 PDF。",
        422,
      );
    }
    throw new DocumentParseError("EMPTY_EXTRACTED_TEXT", "文件中没有可用文本，请检查文件内容。", 422);
  }

  if (normalizedText.length > MAX_TEXT_LENGTH) {
    throw new DocumentParseError("TEXT_TOO_LONG", "提取文本超过 50,000 字符限制，请拆分访谈材料。", 413);
  }

  const document: SourceDocument = {
    id: `document-${randomUUID()}`,
    fileName: file.name,
    fileType,
    sizeBytes: file.size,
    pageCount,
    rawExtractedText: normalizedText,
  };

  return {
    document,
    rawExtractedText: normalizedText,
    warnings,
  };
}
