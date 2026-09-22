export type Stage =
  | "UPLOAD"
  | "TEXT_REVIEW"
  | "OPEN_CODING"
  | "OPEN_REVIEW"
  | "AXIAL_CODING"
  | "AXIAL_REVIEW"
  | "SELECTIVE_CODING"
  | "EXPORT";

export type FileType = "docx" | "pdf";
export type CodeKind = "open" | "axial" | "selective";
export type CodeStatus = "suggested" | "accepted" | "edited" | "deleted";
export type Confidence = "low" | "medium" | "high";
export type FreshnessStatus = "fresh" | "stale" | "confirmed";

export interface TextSpan {
  start: number;
  end: number;
}

export interface ParseWarning {
  code: string;
  message: string;
}

export interface SourceDocument {
  id: string;
  fileName: string;
  fileType: FileType;
  sizeBytes: number;
  pageCount?: number;
  rawExtractedText: string;
}

export interface Evidence {
  id: string;
  chunkId?: string;
  start: number;
  end: number;
  quote: string;
  relevance: string;
}

export interface TextChunk {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface EvidenceSearchResult extends Evidence {
  score: number;
}

export interface CodeEdit {
  id: string;
  codeId: string;
  originalQuote: string;
  editedQuote?: string;
  originalLabel: string;
  editedLabel?: string;
  editedAt: string;
  invalidatedStages: ("AXIAL" | "SELECTIVE")[];
  beforeStage: "OPEN_CODING" | "OPEN_REVIEW" | "AXIAL_REVIEW" | "SELECTIVE_CODING";
}

export interface CodeLabel {
  id: string;
  sourceQuote: string;
  editedQuote?: string;
  sourceSpan: TextSpan;
  name: string;
  kind: CodeKind;
  status: CodeStatus;
  explanation: string;
  confidence: Confidence;
  spans: TextSpan[];
  evidenceIds: string[];
  editHistory: CodeEdit[];
}

export interface AnalysisFreshness {
  status: FreshnessStatus;
  invalidatedByEditId?: string;
}

export interface RelationHypothesis {
  id: string;
  sourceCodeId?: string;
  targetCodeId?: string;
  relation: "condition" | "process" | "strategy" | "consequence" | "association";
  statement: string;
  evidenceIds: string[];
  confidence: Confidence;
  status: "hypothesis" | "confirmed" | "rejected";
}

export type AxialCategoryRole = "phenomenon" | "condition" | "context" | "strategy" | "consequence" | "interaction";

export interface UnanchoredEvidence {
  id: string;
  quote: string;
  relevance: string;
}

export interface AxialCategory {
  id: string;
  role: AxialCategoryRole;
  name: string;
  description: string;
  codeIds: string[];
  relationIds: string[];
  evidenceIds: string[];
}

export interface AxialAnalysis {
  categories: AxialCategory[];
  relations: RelationHypothesis[];
  counterEvidence: Evidence[];
  reviewQuestions: string[];
  unanchoredEvidence: UnanchoredEvidence[];
  generatedAt: string;
}

export interface SelectiveAnalysis {
  coreCategory: string;
  storyline: string;
  propositions: string[];
  evidenceIds: string[];
  relationHypotheses: RelationHypothesis[];
  contradictions: Evidence[];
  reviewQuestions: string[];
  unanchoredEvidence: UnanchoredEvidence[];
  generatedAt: string;
}

export interface SessionSnapshot {
  schemaVersion: 1;
  sessionId: string;
  stage: Stage;
  document: SourceDocument | null;
  documents: SourceDocument[];
  draftText: string;
  confirmedText: string;
  textVersion: string;
  textLocked: boolean;
  parseWarnings: ParseWarning[];
  openCodes: CodeLabel[];
  evidence: Evidence[];
  codeEditHistory: CodeEdit[];
  axialAnalysis: AxialAnalysis | null;
  selectiveAnalysis: SelectiveAnalysis | null;
  axialFreshness: AnalysisFreshness;
  selectiveFreshness: AnalysisFreshness;
  updatedAt: string;
}
