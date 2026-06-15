import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import type { CardGroup, DeckCard } from "./diff";
import { planAddCost } from "./cost";

/** Build a minimal {@link DeckCard}; only priceUsd and quantity matter to planAddCost. */
function deckCard(name: string, priceUsd: number | null, quantity = 1): DeckCard {
  return {
    card: { name, typeLine: "creature", category: "creature", imageUrl: null, priceUsd, priceEur: null },
    quantity,
  };
}

/** Wrap cards in a {@link CardGroup}. */
function group(cards: DeckCard[], category: CardCategory = "creature"): CardGroup {
  return { category, cards };
}

describe("planAddCost", () => {
  it("sums price × quantity across groups", () => {
    const result = planAddCost([
      group([deckCard("Forest", 1.5, 2)], "land"),
      group([deckCard("Sol Ring", 10, 1)], "artifact"),
    ]);

    expect(result).toEqual({ total: 13, pricedCount: 2, missingCount: 0 });
  });

  it("excludes null-price cards from the total but counts them as missing", () => {
    const result = planAddCost([group([deckCard("Sol Ring", 10, 1), deckCard("Obscure Card", null, 3)])]);

    expect(result).toEqual({ total: 10, pricedCount: 1, missingCount: 1 });
  });

  it("reports a zero total and zero priced count when no add card has a price", () => {
    const result = planAddCost([group([deckCard("Foo", null, 2), deckCard("Bar", null, 1)])]);

    expect(result).toEqual({ total: 0, pricedCount: 0, missingCount: 2 });
  });

  it("is all zeros for an empty add partition", () => {
    expect(planAddCost([])).toEqual({ total: 0, pricedCount: 0, missingCount: 0 });
  });
});
