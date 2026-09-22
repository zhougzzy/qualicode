import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/evidence/search/route";
import { createTextVersion } from "@/lib/text-version";

describe("POST /api/evidence/search", () => {
  it("returns temporary chunks and top-k evidence without model access", async () => {
    const text = Array.from({ length: 8 }, (_, index) => "第" + (index + 1) + "段：工作压力和家人陪伴。").join("\n");
    const response = await POST(new Request("http://localhost/api/evidence/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        textLocked: true,
        textVersion: createTextVersion(text),
        query: "工作压力",
        topK: 3,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.chunks.length).toBeGreaterThan(0);
    expect(body.data.evidence.length).toBeGreaterThan(0);
    expect(body.data.evidence.length).toBeLessThanOrEqual(3);
  });

  it("rejects a stale locked-text version", async () => {
    const response = await POST(new Request("http://localhost/api/evidence/search", {
      method: "POST",
      body: JSON.stringify({ text: "原文", textLocked: true, textVersion: "stale", query: "原文" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("TEXT_VERSION_MISMATCH");
  });
});
