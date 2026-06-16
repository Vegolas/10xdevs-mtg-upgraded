/**
 * Pure history transforms (roadmap S-04 / FR-009).
 *
 * Every mutation is a pure function over a SavedComparison[] — no I/O, no clock,
 * no id generation (the caller injects `id`/`savedAt`, so this stays testable in
 * the node env). The localStorage bridge lives in ./storage. See
 * context/changes/on-device-history/plan.md.
 */

import type { CardGroup, UpgradePlan } from "@/lib/deck";
import { HISTORY_CAP } from "./types";
import type { ComparisonSummary, SavedComparison } from "./types";

/**
 * Normalize one deck-list text for dedup: unify line endings, trim every line,
 * drop blank lines. Two pastes that differ only in incidental whitespace collapse
 * to the same string. The result never contains a blank line, so a double newline
 * is a safe delimiter between the two halves of a {@link historyKey}.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * The dedup key for a comparison: the two normalized deck texts joined by a
 * double newline (which cannot occur inside a normalized half). Order-sensitive,
 * so swapping base and target yields a distinct key.
 */
export function historyKey(baseText: string, targetText: string): string {
  return `${normalizeText(baseText)}\n\n${normalizeText(targetText)}`;
}

/** Sum copy counts across a diff partition's groups. */
function countCopies(groups: CardGroup[]): number {
  let total = 0;
  for (const group of groups) {
    for (const entry of group.cards) {
      total += entry.quantity;
    }
  }
  return total;
}

/** Counted summary of a plan's add/remove deltas, used only to label an entry. */
export function summarizePlan(plan: UpgradePlan): ComparisonSummary {
  return {
    addCount: countCopies(plan.add),
    removeCount: countCopies(plan.remove),
  };
}

/**
 * Assemble a SavedComparison. `id` and `savedAt` are injected by the caller (the
 * React hook supplies `crypto.randomUUID()` + `Date.now()`), so this stays pure.
 */
export function makeComparison(
  baseText: string,
  targetText: string,
  plan: UpgradePlan,
  id: string,
  savedAt: number,
): SavedComparison {
  return {
    id,
    baseText,
    targetText,
    savedAt,
    summary: summarizePlan(plan),
  };
}

/**
 * Insert a saved comparison, deduped by normalized inputs. An existing entry with
 * the same key is dropped (the new entry carries the fresh savedAt) and the new
 * entry is prepended; otherwise it is simply prepended. The result is truncated to
 * HISTORY_CAP, dropping the oldest. Returns a new array; never mutates.
 */
export function addComparison(items: SavedComparison[], entry: SavedComparison): SavedComparison[] {
  const key = historyKey(entry.baseText, entry.targetText);
  const withoutDuplicate = items.filter((item) => historyKey(item.baseText, item.targetText) !== key);
  return [entry, ...withoutDuplicate].slice(0, HISTORY_CAP);
}

/** Remove the entry with the given id. A missing id is a no-op. Never mutates. */
export function deleteComparison(items: SavedComparison[], id: string): SavedComparison[] {
  return items.filter((item) => item.id !== id);
}

/** Clear all saved comparisons. */
export function clearComparisons(): SavedComparison[] {
  return [];
}
