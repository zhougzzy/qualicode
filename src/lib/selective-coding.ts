import { z } from "zod";
import type {
  AxialAnalysis,
  CodeLabel,
  RelationHypothesis,
  SelectiveAnalysis,
  UnanchoredEvidence,
} from "@/lib/domain-types";

const relationKindSchema = z.enum(["condition", "process", "strategy", "consequence", "association"]);
const confidenceSchema = z.enum(["low", "medium", "high"]);
const evidenceSchema = z.object({
  id: z.string().min(1),
  chunkId: z.string().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quote: z.string().min(1),
  relevance: z.string(),
});

const axialCategorySchema = z.object({
  id: z.string().min(1),
  role: z.enum(["phenomenon", "condition", "context", "strategy", "consequence", "interaction"]),
  name: z.string().min(1),
  description: z.string().min(1),
  codeIds: z.array(z.string().min(1)).max(20),
  relationIds: z.array(z.string().min(1)).max(30),
  evidenceIds: z.array(z.string().min(1)).max(30),
});

const axialRelationSchema = z.object({
  id: z.string().min(1),
  sourceCodeId: z.string().min(1).optional(),
  targetCodeId: z.string().min(1).optional(),
  relation: relationKindSchema,
  statement: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).max(30),
  confidence: confidenceSchema,
  status: z.enum(["hypothesis", "confirmed", "rejected"]),
});

export const confirmedAxialAnalysisSchema = z.object({
  categories: z.array(axialCategorySchema).max(20),
  relations: z.array(axialRelationSchema).max(30),
  counterEvidence: z.array(evidenceSchema).max(20),
  reviewQuestions: z.array(z.string().min(1)).max(20),
  unanchoredEvidence: z.array(z.object({
    id: z.string().min(1),
    quote: z.string().min(1),
    relevance: z.string().min(1),
  })).max(20),
  generatedAt: z.string().min(1),
});

const selectiveRelationSchema = z.object({
  sourceCodeId: z.string().min(1).optional(),
  targetCodeId: z.string().min(1).optional(),
  relation: relationKindSchema,
  statement: z.string().min(1),
  evidenceQuotes: z.array(z.string().min(1)).max(8),
  confidence: confidenceSchema,
});

export const selectiveModelResponseSchema = z.object({
  coreCategory: z.string().min(1),
  storyline: z.string().min(1),
  propositions: z.array(z.string().min(1)).max(12),
  relationHypotheses: z.array(selectiveRelationSchema).max(20),
  supportingEvidenceQuotes: z.array(z.string().min(1)).max(12),
  contradictions: z.array(z.object({
    quote: z.string().min(1),
    relevance: z.string().min(1),
  })).max(12),
  reviewQuestions: z.array(z.string().min(1)).max(12),
});

export function createSelectiveCodingPrompt(
  text: string,
  codes: CodeLabel[],
  axialAnalysis: AxialAnalysis,
  researchQuestion?: string,
): string {
  const codeContext = codes.map((code) => ({
    id: code.id,
    label: code.name,
    sourceQuote: code.sourceQuote,
    editedQuote: code.editedQuote,
    explanation: code.explanation,
  }));
  const axialContext = {
    categories: axialAnalysis.categories,
    relations: axialAnalysis.relations,
    counterEvidence: axialAnalysis.counterEvidence,
    reviewQuestions: axialAnalysis.reviewQuestions,
  };

  return [
    "请基于已确认的开放编码和轴心编码完成扎根理论选择性编码。",
    "只输出 JSON，不要输出 Markdown、前言或已经验证的因果结论。",
    "核心类别必须是对当前材料的研究性概括，不要生成诊断或临床判断。",
    "理论故事线要清楚说明现象、条件、行动/互动策略和结果如何被组织起来；所有关系都只能写成待确认假设。",
    "命题是可供研究者继续比较和验证的工作命题，不是统计检验结果。",
    "relationHypotheses 中的 sourceCodeId 和 targetCodeId 只能使用输入的已确认开放编码 ID。",
    "每条支持证据、矛盾或反例都必须引用输入文本中的连续原文片段；无法逐字定位的片段由服务端标记为待人工核对。",
    researchQuestion ? "研究问题：" + researchQuestion : "",
    "JSON 格式：{\"coreCategory\":\"核心类别\",\"storyline\":\"理论故事线\",\"propositions\":[\"待验证命题\"],\"relationHypotheses\":[{\"sourceCodeId\":\"开放编码 ID\",\"targetCodeId\":\"开放编码 ID\",\"relation\":\"condition|process|strategy|consequence|association\",\"statement\":\"待确认关系假设\",\"evidenceQuotes\":[\"连续原文\"],\"confidence\":\"low|medium|high\"}],\"supportingEvidenceQuotes\":[\"连续原文\"],\"contradictions\":[{\"quote\":\"连续原文\",\"relevance\":\"为何构成矛盾或需要复核\"}],\"reviewQuestions\":[\"研究者需要继续核对的问题\"]}",
    "已确认开放编码：",
    JSON.stringify(codeContext),
    "已确认轴心编码：",
    JSON.stringify(axialContext),
    "锁定访谈原文：",
    text,
  ].filter(Boolean).join("\n\n");
}

export function createSelectiveRelation(
  raw: Omit<RelationHypothesis, "id" | "status">,
  index: number,
): RelationHypothesis {
  return {
    ...raw,
    id: "selective-relation-" + (index + 1),
    status: "hypothesis",
  };
}

export function createSelectiveAnalysis(
  raw: Omit<SelectiveAnalysis, "generatedAt">,
): SelectiveAnalysis {
  return {
    ...raw,
    generatedAt: new Date().toISOString(),
  };
}

export type SelectiveUnanchoredEvidence = UnanchoredEvidence;
