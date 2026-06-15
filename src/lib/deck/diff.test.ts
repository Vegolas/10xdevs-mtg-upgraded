import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import { diffDecks, CATEGORY_ORDER } from "./diff";
import type { CardGroup, DeckCard } from "./diff";

/** Build a minimal {@link DeckCard}; only name, category, and quantity matter to the diff. */
function card(name: string, category: CardCategory = "other", quantity = 1): DeckCard {
  return {
    card: { name, typeLine: category, category, imageUrl: null, priceUsd: null, priceEur: null },
    quantity,
  };
}

/** The card names in a partition, flattened across its groups in emit order. */
function names(groups: CardGroup[]): string[] {
  return groups.flatMap((group) => group.cards.map((entry) => entry.card.name));
}

/** A partition's [name, quantity] pairs, flattened in emit order. */
function nameQuantities(groups: CardGroup[]): [string, number][] {
  return groups.flatMap((group) => group.cards.map((entry): [string, number] => [entry.card.name, entry.quantity]));
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
    const target: DeckCard[] = [];

    // Everything is base-only, so it all lands in `remove`.
    const plan = diffDecks(base, target);

    expect(plan.remove.map((group) => group.category)).toEqual(["land", "creature", "instant", "planeswalker"]);
    // The fixed order is exactly the prefix of CATEGORY_ORDER for present buckets.
    const present = CATEGORY_ORDER.filter((cat) => plan.remove.some((g) => g.category === cat));
    expect(plan.remove.map((g) => g.category)).toEqual(present);
  });

  it("omits empty categories, including 'other'", () => {
    const base = [card("Forest", "land")];
    const target: DeckCard[] = [];

    const plan = diffDecks(base, target);

    expect(plan.remove.map((g) => g.category)).toEqual(["land"]);
    expect(plan.remove.some((g) => g.category === "other")).toBe(false);
    expect(plan.add).toEqual([]);
    expect(plan.shared).toEqual([]);
  });

  it("sorts cards within a group by name", () => {
    const base = [card("Zur the Enchanter", "creature"), card("Anafenza", "creature"), card("Meren", "creature")];
    const target: DeckCard[] = [];

    const plan = diffDecks(base, target);

    expect(plan.remove).toHaveLength(1);
    expect(plan.remove[0].cards.map((e) => e.card.name)).toEqual(["Anafenza", "Meren", "Zur the Enchanter"]);
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

  it("emits a quantity delta — 8 base vs 6 target → remove ×2 and shared ×6", () => {
    const plan = diffDecks([card("Mountain", "land", 8)], [card("Mountain", "land", 6)]);

    expect(nameQuantities(plan.remove)).toEqual([["Mountain", 2]]);
    expect(nameQuantities(plan.shared)).toEqual([["Mountain", 6]]);
    expect(plan.add).toEqual([]);
  });

  it("treats equal quantities as fully shared — 4 vs 4 → shared ×4, no remove/add", () => {
    const plan = diffDecks([card("Forest", "land", 4)], [card("Forest", "land", 4)]);

    expect(nameQuantities(plan.shared)).toEqual([["Forest", 4]]);
    expect(plan.remove).toEqual([]);
    expect(plan.add).toEqual([]);
  });

  it("emits an addition delta — 0 base vs 3 target → add ×3", () => {
    const plan = diffDecks([], [card("Swamp", "land", 3)]);

    expect(nameQuantities(plan.add)).toEqual([["Swamp", 3]]);
    expect(plan.remove).toEqual([]);
    expect(plan.shared).toEqual([]);
  });

  it("returns empty partitions for two empty decks", () => {
    const plan = diffDecks([], []);

    expect(plan.remove).toEqual([]);
    expect(plan.add).toEqual([]);
    expect(plan.shared).toEqual([]);
  });
});
