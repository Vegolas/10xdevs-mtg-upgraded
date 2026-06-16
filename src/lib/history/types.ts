/**
 * On-device comparison history data model (roadmap S-04 / FR-009).
 *
 * A saved comparison is inputs-only — the two deck-list texts plus identity, a
 * save timestamp, and a tiny label summary. The plan itself is never persisted;
 * it is re-derived on revisit by refilling the textareas (see
 * context/changes/on-device-history/plan.md). The label summary is the one
 * deliberate denormalization, so the drawer can label entries without a lookup.
 */

/** A counted snapshot of a plan's deltas, kept only to label a saved entry. */
export interface ComparisonSummary {
  /** Σ quantities across the plan's `add` groups at save time. */
  addCount: number;
  /** Σ quantities across the plan's `remove` groups at save time. */
  removeCount: number;
}

/** One persisted, inputs-only comparison the user explicitly saved. */
export interface SavedComparison {
  /** Stable unique id (the hook supplies `crypto.randomUUID()`). */
  id: string;
  /** The base deck list text, verbatim. */
  baseText: string;
  /** The target deck list text, verbatim. */
  targetText: string;
  /** Epoch milliseconds when this entry was last saved. */
  savedAt: number;
  /** Denormalized counts used only for the drawer label. */
  summary: ComparisonSummary;
}

/** The envelope actually written to localStorage; `version` gates migration. */
export interface HistoryEnvelope {
  version: number;
  items: SavedComparison[];
}

/** Current persisted-schema version; bump to invalidate older payloads. */
export const HISTORY_VERSION = 1;

/** Maximum entries retained; saving beyond this evicts the oldest. */
export const HISTORY_CAP = 30;
