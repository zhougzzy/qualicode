import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze/open/route";
import { createTextVersion } from "@/lib/text-version";

const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalApiKey;
});

function createRequest(text: string, overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/analyze/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      textLocked: true,
      textVersion: createTextVersion(text),
      options: { maxSuggestions: 12, language: "zh-CN" },
      ...overrides,
    }),
  });
}

describe("POST /api/analyze/open", () => {
  it("returns a configuration error when DeepSeek is not configured", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const response = await POST(createRequest("访谈文本。"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("DEEPSEEK_NOT_CONFIGURED");
  });

  it("rejects a stale text version before calling DeepSeek", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const response = await POST(createRequest("访谈文本。", { textVersion: "stale-version" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("TEXT_VERSION_MISMATCH");
  });

  it("rejects non-JSON model output", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(createRequest("访谈文本。"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("DEEPSEEK_INVALID_JSON");
  });

  it("anchors matching quotes and separates quotes that cannot be located", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const text = "受访者说自己不敢拒绝同事，因为担心被评价。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: [
              {
                quote: "不敢拒绝同事",
                label: "拒绝困难",
                explanation: "受访者描述了难以拒绝他人的行为。",
                confidence: "high",
              },
              {
                quote: "模型概括出的片段",
                label: "外部评价担忧",
                explanation: "该建议无法在原文中逐字定位。",
                confidence: "medium",
              },
            ],
          }),
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(createRequest(text));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.suggestions).toHaveLength(1);
    expect(body.data.suggestions[0].name).toBe("拒绝困难");
    expect(body.data.suggestions[0].sourceQuote).toBe("不敢拒绝同事");
    expect(body.data.suggestions[0].evidenceIds).toHaveLength(1);
    expect(body.data.evidence).toHaveLength(1);
    expect(body.data.evidence[0].quote).toBe("不敢拒绝同事");
    expect(body.data.evidence[0].chunkId).toBeUndefined();
    expect(body.data.unanchoredSuggestions).toHaveLength(1);
    expect(body.data.unanchoredSuggestions[0].needsManualSelection).toBe(true);
  });
});
