import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/convert/route";

describe("POST /api/convert", () => {
  it("returns a structured conversion result for a DOCX upload", async () => {
    const bytes = await readFile(join(process.cwd(), "node_modules/mammoth/test/test-data/single-paragraph.docx"));
    const formData = new FormData();
    formData.append(
      "file",
      new File([bytes], "interview.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    const response = await POST(new Request("http://localhost/api/convert", { method: "POST", body: formData }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.document.fileType).toBe("docx");
    expect(body.data.rawExtractedText).toContain("Walking on imported air");
  });

  it("rejects requests without exactly one file", async () => {
    const response = await POST(
      new Request("http://localhost/api/convert", {
        method: "POST",
        body: new FormData(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("FILE_REQUIRED");
  });
});
