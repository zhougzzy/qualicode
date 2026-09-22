import { z } from "zod";
import type { AxialCategory, AxialCategoryRole, CodeLabel, RelationHypothesis } from "@/lib/domain-types";

export const axialCategoryRoleSchema = z.enum(["phenomenon", "condition", "context", "strategy", "consequence", "interaction"]);
export const axialRelationSchema = z.enum(["condition", "process", "strategy", "consequence", "association"]);

const axialModelCategorySchema = z.object({
  role: axialCategoryRoleSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  codeIds: z.array(z.string()).max(20),
  evidenceQuotes: z.array(z.string().min(1)).max(8),
});

const axialModelRelationSchema = z.object({
  sourceCodeId: z.string().optional(),
  targetCodeId: z.string().optional(),
  relation: axialRelationSchema,
  statement: z.string().min(1),
  evidenceQuotes: z.array(z.string().min(1)).max(8),
  confidence: z.enum(["low", "medium", "high"]),
});

export const axialModelResponseSchema = z.object({
  categories: z.array(axialModelCategorySchema).max(20),
  relations: z.array(axialModelRelationSchema).max(30),
  counterEvidence: z.array(z.object({ quote: z.string().min(1), relevance: z.string().min(1) })).max(12),
  reviewQuestions: z.array(z.string().min(1)).max(12),
});

export function createAxialCodingPrompt(text: string, codes: CodeLabel[], researchQuestion?: string): string {
  const codeContext = codes.map((code) => ({
    id: code.id,
    label: code.name,
    sourceQuote: code.sourceQuote,
    editedQuote: code.editedQuote,
    explanation: code.explanation,
    confidence: code.confidence,
  }));
  return [
    "请基于已确认的开放编码完成扎根理论轴心编码。",
    "只输出 JSON，不要输出 Markdown、前言或未经证据支持的结论。",
    "轴心编码只能组织现有开放编码，不能修改访谈原文，也不能凭空创造开放编码 ID。",
    "将类别标记为 phenomenon、condition、context、strategy、consequence 或 interaction。",
    "关系只写成研究假设，不要表述为已验证的因果关系。relation 使用 condition、process、strategy、consequence 或 association。",
    "每个类别和关系尽量引用输入文本中的连续原文片段；无法逐字定位的内容仍可提出，但必须由服务端标记为待人工核对。",
    "反例要指出与主要模式不一致或需要进一步核对的原文片段。",
    researchQuestion ? "研究问题：" + researchQuestion : "",
    "JSON 格式：{\"categories\":[{\"role\":\"phenomenon|condition|context|strategy|consequence|interaction\",\"name\":\"类别\",\"description\":\"类别说明\",\"codeIds\":[\"开放编码 ID\"],\"evidenceQuotes\":[\"连续原文\"]}],\"relations\":[{\"sourceCodeId\":\"开放编码 ID\",\"targetCodeId\":\"开放编码 ID\",\"relation\":\"condition|process|strategy|consequence|association\",\"statement\":\"待确认关系假设\",\"evidenceQuotes\":[\"连续原文\"],\"confidence\":\"low|medium|high\"}],\"counterEvidence\":[{\"quote\":\"连续原文\",\"relevance\":\"为何构成反例或疑问\"}],\"reviewQuestions\":[\"研究者需要继续核对的问题\"]}",
    "已确认开放编码：",
    JSON.stringify(codeContext),
    "锁定访谈原文：",
    text,
  ].filter(Boolean).join("\n\n");
}

export function createAxialCategory(raw: { role: AxialCategoryRole; name: string; description: string; codeIds: string[]; evidenceIds: string[] }, index: number): AxialCategory {
  return {
    id: "axial-category-" + (index + 1),
    role: raw.role,
    name: raw.name.trim(),
    description: raw.description.trim(),
    codeIds: raw.codeIds,
    relationIds: [],
    evidenceIds: raw.evidenceIds,
  };
}

export function createRelation(raw: Omit<RelationHypothesis, "id" | "status">, index: number): RelationHypothesis {
  return {
    ...raw,
    id: "axial-relation-" + (index + 1),
    status: "hypothesis",
  };
}
