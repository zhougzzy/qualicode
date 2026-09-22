import type { CodeLabel } from "@/lib/domain-types";

interface OriginalEvidencePanelProps {
  code: Pick<CodeLabel, "sourceQuote" | "editedQuote">;
  status?: CodeLabel["status"];
  onAccept?: () => void;
}

export function OriginalEvidencePanel({ code, status, onAccept }: OriginalEvidencePanelProps) {
  return (
    <>
      <p className="evidence">锁定文本原文：{code.sourceQuote}</p>
      {code.editedQuote && code.editedQuote !== code.sourceQuote && (
        <p className="evidence">研究者修订片段：{code.editedQuote}</p>
      )}
      {status === "suggested" && onAccept && (
        <div className="evidence-chain-actions">
          <button className="text-button" onClick={onAccept}>接受该开放编码</button>
        </div>
      )}
    </>
  );
}
