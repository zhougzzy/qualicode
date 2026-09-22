import type {
  AxialAnalysis,
  CodeEdit,
  CodeLabel,
  Evidence,
  ParseWarning,
  SelectiveAnalysis,
  SessionSnapshot,
  SourceDocument,
  Stage,
} from "@/lib/domain-types";
import { createTextVersion } from "@/lib/text-version";
import { canTransition, getTransitionBlockReason } from "@/lib/state-machine";
import { isValidTextSpan } from "@/lib/span-anchoring";

export interface WorkspaceState extends SessionSnapshot {
  errorMessage: string | null;
}

export type WorkspaceAction =
  | { type: "hydrate"; snapshot: SessionSnapshot }
  | { type: "load-document"; document: SourceDocument; draftText: string; warnings: ParseWarning[] }
  | { type: "load-documents"; documents: SourceDocument[]; draftText: string; warnings: ParseWarning[] }
  | { type: "update-draft-text"; text: string }
  | { type: "confirm-text" }
  | { type: "add-open-code"; code: CodeLabel }
  | { type: "finish-open-coding" }
  | { type: "set-open-codes"; codes: CodeLabel[]; evidence?: Evidence[] }
  | { type: "accept-code"; codeId: string }
  | { type: "accept-all-open-codes" }
  | { type: "unaccept-all-open-codes" }
  | { type: "complete-open-coding" }
  | { type: "confirm-open-codes" }
  | { type: "edit-code"; codeId: string; edit: CodeEdit; editedQuote?: string; editedLabel?: string }
  | { type: "delete-code"; codeId: string }
  | { type: "restore-code"; codeId: string }
  | { type: "set-axial-analysis"; analysis: AxialAnalysis; evidence?: Evidence[] }
  | { type: "rename-axial-category"; categoryId: string; name: string }
  | { type: "move-code-to-axial-category"; codeId: string; categoryId: string }
  | { type: "confirm-axial" }
  | { type: "reopen-axial" }
  | { type: "set-selective-analysis"; analysis: SelectiveAnalysis; evidence?: Evidence[] }
  | { type: "confirm-selective" }
  | { type: "set-stage"; stage: Stage }
  | { type: "set-error"; message: string }
  | { type: "clear-error" };

function now(): string {
  return new Date().toISOString();
}

function mergeEvidence(existing: Evidence[], incoming: Evidence[]): Evidence[] {
  const byId = new Map<string, Evidence>();
  existing.forEach((item) => byId.set(item.id, item));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

export function createInitialSession(): WorkspaceState {
  return {
    schemaVersion: 1,
    sessionId: `session-${Date.now()}`,
    stage: "UPLOAD",
    document: null,
    documents: [],
    draftText: "",
    confirmedText: "",
    textVersion: "",
    textLocked: false,
    parseWarnings: [],
    openCodes: [],
    evidence: [],
    codeEditHistory: [],
    axialAnalysis: null,
    selectiveAnalysis: null,
    axialFreshness: { status: "fresh" },
    selectiveFreshness: { status: "fresh" },
    updatedAt: now(),
    errorMessage: null,
  };
}

export function createDemoSession(): WorkspaceState {
  const text =
    "研究者：最近一次让你感到压力比较大的经历是什么？\n受访者：其实主要是工作和家里两边都需要我。工作上不敢拒绝同事，回家以后又觉得没有时间陪伴家人。那段时间我经常先答应下来，后来才发现自己很累。\n研究者：你当时是怎么应对的？\n受访者：我会把事情一件件列出来，先处理最紧急的，但心里还是会担心别人觉得我不够好。";

  const document: SourceDocument = {
    id: "demo-interview",
    fileName: "demo-interview.txt",
    fileType: "docx",
    sizeBytes: text.length,
    rawExtractedText: text,
  };

  return {
    ...createInitialSession(),
    sessionId: "demo-session",
    stage: "TEXT_REVIEW",
    document,
    draftText: text,
    parseWarnings: [],
    updatedAt: now(),
  };
}

function withUpdated(state: WorkspaceState, changes: Partial<WorkspaceState>): WorkspaceState {
  return { ...state, ...changes, updatedAt: now(), errorMessage: null };
}

function withError(state: WorkspaceState, errorMessage: string): WorkspaceState {
  return { ...state, errorMessage };
}

function applyCodeEdit(state: WorkspaceState, action: Extract<WorkspaceAction, { type: "edit-code" }>): WorkspaceState {
  const code = state.openCodes.find((item) => item.id === action.codeId);
  if (!code) return withError(state, "未找到要修改的编码。");

  const updatedCode: CodeLabel = {
    ...code,
    editedQuote: action.editedQuote ?? code.editedQuote,
    name: action.editedLabel?.trim() || code.name,
    status: "edited",
    editHistory: [...code.editHistory, action.edit],
  };

  const invalidatesAxial = action.edit.invalidatedStages.includes("AXIAL");
  const invalidatesSelective = action.edit.invalidatedStages.includes("SELECTIVE");
  const editsOpenCodeAfterAxial = invalidatesAxial && ["AXIAL_CODING", "AXIAL_REVIEW", "SELECTIVE_CODING", "EXPORT"].includes(state.stage);

  return withUpdated(state, {
    stage: editsOpenCodeAfterAxial ? "OPEN_REVIEW" : state.stage,
    openCodes: state.openCodes.map((item) => (item.id === action.codeId ? updatedCode : item)),
    codeEditHistory: [...state.codeEditHistory, action.edit],
    axialFreshness: invalidatesAxial
      ? { status: "stale", invalidatedByEditId: action.edit.id }
      : state.axialFreshness,
    selectiveFreshness: invalidatesSelective
      ? { status: "stale", invalidatedByEditId: action.edit.id }
      : state.selectiveFreshness,
  });
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "hydrate":
      return {
        ...action.snapshot,
        documents: action.snapshot.documents?.length
          ? action.snapshot.documents
          : action.snapshot.document
            ? [action.snapshot.document]
            : [],
        evidence: mergeEvidence([], action.snapshot.evidence ?? []),
        errorMessage: null,
      };
    case "load-document":
      return withUpdated(state, {
        stage: "TEXT_REVIEW",
        document: action.document,
        documents: [action.document],
        draftText: action.draftText,
        confirmedText: "",
        textVersion: "",
        textLocked: false,
        parseWarnings: action.warnings,
        openCodes: [],
        evidence: [],
        codeEditHistory: [],
        axialAnalysis: null,
        selectiveAnalysis: null,
        axialFreshness: { status: "fresh" },
        selectiveFreshness: { status: "fresh" },
      });
    case "load-documents": {
      const firstDocument = action.documents[0] ?? null;
      return withUpdated(state, {
        stage: "TEXT_REVIEW",
        document: firstDocument,
        documents: action.documents,
        draftText: action.draftText,
        confirmedText: "",
        textVersion: "",
        textLocked: false,
        parseWarnings: action.warnings,
        openCodes: [],
        evidence: [],
        codeEditHistory: [],
        axialAnalysis: null,
        selectiveAnalysis: null,
        axialFreshness: { status: "fresh" },
        selectiveFreshness: { status: "fresh" },
      });
    }
    case "update-draft-text":
      if (state.textLocked) return withError(state, "文本已确认并锁定，不能再修改全文。");
      return withUpdated(state, { draftText: action.text });
    case "confirm-text":
      if (state.stage !== "TEXT_REVIEW") return withError(state, "当前阶段不能确认文本。");
      if (!state.draftText.trim()) return withError(state, "文本不能为空。");
      return withUpdated(state, {
        stage: "OPEN_CODING",
        confirmedText: state.draftText,
        textVersion: createTextVersion(state.draftText),
        textLocked: true,
      });
    case "add-open-code": {
      if (!state.textLocked || state.stage !== "OPEN_CODING") {
        return withError(state, "只有在文本锁定后的开放编码阶段才能新增编码。");
      }
      if (state.openCodes.some((code) => code.id === action.code.id)) {
        return withError(state, "该编码已经存在，请重新选择文本。");
      }
      const span = action.code.sourceSpan;
      if (
        action.code.kind !== "open" ||
        !isValidTextSpan(state.confirmedText, span) ||
        state.confirmedText.slice(span.start, span.end) !== action.code.sourceQuote ||
        action.code.spans.some((item) => !isValidTextSpan(state.confirmedText, item))
      ) {
        return withError(state, "编码原文必须来自当前锁定文本，且字符位置有效。");
      }
      return withUpdated(state, { openCodes: [...state.openCodes, action.code] });
    }
    case "finish-open-coding":
      if (state.stage !== "OPEN_CODING") return withError(state, "当前阶段不能完成开放编码。");
      if (!state.openCodes.some((code) => code.status !== "deleted")) {
        return withError(state, "至少需要一条未删除的开放编码。");
      }
      if (state.openCodes.some((code) => code.status === "suggested")) {
        return withError(state, "请先逐条接受、修改或删除开放编码建议。");
      }
      return withUpdated(state, { stage: "OPEN_REVIEW" });
    case "set-open-codes":
      if (!state.textLocked) return withError(state, "文本未锁定，不能保存开放编码。");
      return withUpdated(state, { openCodes: action.codes, evidence: mergeEvidence([], action.evidence ?? state.evidence) });
    case "accept-code":
      if (state.stage !== "OPEN_CODING" && state.stage !== "OPEN_REVIEW") {
        return withError(state, "当前阶段不能接受开放编码。");
      }
      if (!state.openCodes.some((code) => code.id === action.codeId)) {
        return withError(state, "未找到要接受的开放编码。");
      }
      return withUpdated(state, {
        openCodes: state.openCodes.map((code) => code.id === action.codeId && code.status === "suggested" ? { ...code, status: "accepted" } : code),
      });
    case "accept-all-open-codes":
      if (state.stage !== "OPEN_CODING" && state.stage !== "OPEN_REVIEW") {
        return withError(state, "当前阶段不能接受开放编码。");
      }
      return withUpdated(state, {
        openCodes: state.openCodes.map((code) => code.status === "suggested" ? { ...code, status: "accepted" } : code),
      });
    case "unaccept-all-open-codes":
      if (state.stage !== "OPEN_CODING" && state.stage !== "OPEN_REVIEW") {
        return withError(state, "当前阶段不能取消全部接受。");
      }
      return withUpdated(state, {
        openCodes: state.openCodes.map((code) => code.status === "accepted" ? { ...code, status: "suggested" } : code),
      });
    case "complete-open-coding":
      if (state.stage !== "OPEN_CODING") return withError(state, "当前阶段不能进入轴心编码。");
      if (!state.openCodes.some((code) => code.status !== "deleted")) {
        return withError(state, "至少需要一条未删除的开放编码。");
      }
      if (state.openCodes.some((code) => code.status === "suggested")) {
        return withError(state, "请先接受、修改或删除全部开放编码建议。");
      }
      return withUpdated(state, { stage: "AXIAL_CODING" });
    case "confirm-open-codes": {
      const reason = getTransitionBlockReason(state, "AXIAL_CODING");
      if (reason) return withError(state, reason);
      return withUpdated(state, { stage: "AXIAL_CODING" });
    }
    case "edit-code":
      return applyCodeEdit(state, action);
    case "delete-code":
      return withUpdated(state, {
        openCodes: state.openCodes.map((code) =>
          code.id === action.codeId ? { ...code, status: "deleted" } : code,
        ),
      });
    case "restore-code":
      return withUpdated(state, {
        openCodes: state.openCodes.map((code) =>
          code.id === action.codeId ? { ...code, status: "accepted" } : code,
        ),
      });
    case "set-axial-analysis":
      return withUpdated(state, {
        stage: "AXIAL_REVIEW",
        axialAnalysis: action.analysis,
        evidence: action.evidence ? mergeEvidence(state.evidence, action.evidence) : state.evidence,
        axialFreshness: { status: "fresh" },
      });
    case "rename-axial-category": {
      if (!state.axialAnalysis) return withError(state, "当前没有可以修改的轴心类别。");
      const name = action.name.trim();
      if (!name) return withError(state, "轴心类别名称不能为空。");
      if (!state.axialAnalysis.categories.some((category) => category.id === action.categoryId)) {
        return withError(state, "未找到要修改的轴心类别。");
      }
      const invalidationId = `axial-edit-${Date.now()}`;
      return withUpdated(state, {
        stage: state.stage === "SELECTIVE_CODING" || state.stage === "EXPORT" ? "AXIAL_REVIEW" : state.stage,
        axialAnalysis: {
          ...state.axialAnalysis,
          categories: state.axialAnalysis.categories.map((category) => category.id === action.categoryId ? { ...category, name } : category),
        },
        axialFreshness: { status: "stale", invalidatedByEditId: invalidationId },
        selectiveFreshness: { status: "stale", invalidatedByEditId: invalidationId },
      });
    }
    case "move-code-to-axial-category": {
      if (!state.axialAnalysis) return withError(state, "当前没有可以调整的轴心编码结果。");
      if (!state.openCodes.some((code) => code.id === action.codeId && code.status !== "deleted")) {
        return withError(state, "未找到要移动的开放编码。");
      }
      if (!state.axialAnalysis.categories.some((category) => category.id === action.categoryId)) {
        return withError(state, "未找到目标轴心类别。");
      }
      const invalidationId = `axial-edit-${Date.now()}`;
      return withUpdated(state, {
        stage: state.stage === "SELECTIVE_CODING" || state.stage === "EXPORT" ? "AXIAL_REVIEW" : state.stage,
        axialAnalysis: {
          ...state.axialAnalysis,
          categories: state.axialAnalysis.categories.map((category) => ({
            ...category,
            codeIds: category.id === action.categoryId
              ? Array.from(new Set([...category.codeIds, action.codeId]))
              : category.codeIds.filter((codeId) => codeId !== action.codeId),
          })),
        },
        axialFreshness: { status: "stale", invalidatedByEditId: invalidationId },
        selectiveFreshness: { status: "stale", invalidatedByEditId: invalidationId },
      });
    }
    case "confirm-axial":
      if (state.stage !== "AXIAL_REVIEW" || !state.axialAnalysis) {
        return withError(state, "当前没有可以确认的轴心编码结果。");
      }
      if (state.axialFreshness.status === "stale") {
        return withError(state, "轴心编码已过期，请重新生成后再确认。");
      }
      return withUpdated(state, { axialFreshness: { status: "confirmed" } });
    case "reopen-axial":
      if (state.axialFreshness.status !== "stale") {
        return withError(state, "当前轴心编码没有待重新生成的失效结果。");
      }
      return withUpdated(state, {
        stage: "AXIAL_CODING",
        axialAnalysis: null,
        selectiveAnalysis: null,
        selectiveFreshness: { status: "stale", invalidatedByEditId: state.axialFreshness.invalidatedByEditId },
      });
    case "set-selective-analysis":
      if (state.axialFreshness.status !== "confirmed") {
        return withError(state, "轴心编码尚未确认，不能生成选择性编码。");
      }
      return withUpdated(state, {
        stage: "SELECTIVE_CODING",
        selectiveAnalysis: action.analysis,
        evidence: action.evidence ? mergeEvidence(state.evidence, action.evidence) : state.evidence,
        selectiveFreshness: { status: "fresh" },
      });
    case "confirm-selective":
      if (state.stage !== "SELECTIVE_CODING" || !state.selectiveAnalysis) {
        return withError(state, "当前没有可以确认的选择性编码结果。");
      }
      if (state.selectiveFreshness.status === "stale") {
        return withError(state, "选择性编码已过期，请重新生成后再确认。");
      }
      return withUpdated(state, {
        stage: "EXPORT",
        selectiveFreshness: { status: "confirmed" },
      });
    case "set-stage":
      if (!canTransition(state, action.stage)) {
        return withError(state, getTransitionBlockReason(state, action.stage) ?? "当前阶段不能跳转。");
      }
      return withUpdated(state, { stage: action.stage });
    case "set-error":
      return withError(state, action.message);
    case "clear-error":
      return { ...state, errorMessage: null };
    default:
      return state;
  }
}
