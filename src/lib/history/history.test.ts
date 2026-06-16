import { describe, it, expect } from "vitest";
import type { CardCategory } from "@/lib/card-data";
import type { CardGroup, DeckCard, UpgradePlan } from "@/lib/deck";
import {
  historyKey,
  summarizePlan,
  makeComparison,
  addComparison,
  deleteComparison,
  clearComparisons,
} from "./history";
import { HISTORY_CAP } from "./types";
import type { SavedComparison } from "./types";

/** Build a minimal {@link DeckCard}; only quantity matters to summarizePlan. */
function deckCard(name: string, quantity = 1): DeckCard {
  return {
    card: { name, typeLine: "creature", category: "creature", imageUrl: null, priceUsd: null, priceEur: null },
    quantity,
  };
}

/** Wrap cards in a {@link CardGroup}. */
function group(cards: DeckCard[], category: CardCategory = "creature"): CardGroup {
  return { category, cards };
}

/** Build a minimal saved entry; its key is derived from the two texts. */
function saved(id: string, baseText: string, targetText: string, savedAt: number): SavedComparison {
  return { id, baseText, targetText, savedAt, summary: { addCount: 0, removeCount: 0 } };
}

describe("historyKey", () => {
  it("ignores incidental whitespace, blank lines, and line endings", () => {
    const a = historyKey("1 Sol Ring\n1 Forest", "2 Island");
    const b = historyKey("  1 Sol Ring  \n\n1 Forest\n", "2 Island\r\n");

    expect(a).toBe(b);
  });

  it("distinguishes genuinely different lists", () => {
    expect(historyKey("1 Sol Ring", "1 Island")).not.toBe(historyKey("1 Sol Ring", "1 Forest"));
  });

  it("is order-sensitive between base and target", () => {
    expect(historyKey("1 Sol Ring", "1 Island")).not.toBe(historyKey("1 Island", "1 Sol Ring"));
  });
});

describe("summarizePlan", () => {
  it("sums copy quantities, not group or line counts", () => {
    const plan: UpgradePlan = {
      add: [
        group([deckCard("Sol Ring", 1), deckCard("Mana Crypt", 1)], "artifact"),
        group([deckCard("Forest", 3)], "land"),
      ],
      remove: [group([deckCard("Llanowar Elves", 2)])],
      shared: [],
    };

    expect(summarizePlan(plan)).toEqual({ addCount: 5, removeCount: 2 });
  });

  it("is zero for an empty plan", () => {
    expect(summarizePlan({ add: [], remove: [], shared: [] })).toEqual({ addCount: 0, removeCount: 0 });
  });
});

describe("makeComparison", () => {
  it("assembles an entry with the injected id/savedAt and a derived summary", () => {
    const plan: UpgradePlan = { add: [group([deckCard("Sol Ring", 1)], "artifact")], remove: [], shared: [] };

    expect(makeComparison("base", "target", plan, "id-1", 1000)).toEqual({
      id: "id-1",
      baseText: "base",
      targetText: "target",
      savedAt: 1000,
      summary: { addCount: 1, removeCount: 0 },
    });
  });
});

describe("addComparison", () => {
  it("prepends a new entry", () => {
    const first = saved("a", "1 Sol Ring", "1 Island", 1);
    const second = saved("b", "1 Forest", "1 Plains", 2);

    expect(addComparison([first], second).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("replaces and moves to front when inputs match (ignoring whitespace)", () => {
    const original = saved("a", "1 Sol Ring", "1 Island", 1);
    const other = saved("b", "1 Forest", "1 Plains", 2);
    const resave = saved("c", "1 Sol Ring\n", "  1 Island ", 3);

    const result = addComparison([other, original], resave);

    expect(result.map((item) => item.id)).toEqual(["c", "b"]);
    expect(result).toHaveLength(2);
  });

  it("caps at HISTORY_CAP, dropping the oldest", () => {
    const items: SavedComparison[] = [];
    for (let i = 0; i < HISTORY_CAP; i += 1) {
      // unshift so the newest (highest i) ends up at the front, oldest (id-0) at the back.
      items.unshift(saved(`id-${i}`, `${i} Sol Ring`, `${i} Island`, i));
    }

    const result = addComparison(items, saved("new", "x", "y", 999));

    expect(result).toHaveLength(HISTORY_CAP);
    expect(result[0].id).toBe("new");
    expect(result.some((item) => item.id === "id-0")).toBe(false);
  });
});

describe("deleteComparison", () => {
  it("removes the matching entry and leaves the rest", () => {
    const a = saved("a", "1", "2", 1);
    const b = saved("b", "3", "4", 2);

    expect(deleteComparison([a, b], "a")).toEqual([b]);
  });

  it("is a no-op for a missing id", () => {
    const a = saved("a", "1", "2", 1);

    expect(deleteComparison([a], "missing")).toEqual([a]);
  });
});

describe("clearComparisons", () => {
  it("returns an empty list", () => {
    expect(clearComparisons()).toEqual([]);
  });
});
