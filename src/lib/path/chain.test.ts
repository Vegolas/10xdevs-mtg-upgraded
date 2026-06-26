import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import type { DeckCard } from "@/lib/deck";
import type { StepSnapshot } from "./types";
import { stepPlan, cumulativePathCost, isUpgradePlan } from "./chain";

/** Build a {@link DeckCard}; name/category/price/quantity are what the chain reads. */
function deckCard(name: string, category: CardCategory, priceUsd: number | null = null, quantity = 1): DeckCard {
  return {
    card: { name, typeLine: category, category, imageUrl: null, priceUsd, priceEur: null },
    quantity,
  };
}

/** Wrap resolved cards in a snapshot with no unresolved inputs. */
function snap(...cards: DeckCard[]): StepSnapshot {
  return { cards, unresolved: [] };
}

describe("stepPlan", () => {
  it("renders the base (position 0) as a grouped card list, not a diff", () => {
    const plan = stepPlan(null, snap(deckCard("Forest", "land"), deckCard("Sol Ring", "artifact")));

    expect(isUpgradePlan(plan)).toBe(false);
    if (isUpgradePlan(plan)) {
      return;
    }
    expect(plan.base.map((group) => group.category)).toEqual(["land", "artifact"]);
    expect(plan.base.flatMap((group) => group.cards.map((entry) => entry.card.name))).toEqual(["Forest", "Sol Ring"]);
  });

  it("diffs a later step (position ≥ 1) against the previous snapshot", () => {
    const prev = snap(deckCard("Forest", "land"), deckCard("Counterspell", "instant"));
    const cur = snap(deckCard("Forest", "land"), deckCard("Lightning Bolt", "instant"));

    const plan = stepPlan(prev, cur);

    expect(isUpgradePlan(plan)).toBe(true);
    if (!isUpgradePlan(plan)) {
      return;
    }
    expect(plan.remove.flatMap((g) => g.cards.map((e) => e.card.name))).toEqual(["Counterspell"]);
    expect(plan.add.flatMap((g) => g.cards.map((e) => e.card.name))).toEqual(["Lightning Bolt"]);
    expect(plan.shared.flatMap((g) => g.cards.map((e) => e.card.name))).toEqual(["Forest"]);
  });
});

describe("cumulativePathCost", () => {
  it("sums each step's add cost across the chain, excluding missing prices from the total", () => {
    const base = snap(deckCard("Forest", "land", null, 4));
    const step1 = snap(deckCard("Forest", "land", null, 4), deckCard("Sol Ring", "artifact", 10));
    const step2 = snap(
      deckCard("Forest", "land", null, 4),
      deckCard("Sol Ring", "artifact", 10),
      deckCard("Lightning Bolt", "instant", 2),
      deckCard("Mystery Card", "other", null),
    );

    // step1 adds Sol Ring ($10); step2 adds Bolt ($2) + an unpriced card.
    expect(cumulativePathCost([base, step1, step2])).toEqual({ total: 12, pricedCount: 2, missingCount: 1 });
  });

  it("is all zeros for a base-only path (nothing to acquire)", () => {
    expect(cumulativePathCost([snap(deckCard("Forest", "land", null, 4))])).toEqual({
      total: 0,
      pricedCount: 0,
      missingCount: 0,
    });
  });

  it("is all zeros for an empty path", () => {
    expect(cumulativePathCost([])).toEqual({ total: 0, pricedCount: 0, missingCount: 0 });
  });
});
