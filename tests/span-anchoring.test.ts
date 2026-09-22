import { describe, expect, it } from "vitest";
import type { CodeLabel } from "@/lib/domain-types";
import { buildHighlightSegments, findTextSpan, isValidTextSpan } from "@/lib/span-anchoring";

function code(id: string, start: number, end: number): CodeLabel {
  return {
    id,
    sourceQuote: "",
    sourceSpan: { start, end },
    name: id,
    kind: "open",
    status: "accepted",
    explanation: "",
    confidence: "medium",
    spans: [{ start, end }],
    evidenceIds: [],
    editHistory: [],
  };
}

describe("text span anchoring", () => {
  it("finds UTF-16 character offsets without rewriting the source text", () => {
    const text = "第一句。受访者感到压力。";
    const span = findTextSpan(text, "受访者感到压力");

    expect(span).toEqual({ start: 4, end: 11 });
    expect(text.slice(span!.start, span!.end)).toBe("受访者感到压力");
    expect(isValidTextSpan(text, span!)).toBe(true);
  });

  it("splits overlapping ranges and keeps all code ids on the overlap", () => {
    const text = "abcdefghij";
    const segments = buildHighlightSegments(text, [code("code-a", 1, 6), code("code-b", 4, 9)]);

    expect(segments).toEqual([
      { start: 0, end: 1, text: "a", codeIds: [] },
      { start: 1, end: 4, text: "bcd", codeIds: ["code-a"] },
      { start: 4, end: 6, text: "ef", codeIds: ["code-a", "code-b"] },
      { start: 6, end: 9, text: "ghi", codeIds: ["code-b"] },
      { start: 9, end: 10, text: "j", codeIds: [] },
    ]);
  });

  it("does not render deleted codes as highlights", () => {
    const deleted = { ...code("deleted", 0, 3), status: "deleted" as const };
    expect(buildHighlightSegments("abcdef", [deleted])).toEqual([
      { start: 0, end: 6, text: "abcdef", codeIds: [] },
    ]);
  });
});

