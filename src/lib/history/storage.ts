/**
 * localStorage bridge for comparison history (roadmap S-04 / FR-009).
 *
 * Reads/writes a versioned envelope and parses defensively: corrupt JSON, a
 * missing/mismatched version, or malformed items degrade to an empty history
 * rather than throwing (PRD graceful-handling guardrail). parse/serialize are
 * pure (and unit-tested without a DOM); load/save are the only impure wrappers
 * and are guarded for SSR. See context/changes/on-device-history/plan.md.
 */

import { HISTORY_CAP, HISTORY_VERSION } from "./types";
import type { HistoryEnvelope, SavedComparison } from "./types";

/** localStorage key; the `.v1` suffix is belt-and-suspenders over the envelope version. */
export const STORAGE_KEY = "deckdelta.history.v1";

/** Narrow an unknown value to a well-formed {@link SavedComparison}. */
function isSavedComparison(value: unknown): value is SavedComparison {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const summary = candidate.summary;
  if (typeof summary !== "object" || summary === null) {
    return false;
  }
  const summaryRecord = summary as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.baseText === "string" &&
    typeof candidate.targetText === "string" &&
    typeof candidate.savedAt === "number" &&
    typeof summaryRecord.addCount === "number" &&
    typeof summaryRecord.removeCount === "number"
  );
}

/**
 * Parse a raw localStorage string into a clean SavedComparison[]. Returns [] for
 * null/empty input, invalid JSON, a non-object payload, a version mismatch, or a
 * missing items array. Otherwise keeps only well-formed items, truncated to
 * HISTORY_CAP. Pure — no DOM access — so it is unit-tested directly.
 */
export function parseHistory(raw: string | null): SavedComparison[] {
  if (raw === null || raw === "") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — degrade to an empty history rather than throwing.
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== HISTORY_VERSION || !Array.isArray(envelope.items)) {
    return [];
  }

  return envelope.items.filter(isSavedComparison).slice(0, HISTORY_CAP);
}

/** Wrap items in the current envelope and stringify. Pure; round-trips parseHistory. */
export function serializeHistory(items: SavedComparison[]): string {
  const envelope: HistoryEnvelope = { version: HISTORY_VERSION, items };
  return JSON.stringify(envelope);
}

/** Load saved history from localStorage; [] under SSR or on any parse failure. */
export function loadHistory(): SavedComparison[] {
  if (typeof window === "undefined") {
    return [];
  }
  return parseHistory(window.localStorage.getItem(STORAGE_KEY));
}

/**
 * Persist history to localStorage. No-op under SSR. Quota/serialization failures
 * are swallowed (non-fatal) — the cap keeps inputs-only payloads far below quota.
 */
export function saveHistory(items: SavedComparison[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeHistory(items));
  } catch {
    // Quota exceeded or storage unavailable — history is best-effort, so ignore.
  }
}
