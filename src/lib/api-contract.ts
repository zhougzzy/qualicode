import type {
  AxialAnalysis,
  CodeEdit,
  CodeLabel,
  Evidence,
  EvidenceSearchResult,
  ParseWarning,
  RelationHypothesis,
  SelectiveAnalysis,
  Stage,
  TextChunk,
  SourceDocument,
  UnanchoredEvidence,
} from "@/lib/domain-types";

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
}

export interface ConvertResult {
  document: SourceDocument;
  rawExtractedText: string;
  warnings: ParseWarning[];
}

export interface CodeEditRequest {
  text: string;
  textVersion: string;
  codeId: string;
  originalQuote: string;
  editedQuote?: string;
  editedLabel?: string;
  currentStage: "OPEN_CODING" | "OPEN_REVIEW" | "AXIAL_REVIEW" | "SELECTIVE_CODING";
}

export interface CodeEditResult {
  code: CodeLabel;
  edit: CodeEdit;
  invalidatedStages: ("AXIAL" | "SELECTIVE")[];
  beforeStage: CodeEditRequest["currentStage"];
  analysisFreshness: {
    axial: "fresh" | "stale" | "confirmed";
    selective: "fresh" | "stale" | "confirmed";
  };
}

export interface AnalyzeRequestBase {
  text: string;
  textVersion: string;
}

export interface OpenCodingRequest extends AnalyzeRequestBase {
  textLocked: true;
  researchQuestion?: string;
  options?: {
    maxSuggestions?: number;
    language?: "zh-CN";
  };
}

export interface CodingSuggestion {
  id: string;
  quote: string;
  label: string;
  explanation: string;
  confidence: "low" | "medium" | "high";
  needsManualSelection?: boolean;
}

export interface OpenCodingResult {
  suggestions: CodeLabel[];
  unanchoredSuggestions: CodingSuggestion[];
  evidence: Evidence[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AxialCodingRequest extends AnalyzeRequestBase {
  textLocked: true;
  confirmedOpenCodes: CodeLabel[];
  researchQuestion?: string;
}

export interface AxialCodingResult {
  analysis: AxialAnalysis;
  evidence: Evidence[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface SelectiveCodingRequest extends AnalyzeRequestBase {
  textLocked: true;
  confirmedOpenCodes: CodeLabel[];
  confirmedAxialAnalysis: AxialAnalysis;
  researchQuestion?: string;
}

export interface SelectiveCodingResult {
  analysis: SelectiveAnalysis;
  evidence: Evidence[];
  unanchoredEvidence?: UnanchoredEvidence[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface EvidenceSearchRequest extends AnalyzeRequestBase {
  textLocked: true;
  query: string;
  topK?: number;
}

export interface EvidenceSearchResponse {
  chunks: TextChunk[];
  evidence: EvidenceSearchResult[];
}

export interface StageGateResult {
  allowed: boolean;
  currentStage: Stage;
  requiredStage: Stage;
}
