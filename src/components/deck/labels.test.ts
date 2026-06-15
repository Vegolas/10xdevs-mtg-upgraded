import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import type { CardGroup, DeckCard } from "@/lib/deck";
import { categoryLabel, groupCopies } from "./labels";

/** Build a minimal {@link DeckCard}; only name and quantity matter to groupCopies. */
function deckCard(name: string, quantity = 1): DeckCard {
  return {
    card: { name, typeLine: "land", category: "land", imageUrl: null, priceUsd: null, priceEur: null },
    quantity,
  };
}

/** Wrap cards in a {@link CardGroup}. */
function group(cards: DeckCard[], category: CardCategory = "land"): CardGroup {
  return { category, cards };
}

describe("groupCopies", () => {
  it("sums per-card quantities, not distinct cards", () => {
    const result = groupCopies(group([deckCard("Mountain", 2), deckCard("Forest", 6), deckCard("Sol Ring", 1)]));

    expect(result).toBe(9);
  });

  it("counts singletons as one copy each", () => {
    const result = groupCopies(group([deckCard("Island"), deckCard("Swamp"), deckCard("Plains")]));

    expect(result).toBe(3);
  });

  it("is zero for an empty group", () => {
    expect(groupCopies(group([]))).toBe(0);
  });
});

describe("categoryLabel", () => {
  it("maps a category to its plural display label", () => {
    expect(categoryLabel("land")).toBe("Lands");
    expect(categoryLabel("sorcery")).toBe("Sorceries");
  });
});
