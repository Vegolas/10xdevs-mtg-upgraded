import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { resolveCards } from "@/lib/card-data";
import { canonicalizedTo, resolutionOf, unattributed } from "@/lib/card-data/__fixtures__/resolution";
import { resolveDeck, generateUpgradePlan } from "./plan";

// Mock only the resolver (the one network seam); keep `resolutionKey` real so
// `attachQuantities` joins quantities exactly as in production.
vi.mock("@/lib/card-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/card-data")>();
  return { ...actual, resolveCards: vi.fn() };
});

const resolveCardsMock = vi.mocked(resolveCards);

/** Build a minimal {@link Card}; name/category/price are all the tests inspect. */
function card(name: string, category: CardCategory = "other", priceUsd: number | null = null): Card {
  return { name, typeLine: category, category, imageUrl: null, priceUsd, priceEur: null };
}

beforeEach(() => {
  resolveCardsMock.mockReset();
});

describe("resolveDeck", () => {
  it("resolves entries and attaches the parsed quantities", async () => {
    resolveCardsMock.mockResolvedValueOnce(resolutionOf([card("Sol Ring", "artifact"), card("Forest", "land")]));

    const result = await resolveDeck("2 Sol Ring\nForest");

    expect(result.unresolved).toEqual([]);
    expect(result.deck).toEqual([
      { card: card("Sol Ring", "artifact"), quantity: 2 },
      { card: card("Forest", "land"), quantity: 1 },
    ]);
  });

  it("merges malformed lines (first) with resolver misses (second) into unresolved", async () => {
    resolveCardsMock.mockResolvedValueOnce(
      resolutionOf([card("Sol Ring", "artifact")], [{ name: "Notacard", reason: "not-found", suggestion: null }]),
    );

    // "4x" is a count with no name → parser-level malformed; "Notacard" → resolver miss.
    const result = await resolveDeck("Sol Ring\nNotacard\n4x");

    expect(result.deck).toEqual([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    expect(result.unresolved).toEqual([
      { name: "4x", reason: "malformed", suggestion: null },
      { name: "Notacard", reason: "not-found", suggestion: null },
    ]);
  });

  it("keeps a listed count when the source canonicalizes the name", async () => {
    // Flow-level guard for the silent-quantity bug: `resolutionKey` is front-face +
    // lowercase, so a corrected name ("Jace the Mind Sculptor" -> "Jace, the Mind
    // Sculptor") keys differently and the count used to fall back to 1.
    const jace = card("Jace, the Mind Sculptor", "planeswalker");
    resolveCardsMock.mockResolvedValueOnce(canonicalizedTo([["Jace the Mind Sculptor", jace]]));

    const result = await resolveDeck("3 Jace the Mind Sculptor");

    expect(result.deck).toEqual([{ card: jace, quantity: 3 }]);
  });

  it("degrades to one copy when the resolution attributes nothing", async () => {
    // The resolver declines to guess an ambiguous pairing; full paste must then
    // behave exactly as it did before `matched` existed.
    const jace = card("Jace, the Mind Sculptor", "planeswalker");
    const tezzeret = card("Tezzeret the Seeker, Agent of Bolas", "planeswalker");
    resolveCardsMock.mockResolvedValueOnce(unattributed([jace, tezzeret]));

    const result = await resolveDeck("3 Jace the Mind Sculptor\n2 Tezzeret the Seeker");

    expect(result.deck).toEqual([
      { card: jace, quantity: 1 },
      { card: tezzeret, quantity: 1 },
    ]);
  });

  it("propagates a transient resolver throw to the caller", async () => {
    resolveCardsMock.mockRejectedValueOnce(new Error("network down"));

    await expect(resolveDeck("Sol Ring")).rejects.toThrow("network down");
  });
});

describe("generateUpgradePlan", () => {
  it("short-circuits to empty without resolving, naming every side that has no entries", async () => {
    // Comment and section-header text, not "" — this is the shape F-6 is about, and the one
    // the old `{status: "empty"}` could not describe. It is non-empty by `trim()`, so a guard
    // written against raw text lets it through, and it still parses to zero entries.
    const NO_CARDS = "// my commander deck\n\nDeck (99)";

    // All three combinations: only "either side" was pinned before, which cannot tell a
    // `sides` built from one test from one built from both.
    await expect(generateUpgradePlan(NO_CARDS, "Sol Ring")).resolves.toEqual({ status: "empty", sides: ["base"] });
    await expect(generateUpgradePlan("Sol Ring", NO_CARDS)).resolves.toEqual({ status: "empty", sides: ["target"] });
    // Base then target, the order the comparer's message names them in.
    await expect(generateUpgradePlan(NO_CARDS, "")).resolves.toEqual({ status: "empty", sides: ["base", "target"] });

    // The short-circuit itself, still intact for all three: no lookup fires for a deck that
    // parsed to nothing, so the comparer answers instantly and Scryfall never hears about it.
    expect(resolveCardsMock).not.toHaveBeenCalled();
  });

  it("resolves base then target, diffs, and tags unresolved with its deck side", async () => {
    resolveCardsMock
      .mockResolvedValueOnce(
        resolutionOf([card("Sol Ring", "artifact")], [{ name: "BadBase", reason: "not-found", suggestion: null }]),
      )
      .mockResolvedValueOnce(
        resolutionOf([card("Forest", "land")], [{ name: "BadTarget", reason: "ambiguous", suggestion: null }]),
      );

    const result = await generateUpgradePlan("Sol Ring\nBadBase", "Forest\nBadTarget");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    // base-only card → remove; target-only card → add.
    expect(result.plan.remove.flatMap((g) => g.cards.map((e) => e.card.name))).toEqual(["Sol Ring"]);
    expect(result.plan.add.flatMap((g) => g.cards.map((e) => e.card.name))).toEqual(["Forest"]);
    expect(result.plan.shared).toEqual([]);

    expect(result.unresolved).toEqual([
      { name: "BadBase", reason: "not-found", suggestion: null, deck: "base" },
      { name: "BadTarget", reason: "ambiguous", suggestion: null, deck: "target" },
    ]);
  });

  it("surfaces a transient resolver throw as an error outcome", async () => {
    resolveCardsMock.mockRejectedValueOnce(new Error("boom"));

    const result = await generateUpgradePlan("Sol Ring", "Forest");

    expect(result).toEqual({ status: "error", message: "boom" });
  });
});
