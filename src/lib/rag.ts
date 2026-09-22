import type { EvidenceSearchResult, TextChunk, TextSpan } from "@/lib/domain-types";

export interface ChunkOptions {
  targetLength?: number;
  overlap?: number;
}

const DEFAULT_TARGET_LENGTH = 700;
const DEFAULT_OVERLAP = 100;

function paragraphRanges(text: string): TextSpan[] {
  const ranges: TextSpan[] = [];
  const pattern = /[^\n]+(?:\n|$)/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const end = start + raw.length;
    if (raw.trim()) ranges.push({ start, end });
  }
  return ranges;
}

function splitLongRange(range: TextSpan, targetLength: number, overlap: number): TextSpan[] {
  const ranges: TextSpan[] = [];
  const step = Math.max(1, targetLength - overlap);
  for (let start = range.start; start < range.end; start += step) {
    ranges.push({ start, end: Math.min(range.end, start + targetLength) });
    if (start + targetLength >= range.end) break;
  }
  return ranges;
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const targetLength = Math.max(80, options.targetLength ?? DEFAULT_TARGET_LENGTH);
  const overlap = Math.max(0, Math.min(options.overlap ?? DEFAULT_OVERLAP, targetLength - 1));
  const paragraphs = paragraphRanges(text);
  if (paragraphs.length === 0 && text) {
    return splitLongRange({ start: 0, end: text.length }, targetLength, overlap).map((range, index) => ({
      id: "chunk-" + (index + 1),
      ...range,
      text: text.slice(range.start, range.end),
    }));
  }

  const ranges: TextSpan[] = [];
  let current: TextSpan | null = null;
  for (const paragraph of paragraphs) {
    if (paragraph.end - paragraph.start > targetLength) {
      if (current) {
        ranges.push(current);
        current = null;
      }
      ranges.push(...splitLongRange(paragraph, targetLength, overlap));
      continue;
    }

    if (!current) {
      current = { ...paragraph };
      continue;
    }

    if (paragraph.end - current.start <= targetLength) {
      current.end = paragraph.end;
    } else {
      ranges.push(current);
      const overlapStart = Math.max(current.start, current.end - overlap);
      current = { start: overlapStart, end: paragraph.end };
      if (current.end - current.start > targetLength) {
        ranges.push(...splitLongRange(current, targetLength, overlap));
        current = null;
      }
    }
  }
  if (current) ranges.push(current);

  return ranges.map((range, index) => ({
    id: "chunk-" + (index + 1),
    ...range,
    text: text.slice(range.start, range.end),
  }));
}

function searchTerms(query: string): string[] {
  const terms = new Set<string>();
  const compact = query.replace(/\s+/g, "").trim();
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) terms.add(word);
  for (let index = 0; index < compact.length - 1; index += 1) {
    const pair = compact.slice(index, index + 2);
    if (/^[\u3400-\u9fff]{2}$/.test(pair)) terms.add(pair);
  }
  if (compact.length > 0) terms.add(compact.toLowerCase());
  return [...terms];
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let fromIndex = 0;
  while (fromIndex < text.length) {
    const index = text.indexOf(term, fromIndex);
    if (index < 0) break;
    count += 1;
    fromIndex = index + Math.max(1, term.length);
  }
  return count;
}

export function retrieveEvidence(query: string, chunks: TextChunk[], topK = 5): EvidenceSearchResult[] {
  const terms = searchTerms(query.toLowerCase());
  return chunks
    .map((chunk) => {
      const searchableText = chunk.text.toLowerCase();
      const score = terms.reduce((total, term) => total + countOccurrences(searchableText, term), 0);
      return {
        id: "evidence-" + chunk.id,
        chunkId: chunk.id,
        start: chunk.start,
        end: chunk.end,
        quote: chunk.text,
        relevance: score > 0 ? "临时词法检索命中 " + score + " 个关键词/字符片段" : "",
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.start - right.start)
    .slice(0, Math.max(1, topK));
}
