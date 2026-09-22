"use client";

import { useMemo, useRef, useState } from "react";
import type { CodeLabel, TextSpan } from "@/lib/domain-types";
import { buildHighlightSegments } from "@/lib/span-anchoring";

interface TextCodingWorkspaceProps {
  text: string;
  codes: CodeLabel[];
  editable: boolean;
  onCreateCode: (span: TextSpan, label: string) => void;
}

interface PendingSelection {
  span: TextSpan;
  quote: string;
}

function getBoundaryOffset(root: HTMLElement, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function codeColorIndex(codeId: string, codes: CodeLabel[]): number {
  const index = codes.findIndex((code) => code.id === codeId);
  return index < 0 ? 0 : index % 6;
}

export function TextCodingWorkspace({ text, codes, editable, onCreateCode }: TextCodingWorkspaceProps) {
  const textRootRef = useRef<HTMLPreElement>(null);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const segments = useMemo(() => buildHighlightSegments(text, codes), [text, codes]);

  const handleMouseUp = () => {
    if (!editable || !textRootRef.current) return;
    const browserSelection = window.getSelection();
    if (!browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) return;

    const range = browserSelection.getRangeAt(0);
    const start = getBoundaryOffset(textRootRef.current, range.startContainer, range.startOffset);
    const end = getBoundaryOffset(textRootRef.current, range.endContainer, range.endOffset);
    if (start === null || end === null) return;

    const span = start <= end ? { start, end } : { start: end, end: start };
    if (span.end <= span.start) return;

    setError("");
    setLabel("");
    setSelection({ span, quote: text.slice(span.start, span.end) });
  };

  const submitCode = () => {
    const trimmedLabel = label.trim();
    if (!selection) return;
    if (!trimmedLabel) {
      setError("请先填写开放编码名称。");
      return;
    }

    onCreateCode(selection.span, trimmedLabel);
    setSelection(null);
    setLabel("");
    setError("");
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="coding-workspace">
      <div className="coding-workspace-header">
        <div>
          <h3>语义片段编码</h3>
          <p className="hint">
            {editable ? "在锁定文本中拖选连续语义片段，然后为它创建开放编码。" : "当前阶段只读，可查看已保存的原文高亮和编码。"}
          </p>
        </div>
        <span className="status-chip">{codes.filter((code) => code.status !== "deleted").length} 条有效编码</span>
      </div>

      <pre
        ref={textRootRef}
        className={`coding-text ${editable ? "selectable" : ""}`}
        onMouseUp={handleMouseUp}
        aria-label="锁定访谈文本编码区"
      >
        {segments.map((segment) => {
          if (segment.codeIds.length === 0) {
            return <span key={`${segment.start}-${segment.end}`}>{segment.text}</span>;
          }

          const names = segment.codeIds
            .map((codeId) => codes.find((code) => code.id === codeId)?.name)
            .filter((name): name is string => Boolean(name));
          const colorIndex = codeColorIndex(segment.codeIds[0], codes);
          return (
            <mark
              key={`${segment.start}-${segment.end}`}
              className={`code-highlight code-highlight-${colorIndex} ${segment.codeIds.length > 1 ? "overlap" : ""}`}
              title={names.join("、")}
              data-code-ids={segment.codeIds.join(",")}
            >
              {segment.text}
            </mark>
          );
        })}
      </pre>

      {selection && editable && (
        <div className="selection-editor" aria-label="为选中文本创建开放编码">
          <p className="evidence">已选择原文：{selection.quote}</p>
          <div className="field">
            <label htmlFor="new-open-code-label">开放编码名称</label>
            <input
              id="new-open-code-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="例如：回避表达不同意见"
              autoFocus
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="toolbar" style={{ marginTop: 12, justifyContent: "flex-start" }}>
            <button className="button primary" onClick={submitCode}>保存开放编码</button>
            <button className="button" onClick={() => setSelection(null)}>取消选择</button>
          </div>
        </div>
      )}

      {!text && <div className="empty">当前没有可编码文本。</div>}
    </div>
  );
}

