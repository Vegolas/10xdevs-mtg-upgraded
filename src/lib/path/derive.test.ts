import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { resolveCards } from "@/lib/card-data";
import type { DeckCard } from "@/lib/deck";
import { deriveSnapshot } from "./derive";
import type { StepSnapshot } from "./types";

// Mock only the resolver (the one network seam); keep `resolutionKey` real so the
// derive joins delta lines against the prior list exactly as in production.
vi.mock("@/lib/card-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/card-data")>();
  return { ...actual, resolveCards: vi.fn() };
});

const resolveCardsMock = vi.mocked(resolveCards);

/** Build a minimal {@link Card}; name/category are all the tests inspect. */
function card(name: string, category: CardCategory = "other"): Card {
  return { name, typeLine: category, category, imageUrl: null, priceUsd: null, priceEur: null };
}

/** A prior snapshot from quantity-tagged cards plus optional carried-over misses. */
function snapshot(cards: DeckCard[], unresolved: StepSnapshot["unresolved"] = []): StepSnapshot {
  return { cards, unresolved };
}

beforeEach(() => {
  resolveCardsMock.mockReset();
});

describe("deriveSnapshot", () => {
  it("produces exactly prior ± delta — a `-` removes and a new `+` resolves and adds", async () => {
    const prior = snapshot([
      { card: card("Sol Ring", "artifact"), quantity: 1 },
      { card: card("Forest", "land"), quantity: 10 },
    ]);
    resolveCardsMock.mockResolvedValueOnce({ resolved: [card("Black Lotus", "artifact")], unresolved: [] });

    const result = await deriveSnapshot(prior, "- Sol Ring\n+ Black Lotus");

    expect(resolveCardsMock).toHaveBeenCalledWith(["Black Lotus"]);
    expect(result.snapshot.cards).toEqual([
      { card: card("Forest", "land"), quantity: 10 },
      { card: card("Black Lotus", "artifact"), quantity: 1 },
    ]);
    expect(result.snapshot.unresolved).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toEqual({ added: 1, removed: 1, unchanged: 10, total: 11 });
  });

  it("clamps a `-` that exceeds the held count and removes the card", async () => {
    const prior = snapshot([{ card: card("Forest", "land"), quantity: 2 }]);

    const result = await deriveSnapshot(prior, "-5 Forest");

    expect(resolveCardsMock).not.toHaveBeenCalled();
    expect(result.snapshot.cards).toEqual([]);
    expect(result.summary).toEqual({ added: 0, removed: 2, unchanged: 0, total: 0 });
  });

  it("warns (not-in-prior) for a `-` whose card isn't in the prior list, without persisting it", async () => {
    const prior = snapshot([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);

    const result = await deriveSnapshot(prior, "- Nonsuch");

    expect(result.snapshot.cards).toEqual([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    expect(result.snapshot.unresolved).toEqual([]);
    expect(result.warnings).toEqual([{ line: "- Nonsuch", reason: "not-in-prior" }]);
  });

  it("bumps the quantity of an existing `+` card without re-resolving", async () => {
    const prior = snapshot([{ card: card("Island", "land"), quantity: 10 }]);

    const result = await deriveSnapshot(prior, "+2 Island");

    expect(resolveCardsMock).not.toHaveBeenCalled();
    expect(result.snapshot.cards).toEqual([{ card: card("Island", "land"), quantity: 12 }]);
    expect(result.summary).toEqual({ added: 2, removed: 0, unchanged: 10, total: 12 });
  });

  it("carries prior unresolved entries forward verbatim", async () => {
    const prior = snapshot(
      [{ card: card("Sol Ring", "artifact"), quantity: 1 }],
      [{ name: "Badcard", reason: "not-found", suggestion: null }],
    );
    resolveCardsMock.mockResolvedValueOnce({ resolved: [card("Forest", "land")], unresolved: [] });

    const result = await deriveSnapshot(prior, "+ Forest");

    expect(result.snapshot.unresolved).toEqual([{ name: "Badcard", reason: "not-found", suggestion: null }]);
    expect(result.snapshot.cards).toEqual([
      { card: card("Sol Ring", "artifact"), quantity: 1 },
      { card: card("Forest", "land"), quantity: 1 },
    ]);
  });

  it("routes a `+` that fails to resolve into snapshot.unresolved (after prior misses)", async () => {
    const prior = snapshot([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    resolveCardsMock.mockResolvedValueOnce({
      resolved: [],
      unresolved: [{ name: "Notacard", reason: "not-found", suggestion: "Nota Card" }],
    });

    const result = await deriveSnapshot(prior, "+ Notacard");

    expect(result.snapshot.cards).toEqual([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    expect(result.snapshot.unresolved).toEqual([{ name: "Notacard", reason: "not-found", suggestion: "Nota Card" }]);
    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 1, total: 1 });
  });

  it("surfaces a malformed delta line as a warning", async () => {
    const prior = snapshot([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    resolveCardsMock.mockResolvedValueOnce({ resolved: [card("Forest", "land")], unresolved: [] });

    const result = await deriveSnapshot(prior, "Island\n+ Forest");

    expect(result.warnings).toEqual([{ line: "Island", reason: "malformed" }]);
    expect(result.snapshot.cards).toEqual([
      { card: card("Sol Ring", "artifact"), quantity: 1 },
      { card: card("Forest", "land"), quantity: 1 },
    ]);
  });

  it("propagates a transient resolver throw", async () => {
    const prior = snapshot([{ card: card("Sol Ring", "artifact"), quantity: 1 }]);
    resolveCardsMock.mockRejectedValueOnce(new Error("network down"));

    await expect(deriveSnapshot(prior, "+ Black Lotus")).rejects.toThrow("network down");
  });
});
