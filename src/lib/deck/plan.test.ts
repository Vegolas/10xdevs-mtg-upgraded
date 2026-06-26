import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { resolveCards } from "@/lib/card-data";
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
    resolveCardsMock.mockResolvedValueOnce({
      resolved: [card("Sol Ring", "artifact"), card("Forest", "land")],
      unresolved: [],
    });

    const result = await resolveDeck("2 Sol Ring\nForest");

    expect(result.unresolved).toEqual([]);
    expect(result.deck).toEqual([
      { card: card("Sol Ring", "artifact"), quantity: 2 },
      { card: card("Forest", "land"), quantity: 1 },
    ]);
  });

  it("merges malformed lines (first) with resolver misses (second) into unresolved", async () => {
    resolveCardsMock.mockResolvedValueOnce({
      resolved: [card("Sol Ring", "artifact")],
      unresolved: [{ name: "Notacard", reason: "not-found", suggestion: null }],
    });

    // "4x" is a count with no name → parser-level malformed; "Notacard" → resolver miss.
    const result = await resolveDeck("Sol Ring\nNotacard\n4x");

    expect(result.deck).toEqual([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    expect(result.unresolved).toEqual([
      { name: "4x", reason: "malformed", suggestion: null },
      { name: "Notacard", reason: "not-found", suggestion: null },
    ]);
  });

  it("propagates a transient resolver throw to the caller", async () => {
    resolveCardsMock.mockRejectedValueOnce(new Error("network down"));

    await expect(resolveDeck("Sol Ring")).rejects.toThrow("network down");
  });
});

describe("generateUpgradePlan", () => {
  it("short-circuits to empty without resolving when either deck has no entries", async () => {
    const result = await generateUpgradePlan("", "Sol Ring");

    expect(result).toEqual({ status: "empty" });
    expect(resolveCardsMock).not.toHaveBeenCalled();
  });

  it("resolves base then target, diffs, and tags unresolved with its deck side", async () => {
    resolveCardsMock
      .mockResolvedValueOnce({
        resolved: [card("Sol Ring", "artifact")],
        unresolved: [{ name: "BadBase", reason: "not-found", suggestion: null }],
      })
      .mockResolvedValueOnce({
        resolved: [card("Forest", "land")],
        unresolved: [{ name: "BadTarget", reason: "ambiguous", suggestion: null }],
      });

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
