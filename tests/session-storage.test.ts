import { describe, expect, it } from "vitest";
import { createInitialSession } from "@/lib/state";
import { clearPendingUploads, clearSession, loadPendingUploads, loadSession, savePendingUploads, saveSession } from "@/lib/session-storage";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("sessionStorage adapter", () => {
  it("round-trips a valid snapshot", () => {
    const storage = createMemoryStorage();
    const session = createInitialSession();

    expect(saveSession(session, storage)).toBe(true);
    expect(loadSession(storage)).toMatchObject({
      sessionId: session.sessionId,
      stage: "UPLOAD",
      textLocked: false,
    });
  });

  it("clears corrupted snapshots instead of throwing", () => {
    const storage = createMemoryStorage();
    storage.setItem("qualicode:workspace:v1", "{not-json");

    expect(loadSession(storage)).toBeNull();
    expect(storage.getItem("qualicode:workspace:v1")).toBeNull();
  });

  it("supports explicit session clearing", () => {
    const storage = createMemoryStorage();
    saveSession(createInitialSession(), storage);
    clearSession(storage);

    expect(loadSession(storage)).toBeNull();
  });

  it("round-trips multiple pending uploads for the page transition", () => {
    const storage = createMemoryStorage();
    const uploads = ["访谈A.docx", "访谈B.pdf"].map((fileName, index) => ({
      document: {
        id: `document-${index}`,
        fileName,
        fileType: index === 0 ? "docx" as const : "pdf" as const,
        sizeBytes: 100,
        rawExtractedText: `文本${index + 1}`,
      },
      rawExtractedText: `文本${index + 1}`,
      warnings: [],
    }));

    expect(savePendingUploads(uploads, storage)).toBe(true);
    expect(loadPendingUploads(storage)).toEqual(uploads);
    clearPendingUploads(storage);
    expect(loadPendingUploads(storage)).toBeNull();
  });
});
