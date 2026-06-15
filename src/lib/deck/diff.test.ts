import { describe, it, expect } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { diffDecks, CATEGORY_ORDER } from "./diff";

/** Build a minimal Card; only `name` and `category` matter to the diff. */
function card(name: string, category: CardCategory = "other"): Card {
  return { name, typeLine: category, category, imageUrl: null, priceUsd: null, priceEur: null };
}

/** The card names in a partition, flattened across its groups in emit order. */
function names(groups: { cards: Card[] }[]): string[] {
  return groups.flatMap((group) => group.cards.map((c) => c.name));
}

describe("diffDecks", () => {
  it("partitions into remove (base only), add (target only), and shared (both)", () => {
    const base = [card("Sol Ring"), card("Counterspell"), card("Forest")];
    const target = [card("Sol Ring"), card("Lightning Bolt"), card("Forest")];

    const plan = diffDecks(base, target);

    expect(names(plan.remove)).toEqual(["Counterspell"]);
    expect(names(plan.add)).toEqual(["Lightning Bolt"]);
    expect(names(plan.shared).sort()).toEqual(["Forest", "Sol Ring"]);
  });

  it("groups each partition by category in CATEGORY_ORDER", () => {
    const base = [
      card("Birds of Paradise", "creature"),
      card("Island", "land"),
      card("Brainstorm", "instant"),
      card("Karn Liberated", "planeswalker"),
    ];
    const target: Card[] = [];

    // Everything is base-only, so it all lands in `remove`.
    const plan = diffDecks(base, target);

    expect(plan.remove.map((group) => group.category)).toEqual(["land", "creature", "instant", "planeswalker"]);
    // The fixed order is exactly the prefix of CATEGORY_ORDER for present buckets.
    const present = CATEGORY_ORDER.filter((cat) => plan.remove.some((g) => g.category === cat));
    expect(plan.remove.map((g) => g.category)).toEqual(present);
  });

  it("omits empty categories, including 'other'", () => {
    const base = [card("Forest", "land")];
    const target: Card[] = [];

    const plan = diffDecks(base, target);

    expect(plan.remove.map((g) => g.category)).toEqual(["land"]);
    expect(plan.remove.some((g) => g.category === "other")).toBe(false);
    expect(plan.add).toEqual([]);
    expect(plan.shared).toEqual([]);
  });

  it("sorts cards within a group by name", () => {
    const base = [card("Zur the Enchanter", "creature"), card("Anafenza", "creature"), card("Meren", "creature")];
    const target: Card[] = [];

    const plan = diffDecks(base, target);

    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0].cards.map((c) => c.name)).toEqual(["Anafenza", "Meren", "Zur the Enchanter"]);
  });

  it("treats identical decks as all-shared with empty add/remove", () => {
    const deck = [card("Sol Ring", "artifact"), card("Forest", "land")];

    const plan = diffDecks(deck, [...deck]);

    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(names(plan.shared).sort()).toEqual(["Forest", "Sol Ring"]);
  });

  it("matches a DFC by its canonical joined name (shared, not add/remove)", () => {
    const dfc = "Delver of Secrets // Insectile Aberration";
    const base = [card(dfc, "creature")];
    const target = [card(dfc, "creature")];

    const plan = diffDecks(base, target);

    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(names(plan.shared)).toEqual([dfc]);
  });

  it("returns empty partitions for two empty decks", () => {
    const plan = diffDecks([], []);

    expect(plan.remove).toEqual([]);
    expect(plan.add).toEqual([]);
    expect(plan.shared).toEqual([]);
  });
});
