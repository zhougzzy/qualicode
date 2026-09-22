import { z } from "zod";
import type { CodeLabel, TextSpan } from "@/lib/domain-types";
import type { CodingSuggestion } from "@/lib/api-contract";

export const codingSuggestionSchema = z.object({
  quote: z.string().min(1),
  label: z.string().min(1),
  explanation: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  needsManualSelection: z.boolean().optional(),
});

export const openCodingModelResponseSchema = z.object({
  suggestions: z.array(codingSuggestionSchema).max(30),
});

export function createOpenCodingPrompt(text: string, researchQuestion?: string): string {
  return [
    "请对下面的心理学访谈文本进行扎根理论的开放编码。",
    "只输出 JSON，不要输出 Markdown、前言或结论。",
    "每条建议必须对应一个连续、完整、可在输入文本中逐字找到的 quote。",
    "不要修正口语、错别字或标点；如果转写不通顺，也要按原文逐字复制 quote。",
    "标签应尽量简洁、贴近材料，不要直接生成轴心编码、因果结论或诊断。",
    "最多输出 12 条最有信息量的建议，避免对同一句话重复编码。",
    researchQuestion ? `研究问题：${researchQuestion}` : "",
    "JSON 格式：{\"suggestions\":[{\"quote\":\"原文连续片段\",\"label\":\"开放编码\",\"explanation\":\"编码依据\",\"confidence\":\"low|medium|high\"}]}",
    "访谈文本：",
    text,
  ].filter(Boolean).join("\n\n");
}

export function locateQuote(text: string, quote: string): TextSpan | null {
  const exactStart = text.indexOf(quote);
  if (exactStart >= 0) return { start: exactStart, end: exactStart + quote.length };

  const normalizedText = text.replace(/[ \t]+/g, " ");
  const normalizedQuote = quote.replace(/[ \t]+/g, " ");
  const normalizedStart = normalizedText.indexOf(normalizedQuote);
  if (normalizedStart < 0) return null;

  let sourceIndex = 0;
  let normalizedIndex = 0;
  let start = -1;
  let end = -1;
  while (sourceIndex < text.length && normalizedIndex < normalizedStart + normalizedQuote.length) {
    const sourceChar = text[sourceIndex];
    const normalizedChar = normalizedText[normalizedIndex];
    if (normalizedIndex === normalizedStart && start < 0) start = sourceIndex;
    if (sourceChar === normalizedChar) {
      sourceIndex += 1;
      normalizedIndex += 1;
      continue;
    }
    if (/\s/.test(sourceChar) && normalizedChar === " ") {
      while (sourceIndex < text.length && /\s/.test(text[sourceIndex])) sourceIndex += 1;
      normalizedIndex += 1;
      continue;
    }
    sourceIndex += 1;
  }
  end = sourceIndex;
  return start >= 0 && end > start ? { start, end } : null;
}

export function toCodeLabel(
  suggestion: CodingSuggestion,
  span: TextSpan,
  index: number,
): CodeLabel {
  return {
    id: `ai-code-${Date.now()}-${index}`,
    sourceQuote: suggestion.quote,
    sourceSpan: span,
    name: suggestion.label.trim(),
    kind: "open",
    status: "suggested",
    explanation: suggestion.explanation.trim(),
    confidence: suggestion.confidence,
    spans: [span],
    evidenceIds: [],
    editHistory: [],
  };
}

