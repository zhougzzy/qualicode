import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze/selective/route";
import { createTextVersion } from "@/lib/text-version";

const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalApiKey;
});

function code(id: string, quote: string, text: string, status: "accepted" | "edited" = "accepted") {
  const start = text.indexOf(quote);
  return {
    id,
    sourceQuote: quote,
    sourceSpan: { start, end: start + quote.length },
    name: id,
    kind: "open",
    status,
    explanation: "依据",
    confidence: "medium",
    spans: [{ start, end: start + quote.length }],
    evidenceIds: [],
    editHistory: [],
  };
}

function axial(codeId: string, counterQuote: string) {
  return {
    categories: [{
      id: "category-1",
      role: "phenomenon",
      name: "压力体验",
      description: "受访者持续感知到工作压力。",
      codeIds: [codeId],
      relationIds: [],
      evidenceIds: [],
    }],
    relations: [],
    counterEvidence: [{ id: "counter-1", start: 0, end: counterQuote.length, quote: counterQuote, relevance: "需要复核" }],
    reviewQuestions: ["该模式是否持续出现？"],
    unanchoredEvidence: [],
    generatedAt: new Date().toISOString(),
  };
}

function requestFor(text: string, openCodes: unknown[], axialAnalysis: unknown, overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/analyze/selective", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      textLocked: true,
      textVersion: createTextVersion(text),
      confirmedOpenCodes: openCodes,
      confirmedAxialAnalysis: axialAnalysis,
      ...overrides,
    }),
  });
}

describe("POST /api/analyze/selective", () => {
  it("requires the server-side DeepSeek key", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const text = "受访者感到工作压力。";
    const response = await POST(requestFor(text, [code("open-1", "工作压力", text)], axial("open-1", "工作压力")));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DEEPSEEK_NOT_CONFIGURED");
  });

  it("rejects stale text versions before calling the model", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。";
    const response = await POST(requestFor(text, [code("open-1", "工作压力", text)], axial("open-1", "工作压力"), { textVersion: "stale" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("TEXT_VERSION_MISMATCH");
  });

  it("rejects confirmed codes whose source quote is not in the locked text", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。";
    const response = await POST(requestFor(text, [code("open-1", "不存在的片段", text)], axial("open-1", "工作压力")));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("rejects suggested open codes and invalid axial references", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。";
    const suggested = { ...code("open-1", "工作压力", text), status: "suggested" };
    const suggestedResponse = await POST(requestFor(text, [suggested], axial("open-1", "工作压力")));
    expect(suggestedResponse.status).toBe(400);
    expect((await suggestedResponse.json()).error.code).toBe("INVALID_REQUEST");

    const invalidAxial = axial("missing-code", "工作压力");
    const referenceResponse = await POST(requestFor(text, [code("open-1", "工作压力", text)], invalidAxial));
    expect(referenceResponse.status).toBe(400);
    expect((await referenceResponse.json()).error.message).toContain("未确认");
  });

  it("normalizes a selective result, anchors evidence, and limits the workflow to one model call", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。后来她把事情列出来，但仍担心评价。";
    const openCode = code("open-1", "工作压力", text);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        coreCategory: "在评价压力中恢复秩序",
        storyline: "工作压力和评价担忧可能推动受访者先整理任务，但这一过程仍需研究者核对。",
        propositions: ["当工作压力升高时，整理任务可能成为恢复秩序的策略。"],
        relationHypotheses: [{ sourceCodeId: "open-1", relation: "strategy", statement: "工作压力可能促使受访者整理任务。", evidenceQuotes: ["把事情列出来"], confidence: "medium" }],
        supportingEvidenceQuotes: ["工作压力", "把事情列出来"],
        contradictions: [{ quote: "不存在的反例", relevance: "模型提出但无法定位" }],
        reviewQuestions: ["整理任务是否降低了压力？"],
      }) } }],
      usage: { total_tokens: 40 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(requestFor(text, [openCode], axial("open-1", "工作压力")));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.analysis.coreCategory).toBe("在评价压力中恢复秩序");
    expect(body.data.analysis.relationHypotheses[0].status).toBe("hypothesis");
    expect(body.data.analysis.evidenceIds).toHaveLength(2);
    expect(body.data.analysis.contradictions).toHaveLength(0);
    expect(body.data.analysis.unanchoredEvidence).toHaveLength(1);
    expect(body.data.evidence).toHaveLength(2);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("keeps evidence references valid when model quotes overlap", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。后来她把事情列出来。";
    const openCode = code("open-1", "工作压力", text);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        coreCategory: "恢复秩序",
        storyline: "压力可能推动整理行动。",
        propositions: [],
        relationHypotheses: [{ sourceCodeId: "open-1", relation: "strategy", statement: "压力可能推动整理行动。", evidenceQuotes: ["工作压力"], confidence: "low" }],
        supportingEvidenceQuotes: ["工作压力"],
        contradictions: [{ quote: "工作压力", relevance: "同一片段需要作为反例重新核对" }],
        reviewQuestions: [],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(requestFor(text, [openCode], axial("open-1", "工作压力")));
    const body = await response.json();
    const evidenceIds = new Set(body.data.evidence.map((item: { id: string }) => item.id));
    expect(response.status).toBe(200);
    expect(body.data.evidence).toHaveLength(1);
    expect(body.data.analysis.evidenceIds.every((id: string) => evidenceIds.has(id))).toBe(true);
    expect(body.data.analysis.relationHypotheses[0].evidenceIds.every((id: string) => evidenceIds.has(id))).toBe(true);
    expect(body.data.analysis.contradictions[0].id).toBe(body.data.evidence[0].id);
  });

  it("rejects invalid model JSON", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者感到工作压力。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(requestFor(text, [code("open-1", "工作压力", text)], axial("open-1", "工作压力")));
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("DEEPSEEK_INVALID_JSON");
  });
});
