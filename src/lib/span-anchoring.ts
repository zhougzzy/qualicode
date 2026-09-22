import type { CodeLabel, TextSpan } from "@/lib/domain-types";

export interface HighlightSegment {
  start: number;
  end: number;
  text: string;
  codeIds: string[];
}

export function isValidTextSpan(text: string, span: TextSpan): boolean {
  return (
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.end > span.start &&
    span.end <= text.length
  );
}

export function findTextSpan(text: string, quote: string, fromIndex = 0): TextSpan | null {
  const start = text.indexOf(quote, fromIndex);
  return start < 0 ? null : { start, end: start + quote.length };
}

function normalizedSpans(text: string, codes: CodeLabel[]): Array<{ codeId: string; span: TextSpan }> {
  return codes.flatMap((code) =>
    code.status === "deleted"
      ? []
      : code.spans
          .filter((span) => isValidTextSpan(text, span))
          .map((span) => ({ codeId: code.id, span })),
  );
}

export function buildHighlightSegments(text: string, codes: CodeLabel[]): HighlightSegment[] {
  if (!text) return [];

  const spans = normalizedSpans(text, codes);
  const boundaries = new Set<number>([0, text.length]);
  for (const { span } of spans) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }

  const sortedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  const segments: HighlightSegment[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];
    if (start === end) continue;

    const codeIds = spans
      .filter(({ span }) => span.start <= start && span.end >= end)
      .map(({ codeId }) => codeId)
      .filter((codeId, codeIndex, ids) => ids.indexOf(codeId) === codeIndex);

    segments.push({ start, end, text: text.slice(start, end), codeIds });
  }

  return segments;
}

