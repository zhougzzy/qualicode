import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DocumentParseError,
  normalizeExtractedText,
  parseUploadedFile,
  validateFileMetadata,
} from "@/lib/document-parser";

function asArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function uploadedFile(name: string, type: string, bytes: Buffer) {
  return {
    name,
    type,
    size: bytes.length,
    arrayBuffer: async () => asArrayBuffer(bytes),
  };
}

describe("document parser", () => {
  it("normalizes line endings and excessive blank lines without rewriting text", () => {
    expect(normalizeExtractedText("第一行\r\n\r\n\r\n第二行  \r第三行")).toBe("第一行\n\n第二行\n第三行");
  });

  it("extracts raw text from a DOCX file", async () => {
    const bytes = await readFile(join(process.cwd(), "node_modules/mammoth/test/test-data/single-paragraph.docx"));
    const result = await parseUploadedFile(
      uploadedFile(
        "interview.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes,
      ),
    );

    expect(result.document.fileType).toBe("docx");
    expect(result.document.rawExtractedText).toBe(result.rawExtractedText);
    expect(result.rawExtractedText.trim().length).toBeGreaterThan(0);
  });

  it("extracts text and page count from a text PDF", async () => {
    const bytes = await readFile(join(process.cwd(), "node_modules/pdf-parse/test/data/04-valid.pdf"));
    const result = await parseUploadedFile(uploadedFile("interview.pdf", "application/pdf", bytes));

    expect(result.document.fileType).toBe("pdf");
    expect(result.document.pageCount).toBeGreaterThan(0);
    expect(result.rawExtractedText.trim().length).toBeGreaterThan(0);
  });

  it("rejects unsupported file types, MIME mismatches, and oversized files", () => {
    expect(() => validateFileMetadata({ name: "interview.txt", type: "text/plain", size: 10 })).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_FILE_TYPE" }),
    );
    expect(() => validateFileMetadata({ name: "interview.pdf", type: "text/plain", size: 10 })).toThrowError(
      expect.objectContaining({ code: "MIME_TYPE_MISMATCH" }),
    );
    expect(() => validateFileMetadata({ name: "interview.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 })).toThrowError(
      expect.objectContaining({ code: "FILE_TOO_LARGE" }),
    );
  });

  it("rejects empty extracted text", async () => {
    const bytes = await readFile(join(process.cwd(), "node_modules/mammoth/test/test-data/empty.docx"));

    await expect(
      parseUploadedFile(
        uploadedFile(
          "empty.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          bytes,
        ),
      ),
    ).rejects.toEqual(expect.objectContaining({ code: "EMPTY_EXTRACTED_TEXT" } satisfies Partial<DocumentParseError>));
  });

  it("rejects a file whose actual bytes exceed the declared metadata size", async () => {
    const bytes = Buffer.alloc(10 * 1024 * 1024 + 1, 1);

    await expect(
      parseUploadedFile({
        name: "interview.pdf",
        type: "application/pdf",
        size: 1,
        arrayBuffer: async () => asArrayBuffer(bytes),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "FILE_TOO_LARGE" } satisfies Partial<DocumentParseError>));
  });
});
