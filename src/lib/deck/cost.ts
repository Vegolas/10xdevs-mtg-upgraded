/**
 * Total upgrade cost (roadmap S-03).
 *
 * The pure, quantity-aware aggregation behind FR-007: sum the additions' prices so
 * the UI can show an honest headline total. Prices are nullable (Scryfall coverage
 * varies), so this sums only the priced cards and separately counts the ones with
 * no price — the total is then honestly partial rather than silently wrong, and the
 * UI can show `—` (not a misleading `$0.00`) when nothing in the add partition is
 * priced. The diff carries copy deltas, so each card contributes `priceUsd × quantity`.
 */

import type { CardGroup } from "./diff";

/** Priced/missing breakdown of an upgrade plan's additions, for an honest total. */
export interface PlanCost {
  /** Σ (priceUsd × quantity) over add cards with a non-null priceUsd. */
  total: number;
  /** Number of add cards that had a priceUsd. */
  pricedCount: number;
  /** Number of add cards with priceUsd === null. */
  missingCount: number;
}

/**
 * Aggregate the cost of an upgrade plan's `add` partition. Walks every group's
 * cards: a card with a price adds `priceUsd × quantity` to the total and counts as
 * priced; a card without one is counted as missing and excluded from the total.
 * An empty or absent add partition yields all zeros.
 */
export function planAddCost(add: CardGroup[]): PlanCost {
  let total = 0;
  let pricedCount = 0;
  let missingCount = 0;

  for (const group of add) {
    for (const entry of group.cards) {
      if (entry.card.priceUsd !== null) {
        total += entry.card.priceUsd * entry.quantity;
        pricedCount += 1;
      } else {
        missingCount += 1;
      }
    }
  }

  return { total, pricedCount, missingCount };
}
