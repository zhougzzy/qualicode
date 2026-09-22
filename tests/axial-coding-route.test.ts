import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze/axial/route";
import { createTextVersion } from "@/lib/text-version";

const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalApiKey;
});

function requestFor(text: string, codes: unknown[], overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/analyze/axial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, textLocked: true, textVersion: createTextVersion(text), confirmedOpenCodes: codes, ...overrides }),
  });
}

function code(id: string, quote: string, start: number, status: "accepted" | "edited" = "accepted") {
  return { id, sourceQuote: quote, sourceSpan: { start, end: start + quote.length }, name: id, kind: "open", status, explanation: "依据", confidence: "medium", spans: [{ start, end: start + quote.length }], evidenceIds: [], editHistory: [] };
}

describe("POST /api/analyze/axial", () => {
  it("requires the server-side DeepSeek key", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const text = "受访者感到工作压力。";
    const response = await POST(requestFor(text, [code("open-1", "工作压力", 6)]));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DEEPSEEK_NOT_CONFIGURED");
  });

  it("rejects stale text versions before calling the model", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。";
    const response = await POST(requestFor(text, [code("open-1", "工作压力", 6)], { textVersion: "stale" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("TEXT_VERSION_MISMATCH");
  });

  it("rejects confirmed codes whose source quote is not in the locked text", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。";
    const response = await POST(requestFor(text, [code("open-1", "不存在的片段", 0)]));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("normalizes model categories, relations, and anchored evidence", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。后来她把事情列出来。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ categories: [{ role: "phenomenon", name: "压力体验", description: "工作压力被感知为持续负担。", codeIds: ["open-1"], evidenceQuotes: ["工作压力"] }], relations: [{ sourceCodeId: "open-1", relation: "strategy", statement: "压力体验可能促使受访者整理任务。", evidenceQuotes: ["把事情列出来"], confidence: "medium" }], counterEvidence: [{ quote: "不存在的反例", relevance: "需要人工核对" }], reviewQuestions: ["该策略是否在其他情境中也出现？"] }) } }], usage: { total_tokens: 20 } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(requestFor(text, [code("open-1", "工作压力", 6)]));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.analysis.categories[0].codeIds).toEqual(["open-1"]);
    expect(body.data.analysis.relations[0].status).toBe("hypothesis");
    expect(body.data.analysis.counterEvidence).toHaveLength(0);
    expect(body.data.analysis.unanchoredEvidence).toHaveLength(1);
    expect(body.data.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects suggested codes as unconfirmed input", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "原文片段。";
    const response = await POST(requestFor(text, [{ ...code("open-1", "原文片段", 0), status: "suggested" }]));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });
});
