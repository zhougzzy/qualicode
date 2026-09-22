import { describe, expect, it } from "vitest";
import { chunkText, retrieveEvidence } from "@/lib/rag";

describe("temporary lexical RAG", () => {
  it("chunks paragraphs with stable offsets", () => {
    const text = Array.from({ length: 8 }, (_, index) => `第${index + 1}段关于工作压力和访谈材料中的家人陪伴。`).join("\n");
    const chunks = chunkText(text, { targetLength: 80, overlap: 12 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].id).toBe("chunk-1");
    for (const chunk of chunks) {
      expect(text.slice(chunk.start, chunk.end)).toBe(chunk.text);
    }
  });

  it("returns top-k evidence ranked by matching Chinese character pairs", () => {
    const text = Array.from({ length: 8 }, (_, index) => `第${index + 1}段：受访者描述工作压力很大，并记录了应对策略。`).join("\n");
    const chunks = chunkText(text, { targetLength: 80, overlap: 12 });
    const evidence = retrieveEvidence("工作压力", chunks, 2);

    expect(evidence).toHaveLength(2);
    expect(evidence[0].quote).toContain("工作");
    expect(evidence[0].score).toBeGreaterThanOrEqual(evidence[1].score);
    expect(evidence[0].start).toBeGreaterThanOrEqual(0);
  });
});
