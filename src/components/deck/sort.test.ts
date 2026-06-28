import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import type { CardGroup, DeckCard } from "@/lib/deck";
import { flattenAndSort, sortCards } from "./sort";

/** Build a minimal {@link DeckCard}; only name and priceUsd matter to flattenAndSort. */
function deckCard(name: string, priceUsd: number | null = null): DeckCard {
  return {
    card: { name, typeLine: "creature", category: "creature", imageUrl: null, priceUsd, priceEur: null },
    quantity: 1,
  };
}

/** Wrap cards in a {@link CardGroup}. */
function group(cards: DeckCard[], category: CardCategory = "creature"): CardGroup {
  return { category, cards };
}

/** Project the sorted output down to card names for concise assertions. */
function names(cards: DeckCard[]): string[] {
  return cards.map((entry) => entry.card.name);
}

describe("flattenAndSort", () => {
  it("flattens cards across every group into one list", () => {
    const groups = [group([deckCard("Forest")]), group([deckCard("Mountain")], "land"), group([deckCard("Bear")])];

    expect(names(flattenAndSort(groups, "name", "asc"))).toEqual(["Bear", "Forest", "Mountain"]);
  });

  it("sorts by name ascending and descending", () => {
    const groups = [group([deckCard("Zealot"), deckCard("Bear"), deckCard("Mage")])];

    expect(names(flattenAndSort(groups, "name", "asc"))).toEqual(["Bear", "Mage", "Zealot"]);
    expect(names(flattenAndSort(groups, "name", "desc"))).toEqual(["Zealot", "Mage", "Bear"]);
  });

  it("sorts by price ascending and descending", () => {
    const groups = [group([deckCard("Cheap", 1), deckCard("Mid", 5), deckCard("Pricey", 20)])];

    expect(names(flattenAndSort(groups, "price", "asc"))).toEqual(["Cheap", "Mid", "Pricey"]);
    expect(names(flattenAndSort(groups, "price", "desc"))).toEqual(["Pricey", "Mid", "Cheap"]);
  });

  it("pushes null-priced cards last in both directions", () => {
    const groups = [group([deckCard("HasPrice", 3), deckCard("NoPrice", null), deckCard("AlsoPriced", 8)])];

    expect(names(flattenAndSort(groups, "price", "asc"))).toEqual(["HasPrice", "AlsoPriced", "NoPrice"]);
    expect(names(flattenAndSort(groups, "price", "desc"))).toEqual(["AlsoPriced", "HasPrice", "NoPrice"]);
  });

  it("breaks equal prices by name A→Z, even when sorting descending", () => {
    const groups = [group([deckCard("Beta", 5), deckCard("Alpha", 5), deckCard("Gamma", 5)])];

    expect(names(flattenAndSort(groups, "price", "asc"))).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(names(flattenAndSort(groups, "price", "desc"))).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("orders multiple null prices by name for a deterministic result", () => {
    const groups = [group([deckCard("Yak", null), deckCard("Ant", null), deckCard("Moose", null)])];

    expect(names(flattenAndSort(groups, "price", "asc"))).toEqual(["Ant", "Moose", "Yak"]);
  });

  it("does not mutate the input groups", () => {
    const groups = [group([deckCard("Zed", 9), deckCard("Abe", 1)])];

    flattenAndSort(groups, "name", "asc");

    expect(names(groups[0].cards)).toEqual(["Zed", "Abe"]);
  });
});

describe("sortCards", () => {
  it("orders a flat list by name in both directions", () => {
    const cards = [deckCard("Zealot"), deckCard("Bear"), deckCard("Mage")];

    expect(names(sortCards(cards, "name", "asc"))).toEqual(["Bear", "Mage", "Zealot"]);
    expect(names(sortCards(cards, "name", "desc"))).toEqual(["Zealot", "Mage", "Bear"]);
  });

  it("orders a flat list by price, null last in both directions", () => {
    const cards = [deckCard("HasPrice", 3), deckCard("NoPrice", null), deckCard("AlsoPriced", 8)];

    expect(names(sortCards(cards, "price", "asc"))).toEqual(["HasPrice", "AlsoPriced", "NoPrice"]);
    expect(names(sortCards(cards, "price", "desc"))).toEqual(["AlsoPriced", "HasPrice", "NoPrice"]);
  });

  it("does not mutate the input array", () => {
    const cards = [deckCard("Zed", 9), deckCard("Abe", 1)];

    sortCards(cards, "name", "asc");

    expect(names(cards)).toEqual(["Zed", "Abe"]);
  });
});
