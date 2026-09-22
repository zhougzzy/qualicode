import type { CodeLabel } from "@/lib/domain-types";

interface CodeEditDialogProps {
  code: CodeLabel;
  editedLabel: string;
  editedQuote: string;
  onChangeLabel: (value: string) => void;
  onChangeQuote: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function CodeEditDialog({
  code,
  editedLabel,
  editedQuote,
  onChangeLabel,
  onChangeQuote,
  onSave,
  onCancel,
}: CodeEditDialogProps) {
  return (
    <div className="code-edit-dialog" role="dialog" aria-label={`修改编码：${code.name}`}>
      <p className="hint">修改只作用于该条编码，不会修改锁定文本。</p>
      <p className="evidence">锁定文本原文（不可变）：{code.sourceQuote}</p>
      <div className="field">
        <label htmlFor={`label-${code.id}`}>开放编码</label>
        <input id={`label-${code.id}`} value={editedLabel} onChange={(event) => onChangeLabel(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`quote-${code.id}`}>研究者修订片段</label>
        <input id={`quote-${code.id}`} value={editedQuote} onChange={(event) => onChangeQuote(event.target.value)} />
      </div>
      <div className="toolbar" style={{ marginTop: 12, justifyContent: "flex-start" }}>
        <button className="button primary" onClick={onSave}>保存该条修订</button>
        <button className="button" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
