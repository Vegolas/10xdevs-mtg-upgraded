import { describe, it, expect } from "vitest";
import { parseDeltaList, applyDeltaSuggestion, applyAllDeltaSuggestions } from "./delta";

describe("parseDeltaList", () => {
  it("reads a bare signed line as ±1", () => {
    const result = parseDeltaList("+ Black Lotus\n- Sol Ring");

    expect(result.entries).toEqual([
      { op: "+", name: "Black Lotus", quantity: 1 },
      { op: "-", name: "Sol Ring", quantity: 1 },
    ]);
    expect(result.malformed).toEqual([]);
  });

  it("parses `N` and `Nx` counts after the sign", () => {
    const result = parseDeltaList("+2 Island\n-3x Forest");

    expect(result.entries).toEqual([
      { op: "+", name: "Island", quantity: 2 },
      { op: "-", name: "Forest", quantity: 3 },
    ]);
  });

  it("routes a line with no leading sign to malformed", () => {
    const result = parseDeltaList("Island\n+ Forest");

    expect(result.entries).toEqual([{ op: "+", name: "Forest", quantity: 1 }]);
    expect(result.malformed).toEqual(["Island"]);
  });

  it("routes a sign with no card name to malformed", () => {
    const result = parseDeltaList("+\n-\n+4x");

    expect(result.entries).toEqual([]);
    expect(result.malformed).toEqual(["+", "-", "+4x"]);
  });

  it("skips blank lines and comments", () => {
    const result = parseDeltaList("\n# a comment\n// another\n+ Sol Ring\n   \n");

    expect(result.entries).toEqual([{ op: "+", name: "Sol Ring", quantity: 1 }]);
    expect(result.malformed).toEqual([]);
  });

  it("keeps the front-face `//` spelling on the name (resolved downstream)", () => {
    const result = parseDeltaList("+ Fire // Ice");

    expect(result.entries).toEqual([{ op: "+", name: "Fire // Ice", quantity: 1 }]);
  });
});

describe("applyDeltaSuggestion", () => {
  it("rewrites a matching line, preserving the sign and gap", () => {
    expect(applyDeltaSuggestion("+ Blck Lotus", "Blck Lotus", "Black Lotus")).toBe("+ Black Lotus");
  });

  it("preserves a count prefix after the sign", () => {
    expect(applyDeltaSuggestion("-2 Forrest", "Forrest", "Forest")).toBe("-2 Forest");
  });

  it("matches by resolutionKey (case-insensitive) and rewrites every matching line", () => {
    expect(applyDeltaSuggestion("+ blck lotus\n- Sol Ring\n+ BLCK LOTUS", "Blck Lotus", "Black Lotus")).toBe(
      "+ Black Lotus\n- Sol Ring\n+ Black Lotus",
    );
  });

  it("leaves non-delta and non-matching lines verbatim", () => {
    expect(applyDeltaSuggestion("# note\n+ Sol Ring\nIsland", "Blck Lotus", "Black Lotus")).toBe(
      "# note\n+ Sol Ring\nIsland",
    );
  });
});

describe("applyAllDeltaSuggestions", () => {
  it("applies every suggestion-bearing entry and skips null suggestions", () => {
    const text = "+ Blck Lotus\n- Sol Rng";
    const entries = [
      { name: "Blck Lotus", suggestion: "Black Lotus" },
      { name: "Sol Rng", suggestion: "Sol Ring" },
      { name: "Mystery", suggestion: null },
    ];

    expect(applyAllDeltaSuggestions(text, entries)).toBe("+ Black Lotus\n- Sol Ring");
  });
});
