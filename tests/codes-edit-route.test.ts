import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/codes/edit/route";
import { createTextVersion } from "@/lib/text-version";

describe("POST /api/codes/edit", () => {
  it("validates evidence against the locked text and returns stale metadata", async () => {
    const text = "受访者说自己不敢拒绝同事，因为担心被评价。";
    const response = await POST(
      new Request("http://localhost/api/codes/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          textVersion: createTextVersion(text),
          codeId: "code-1",
          originalQuote: "不敢拒绝同事",
          editedQuote: "担心被评价",
          editedLabel: "拒绝困难",
          currentStage: "AXIAL_REVIEW",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.invalidatedStages).toEqual(["AXIAL", "SELECTIVE"]);
    expect(body.data.code.sourceQuote).toBe("不敢拒绝同事");
  });

  it("rejects an evidence quote that is not in the locked text", async () => {
    const text = "原文只有这一句。";
    const response = await POST(
      new Request("http://localhost/api/codes/edit", {
        method: "POST",
        body: JSON.stringify({
          text,
          textVersion: createTextVersion(text),
          codeId: "code-1",
          originalQuote: "不存在的片段",
          currentStage: "OPEN_REVIEW",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("ORIGINAL_QUOTE_NOT_FOUND");
  });

  it("rejects a revised quote that is not in the locked text", async () => {
    const text = "原文只有这一句。";
    const response = await POST(
      new Request("http://localhost/api/codes/edit", {
        method: "POST",
        body: JSON.stringify({
          text,
          textVersion: createTextVersion(text),
          codeId: "code-1",
          originalQuote: "这一句",
          editedQuote: "模型新写的内容",
          currentStage: "OPEN_REVIEW",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("EDITED_QUOTE_NOT_FOUND");
  });

  it("does not invalidate downstream analyses while editing during open coding", async () => {
    const text = "原文片段。";
    const response = await POST(
      new Request("http://localhost/api/codes/edit", {
        method: "POST",
        body: JSON.stringify({
          text,
          textVersion: createTextVersion(text),
          codeId: "code-1",
          originalQuote: "原文片段",
          editedQuote: "原文片段",
          editedLabel: "新的开放编码",
          currentStage: "OPEN_CODING",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.invalidatedStages).toEqual([]);
    expect(body.data.analysisFreshness).toEqual({ axial: "fresh", selective: "fresh" });
  });
});
