import type { ConvertResult } from "@/lib/api-contract";
import type { SessionSnapshot } from "@/lib/domain-types";

export const SESSION_STORAGE_KEY = "qualicode:workspace:v1";
export const PENDING_UPLOADS_KEY = "qualicode:pending-uploads:v1";

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SessionSnapshot>;
  return (
    snapshot.schemaVersion === 1 &&
    typeof snapshot.sessionId === "string" &&
    typeof snapshot.stage === "string" &&
    typeof snapshot.confirmedText === "string" &&
    typeof snapshot.draftText === "string" &&
    typeof snapshot.textLocked === "boolean" &&
    Array.isArray(snapshot.openCodes)
  );
}

export function loadSession(storage?: Storage): SessionSnapshot | null {
  if (typeof window === "undefined" && !storage) return null;
  const target = storage ?? window.sessionStorage;

  try {
    const raw = target.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSessionSnapshot(parsed)) {
      target.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    const snapshotWithWarnings = parsed as SessionSnapshot & { parseWarnings?: unknown };
    return {
      ...snapshotWithWarnings,
      documents: Array.isArray(snapshotWithWarnings.documents)
        ? snapshotWithWarnings.documents
        : snapshotWithWarnings.document
          ? [snapshotWithWarnings.document]
          : [],
      parseWarnings: Array.isArray(snapshotWithWarnings.parseWarnings)
        ? snapshotWithWarnings.parseWarnings
        : [],
      evidence: Array.isArray(snapshotWithWarnings.evidence)
        ? snapshotWithWarnings.evidence
        : [],
    };
  } catch {
    try {
      target.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing contexts.
    }
    return null;
  }
}

export function savePendingUploads(results: ConvertResult[], storage?: Storage): boolean {
  if (typeof window === "undefined" && !storage) return false;
  const target = storage ?? window.sessionStorage;

  try {
    target.setItem(PENDING_UPLOADS_KEY, JSON.stringify(results));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingUploads(storage?: Storage): ConvertResult[] | null {
  if (typeof window === "undefined" && !storage) return null;
  const target = storage ?? window.sessionStorage;

  try {
    const raw = target.getItem(PENDING_UPLOADS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((item) => {
      if (!item || typeof item !== "object") return false;
      const result = item as Partial<ConvertResult>;
      return Boolean(result.document && typeof result.rawExtractedText === "string" && Array.isArray(result.warnings));
    })) return null;
    return parsed as ConvertResult[];
  } catch {
    return null;
  }
}

export function clearPendingUploads(storage?: Storage): void {
  if (typeof window === "undefined" && !storage) return;
  try {
    (storage ?? window.sessionStorage).removeItem(PENDING_UPLOADS_KEY);
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }
}

export function saveSession(snapshot: SessionSnapshot, storage?: Storage): boolean {
  if (typeof window === "undefined" && !storage) return false;
  const target = storage ?? window.sessionStorage;

  try {
    target.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage?: Storage): void {
  if (typeof window === "undefined" && !storage) return;
  try {
    (storage ?? window.sessionStorage).removeItem(SESSION_STORAGE_KEY);
  } catch {
    // There is nothing useful to do when browser storage is unavailable.
  }
}
