import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import type { CardGroup, DeckCard } from "@/lib/deck";
import { categoryLabel, formatSignedUsd, formatUsd, groupCopies } from "./labels";

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

describe("formatUsd", () => {
  it("renders the em-dash marker for a null price", () => {
    expect(formatUsd(null)).toBe("—");
  });

  it("renders an integer with two decimals and the approximate prefix", () => {
    expect(formatUsd(12)).toBe("~$12.00");
  });

  it("renders a fractional value to two decimals", () => {
    expect(formatUsd(1.5)).toBe("~$1.50");
  });

  it("renders zero as an explicit ~$0.00", () => {
    expect(formatUsd(0)).toBe("~$0.00");
  });
});

describe("formatSignedUsd", () => {
  it("renders the em-dash marker for a null price regardless of sign", () => {
    expect(formatSignedUsd(null, "add")).toBe("—");
    expect(formatSignedUsd(null, "remove")).toBe("—");
  });

  it("prefixes added prices with a plus sign", () => {
    expect(formatSignedUsd(94.38, "add")).toBe("+$94.38");
  });

  it("prefixes removed prices with a true minus glyph", () => {
    expect(formatSignedUsd(4.77, "remove")).toBe("−$4.77");
  });

  it("renders to two decimals like formatUsd", () => {
    expect(formatSignedUsd(1.5, "add")).toBe("+$1.50");
    expect(formatSignedUsd(12, "remove")).toBe("−$12.00");
  });

  it("renders zero with an explicit sign", () => {
    expect(formatSignedUsd(0, "add")).toBe("+$0.00");
  });
});
