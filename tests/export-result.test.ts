import { describe, expect, it } from "vitest";
import { buildJsonExport, buildMarkdownExport } from "@/lib/export-result";
import { createInitialSession } from "@/lib/state";

describe("result export", () => {
  it("exports confirmed text and analysis data as JSON", () => {
    const snapshot = createInitialSession();
    snapshot.confirmedText = "受访者：我会先答应下来。";
    snapshot.openCodes = [{
      id: "open-1",
      sourceQuote: "先答应下来",
      sourceSpan: { start: 9, end: 15 },
      name: "难以拒绝",
      kind: "open",
      status: "accepted",
      explanation: "描述了先答应再承担压力的行为。",
      confidence: "high",
      spans: [{ start: 9, end: 15 }],
      evidenceIds: [],
      editHistory: [],
    }];

    const exported = JSON.parse(buildJsonExport(snapshot, "2026-09-20T00:00:00.000Z"));
    expect(exported.confirmedText).toContain("先答应下来");
    expect(exported.openCodes[0].name).toBe("难以拒绝");
    expect(exported.privacyNotice).toContain("DeepSeek API");
  });

  it("exports a readable Markdown report with privacy limits", () => {
    const snapshot = createInitialSession();
    snapshot.confirmedText = "一段已确认的访谈文本";
    const exported = buildMarkdownExport(snapshot, "2026-09-20T00:00:00.000Z");

    expect(exported).toContain("# QualiCode 质性研究分析结果");
    expect(exported).toContain("一段已确认的访谈文本");
    expect(exported).toContain("## 隐私与研究限制");
    expect(exported).toContain("sessionStorage");
    expect(exported).toContain("仅包含已确认的研究结果");
  });

  it("does not include pending or deleted open-code suggestions", () => {
    const snapshot = createInitialSession();
    snapshot.openCodes = [
      { id: "accepted", sourceQuote: "原文", sourceSpan: { start: 0, end: 2 }, name: "已确认", kind: "open", status: "accepted", explanation: "", confidence: "medium", spans: [{ start: 0, end: 2 }], evidenceIds: [], editHistory: [] },
      { id: "suggested", sourceQuote: "建议", sourceSpan: { start: 2, end: 4 }, name: "待确认", kind: "open", status: "suggested", explanation: "", confidence: "low", spans: [{ start: 2, end: 4 }], evidenceIds: [], editHistory: [] },
      { id: "deleted", sourceQuote: "删除", sourceSpan: { start: 4, end: 6 }, name: "已删除", kind: "open", status: "deleted", explanation: "", confidence: "low", spans: [{ start: 4, end: 6 }], evidenceIds: [], editHistory: [] },
    ];

    const exported = JSON.parse(buildJsonExport(snapshot));
    expect(exported.openCodes.map((code: { id: string }) => code.id)).toEqual(["accepted"]);
    expect(exported.exportScope).toBe("confirmed-results-only");
  });

  it("only exports evidence referenced by confirmed results", () => {
    const snapshot = createInitialSession();
    snapshot.openCodes = [{ id: "accepted", sourceQuote: "原文", sourceSpan: { start: 0, end: 2 }, name: "已确认", kind: "open", status: "accepted", explanation: "", confidence: "medium", spans: [{ start: 0, end: 2 }], evidenceIds: ["evidence-1"], editHistory: [] }];
    snapshot.evidence = [
      { id: "evidence-1", start: 0, end: 2, quote: "原文", relevance: "已确认" },
      { id: "orphan-evidence", start: 2, end: 4, quote: "未确认片段", relevance: "不应导出" },
    ];

    const exported = JSON.parse(buildJsonExport(snapshot));
    expect(exported.evidence.map((item: { id: string }) => item.id)).toEqual(["evidence-1"]);
  });
});
