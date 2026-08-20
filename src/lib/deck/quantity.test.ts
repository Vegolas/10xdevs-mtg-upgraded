import { describe, it, expect } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { canonicalizedTo, resolutionOf, unattributed } from "@/lib/card-data/__fixtures__/resolution";
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

    expect(attachQuantities(resolutionOf(resolved), entries)).toEqual([{ card: resolved[0], quantity: 8 }]);
  });

  it("sums duplicate lines of the same card", () => {
    const resolved = [resolvedCard("Mountain", "land")];
    const entries: DeckEntry[] = [
      { name: "Mountain", quantity: 4 },
      { name: "Mountain", quantity: 4 },
    ];

    expect(attachQuantities(resolutionOf(resolved), entries)[0].quantity).toBe(8);
  });

  it("joins a front-only entry to its canonical DFC resolution", () => {
    // The resolver returns the canonical joined name; the deck listed only the front.
    const resolved = [resolvedCard("Delver of Secrets // Insectile Aberration", "creature")];
    const entries: DeckEntry[] = [{ name: "Delver of Secrets", quantity: 2 }];

    expect(attachQuantities(resolutionOf(resolved), entries)[0].quantity).toBe(2);
  });

  it("merges front-only and full `//` spellings of one card", () => {
    const resolved = [resolvedCard("Fire // Ice", "instant")];
    const entries: DeckEntry[] = [
      { name: "Fire", quantity: 1 },
      { name: "Fire // Ice", quantity: 1 },
    ];

    expect(attachQuantities(resolutionOf(resolved), entries)[0].quantity).toBe(2);
  });

  it("keeps the listed count when the source canonicalizes past resolutionKey", () => {
    // The join's whole reason to exist: `resolutionKey` is front-face + lowercase,
    // so a name the source corrects past that ("Jace the Mind Sculptor" →
    // "Jace, the Mind Sculptor") lands under a different key. Joining by canonical
    // name missed it and silently persisted one copy instead of three.
    const jace = resolvedCard("Jace, the Mind Sculptor", "planeswalker");
    const resolution = canonicalizedTo([["Jace the Mind Sculptor", jace]]);
    const entries: DeckEntry[] = [{ name: "Jace the Mind Sculptor", quantity: 3 }];

    expect(attachQuantities(resolution, entries)).toEqual([{ card: jace, quantity: 3 }]);
  });

  it("sums two differently-keyed spellings that resolve to one card", () => {
    // Two inputs whose keys differ but whose canonical card is the same. The join
    // credits the card with both counts rather than the last one seen.
    //
    // Note this fixture hands back a single `resolved` entry. A source that answers
    // each identifier separately would return the card twice, and `attachQuantities`
    // maps over `resolved`, so it would emit two `DeckCard`s for one card. That
    // duplicate-entry gap predates `matched` and is deliberately not addressed here —
    // this phase changes the join, not the de-duplication of `resolved`.
    const jace = resolvedCard("Jace, the Mind Sculptor", "planeswalker");
    const resolution = {
      resolved: [jace],
      unresolved: [],
      matched: new Map([
        ["jace the mind sculptor", jace],
        ["jace,  the mind sculptor", jace],
      ]),
    };
    const entries: DeckEntry[] = [
      { name: "Jace the Mind Sculptor", quantity: 2 },
      { name: "jace,  the mind sculptor", quantity: 1 },
    ];

    const deck = attachQuantities(resolution, entries);
    expect(deck).toHaveLength(1);
    expect(deck[0].quantity).toBe(3);
  });

  it("falls back to quantity 1 when no entry matches the resolved card", () => {
    const resolved = [resolvedCard("Sol Ring", "artifact")];

    expect(attachQuantities(resolutionOf(resolved), [])[0].quantity).toBe(1);
  });

  it("degrades to the canonical-key lookup when the resolution attributes nothing", () => {
    // `pairBatch` declines to guess when two or more residual cards make the
    // association ambiguous, so `matched` can be empty for cards that did resolve.
    // The old rule still applies: exact-key hits keep their count, the rest get 1.
    const resolution = unattributed([resolvedCard("Mountain", "land"), resolvedCard("Jace, the Mind Sculptor")]);
    const entries: DeckEntry[] = [
      { name: "Mountain", quantity: 8 },
      { name: "Jace the Mind Sculptor", quantity: 3 },
    ];

    const deck = attachQuantities(resolution, entries);
    expect(deck[0].quantity).toBe(8);
    // The degrade path — a wrong-but-old 1 rather than a guessed 3.
    expect(deck[1].quantity).toBe(1);
  });
});
