/**
 * Path domain types (roadmap S-05 / user-accounts).
 *
 * An upgrade path is an ordered chain of named checkpoints. Each step stores its
 * raw pasted `listText` plus a client-produced, server-stored resolved
 * {@link StepSnapshot}; views recompute plans and costs from the snapshot, so the
 * card-data source is never touched on read. {@link UpgradePath} and
 * {@link PathStep} mirror the `upgrade_paths` / `path_steps` rows (see the
 * user-accounts migration); snapshots round-trip through the row's `jsonb`
 * column via `@/lib/path`'s `serializeSnapshot` / `parseSnapshot`.
 */

import type { DeckCard } from "@/lib/deck";
import type { UnresolvedReason } from "@/lib/card-data";

/**
 * An input that did not resolve, as stored in a snapshot — an `UnresolvedEntry`
 * minus the base/target {@link DeckSide} tag (a single deck has no side).
 */
export interface UnresolvedLite {
  name: string;
  reason: UnresolvedReason;
  suggestion: string | null;
}

/**
 * One checkpoint's resolved deck, captured at save time. `cards` are the
 * quantity-tagged resolved cards; `unresolved` are the inputs that did not
 * resolve (kept so the view can surface them). Prices/images are at-save values
 * and may be stale — snapshots are never re-resolved.
 */
export interface StepSnapshot {
  cards: DeckCard[];
  unresolved: UnresolvedLite[];
}

/** One checkpoint in a path — mirrors a `path_steps` row. */
export interface PathStep {
  id: string;
  pathId: string;
  position: number;
  name: string;
  listText: string;
  snapshot: StepSnapshot;
  createdAt: string;
  updatedAt: string;
}

/** An owned upgrade path — mirrors an `upgrade_paths` row. */
export interface UpgradePath {
  id: string;
  ownerId: string;
  title: string;
  visibility: "private" | "unlisted";
  createdAt: string;
  updatedAt: string;
}
