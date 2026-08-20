import { describe, it, expect } from "vitest";
import type { StepSnapshot } from "./types";
import { serializeSnapshot } from "./snapshot";
import { parseTitleInput, parseStepInput } from "./request";

/** A well-formed snapshot for building valid step bodies. */
function snapshot(): StepSnapshot {
  return {
    cards: [
      {
        card: {
          name: "Sol Ring",
          typeLine: "Artifact",
          category: "artifact",
          imageUrl: null,
          priceUsd: 1.23,
          priceEur: null,
        },
        quantity: 1,
      },
    ],
    unresolved: [],
  };
}

describe("parseTitleInput", () => {
  it("returns the trimmed title for a valid body", () => {
    expect(parseTitleInput({ title: "  My Path  " })).toBe("My Path");
  });

  it("returns null for a missing, blank, or non-string title", () => {
    expect(parseTitleInput({})).toBeNull();
    expect(parseTitleInput({ title: "   " })).toBeNull();
    expect(parseTitleInput({ title: 42 })).toBeNull();
    expect(parseTitleInput(null)).toBeNull();
    expect(parseTitleInput("My Path")).toBeNull();
  });
});

describe("parseStepInput", () => {
  it("accepts a valid body and trims the name (full paste → deltaText null)", () => {
    const body = { name: "  $50 upgrade  ", listText: "1 Sol Ring", snapshot: serializeSnapshot(snapshot()) };

    expect(parseStepInput(body)).toEqual({
      name: "$50 upgrade",
      listText: "1 Sol Ring",
      snapshot: snapshot(),
      deltaText: null,
      priorStepId: null,
    });
  });

  it("keeps a non-empty deltaText verbatim (diff-entered checkpoint)", () => {
    const body = {
      name: "Swap",
      listText: "1 Black Lotus",
      snapshot: serializeSnapshot(snapshot()),
      deltaText: "+ Black Lotus\n- Sol Ring",
    };

    expect(parseStepInput(body)?.deltaText).toBe("+ Black Lotus\n- Sol Ring");
  });

  it("collapses a blank or non-string deltaText to null", () => {
    const base = { name: "Step", listText: "1 Sol Ring", snapshot: serializeSnapshot(snapshot()) };

    expect(parseStepInput({ ...base, deltaText: "   " })?.deltaText).toBeNull();
    expect(parseStepInput({ ...base, deltaText: 42 })?.deltaText).toBeNull();
    expect(parseStepInput(base)?.deltaText).toBeNull();
  });

  it("keeps a non-empty priorStepId verbatim (the diff-mode concurrency token)", () => {
    const body = {
      name: "Swap",
      listText: "1 Black Lotus",
      snapshot: serializeSnapshot(snapshot()),
      deltaText: "+ Black Lotus",
      priorStepId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    };

    expect(parseStepInput(body)?.priorStepId).toBe("3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
  });

  // The collapse, not a rejection, is the contract: "a diff checkpoint that named
  // no prior" is the route's own 400, which says something the caller can act on.
  it("collapses a blank, non-string, or absent priorStepId to null — even alongside a deltaText", () => {
    const base = {
      name: "Swap",
      listText: "1 Black Lotus",
      snapshot: serializeSnapshot(snapshot()),
      deltaText: "+ Black Lotus",
    };

    expect(parseStepInput({ ...base, priorStepId: "   " })?.priorStepId).toBeNull();
    expect(parseStepInput({ ...base, priorStepId: 42 })?.priorStepId).toBeNull();
    expect(parseStepInput(base)?.priorStepId).toBeNull();
    expect(parseStepInput(base)).not.toBeNull();
  });

  it("rejects a malformed snapshot body (the API's 400 gate)", () => {
    expect(parseStepInput({ name: "Step", listText: "1 Sol Ring", snapshot: { cards: "nope" } })).toBeNull();
    expect(parseStepInput({ name: "Step", listText: "1 Sol Ring", snapshot: null })).toBeNull();
    expect(parseStepInput({ name: "Step", listText: "1 Sol Ring" })).toBeNull();
  });

  it("rejects a missing or blank name", () => {
    const snap = serializeSnapshot(snapshot());
    expect(parseStepInput({ name: "   ", listText: "x", snapshot: snap })).toBeNull();
    expect(parseStepInput({ listText: "x", snapshot: snap })).toBeNull();
  });

  it("rejects a non-string listText", () => {
    expect(parseStepInput({ name: "Step", listText: 5, snapshot: serializeSnapshot(snapshot()) })).toBeNull();
  });

  it("returns null for non-object bodies", () => {
    expect(parseStepInput(null)).toBeNull();
    expect(parseStepInput("nope")).toBeNull();
  });
});
