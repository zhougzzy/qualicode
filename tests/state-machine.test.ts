import { describe, expect, it } from "vitest";
import { createDemoSession, createInitialSession, workspaceReducer } from "@/lib/state";
import { createTextVersion } from "@/lib/text-version";
import type { AxialAnalysis, CodeLabel } from "@/lib/domain-types";
import { canTransition, getTransitionBlockReason } from "@/lib/state-machine";

const demoCode: CodeLabel = {
  id: "code-1",
  sourceQuote: "原文片段",
  sourceSpan: { start: 0, end: 4 },
  name: "初始标签",
  kind: "open",
  status: "accepted",
  explanation: "解释",
  confidence: "medium",
  spans: [{ start: 0, end: 4 }],
  evidenceIds: [],
  editHistory: [],
};

const demoAxial: AxialAnalysis = {
  categories: [],
  relations: [],
  counterEvidence: [],
  reviewQuestions: [],
  unanchoredEvidence: [],
  generatedAt: new Date().toISOString(),
};

describe("QualiCode Sprint 0 state machine", () => {
  it("locks confirmedText and derives a text version", () => {
    const session = createDemoSession();
    const next = workspaceReducer(session, { type: "confirm-text" });

    expect(next.textLocked).toBe(true);
    expect(next.confirmedText).toBe(session.draftText);
    expect(next.textVersion).toBe(createTextVersion(session.draftText));
    expect(next.stage).toBe("OPEN_CODING");
  });

  it("rejects full-text edits after confirmation", () => {
    const session = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    const next = workspaceReducer(session, { type: "update-draft-text", text: "被篡改的全文" });

    expect(next.confirmedText).not.toBe("被篡改的全文");
    expect(next.draftText).toBe(session.draftText);
    expect(next.errorMessage).toContain("锁定");
  });

  it("blocks axial coding until open suggestions are confirmed", () => {
    let session = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    session = workspaceReducer(session, {
      type: "set-open-codes",
      codes: [{ ...demoCode, status: "suggested" }],
    });

    expect(canTransition(session, "AXIAL_CODING")).toBe(false);
    expect(getTransitionBlockReason(session, "AXIAL_CODING")).toContain("未确认");
  });

  it("marks downstream analyses stale when an upstream code changes", () => {
    let session = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    session = workspaceReducer(session, { type: "set-open-codes", codes: [demoCode] });
    session = workspaceReducer(session, { type: "finish-open-coding" });
    session = workspaceReducer(session, { type: "confirm-open-codes" });
    session = workspaceReducer(session, { type: "set-axial-analysis", analysis: demoAxial });
    session = workspaceReducer(session, { type: "confirm-axial" });

    const edit = {
      id: "edit-1",
      codeId: demoCode.id,
      originalQuote: demoCode.sourceQuote,
      editedQuote: "修订后的原文片段",
      originalLabel: demoCode.name,
      editedLabel: "修订标签",
      editedAt: new Date().toISOString(),
      invalidatedStages: ["AXIAL", "SELECTIVE"] as ("AXIAL" | "SELECTIVE")[],
      beforeStage: "AXIAL_REVIEW" as const,
    };
    const next = workspaceReducer(session, {
      type: "edit-code",
      codeId: demoCode.id,
      edit,
      editedQuote: edit.editedQuote,
      editedLabel: edit.editedLabel,
    });

    expect(next.confirmedText).toBe(session.confirmedText);
    expect(next.axialFreshness.status).toBe("stale");
    expect(next.selectiveFreshness.status).toBe("stale");
    expect(next.codeEditHistory).toHaveLength(1);
    expect(next.openCodes[0].editHistory).toHaveLength(1);
  });

  it("does not allow selective coding from stale axial analysis", () => {
    const session = createInitialSession();
    const staleSession = {
      ...session,
      stage: "AXIAL_REVIEW" as const,
      axialAnalysis: demoAxial,
      axialFreshness: { status: "stale" as const, invalidatedByEditId: "edit-1" },
    };

    expect(canTransition(staleSession, "SELECTIVE_CODING")).toBe(false);
  });

  it("requires confirmed axial analysis before selective coding and export", () => {
    const session = {
      ...createInitialSession(),
      stage: "AXIAL_REVIEW" as const,
      axialAnalysis: demoAxial,
      axialFreshness: { status: "confirmed" as const },
    };
    const selective = {
      coreCategory: "核心类别",
      storyline: "故事线",
      propositions: ["工作命题"],
      evidenceIds: [],
      relationHypotheses: [],
      contradictions: [],
      reviewQuestions: [],
      unanchoredEvidence: [],
      generatedAt: new Date().toISOString(),
    };
    const generated = workspaceReducer(session, { type: "set-selective-analysis", analysis: selective });
    expect(generated.stage).toBe("SELECTIVE_CODING");
    expect(generated.selectiveFreshness.status).toBe("fresh");
    expect(canTransition(generated, "EXPORT")).toBe(false);
    const confirmed = workspaceReducer(generated, { type: "confirm-selective" });
    expect(confirmed.stage).toBe("EXPORT");
    expect(confirmed.selectiveFreshness.status).toBe("confirmed");
  });

  it("blocks confirmation of stale selective analysis", () => {
    const session = {
      ...createInitialSession(),
      stage: "SELECTIVE_CODING" as const,
      selectiveAnalysis: {
        coreCategory: "核心类别",
        storyline: "故事线",
        propositions: [],
        evidenceIds: [],
        relationHypotheses: [],
        contradictions: [],
        reviewQuestions: [],
        unanchoredEvidence: [],
        generatedAt: new Date().toISOString(),
      },
      selectiveFreshness: { status: "stale" as const, invalidatedByEditId: "edit-1" },
    };
    const next = workspaceReducer(session, { type: "confirm-selective" });
    expect(next.stage).toBe("SELECTIVE_CODING");
    expect(next.errorMessage).toContain("过期");
  });

  it("returns to open review when a selective-stage code edit invalidates upstream analysis", () => {
    const session = {
      ...createInitialSession(),
      stage: "SELECTIVE_CODING" as const,
      axialAnalysis: demoAxial,
      axialFreshness: { status: "confirmed" as const },
      selectiveFreshness: { status: "fresh" as const },
    };
    const edit = {
      id: "edit-selective-1",
      codeId: demoCode.id,
      originalQuote: demoCode.sourceQuote,
      editedQuote: demoCode.sourceQuote,
      originalLabel: demoCode.name,
      editedLabel: "修订标签",
      editedAt: new Date().toISOString(),
      invalidatedStages: ["AXIAL", "SELECTIVE"] as ("AXIAL" | "SELECTIVE")[],
      beforeStage: "SELECTIVE_CODING" as const,
    };
    const next = workspaceReducer({ ...session, openCodes: [demoCode] }, {
      type: "edit-code",
      codeId: demoCode.id,
      edit,
      editedQuote: edit.editedQuote,
      editedLabel: edit.editedLabel,
    });
    expect(next.stage).toBe("OPEN_REVIEW");
    expect(next.axialFreshness.status).toBe("stale");
    expect(next.selectiveFreshness.status).toBe("stale");
  });

  it("returns to open review when an axial-stage code edit invalidates upstream analysis", () => {
    const session = {
      ...createInitialSession(),
      stage: "AXIAL_REVIEW" as const,
      openCodes: [demoCode],
      axialAnalysis: demoAxial,
      axialFreshness: { status: "confirmed" as const },
      selectiveFreshness: { status: "confirmed" as const },
    };
    const edit = {
      id: "edit-axial-1",
      codeId: demoCode.id,
      originalQuote: demoCode.sourceQuote,
      editedQuote: demoCode.sourceQuote,
      originalLabel: demoCode.name,
      editedLabel: "轴心阶段修订标签",
      editedAt: new Date().toISOString(),
      invalidatedStages: ["AXIAL", "SELECTIVE"] as ("AXIAL" | "SELECTIVE")[],
      beforeStage: "AXIAL_REVIEW" as const,
    };

    const next = workspaceReducer(session, {
      type: "edit-code",
      codeId: demoCode.id,
      edit,
      editedQuote: edit.editedQuote,
      editedLabel: edit.editedLabel,
    });

    expect(next.stage).toBe("OPEN_REVIEW");
    expect(next.axialFreshness.status).toBe("stale");
    expect(next.selectiveFreshness.status).toBe("stale");
  });

  it("allows researchers to rename categories and move codes while invalidating downstream analysis", () => {
    const axialWithCategories: AxialAnalysis = {
      ...demoAxial,
      categories: [
        { id: "category-1", role: "phenomenon", name: "原类别", description: "描述", codeIds: [demoCode.id], relationIds: [], evidenceIds: [] },
        { id: "category-2", role: "strategy", name: "目标类别", description: "描述", codeIds: [], relationIds: [], evidenceIds: [] },
      ],
    };
    const session = {
      ...createInitialSession(),
      stage: "AXIAL_REVIEW" as const,
      openCodes: [demoCode],
      axialAnalysis: axialWithCategories,
      axialFreshness: { status: "confirmed" as const },
      selectiveFreshness: { status: "confirmed" as const },
    };

    const renamed = workspaceReducer(session, { type: "rename-axial-category", categoryId: "category-1", name: "修订类别" });
    expect(renamed.axialAnalysis?.categories[0].name).toBe("修订类别");
    expect(renamed.axialFreshness.status).toBe("stale");
    expect(renamed.selectiveFreshness.status).toBe("stale");

    const moved = workspaceReducer(renamed, { type: "move-code-to-axial-category", codeId: demoCode.id, categoryId: "category-2" });
    expect(moved.axialAnalysis?.categories[0].codeIds).toEqual([]);
    expect(moved.axialAnalysis?.categories[1].codeIds).toEqual([demoCode.id]);
    expect(moved.axialFreshness.status).toBe("stale");
  });

  it("reopens axial coding after an upstream edit invalidates the result", () => {
    const session = {
      ...createInitialSession(),
      stage: "AXIAL_REVIEW" as const,
      axialAnalysis: demoAxial,
      axialFreshness: { status: "stale" as const, invalidatedByEditId: "edit-1" },
      selectiveAnalysis: {
        coreCategory: "旧结果",
        storyline: "旧结果",
        propositions: [],
        evidenceIds: [],
        relationHypotheses: [],
        contradictions: [],
        reviewQuestions: [],
        unanchoredEvidence: [],
        generatedAt: new Date().toISOString(),
      },
      selectiveFreshness: { status: "stale" as const, invalidatedByEditId: "edit-1" },
    };

    const next = workspaceReducer(session, { type: "reopen-axial" });

    expect(next.stage).toBe("AXIAL_CODING");
    expect(next.axialAnalysis).toBeNull();
    expect(next.selectiveAnalysis).toBeNull();
    expect(next.selectiveFreshness.status).toBe("stale");
  });

  it("accepts a manual open code only when its quote and span match locked text", () => {
    const base = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    const quote = "工作上不敢拒绝同事";
    const start = base.confirmedText.indexOf(quote);
    const manualCode: CodeLabel = {
      ...demoCode,
      id: "manual-code",
      sourceQuote: quote,
      sourceSpan: { start, end: start + quote.length },
      spans: [{ start, end: start + quote.length }],
    };
    const next = workspaceReducer(base, { type: "add-open-code", code: manualCode });

    expect(next.openCodes).toHaveLength(1);
    expect(next.openCodes[0].sourceQuote).toBe(quote);
    expect(next.errorMessage).toBeNull();
  });

  it("blocks invalid manual evidence and requires a usable code before review", () => {
    const base = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    const invalidCode: CodeLabel = {
      ...demoCode,
      id: "invalid-code",
      sourceQuote: "不在文本中的内容",
      sourceSpan: { start: 0, end: 7 },
      spans: [{ start: 0, end: 7 }],
    };
    const rejected = workspaceReducer(base, { type: "add-open-code", code: invalidCode });
    expect(rejected.openCodes).toHaveLength(0);
    expect(rejected.errorMessage).toContain("锁定文本");

    const emptyFinish = workspaceReducer(base, { type: "finish-open-coding" });
    expect(emptyFinish.stage).toBe("OPEN_CODING");
    expect(emptyFinish.errorMessage).toContain("至少需要一条");
  });

  it("accepts suggestions before allowing open coding confirmation", () => {
    let session = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    const suggested = { ...demoCode, id: "suggested-code", status: "suggested" as const };
    session = workspaceReducer(session, { type: "set-open-codes", codes: [suggested] });
    session = workspaceReducer(session, { type: "finish-open-coding" });
    expect(session.stage).toBe("OPEN_CODING");
    expect(session.errorMessage).toContain("逐条接受");
    session = workspaceReducer(session, { type: "accept-code", codeId: suggested.id });
    session = workspaceReducer(session, { type: "finish-open-coding" });
    expect(session.stage).toBe("OPEN_REVIEW");
    session = workspaceReducer(session, { type: "confirm-open-codes" });
    expect(session.stage).toBe("AXIAL_CODING");
  });

  it("toggles all accepted suggestions and can enter axial coding directly", () => {
    let session = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    const suggested = { ...demoCode, id: "toggle-code", status: "suggested" as const };
    session = workspaceReducer(session, { type: "set-open-codes", codes: [suggested] });

    session = workspaceReducer(session, { type: "accept-all-open-codes" });
    expect(session.openCodes[0].status).toBe("accepted");
    session = workspaceReducer(session, { type: "unaccept-all-open-codes" });
    expect(session.openCodes[0].status).toBe("suggested");
    session = workspaceReducer(session, { type: "accept-all-open-codes" });
    session = workspaceReducer(session, { type: "complete-open-coding" });

    expect(session.stage).toBe("AXIAL_CODING");
  });

  it("supports soft deletion and restoration before axial coding", () => {
    let session = workspaceReducer(createDemoSession(), { type: "confirm-text" });
    const quote = "工作上不敢拒绝同事";
    const start = session.confirmedText.indexOf(quote);
    const manualCode = {
      ...demoCode,
      id: "deletable-code",
      sourceQuote: quote,
      sourceSpan: { start, end: start + quote.length },
      spans: [{ start, end: start + quote.length }],
    };
    session = workspaceReducer(session, { type: "add-open-code", code: manualCode });
    session = workspaceReducer(session, { type: "delete-code", codeId: manualCode.id });
    expect(session.openCodes[0].status).toBe("deleted");
    session = workspaceReducer(session, { type: "restore-code", codeId: manualCode.id });
    expect(session.openCodes[0].status).toBe("accepted");
    session = workspaceReducer(session, { type: "finish-open-coding" });
    expect(session.stage).toBe("OPEN_REVIEW");
  });
});
