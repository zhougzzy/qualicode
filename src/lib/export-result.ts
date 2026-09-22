import type { SessionSnapshot } from "@/lib/domain-types";

export const PRIVACY_NOTICE =
  "本应用不会在自身服务器中持久化保存上传文件、原文或分析结果。确认使用 AI 分析后，锁定文本会发送至服务端配置的 DeepSeek API。当前会话保存在本标签页的 sessionStorage，导出文件由当前浏览器生成。请仅上传已经脱敏的访谈材料。";

const confidenceLabels = { low: "低", medium: "中", high: "高" } as const;

export interface ExportPayload {
  exportedAt: string;
  sessionId: string;
  documents: Array<{
    fileName: string;
    fileType: string;
    sizeBytes: number;
    pageCount?: number;
  }>;
  confirmedText: string;
  openCodes: SessionSnapshot["openCodes"];
  evidence: SessionSnapshot["evidence"];
  axialAnalysis: SessionSnapshot["axialAnalysis"];
  selectiveAnalysis: SessionSnapshot["selectiveAnalysis"];
  exportScope: "confirmed-results-only";
  privacyNotice: string;
  limitations: string[];
}

export function createExportPayload(snapshot: SessionSnapshot, exportedAt = new Date().toISOString()): ExportPayload {
  const openCodes = snapshot.openCodes.filter((code) => code.status === "accepted" || code.status === "edited");
  const referencedEvidenceIds = new Set(openCodes.flatMap((code) => code.evidenceIds));
  snapshot.axialAnalysis?.categories.forEach((category) => category.evidenceIds.forEach((id) => referencedEvidenceIds.add(id)));
  snapshot.axialAnalysis?.relations.forEach((relation) => relation.evidenceIds.forEach((id) => referencedEvidenceIds.add(id)));
  snapshot.axialAnalysis?.counterEvidence.forEach((item) => referencedEvidenceIds.add(item.id));
  snapshot.selectiveAnalysis?.evidenceIds.forEach((id) => referencedEvidenceIds.add(id));
  snapshot.selectiveAnalysis?.relationHypotheses.forEach((relation) => relation.evidenceIds.forEach((id) => referencedEvidenceIds.add(id)));
  snapshot.selectiveAnalysis?.contradictions.forEach((item) => referencedEvidenceIds.add(item.id));
  const evidence = snapshot.evidence.filter((item) => referencedEvidenceIds.has(item.id));
  return {
    exportedAt,
    sessionId: snapshot.sessionId,
    documents: snapshot.documents.map(({ fileName, fileType, sizeBytes, pageCount }) => ({ fileName, fileType, sizeBytes, pageCount })),
    confirmedText: snapshot.confirmedText,
    openCodes,
    evidence,
    axialAnalysis: snapshot.axialAnalysis,
    selectiveAnalysis: snapshot.selectiveAnalysis,
    exportScope: "confirmed-results-only",
    privacyNotice: PRIVACY_NOTICE,
    limitations: [
      "AI 编码是研究辅助建议，不是已验证的理论结论或临床判断。",
      "关系、类别、故事线和命题仍需研究者回到原文核对。",
      "导出只包含已接受或已修改的开放编码；导出文件仍可能包含访谈原文和敏感证据。",
      "导出文件保存在下载位置，请研究者自行管理、加密和删除其中的敏感信息。",
    ],
  };
}

export function buildJsonExport(snapshot: SessionSnapshot, exportedAt?: string): string {
  return JSON.stringify(createExportPayload(snapshot, exportedAt), null, 2);
}

export function buildMarkdownExport(snapshot: SessionSnapshot, exportedAt?: string): string {
  const payload = createExportPayload(snapshot, exportedAt);
  const lines: string[] = [
    "# QualiCode 质性研究分析结果",
    "",
    `- 导出时间：${payload.exportedAt}`,
    `- 会话 ID：${payload.sessionId}`,
    `- 文件：${payload.documents.map((document) => document.fileName).join("、") || "未记录"}`,
    "- 导出范围：仅包含已确认的研究结果",
    "",
    "## 隐私与研究限制",
    "",
    payload.privacyNotice,
    "",
    ...payload.limitations.map((item) => `- ${item}`),
    "",
    "## 确认后的访谈文本",
    "",
    "```text",
    payload.confirmedText,
    "```",
    "",
    "## 开放编码",
    "",
  ];

  if (payload.openCodes.length === 0) {
    lines.push("暂无开放编码。", "");
  } else {
    payload.openCodes.forEach((code, index) => {
      lines.push(
        `### ${index + 1}. ${code.name}`,
        "",
        `- 状态：${code.status}`,
        `- 置信度：${confidenceLabels[code.confidence]}`,
        `- 原文证据：${code.editedQuote ?? code.sourceQuote}`,
        `- 解释：${code.explanation}`,
        "",
      );
      if (code.editHistory.length > 0) {
        lines.push("#### 修改记录", "", ...code.editHistory.map((edit) => `- ${edit.editedAt}：${edit.originalLabel} → ${edit.editedLabel ?? edit.originalLabel}；证据：${edit.editedQuote ?? edit.originalQuote}`), "");
      }
    });
  }

  lines.push("## 轴心编码", "");
  if (!payload.axialAnalysis) {
    lines.push("暂无轴心编码。", "");
  } else {
    payload.axialAnalysis.categories.forEach((category) => {
      lines.push(`### ${category.role}：${category.name}`, "", category.description, "", `- 关联开放编码：${category.codeIds.join("、") || "无"}`, "");
    });
    lines.push("### 关系假设", "");
    payload.axialAnalysis.relations.forEach((relation) => {
      lines.push(`- ${relation.statement}（${relation.relation}，置信度：${confidenceLabels[relation.confidence]}）`);
    });
    if (payload.axialAnalysis.counterEvidence.length > 0) {
      lines.push("", "### 反例与矛盾", "", ...payload.axialAnalysis.counterEvidence.map((item) => `- ${item.quote}：${item.relevance}`));
    }
    if (payload.axialAnalysis.reviewQuestions.length > 0) {
      lines.push("", "### 研究者复核问题", "", ...payload.axialAnalysis.reviewQuestions.map((question) => `- ${question}`));
    }
    lines.push("");
  }

  lines.push("## 选择性编码", "");
  if (!payload.selectiveAnalysis) {
    lines.push("暂无选择性编码。", "");
  } else {
    lines.push(
      `### 核心类别：${payload.selectiveAnalysis.coreCategory}`,
      "",
      payload.selectiveAnalysis.storyline,
      "",
      "#### 工作命题",
      "",
      ...payload.selectiveAnalysis.propositions.map((proposition) => `- ${proposition}`),
      "",
    );
    if (payload.selectiveAnalysis.relationHypotheses.length > 0) {
      lines.push("#### 关系假设", "", ...payload.selectiveAnalysis.relationHypotheses.map((relation) => `- ${relation.statement}（${relation.relation}，置信度：${confidenceLabels[relation.confidence]}）`), "");
    }
    if (payload.selectiveAnalysis.contradictions.length > 0) {
      lines.push("#### 矛盾与反例", "", ...payload.selectiveAnalysis.contradictions.map((item) => `- ${item.quote}：${item.relevance}`), "");
    }
  }

  lines.push("## 原文证据", "");
  if (payload.evidence.length === 0) {
    lines.push("暂无证据卡片。", "");
  } else {
    payload.evidence.forEach((evidence, index) => {
      lines.push(`### 证据 ${index + 1}`, "", `> ${evidence.quote.replace(/\n/g, "\n> ")}`, "", evidence.relevance, "");
    });
  }

  return lines.join("\n");
}
