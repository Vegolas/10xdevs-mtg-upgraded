import { describe, it, expect } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import type { DeckEntry } from "./parse";
import { attachQuantities } from "./quantity";

/** A resolved card carrying just the fields the join touches. */
function resolvedCard(name: string, category: CardCategory = "other"): Card {
  return { name, typeLine: category, category, imageUrl: null, priceUsd: null, priceEur: null };
}

describe("attachQuantities", () => {
  it("pairs each resolved card with its parsed quantity", () => {
    const resolved = [resolvedCard("Mountain", "land")];
    const entries: DeckEntry[] = [{ name: "Mountain", quantity: 8 }];

    expect(attachQuantities(resolved, entries)).toEqual([{ card: resolved[0], quantity: 8 }]);
  });

  it("sums duplicate lines of the same card", () => {
    const resolved = [resolvedCard("Mountain", "land")];
    const entries: DeckEntry[] = [
      { name: "Mountain", quantity: 4 },
      { name: "Mountain", quantity: 4 },
    ];

    expect(attachQuantities(resolved, entries)[0].quantity).toBe(8);
  });

  it("joins a front-only entry to its canonical DFC resolution", () => {
    // The resolver returns the canonical joined name; the deck listed only the front.
    const resolved = [resolvedCard("Delver of Secrets // Insectile Aberration", "creature")];
    const entries: DeckEntry[] = [{ name: "Delver of Secrets", quantity: 2 }];

    expect(attachQuantities(resolved, entries)[0].quantity).toBe(2);
  });

  it("merges front-only and full `//` spellings of one card", () => {
    const resolved = [resolvedCard("Fire // Ice", "instant")];
    const entries: DeckEntry[] = [
      { name: "Fire", quantity: 1 },
      { name: "Fire // Ice", quantity: 1 },
    ];

    expect(attachQuantities(resolved, entries)[0].quantity).toBe(2);
  });

  it("falls back to quantity 1 when no entry matches the resolved card", () => {
    const resolved = [resolvedCard("Sol Ring", "artifact")];

    expect(attachQuantities(resolved, [])[0].quantity).toBe(1);
  });
});
