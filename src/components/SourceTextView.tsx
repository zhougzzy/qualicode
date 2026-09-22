"use client";

import type { CodeLabel } from "@/lib/domain-types";
import { buildHighlightSegments } from "@/lib/span-anchoring";

interface SourceTextViewProps {
  text: string;
  codes: CodeLabel[];
  onCodeClick?: (codeId: string) => void;
}

export function SourceTextView({ text, codes, onCodeClick }: SourceTextViewProps) {
  const segments = buildHighlightSegments(text, codes);
  const codeIndex = new Map(codes.map((code, index) => [code.id, index]));
  const anchoredCodes = new Set<string>();

  return (
    <div className="reading-text source-text-view" aria-label="已锁定的访谈原文">
      {segments.map((segment) => {
        const primaryCodeId = segment.codeIds[0];
        const hasAnchor = Boolean(primaryCodeId && !anchoredCodes.has(primaryCodeId));
        if (primaryCodeId) anchoredCodes.add(primaryCodeId);
        const className = segment.codeIds.length > 0
          ? "source-code-anchor code-highlight-" + (codeIndex.get(primaryCodeId ?? "") ?? 0) + (segment.codeIds.length > 1 ? " overlap" : "")
          : undefined;
        return (
          <span
            key={String(segment.start) + "-" + String(segment.end)}
            id={hasAnchor ? "source-code-" + primaryCodeId : undefined}
            className={className}
            data-code-ids={segment.codeIds.join(",") || undefined}
            onClick={() => primaryCodeId && onCodeClick?.(primaryCodeId)}
            role={primaryCodeId ? "button" : undefined}
            tabIndex={primaryCodeId ? 0 : undefined}
          >
            {segment.text}
            {segment.codeIds.length > 1 && (
              <sup className="overlap-code-indexes" aria-label={`重叠开放编码：${segment.codeIds.map((id) => (codeIndex.get(id) ?? 0) + 1).join("、")}`}>
                {segment.codeIds.map((id) => (codeIndex.get(id) ?? 0) + 1).join("/")}
              </sup>
            )}
          </span>
        );
      })}
    </div>
  );
}
