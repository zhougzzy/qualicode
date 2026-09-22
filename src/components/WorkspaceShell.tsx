"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DragEvent, MutableRefObject } from "react";
import type { AxialCodingRequest, AxialCodingResult, OpenCodingRequest, OpenCodingResult, SelectiveCodingRequest, SelectiveCodingResult } from "@/lib/api-contract";
import type { AxialAnalysis, CodeEdit, CodeLabel } from "@/lib/domain-types";
import { CodeEditDialog } from "@/components/CodeEditDialog";
import { OriginalEvidencePanel } from "@/components/OriginalEvidencePanel";
import { SourceTextView } from "@/components/SourceTextView";
import { UploadPanel } from "@/components/UploadPanel";
import { postJson } from "@/lib/api-client";
import { clearPendingUploads, clearSession, loadPendingUploads, loadSession, saveSession } from "@/lib/session-storage";
import { createInitialSession, workspaceReducer } from "@/lib/state";
import { buildJsonExport, buildMarkdownExport } from "@/lib/export-result";
import { formatFileSize, MAX_FILE_SIZE_BYTES } from "@/lib/limits";

type AnalysisStatus = "idle" | "analyzing" | "done";
type SectionKey = "reading" | "analysis" | "results" | "axial" | "selective";

const confidenceLabels: Record<CodeLabel["confidence"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const axialRoleLabels: Record<NonNullable<AxialAnalysis>["categories"][number]["role"], string> = {
  phenomenon: "现象",
  condition: "条件",
  context: "情境",
  strategy: "策略",
  consequence: "结果",
  interaction: "互动",
};

const axialRelationLabels: Record<NonNullable<AxialAnalysis>["relations"][number]["relation"], string> = {
  condition: "条件",
  process: "过程",
  strategy: "策略",
  consequence: "结果",
  association: "关联",
};

const selectiveRelationLabels = axialRelationLabels;

export function WorkspaceShell() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialSession);
  const didInitialize = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [axialStatus, setAxialStatus] = useState<AnalysisStatus>("idle");
  const [selectiveStatus, setSelectiveStatus] = useState<AnalysisStatus>("idle");
  const [unanchoredSuggestions, setUnanchoredSuggestions] = useState<OpenCodingResult["unanchoredSuggestions"]>([]);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editedQuote, setEditedQuote] = useState("");
  const [editedLabel, setEditedLabel] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [returnToOpenAfterEdit, setReturnToOpenAfterEdit] = useState(false);
  const [returnPromptCodeId, setReturnPromptCodeId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [draggedCodeId, setDraggedCodeId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const pendingScrollRef = useRef<SectionKey | null>(null);
  const readingRef = useRef<HTMLElement | null>(null);
  const analysisRef = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const axialRef = useRef<HTMLElement | null>(null);
  const selectiveRef = useRef<HTMLElement | null>(null);

  const sectionRefs: Record<SectionKey, MutableRefObject<HTMLElement | null>> = {
    reading: readingRef,
    analysis: analysisRef,
    results: resultsRef,
    axial: axialRef,
    selective: selectiveRef,
  };

  const showToast = (message: string) => {
    setToastMessage(message);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 1000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const queueSectionScroll = (section: SectionKey) => {
    pendingScrollRef.current = section;
  };

  const scrollToSection = (section: SectionKey) => {
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const section = pendingScrollRef.current;
    if (!section) return;
    const target = sectionRefs[section].current;
    if (!target) return;
    pendingScrollRef.current = null;
    window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [state, analysisStatus, axialStatus, selectiveStatus]);

  useEffect(() => {
    // React Strict Mode re-runs mount effects in development. The pending upload
    // must be consumed only once, otherwise the second pass can hydrate an old
    // snapshot and overwrite the documents just loaded from the landing page.
    if (didInitialize.current) return;
    didInitialize.current = true;

    const pendingUploads = loadPendingUploads();
    const stored = loadSession();
    if (pendingUploads?.length) {
      dispatch({
        type: "load-documents",
        documents: pendingUploads.map((item) => item.document),
        draftText: pendingUploads.map((item) => item.rawExtractedText).join("\n\n"),
        warnings: pendingUploads.flatMap((item) => item.warnings),
      });
      clearPendingUploads();
      showToast("请核对转写结果");
      queueSectionScroll("reading");
    } else if (stored) {
      dispatch({ type: "hydrate", snapshot: stored });
      if (stored.openCodes.length > 0) setAnalysisStatus("done");
      if (stored.axialAnalysis) setAxialStatus("done");
      if (stored.selectiveAnalysis) setSelectiveStatus("done");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!saveSession(state)) {
      setStorageWarning("当前浏览器无法保存会话。请不要关闭或刷新页面，并尽快导出已确认结果。");
    } else {
      setStorageWarning("");
    }
  }, [hydrated, state]);

  const activeCode = useMemo(
    () => state.openCodes.find((code) => code.id === editingCodeId) ?? null,
    [editingCodeId, state.openCodes],
  );

  const openEditor = (code: CodeLabel, shouldReturnToOpen = false) => {
    setEditingCodeId(code.id);
    setEditedQuote(code.editedQuote ?? code.sourceQuote);
    setEditedLabel(code.name);
    setReturnToOpenAfterEdit(shouldReturnToOpen);
  };

  const focusCode = (code: CodeLabel) => {
    const target = document.getElementById(`source-code-${code.id}`) ?? Array.from(document.querySelectorAll("[data-code-ids]"))
      .find((element) => element.getAttribute("data-code-ids")?.split(",").includes(code.id));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("is-focused");
    window.setTimeout(() => target?.classList.remove("is-focused"), 1000);
  };

  const focusOpenCode = (codeId: string) => {
    const target = document.getElementById(`open-code-${codeId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("is-focused");
    window.setTimeout(() => target?.classList.remove("is-focused"), 1000);
  };

  const focusOpenCodeEvidence = (codeId: string) => {
    const target = document.getElementById(`open-code-evidence-${codeId}`) ?? document.getElementById(`open-code-${codeId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("is-focused");
    window.setTimeout(() => target?.classList.remove("is-focused"), 1000);
  };

  const focusEvidence = (quote: string) => {
    const code = state.openCodes.find((item) => item.status !== "deleted" && (item.sourceQuote.includes(quote) || quote.includes(item.sourceQuote)));
    if (code) {
      focusCode(code);
    }
  };

  const handleAxialCodeDrop = (event: DragEvent<HTMLElement>, categoryId: string) => {
    event.preventDefault();
    const codeId = event.dataTransfer.getData("text/plain") || draggedCodeId;
    if (codeId) {
      dispatch({ type: "move-code-to-axial-category", codeId, categoryId });
      queueSectionScroll("axial");
    }
    setDraggedCodeId(null);
    setDragOverCategoryId(null);
  };

  const saveCodeEdit = () => {
    if (!activeCode) return;
    if (!state.confirmedText.includes(editedQuote)) {
      dispatch({ type: "set-error", message: "修订片段必须来自已锁定文本，请保留原文证据或重新选择片段。" });
      return;
    }
    const invalidatedStages: CodeEdit["invalidatedStages"] =
      state.stage === "AXIAL_REVIEW" || state.stage === "SELECTIVE_CODING" || state.stage === "EXPORT"
        ? ["AXIAL", "SELECTIVE"]
        : [];
    const edit: CodeEdit = {
      id: `edit-${Date.now()}`,
      codeId: activeCode.id,
      originalQuote: activeCode.sourceQuote,
      editedQuote,
      originalLabel: activeCode.name,
      editedLabel,
      editedAt: new Date().toISOString(),
      invalidatedStages,
      beforeStage: state.stage === "SELECTIVE_CODING" ? "SELECTIVE_CODING" : state.stage === "AXIAL_REVIEW" ? "AXIAL_REVIEW" : "OPEN_REVIEW",
    };
    dispatch({ type: "edit-code", codeId: activeCode.id, edit, editedQuote, editedLabel });
    setEditingCodeId(null);
    if (returnToOpenAfterEdit) setReturnPromptCodeId(activeCode.id);
    setReturnToOpenAfterEdit(false);
  };

  const downloadExport = (format: "markdown" | "json") => {
    if (state.stage !== "EXPORT" || state.selectiveFreshness.status !== "confirmed") {
      showToast("确认选择性编码后才能导出结果");
      return;
    }
    const extension = format === "markdown" ? "md" : "json";
    const content = format === "markdown" ? buildMarkdownExport(state) : buildJsonExport(state);
    const blob = new Blob([content], { type: format === "markdown" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qualicode-${state.sessionId}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearWorkspaceData = () => {
    if (!window.confirm("确定清除当前标签页中的文本、编码和分析结果吗？此操作不可撤销。")) return;
    clearSession();
    clearPendingUploads();
    window.location.assign("/");
  };

  const analyzeAxialWithDeepSeek = async () => {
    if (!state.textLocked || !state.textVersion || axialStatus === "analyzing") return;
    if (state.stage !== "AXIAL_CODING" && !(state.stage === "AXIAL_REVIEW" && state.axialFreshness.status === "stale")) return;
    const confirmedOpenCodes = state.openCodes.filter((code) => code.status === "accepted" || code.status === "edited");
    if (confirmedOpenCodes.length === 0) {
      dispatch({ type: "set-error", message: "没有可用于轴心编码的已确认开放编码。" });
      return;
    }
    dispatch({ type: "clear-error" });
    setAxialStatus("analyzing");
    const payload: AxialCodingRequest = { text: state.confirmedText, textLocked: true, textVersion: state.textVersion, confirmedOpenCodes, researchQuestion: undefined };
    try {
      const response = await postJson<AxialCodingRequest, AxialCodingResult>("/api/analyze/axial", payload);
      if (!response.ok || !response.data) {
        setAxialStatus("idle");
        dispatch({ type: "set-error", message: response.error?.message ?? "轴心编码分析失败，请稍后重试。" });
        return;
      }
      dispatch({ type: "set-axial-analysis", analysis: response.data.analysis, evidence: response.data.evidence });
      setAxialStatus("done");
      queueSectionScroll("axial");
    } catch {
      setAxialStatus("idle");
      dispatch({ type: "set-error", message: "无法连接轴心编码分析服务，请稍后重试。" });
    }
  };

  const analyzeWithDeepSeek = async () => {
    if (!state.textLocked || !state.textVersion || analysisStatus === "analyzing") return;
    dispatch({ type: "clear-error" });
    setAnalysisStatus("analyzing");
    setUnanchoredSuggestions([]);

    const payload: OpenCodingRequest = {
      text: state.confirmedText,
      textLocked: true,
      textVersion: state.textVersion,
      options: { maxSuggestions: 12, language: "zh-CN" },
    };
    try {
      const response = await postJson<OpenCodingRequest, OpenCodingResult>("/api/analyze/open", payload);
      if (!response.ok || !response.data) {
        setAnalysisStatus("idle");
        dispatch({ type: "set-error", message: response.error?.message ?? "DeepSeek 分析失败，请稍后重试。" });
        return;
      }
      dispatch({ type: "set-open-codes", codes: response.data.suggestions, evidence: response.data.evidence });
      setUnanchoredSuggestions(response.data.unanchoredSuggestions);
      setAnalysisStatus("done");
      queueSectionScroll("results");
    } catch {
      setAnalysisStatus("idle");
      dispatch({ type: "set-error", message: "无法连接 DeepSeek 分析服务，请稍后重试。" });
    }
  };

  const analyzeSelectiveWithDeepSeek = async () => {
    const canAnalyze = Boolean(
      state.textLocked &&
      state.textVersion &&
      state.axialAnalysis &&
      state.axialFreshness.status === "confirmed" &&
      (state.stage === "AXIAL_REVIEW" || state.stage === "SELECTIVE_CODING"),
    );
    if (!canAnalyze || selectiveStatus === "analyzing" || !state.axialAnalysis) return;
    const confirmedOpenCodes = state.openCodes.filter((code) => code.status === "accepted" || code.status === "edited");
    if (confirmedOpenCodes.length === 0) {
      dispatch({ type: "set-error", message: "没有可用于选择性编码的已确认开放编码。" });
      return;
    }
    dispatch({ type: "clear-error" });
    setSelectiveStatus("analyzing");
    const payload: SelectiveCodingRequest = {
      text: state.confirmedText,
      textLocked: true,
      textVersion: state.textVersion,
      confirmedOpenCodes,
      confirmedAxialAnalysis: state.axialAnalysis,
      researchQuestion: undefined,
    };
    try {
      const response = await postJson<SelectiveCodingRequest, SelectiveCodingResult>("/api/analyze/selective", payload);
      if (!response.ok || !response.data) {
        setSelectiveStatus("idle");
        dispatch({ type: "set-error", message: response.error?.message ?? "选择性编码分析失败，请稍后重试。" });
        return;
      }
      dispatch({ type: "set-selective-analysis", analysis: response.data.analysis, evidence: response.data.evidence });
      setSelectiveStatus("done");
      queueSectionScroll("selective");
    } catch {
      setSelectiveStatus("idle");
      dispatch({ type: "set-error", message: "无法连接选择性编码分析服务，请稍后重试。" });
    }
  };

  const documents = state.documents.length > 0 ? state.documents : state.document ? [state.document] : [];
  const hasDocument = documents.length > 0;
  const visibleCodes = state.openCodes.filter((code) => code.status !== "deleted");
  const suggestedCodes = visibleCodes.filter((code) => code.status === "suggested");
  const allOpenCodesAccepted = visibleCodes.length > 0 && suggestedCodes.length === 0;
  const codeEvidence = (code: CodeLabel) => state.evidence.filter((item) => code.evidenceIds.includes(item.id));
  const axialAssignedCodeIds = new Set(state.axialAnalysis?.categories.flatMap((category) => category.codeIds) ?? []);
  const axialUnassignedCodes = state.openCodes.filter((code) =>
    (code.status === "accepted" || code.status === "edited") && !axialAssignedCodeIds.has(code.id),
  );

  return (
    <main className="workspace-page">
      <header className="workspace-filebar">
        <Link className="brand-lockup" href="/" aria-label="返回 QualiCode 首页">
          <span className="brand-mark">Q</span>
          <span>QualiCode</span>
        </Link>
        <div className="filebar-current">
          <span className="filebar-label">已选文件 · {documents.length}</span>
          {documents.length > 0 ? (
            <div className="filebar-files" aria-label="已选择的访谈文件">
              {documents.map((document) => <strong key={document.id} title={document.fileName}>{document.fileName}</strong>)}
            </div>
          ) : <strong>尚未选择文件</strong>}
        </div>
        <UploadPanel
          compact
          multiple
          hasFile={hasDocument}
          onConverted={(results) => {
            setAnalysisStatus("idle");
            setAxialStatus("idle");
            setSelectiveStatus("idle");
            setUnanchoredSuggestions([]);
            dispatch({
              type: "load-documents",
              documents: results.map((item) => item.document),
              draftText: results.map((item) => item.rawExtractedText).join("\n\n"),
              warnings: results.flatMap((item) => item.warnings),
            });
            showToast("请核对转写结果");
            queueSectionScroll("reading");
          }}
          onError={(message) => dispatch({ type: "set-error", message })}
        />
      </header>

      <div className="workspace-main">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">INTERVIEW WORKSPACE / 02</p>
            <h1>访谈文本工作台</h1>
            <p className="workspace-lede">先把材料读准确，再决定是否交给 DeepSeek 做开放编码。</p>
          </div>
          <div className="workspace-heading-actions">
            <div className="privacy-seal"><span className="seal-dot" />原文件仅在本次请求中解析</div>
            <div className="export-actions heading-export-actions" aria-label="导出当前结果">
              <button className="button button-primary" onClick={() => downloadExport("markdown")} disabled={state.stage !== "EXPORT"}>导出 Markdown</button>
              <button className="button" onClick={() => downloadExport("json")} disabled={state.stage !== "EXPORT"}>导出 JSON</button>
            </div>
          </div>
        </header>

        <nav className="workspace-breadcrumbs" aria-label="工作台板块导航">
          {([
            ["reading", "01 文本核对"],
            ["analysis", "02 开放编码"],
            ["results", "03 编码结果"],
            ["axial", "04 轴心编码"],
            ["selective", "05 选择性编码"],
          ] as Array<[SectionKey, string]>).map(([section, label]) => (
            <button key={section} className="breadcrumb-button" onClick={() => scrollToSection(section)}>{label}</button>
          ))}
        </nav>

        {toastMessage && <div className="workspace-toast" role="status" aria-live="polite">{toastMessage}</div>}

        {state.errorMessage && <div className="notice notice-danger">{state.errorMessage}</div>}
        {storageWarning && <div className="notice notice-warning" role="alert">{storageWarning}</div>}
        {state.parseWarnings.length > 0 && (
          <div className="notice notice-warning">
            {state.parseWarnings.map((warning) => <div key={`${warning.code}-${warning.message}`}>{warning.message}</div>)}
          </div>
        )}

        <section ref={readingRef} className="reading-section" aria-labelledby="reading-title" id="section-reading">
          <div className="section-kicker"><span>01</span><span>文本读取与核对</span></div>
          <div className="reading-header">
            <div>
              <h2 id="reading-title">{hasDocument ? "已上传访谈文本" : "等待上传访谈文件"}</h2>
              <p>{state.textLocked ? "文本已确认，后续分析将严格引用这份原文。" : "文件读取完成后，请先核对转写结果，再继续分析。"}</p>
            </div>
            <div className={`reading-status ${hasDocument ? "is-ready" : ""}`}>
              <span className="status-pulse" />
              {hasDocument ? (state.textLocked ? "已确认" : "读取完成") : "等待文件"}
            </div>
          </div>

          {!hasDocument ? (
            <div className="reading-empty">
              <div className="empty-index">A</div>
              <p>文件读取结果会显示在这里</p>
              <span>支持 .docx 与文字型 .pdf，单个文件最大 {formatFileSize(MAX_FILE_SIZE_BYTES)}</span>
            </div>
          ) : !state.textLocked ? (
            <>
              <textarea
                className="reading-editor"
                value={state.draftText}
                onChange={(event) => dispatch({ type: "update-draft-text", text: event.target.value })}
                aria-label="待确认的访谈文本"
              />
              <div className="reading-actions">
                <p>可以修正转写中的标点、说话人或明显识别错误。确认后全文将锁定。</p>
                <button className="button button-primary" onClick={() => { dispatch({ type: "confirm-text" }); queueSectionScroll("analysis"); }}>
                  确定文本 <span aria-hidden="true">→</span>
                </button>
              </div>
            </>
          ) : (
            <SourceTextView text={state.confirmedText} codes={visibleCodes} onCodeClick={focusOpenCodeEvidence} />
          )}
        </section>

        {state.textLocked && (
          <section ref={analysisRef} className="analysis-section" aria-labelledby="analysis-title" id="section-analysis">
            <div className="section-kicker"><span>02</span><span>AI 开放编码</span></div>
            <div className="analysis-gate">
              <div>
                <h2 id="analysis-title">让 DeepSeek 帮你寻找值得讨论的片段</h2>
                <p>分析只使用当前已确认文本，模型会返回原文片段、开放编码和编码依据。结果仍需要你核对、修改或删除。</p>
              </div>
              <button className="button button-accent" onClick={analyzeWithDeepSeek} disabled={analysisStatus === "analyzing"}>
                {analysisStatus === "analyzing" ? "DeepSeek 分析中…" : analysisStatus === "done" ? "重新使用 DeepSeek 分析" : "确认使用 DeepSeek 进行分析"}
              </button>
            </div>
            <p className="analysis-consent">点击按钮即表示你确认将当前访谈文本发送给 DeepSeek，用于本次开放编码请求。</p>
          </section>
        )}

        {state.textLocked && (visibleCodes.length > 0 || analysisStatus === "done" || unanchoredSuggestions.length > 0) && (
          <section ref={resultsRef} className="results-section" aria-labelledby="results-title" id="section-results">
            <div className="section-kicker"><span>03</span><span>分析结果</span></div>
            <div className="results-heading">
              <div>
                <h2 id="results-title">开放编码建议</h2>
                <p>结果显示在原文之后。蓝色证据条代表模型能够在原文中定位的片段。先逐条核对，再确认进入下一阶段。</p>
              </div>
              <span className="result-count">{visibleCodes.length} 条已定位</span>
            </div>
            {visibleCodes.length > 0 ? (
              <div className="result-list">
                {visibleCodes.map((code, index) => (
                  <article className="result-item" key={code.id} id={`open-code-${code.id}`}>
                    <div className="result-item-topline">
                      <span className="result-number">{String(index + 1).padStart(2, "0")}</span>
                      <div className="result-title-wrap">
                        <h3>{code.name}</h3>
                        <div className="result-meta"><span>{code.status === "suggested" ? "待接受" : code.status === "accepted" ? "已接受" : "已修改"}</span><span>置信度：{confidenceLabels[code.confidence]}</span></div>
                      </div>
                      <div className="result-actions">
                        {code.status === "suggested" && <button className="text-button" onClick={() => dispatch({ type: "accept-code", codeId: code.id })}>接受</button>}
                        <button className="text-button" onClick={() => focusCode(code)}>查看原文</button>
                        <button className="text-button" onClick={() => openEditor(code)}>修改</button>
                        <button className="text-button text-button-danger" onClick={() => dispatch({ type: "delete-code", codeId: code.id })}>删除</button>
                      </div>
                    </div>
                    {editingCodeId === code.id && (
                      <div className="result-inline-editor">
                        <CodeEditDialog code={code} editedLabel={editedLabel} editedQuote={editedQuote} onChangeLabel={setEditedLabel} onChangeQuote={setEditedQuote} onSave={saveCodeEdit} onCancel={() => setEditingCodeId(null)} />
                      </div>
                    )}
                    <div id={`open-code-evidence-${code.id}`} className="open-code-evidence">
                      <OriginalEvidencePanel code={code} status={code.status} />
                      {codeEvidence(code).length > 0 && (
                        <div className="evidence-list" aria-label={`${code.name} 的证据卡片`}>
                          {codeEvidence(code).map((evidence, evidenceIndex) => (
                            <div className="evidence-card" key={evidence.id}>
                              <div className="evidence-card-header"><span>证据 {String(evidenceIndex + 1).padStart(2, "0")}{evidence.chunkId ? ` · ${evidence.chunkId}` : ""}</span><button className="text-button" onClick={() => focusCode(code)}>查看原文</button></div>
                              <p>{evidence.quote}</p>
                              <small>{evidence.relevance}</small>
                            </div>
                          ))}
                        </div>
                      )}
                      {code.status === "suggested" && <div className="evidence-chain-actions"><button className="text-button" onClick={() => dispatch({ type: "accept-code", codeId: code.id })}>接受该开放编码</button></div>}
                    </div>
                    <p className="result-explanation">{code.explanation}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="results-empty">本次分析没有返回可以定位到原文的编码建议。</div>
            )}

            {state.stage === "OPEN_CODING" && visibleCodes.length > 0 && (
              <div className="open-review-actions open-review-actions-bottom">
                <button className="button" onClick={() => dispatch({ type: allOpenCodesAccepted ? "unaccept-all-open-codes" : "accept-all-open-codes" })}>
                  {allOpenCodesAccepted ? "取消全部接受建议" : "全部接受建议"}
                </button>
                <button className="button button-primary" onClick={() => { dispatch({ type: "complete-open-coding" }); queueSectionScroll("axial"); }} disabled={!allOpenCodesAccepted}>
                  {allOpenCodesAccepted ? "完成开放编码，进入轴心编码" : "完成开放编码，进入确认"}
                </button>
                {suggestedCodes.length > 0 && <span>还有 {suggestedCodes.length} 条建议未处理。</span>}
              </div>
            )}
            {state.stage === "OPEN_REVIEW" && (
              <div className="open-review-actions is-confirming open-review-actions-bottom">
                <span>当前开放编码已完成逐条处理。确认后才能进入轴心编码。</span>
                <button className="button button-primary" onClick={() => { dispatch({ type: "confirm-open-codes" }); queueSectionScroll("axial"); }}>确认开放编码</button>
              </div>
            )}
            {state.stage === "AXIAL_CODING" && (
              <div className="next-step-note">开放编码已确认。现在可以基于当前证据上下文生成轴心编码。</div>
            )}

            {unanchoredSuggestions.length > 0 && (
              <div className="unanchored-box">
                <strong>需要你手动核对的建议（{unanchoredSuggestions.length}）</strong>
                {unanchoredSuggestions.map((suggestion) => <p key={suggestion.id}><b>{suggestion.label}</b>：{suggestion.quote}</p>)}
              </div>
            )}
          </section>
        )}

        {state.textLocked && (state.stage === "AXIAL_CODING" || state.stage === "AXIAL_REVIEW" || state.stage === "SELECTIVE_CODING" || state.stage === "EXPORT") && (
          <section ref={axialRef} className="axial-section" aria-labelledby="axial-title" id="section-axial">
            <div className="section-kicker"><span>04</span><span>轴心编码</span></div>
            {state.stage === "AXIAL_CODING" && (
              <div className="analysis-gate axial-gate">
                <div><h2 id="axial-title">把开放编码组织成关系假设</h2><p>轴心编码只使用已确认的开放编码，并回到锁定原文寻找类别、条件、过程、策略和结果的证据。</p></div>
                <button className="button button-accent" onClick={analyzeAxialWithDeepSeek} disabled={axialStatus === "analyzing"}>{axialStatus === "analyzing" ? "轴心编码分析中…" : "生成轴心编码"}</button>
              </div>
            )}
            {state.stage === "AXIAL_REVIEW" && state.axialFreshness.status === "stale" && (
              <div className="stale-analysis-banner"><div><strong>轴心编码已失效</strong><span>开放编码、类别名称或类别归属发生了修改，旧的类别和关系不能直接继续使用。</span></div><button className="button button-primary" onClick={analyzeAxialWithDeepSeek} disabled={axialStatus === "analyzing"}>{axialStatus === "analyzing" ? "重新生成中…" : "重新生成轴心编码"}</button></div>
            )}
            {state.axialAnalysis && (
              <>
                <div className="axial-summary-row"><div><strong>{visibleCodes.length}</strong><span>条开放编码</span></div><div><strong>{state.axialAnalysis.categories.length}</strong><span>个类别</span></div><div><strong>{state.axialAnalysis.relations.length}</strong><span>条关系假设</span></div><div><strong>{state.axialAnalysis.counterEvidence.length}</strong><span>条反例证据</span></div><span className="analysis-freshness">{state.axialFreshness.status === "confirmed" ? "已确认" : "待研究者确认"}</span></div>
                {axialUnassignedCodes.length > 0 && (
                  <div className="axial-unassigned-box">
                    <div className="axial-subheading">
                      <div><h3>未归类开放编码</h3><span>拖入下方类别，补充你的研究判断</span></div>
                      <span>{axialUnassignedCodes.length} 条待归类</span>
                    </div>
                    <div className="axial-unassigned-list">
                      {axialUnassignedCodes.map((code) => (
                        <div
                          className="axial-unassigned-code"
                          key={code.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", code.id);
                            setDraggedCodeId(code.id);
                          }}
                          onDragEnd={() => {
                            setDraggedCodeId(null);
                            setDragOverCategoryId(null);
                          }}
                        >
                          <strong>{code.name}</strong>
                          <span>{code.editedQuote ?? code.sourceQuote}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="axial-category-list">
                  {state.axialAnalysis.categories.map((category) => {
                    const categoryEvidence = Array.from(new Map(
                      state.evidence
                        .filter((item) => category.evidenceIds.includes(item.id))
                        .map((item) => [item.id, item]),
                    ).values());
                    const isEditingCategory = editingCategoryId === category.id;
                    return (
                      <article
                        className={`axial-category-card ${dragOverCategoryId === category.id ? "is-drag-over" : ""}`}
                        key={category.id}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverCategoryId(category.id);
                        }}
                        onDragLeave={() => setDragOverCategoryId((current) => current === category.id ? null : current)}
                        onDrop={(event) => handleAxialCodeDrop(event, category.id)}
                      >
                        <div className="axial-card-heading">
                          <div>
                            <span className="axial-role">{axialRoleLabels[category.role]}</span>
                            {isEditingCategory ? (
                              <div className="axial-category-edit">
                                <input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} aria-label="轴心类别名称" />
                                <button className="text-button" onClick={() => { dispatch({ type: "rename-axial-category", categoryId: category.id, name: editingCategoryName }); setEditingCategoryId(null); queueSectionScroll("axial"); }}>保存</button>
                                <button className="text-button" onClick={() => setEditingCategoryId(null)}>取消</button>
                              </div>
                            ) : (
                              <div className="axial-category-title-row"><h3>{category.name}</h3><button className="text-button" onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }}>修改名称</button></div>
                            )}
                          </div>
                          <span>{category.codeIds.length} 条开放编码</span>
                        </div>
                        <p>{category.description}</p>
                        <div className="axial-code-links">
                          {category.codeIds.map((codeId) => {
                            const code = state.openCodes.find((item) => item.id === codeId);
                            if (!code) return null;
                            return (
                              <div
                                className="axial-code-link-row"
                                key={codeId}
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", codeId);
                                  setDraggedCodeId(codeId);
                                }}
                                onDragEnd={() => {
                                  setDraggedCodeId(null);
                                  setDragOverCategoryId(null);
                                }}
                              >
                                <button className="axial-code-link" onDoubleClick={() => { openEditor(code, true); queueSectionScroll("results"); }} title="双击跳回开放编码并修改">{code.name}</button>
                              </div>
                            );
                          })}
                        </div>
                        {categoryEvidence.length > 0 && <div className="evidence-list">{categoryEvidence.map((item) => <div className="evidence-card" key={item.id}><p>{item.quote}</p><small>{item.relevance}</small></div>)}</div>}
                      </article>
                    );
                  })}
                </div>
                <div className="axial-relations"><div className="axial-subheading"><h3>关系假设</h3><span>所有关系均需研究者继续核对</span></div>{state.axialAnalysis.relations.length === 0 ? <p className="results-empty">本次分析没有返回关系假设。</p> : state.axialAnalysis.relations.map((relation) => { const relationEvidence = state.evidence.filter((item) => relation.evidenceIds.includes(item.id)); const sourceCode = state.openCodes.find((code) => code.id === relation.sourceCodeId); const targetCode = state.openCodes.find((code) => code.id === relation.targetCodeId); return <article className="relation-card" key={relation.id}><div className="relation-meta"><span>{axialRelationLabels[relation.relation]}</span><span>置信度：{confidenceLabels[relation.confidence]}</span><span>待确认</span></div>{(sourceCode || targetCode) && <div className="relation-endpoints"><span>{sourceCode?.name ?? "未指定"}</span><b>→</b><span>{targetCode?.name ?? "未指定"}</span></div>}<p>{relation.statement}</p>{relationEvidence.map((item) => <div className="evidence-card" key={item.id}><p>{item.quote}</p><small>{item.relevance}</small></div>)}</article>; })}</div>
                {state.axialAnalysis.counterEvidence.length > 0 && <div className="axial-counterevidence"><div className="axial-subheading"><h3>反例与矛盾</h3><span>用于提醒研究者复核主要模式</span></div>{state.axialAnalysis.counterEvidence.map((item) => <div className="evidence-card" key={item.id}><p>{item.quote}</p><small>{item.relevance}</small></div>)}</div>}
                {state.axialAnalysis.unanchoredEvidence.length > 0 && <div className="unanchored-box"><strong>需要手动核对的轴心证据（{state.axialAnalysis.unanchoredEvidence.length}）</strong>{state.axialAnalysis.unanchoredEvidence.map((item) => <p key={item.id}>{item.quote}：{item.relevance}</p>)}</div>}
                {state.axialAnalysis.reviewQuestions.length > 0 && <div className="review-questions"><strong>研究者复核问题</strong>{state.axialAnalysis.reviewQuestions.map((question) => <p key={question}>{question}</p>)}</div>}
                <div className="axial-confirm-actions"><span>确认表示你接受当前类别与关系作为研究工作假设，不代表已验证因果结论。</span>{state.axialFreshness.status === "fresh" && <button className="button button-primary" onClick={() => dispatch({ type: "confirm-axial" })}>确认轴心编码</button>}{state.axialFreshness.status === "confirmed" && <div className="axial-confirmed-next"><span className="confirmed-mark">轴心编码已确认</span><button className="button button-primary" onClick={() => scrollToSection("selective")}>进入选择性编码 <span aria-hidden="true">→</span></button></div>}</div>
              </>
            )}
          </section>
        )}

        {state.textLocked && state.axialAnalysis && state.axialFreshness.status === "confirmed" && (state.stage === "AXIAL_REVIEW" || state.stage === "SELECTIVE_CODING" || state.stage === "EXPORT") && (
          <section ref={selectiveRef} className="selective-section" aria-labelledby="selective-title" id="section-selective">
            <div className="section-kicker"><span>05</span><span>选择性编码</span></div>
            {state.stage === "AXIAL_REVIEW" && (
              <div className="analysis-gate selective-gate">
                <div><h2 id="selective-title">提炼核心类别与理论故事线</h2><p>选择性编码会综合已确认的开放编码、轴心类别和锁定原文，提出核心类别、故事线、关系假设与矛盾证据，供你继续判断。</p></div>
                <button className="button button-accent" onClick={analyzeSelectiveWithDeepSeek} disabled={selectiveStatus === "analyzing"}>{selectiveStatus === "analyzing" ? "选择性编码分析中…" : selectiveStatus === "done" ? "重新生成选择性编码" : "生成选择性编码"}</button>
              </div>
            )}
            {state.selectiveFreshness.status === "stale" && (
              <div className="stale-analysis-banner"><div><strong>选择性编码已失效</strong><span>开放编码或上游分析发生了修改，旧的核心类别和故事线不能直接确认。</span></div><button className="button button-primary" onClick={analyzeSelectiveWithDeepSeek} disabled={selectiveStatus === "analyzing"}>{selectiveStatus === "analyzing" ? "重新生成中…" : "重新生成选择性编码"}</button></div>
            )}
            {state.selectiveAnalysis && state.selectiveFreshness.status !== "stale" && (
              <>
                <div className="selective-summary-row"><div><strong>{state.selectiveAnalysis.propositions.length}</strong><span>条工作命题</span></div><div><strong>{state.selectiveAnalysis.relationHypotheses.length}</strong><span>条关系假设</span></div><div><strong>{state.selectiveAnalysis.contradictions.length}</strong><span>条反例证据</span></div><span className="analysis-freshness">{state.selectiveFreshness.status === "confirmed" ? "已确认" : "待研究者确认"}</span></div>
                <div className="selective-core-block"><span className="axial-role">核心类别</span><h2 id="selective-title">{state.selectiveAnalysis.coreCategory}</h2><p>{state.selectiveAnalysis.storyline}</p></div>
                {state.selectiveAnalysis.evidenceIds.length > 0 && <div className="selective-subsection"><div className="axial-subheading"><h3>支持证据</h3><span>已定位到锁定原文</span></div><div className="evidence-list">{state.evidence.filter((item) => state.selectiveAnalysis?.evidenceIds.includes(item.id)).map((item) => <div className="evidence-card" key={item.id}><div className="evidence-card-header"><span>支持证据</span><button className="text-button" onClick={() => focusEvidence(item.quote)}>查看原文</button></div><p>{item.quote}</p><small>{item.relevance}</small></div>)}</div></div>}
                <div className="selective-subsection"><div className="axial-subheading"><h3>工作命题</h3><span>供后续比较和验证</span></div>{state.selectiveAnalysis.propositions.length === 0 ? <p className="results-empty">本次分析没有返回工作命题。</p> : <div className="proposition-list">{state.selectiveAnalysis.propositions.map((proposition, index) => <div className="proposition-item" key={`${index}-${proposition}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{proposition}</p></div>)}</div>}</div>
                {state.selectiveAnalysis.relationHypotheses.length > 0 && <div className="selective-subsection"><div className="axial-subheading"><h3>关系假设</h3><span>所有关系均需研究者继续核对</span></div>{state.selectiveAnalysis.relationHypotheses.map((relation) => { const relationEvidence = state.evidence.filter((item) => relation.evidenceIds.includes(item.id)); const sourceCode = state.openCodes.find((code) => code.id === relation.sourceCodeId); const targetCode = state.openCodes.find((code) => code.id === relation.targetCodeId); return <article className="relation-card" key={relation.id}><div className="relation-meta"><span>{selectiveRelationLabels[relation.relation]}</span><span>置信度：{confidenceLabels[relation.confidence]}</span><span>待确认</span></div>{(sourceCode || targetCode) && <div className="relation-endpoints"><button className="relation-endpoint-button" onClick={() => sourceCode && focusOpenCodeEvidence(sourceCode.id)}>{sourceCode?.name ?? "未指定"}</button><b>→</b><button className="relation-endpoint-button" onClick={() => targetCode && focusOpenCodeEvidence(targetCode.id)}>{targetCode?.name ?? "未指定"}</button></div>}<p>{relation.statement}</p>{relationEvidence.map((item) => <div className="evidence-card" key={item.id}><div className="evidence-card-header"><span>关系证据</span><button className="text-button" onClick={() => focusEvidence(item.quote)}>查看原文</button></div><p>{item.quote}</p><small>{item.relevance}</small></div>)}</article>; })}</div>}
                {state.selectiveAnalysis.contradictions.length > 0 && <div className="selective-subsection"><div className="axial-subheading"><h3>矛盾与反例</h3><span>提醒你复核核心类别的边界</span></div><div className="evidence-list">{state.selectiveAnalysis.contradictions.map((item) => <div className="evidence-card" key={item.id}><div className="evidence-card-header"><span>反例证据</span><button className="text-button" onClick={() => focusEvidence(item.quote)}>查看原文</button></div><p>{item.quote}</p><small>{item.relevance}</small></div>)}</div></div>}
                {state.selectiveAnalysis.unanchoredEvidence.length > 0 && <div className="unanchored-box"><strong>需要手动核对的选择性证据（{state.selectiveAnalysis.unanchoredEvidence.length}）</strong>{state.selectiveAnalysis.unanchoredEvidence.map((item) => <p key={item.id}>{item.quote}：{item.relevance}</p>)}</div>}
                {state.selectiveAnalysis.reviewQuestions.length > 0 && <div className="review-questions"><strong>研究者复核问题</strong>{state.selectiveAnalysis.reviewQuestions.map((question) => <p key={question}>{question}</p>)}</div>}
                <div className="selective-confirm-actions"><span>确认表示你接受当前核心类别、故事线和命题作为研究工作假设，不代表已经完成理论验证。</span>{state.selectiveFreshness.status === "fresh" && state.stage === "SELECTIVE_CODING" && <button className="button button-primary" onClick={() => dispatch({ type: "confirm-selective" })}>确认选择性编码</button>}{state.selectiveFreshness.status === "confirmed" && <div className="selective-confirmed-next"><span className="confirmed-mark">选择性编码已确认</span><button className="button button-primary" onClick={() => downloadExport("markdown")}>导出研究备忘录 <span aria-hidden="true">↓</span></button></div>}</div>
              </>
            )}
          </section>
        )}

        {state.stage === "EXPORT" && state.selectiveFreshness.status === "confirmed" && (
          <section className="export-section" aria-labelledby="export-title" id="section-export">
            <div className="section-kicker"><span>06</span><span>结果导出与数据清理</span></div>
            <div className="export-heading">
              <div>
                <h2 id="export-title">研究结果已确认</h2>
                <p>导出文件由当前浏览器本地生成，不会创建服务端下载地址。导出范围只包含已确认的开放编码及当前分析结果。</p>
              </div>
              <div className="export-actions">
                <button className="button button-primary" onClick={() => downloadExport("markdown")}>导出 Markdown</button>
                <button className="button" onClick={() => downloadExport("json")}>导出 JSON</button>
              </div>
            </div>
            <div className="privacy-export-grid">
              <div className="privacy-export-card">
                <strong>数据流边界</strong>
                <p>原文只在本次请求中发送至服务端配置的 DeepSeek API；本应用不建立业务数据库或长期文件存储。</p>
              </div>
              <div className="privacy-export-card">
                <strong>浏览器存储</strong>
                <p>当前会话暂存在本标签页的 sessionStorage。公共或共用电脑上使用后，应立即清除本页数据。</p>
              </div>
              <div className="privacy-export-card privacy-export-card-warning">
                <strong>清除本页数据</strong>
                <p>会删除当前标签页中的文本、编码、证据和分析结果，不能恢复。</p>
                <button className="button button-danger" onClick={clearWorkspaceData}>清除并返回首页</button>
              </div>
            </div>
          </section>
        )}

      </div>

      {returnPromptCodeId && (
        <div className="dialog-backdrop" role="presentation">
          <div className="return-dialog" role="dialog" aria-modal="true" aria-labelledby="return-dialog-title">
            <h2 id="return-dialog-title">开放编码已修改</h2>
            <p>轴心编码和选择性编码已失效，需要回到开放编码阶段重新确认。</p>
            <div className="return-dialog-actions">
              <button className="button button-primary" onClick={() => { const codeId = returnPromptCodeId; setReturnPromptCodeId(null); queueSectionScroll("results"); window.setTimeout(() => focusOpenCode(codeId), 300); }}>回到开放编码</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
