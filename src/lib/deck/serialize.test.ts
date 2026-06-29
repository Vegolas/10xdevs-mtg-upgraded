import { describe, it, expect } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { parseDeckList } from "./parse";
import { deckCardsToText } from "./serialize";
import type { DeckCard } from "./diff";

/** Build a minimal {@link Card}; only name + category matter to these tests. */
function card(name: string, category: CardCategory = "other"): Card {
  return { name, typeLine: category, category, imageUrl: null, priceUsd: null, priceEur: null };
}

const deck: DeckCard[] = [
  { card: card("Sol Ring", "artifact"), quantity: 1 },
  { card: card("Forest", "land"), quantity: 10 },
  { card: card("Llanowar Elves", "creature"), quantity: 1 },
];

describe("deckCardsToText", () => {
  it("renders one `<qty> <name>` line per card, ordered by category then name", () => {
    expect(deckCardsToText(deck)).toBe("10 Forest\n1 Llanowar Elves\n1 Sol Ring");
  });

  it("round-trips through parseDeckList to the same entries (in display order)", () => {
    const parsed = parseDeckList(deckCardsToText(deck));

    expect(parsed.malformed).toEqual([]);
    expect(parsed.entries).toEqual([
      { name: "Forest", quantity: 10 },
      { name: "Llanowar Elves", quantity: 1 },
      { name: "Sol Ring", quantity: 1 },
    ]);
  });

  it("renders an empty deck as an empty string", () => {
    expect(deckCardsToText([])).toBe("");
  });
});
