import { describe, it, expect } from "vitest";
import type { StepSnapshot } from "./types";
import { serializeSnapshot, parseSnapshot } from "./snapshot";

/** A well-formed snapshot: one priced card plus one unresolved input. */
function snapshot(): StepSnapshot {
  return {
    cards: [
      {
        card: {
          name: "Sol Ring",
          typeLine: "Artifact",
          category: "artifact",
          imageUrl: "https://cards.scryfall.io/normal/sol-ring.jpg",
          priceUsd: 1.23,
          priceEur: null,
        },
        quantity: 1,
      },
    ],
    unresolved: [{ name: "Notacard", reason: "not-found", suggestion: null }],
  };
}

describe("serializeSnapshot / parseSnapshot", () => {
  it("round-trips a valid snapshot", () => {
    const original = snapshot();
    expect(parseSnapshot(serializeSnapshot(original))).toEqual(original);
  });

  it("round-trips through JSON (the jsonb column boundary)", () => {
    const original = snapshot();
    const throughJson: unknown = JSON.parse(JSON.stringify(serializeSnapshot(original)));
    expect(parseSnapshot(throughJson)).toEqual(original);
  });

  it("accepts empty card and unresolved arrays", () => {
    const empty: StepSnapshot = { cards: [], unresolved: [] };
    expect(parseSnapshot(serializeSnapshot(empty))).toEqual(empty);
  });

  it("returns null for non-object payloads", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot(42)).toBeNull();
    expect(parseSnapshot("nope")).toBeNull();
    expect(parseSnapshot(undefined)).toBeNull();
  });

  it("returns null when either array is missing or not an array", () => {
    expect(parseSnapshot({ unresolved: [] })).toBeNull();
    expect(parseSnapshot({ cards: [] })).toBeNull();
    expect(parseSnapshot({ cards: {}, unresolved: [] })).toBeNull();
  });

  it("returns null when a card carries an unknown category", () => {
    const bad = {
      cards: [{ card: { ...snapshot().cards[0].card, category: "vehicle" }, quantity: 1 }],
      unresolved: [],
    };
    expect(parseSnapshot(bad)).toBeNull();
  });

  it("returns null when a card price is the wrong type", () => {
    const bad = {
      cards: [{ card: { ...snapshot().cards[0].card, priceUsd: "1.23" }, quantity: 1 }],
      unresolved: [],
    };
    expect(parseSnapshot(bad)).toBeNull();
  });

  it("returns null when a deck card is missing its quantity", () => {
    const bad = { cards: [{ card: snapshot().cards[0].card }], unresolved: [] };
    expect(parseSnapshot(bad)).toBeNull();
  });

  it("returns null when an unresolved entry has an unknown reason", () => {
    const bad = { cards: [], unresolved: [{ name: "X", reason: "exploded", suggestion: null }] };
    expect(parseSnapshot(bad)).toBeNull();
  });
});
