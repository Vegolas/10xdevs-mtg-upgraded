/**
 * Display-only ordering for the upgrade plan's flat view (roadmap S-06).
 *
 * The grouped-by-type, name-within-bucket layout is the default and lives in the
 * domain layer (`src/lib/deck/diff.ts`). This module adds the opt-in *flat* mode:
 * a pure flatten + re-sort over the already-computed `CardGroup[]`, kept in the
 * presentation tier so `src/lib/deck` stays pure and the cost total — fed the
 * grouped `plan.add` directly — is naturally unaffected by ordering.
 */

import type { CardGroup, DeckCard } from "@/lib/deck";

/** Grouped-by-type (default) vs. one flat sorted list. */
export type SortLayout = "grouped" | "flat";
/** Which field the flat list orders by. */
export type SortKey = "name" | "price";
/** Ascending or descending within the chosen key. */
export type SortDirection = "asc" | "desc";

/** The full sort preference. `key`/`direction` are retained while grouped so
 * toggling back to flat restores the last flat sort. */
export interface SortMode {
  layout: SortLayout;
  key: SortKey;
  direction: SortDirection;
}

/** Grouped-by-type, name A→Z — the status quo before this slice. */
export const DEFAULT_SORT_MODE: SortMode = { layout: "grouped", key: "name", direction: "asc" };

/** Stable A→Z name comparison, the deterministic tie-break for every key. */
function compareByName(a: DeckCard, b: DeckCard): number {
  return a.card.name.localeCompare(b.card.name);
}

/**
 * Order one flat card list by `key`/`direction`, returning a new array.
 *
 * Price: a `null` price is treated as "after" every real price regardless of
 * direction (unpriced cards always sink to the bottom); ties — and null-vs-null —
 * break by name A→Z so the order is stable. Name: A→Z for `asc`, Z→A for `desc`.
 * Pure: copies the input, never mutating it.
 */
export function sortCards(cards: DeckCard[], key: SortKey, direction: SortDirection): DeckCard[] {
  const flat = [...cards];

  flat.sort((a, b) => {
    if (key === "price") {
      const priceA = a.card.priceUsd;
      const priceB = b.card.priceUsd;
      // Unpriced cards sort last in both directions.
      if (priceA === null && priceB === null) {
        return compareByName(a, b);
      }
      if (priceA === null) {
        return 1;
      }
      if (priceB === null) {
        return -1;
      }
      if (priceA !== priceB) {
        return direction === "asc" ? priceA - priceB : priceB - priceA;
      }
      // Equal price — deterministic name A→Z tie-break.
      return compareByName(a, b);
    }

    const byName = compareByName(a, b);
    return direction === "asc" ? byName : -byName;
  });

  return flat;
}

/**
 * Flatten every group's cards into one list ordered by `key`/`direction`. The
 * flat-layout counterpart to the grouped-by-type default; thin wrapper over
 * {@link sortCards}.
 */
export function flattenAndSort(groups: CardGroup[], key: SortKey, direction: SortDirection): DeckCard[] {
  return sortCards(
    groups.flatMap((group) => group.cards),
    key,
    direction,
  );
}
