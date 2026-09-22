import type { SessionSnapshot, Stage } from "@/lib/domain-types";

const stageOrder: Stage[] = [
  "UPLOAD",
  "TEXT_REVIEW",
  "OPEN_CODING",
  "OPEN_REVIEW",
  "AXIAL_CODING",
  "AXIAL_REVIEW",
  "SELECTIVE_CODING",
  "EXPORT",
];

export function getStageLabel(stage: Stage): string {
  const labels: Record<Stage, string> = {
    UPLOAD: "上传材料",
    TEXT_REVIEW: "文本核对",
    OPEN_CODING: "开放编码",
    OPEN_REVIEW: "开放编码确认",
    AXIAL_CODING: "轴心编码",
    AXIAL_REVIEW: "轴心编码确认",
    SELECTIVE_CODING: "选择性编码",
    EXPORT: "导出结果",
  };
  return labels[stage];
}

export function getStageIndex(stage: Stage): number {
  return stageOrder.indexOf(stage);
}

export function getTransitionBlockReason(snapshot: SessionSnapshot, target: Stage): string | null {
  if (target === snapshot.stage) return null;

  if (target === "OPEN_CODING" && !snapshot.textLocked) {
    return "必须先确认文本；确认后 confirmedText 将锁定。";
  }

  if (target === "OPEN_REVIEW" && snapshot.stage !== "OPEN_CODING") {
    return "必须先完成开放编码分析。";
  }

  if (target === "AXIAL_CODING") {
    const hasPendingSuggestions = snapshot.openCodes.some((code) => code.status === "suggested");
    const hasUsableCode = snapshot.openCodes.some((code) => code.status !== "deleted");
    if (hasPendingSuggestions) return "仍有未确认的开放编码，请先处理后进入确认阶段。";
    if (snapshot.stage !== "OPEN_REVIEW") return "必须先进入开放编码确认阶段。";
    if (!hasUsableCode) return "至少需要一条未删除的开放编码。";
  }

  if (target === "AXIAL_REVIEW" && snapshot.stage !== "AXIAL_CODING") {
    return "必须先完成轴心编码分析。";
  }

  if (target === "SELECTIVE_CODING") {
    if (snapshot.stage !== "AXIAL_REVIEW") return "必须先进入轴心编码确认阶段。";
    if (!snapshot.axialAnalysis || snapshot.axialFreshness.status !== "confirmed") {
      return "轴心编码必须重新生成并确认后，才能进入选择性编码。";
    }
  }

  if (target === "EXPORT") {
    if (snapshot.stage !== "SELECTIVE_CODING") return "必须先完成选择性编码。";
    if (!snapshot.selectiveAnalysis || snapshot.selectiveFreshness.status !== "confirmed") {
      return "选择性编码必须确认后才能导出。";
    }
  }

  if (getStageIndex(target) < getStageIndex(snapshot.stage)) {
    return "第一版按阶段顺序推进，不允许回退阶段。";
  }

  return null;
}

export function canTransition(snapshot: SessionSnapshot, target: Stage): boolean {
  return getTransitionBlockReason(snapshot, target) === null;
}

export function transitionStage(snapshot: SessionSnapshot, target: Stage): SessionSnapshot {
  const reason = getTransitionBlockReason(snapshot, target);
  if (reason) throw new Error(reason);
  return { ...snapshot, stage: target, updatedAt: new Date().toISOString() };
}
