import { describe, it, expect } from "vitest";
import { applySuggestion, acceptAllSuggestions, applyAllSuggestions } from "./accept";
import type { UnresolvedEntry } from "./plan";
import type { UnresolvedCard } from "@/lib/card-data";

describe("applySuggestion", () => {
  it("preserves a leading numeric count prefix", () => {
    expect(applySuggestion("1 Sol Rng", "Sol Rng", "Sol Ring")).toBe("1 Sol Ring");
  });

  it("preserves an 'Nx' count prefix verbatim", () => {
    expect(applySuggestion("4x Sol Rng", "Sol Rng", "Sol Ring")).toBe("4x Sol Ring");
  });

  it("replaces a bare name with no count", () => {
    expect(applySuggestion("Sol Rng", "Sol Rng", "Sol Ring")).toBe("Sol Ring");
  });

  it("matches a set-code / collector-suffixed name on the full name and swaps in the canonical suggestion", () => {
    expect(applySuggestion("1 Sol Rng (LTC) 280", "Sol Rng (LTC) 280", "Sol Ring")).toBe("1 Sol Ring");
  });

  it("rewrites every duplicate line of one typo, including a differing-case duplicate", () => {
    const text = "1 Sol Rng\n2 sol rng\nSOL RNG";
    expect(applySuggestion(text, "Sol Rng", "Sol Ring")).toBe("1 Sol Ring\n2 Sol Ring\nSol Ring");
  });

  it("leaves the text unchanged when nothing matches", () => {
    const text = "1 Sol Ring\n2 Forest";
    expect(applySuggestion(text, "Mana Crpyt", "Mana Crypt")).toBe(text);
  });

  it("does not alter a name that merely contains the target as a substring", () => {
    const text = "1 Forest\n1 Snow-Covered Forest";
    expect(applySuggestion(text, "Forest", "Island")).toBe("1 Island\n1 Snow-Covered Forest");
  });

  it("never rewrites comment, section-header, or count-only lines", () => {
    const text = "# Sol Rng\nDeck (99)\n4\n1 Sol Rng";
    expect(applySuggestion(text, "Sol Rng", "Sol Ring")).toBe("# Sol Rng\nDeck (99)\n4\n1 Sol Ring");
  });
});

describe("acceptAllSuggestions", () => {
  it("applies base suggestions to baseText and target suggestions to targetText", () => {
    const entries: UnresolvedEntry[] = [
      { name: "Sol Rng", reason: "not-found", suggestion: "Sol Ring", deck: "base" },
      { name: "Forst", reason: "not-found", suggestion: "Forest", deck: "target" },
    ];

    const result = acceptAllSuggestions("1 Sol Rng", "10 Forst", entries);

    expect(result).toEqual({ baseText: "1 Sol Ring", targetText: "10 Forest" });
  });

  it("ignores entries with a null suggestion, leaving their lines untouched", () => {
    const entries: UnresolvedEntry[] = [
      { name: "Sol Rng", reason: "not-found", suggestion: "Sol Ring", deck: "base" },
      { name: "Bob", reason: "ambiguous", suggestion: null, deck: "base" },
    ];

    const result = acceptAllSuggestions("1 Sol Rng\n1 Bob", "1 Forest", entries);

    expect(result).toEqual({ baseText: "1 Sol Ring\n1 Bob", targetText: "1 Forest" });
  });
});

describe("applyAllSuggestions", () => {
  it("rewrites every suggestion-bearing entry in a single list, preserving count prefixes", () => {
    const entries: UnresolvedCard[] = [
      { name: "Sol Rng", reason: "not-found", suggestion: "Sol Ring" },
      { name: "Forst", reason: "not-found", suggestion: "Forest" },
    ];

    const result = applyAllSuggestions("1 Sol Rng\n10 Forst", entries);

    expect(result).toBe("1 Sol Ring\n10 Forest");
  });

  it("skips entries with a null suggestion, leaving their lines untouched", () => {
    const entries: UnresolvedCard[] = [
      { name: "Sol Rng", reason: "not-found", suggestion: "Sol Ring" },
      { name: "Bob", reason: "ambiguous", suggestion: null },
    ];

    const result = applyAllSuggestions("1 Sol Rng\n1 Bob", entries);

    expect(result).toBe("1 Sol Ring\n1 Bob");
  });

  it("leaves non-card lines (comment, section header, count-only) untouched", () => {
    const text = "# notes\nDeck (99)\n4\n1 Sol Rng";
    const entries: UnresolvedCard[] = [{ name: "Sol Rng", reason: "not-found", suggestion: "Sol Ring" }];

    expect(applyAllSuggestions(text, entries)).toBe("# notes\nDeck (99)\n4\n1 Sol Ring");
  });

  it("returns the text unchanged for empty entries", () => {
    expect(applyAllSuggestions("1 Sol Ring", [])).toBe("1 Sol Ring");
  });
});
