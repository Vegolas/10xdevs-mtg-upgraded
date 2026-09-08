import { describe, it, expect } from "vitest";
import { parseDeckList, hasNoCardLines } from "./parse";

describe("parseDeckList", () => {
  it("parses a leading count, an 'Nx' count, and a bare name", () => {
    const result = parseDeckList("3 Llanowar Elves\n4x Forest\nSol Ring");

    expect(result.entries).toEqual([
      { name: "Llanowar Elves", quantity: 3 },
      { name: "Forest", quantity: 4 },
      { name: "Sol Ring", quantity: 1 },
    ]);
    expect(result.malformed).toEqual([]);
  });

  it("skips blank lines and comments", () => {
    const result = parseDeckList("Sol Ring\n\n# my deck\n   \n// a note\nMana Crypt");

    expect(result.entries).toEqual([
      { name: "Sol Ring", quantity: 1 },
      { name: "Mana Crypt", quantity: 1 },
    ]);
    expect(result.malformed).toEqual([]);
  });

  it("skips section headers with and without a parenthesized count", () => {
    const result = parseDeckList("Commander\n1 Atraxa, Praetors' Voice\n\nDeck (99)\n1 Sol Ring\nSideboard\n");

    expect(result.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", quantity: 1 },
      { name: "Sol Ring", quantity: 1 },
    ]);
    expect(result.malformed).toEqual([]);
  });

  it("keeps duplicate lines as separate entries with their quantities", () => {
    const result = parseDeckList("Forest\nForest\n2 Forest");

    expect(result.entries).toEqual([
      { name: "Forest", quantity: 1 },
      { name: "Forest", quantity: 1 },
      { name: "Forest", quantity: 2 },
    ]);
  });

  it("records a count-only line as malformed", () => {
    const result = parseDeckList("4\n4x\nSol Ring");

    expect(result.malformed).toEqual(["4", "4x"]);
    expect(result.entries).toEqual([{ name: "Sol Ring", quantity: 1 }]);
  });

  it("leaves set-code / collector suffixes on the name (common-core scope)", () => {
    const result = parseDeckList("1 Sol Ring (LTC) 280");

    expect(result.entries).toEqual([{ name: "Sol Ring (LTC) 280", quantity: 1 }]);
    expect(result.malformed).toEqual([]);
  });

  it("parses a mixed real-world paste", () => {
    const paste = [
      "// Upgrade target",
      "Commander (1)",
      "1 Kenrith, the Returned King",
      "",
      "Deck (99)",
      "1 Sol Ring",
      "10 Forest",
      "1x Cultivate",
      "4 ",
    ].join("\n");

    const result = parseDeckList(paste);

    expect(result.entries).toEqual([
      { name: "Kenrith, the Returned King", quantity: 1 },
      { name: "Sol Ring", quantity: 1 },
      { name: "Forest", quantity: 10 },
      { name: "Cultivate", quantity: 1 },
    ]);
    expect(result.malformed).toEqual(["4"]);
  });

  it("returns empty results for empty input", () => {
    const result = parseDeckList("");

    expect(result.entries).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    const result = parseDeckList("1 Sol Ring\r\n2 Forest");

    expect(result.entries).toEqual([
      { name: "Sol Ring", quantity: 1 },
      { name: "Forest", quantity: 2 },
    ]);
  });
});

describe("hasNoCardLines", () => {
  it("is true for empty and whitespace-only text", () => {
    expect(hasNoCardLines("")).toBe(true);
    expect(hasNoCardLines("   ")).toBe(true);
    expect(hasNoCardLines("\n\n  \n")).toBe(true);
  });

  it("is true for comment-only text in both spellings", () => {
    expect(hasNoCardLines("// note")).toBe(true);
    expect(hasNoCardLines("# note")).toBe(true);
  });

  it("is true for section headers with and without a parenthesized count", () => {
    expect(hasNoCardLines("Commander")).toBe(true);
    expect(hasNoCardLines("Deck (99)")).toBe(true);
  });

  it("is true for a multi-line combination of comments, headers and blank lines", () => {
    const paste = ["// my commander deck", "", "Commander (1)", "   ", "Deck (99)", "# end"].join("\n");

    expect(hasNoCardLines(paste)).toBe(true);
  });

  it("is false as soon as one real card line is present", () => {
    expect(hasNoCardLines("Sol Ring")).toBe(false);
    expect(hasNoCardLines("3 Llanowar Elves")).toBe(false);
    expect(hasNoCardLines("// my deck\n\nDeck (99)\nSol Ring")).toBe(false);
  });

  it("is false for a count-only line — malformed is not absent", () => {
    // "4x" yields no entries but IS a card line, a bad one, and already surfaces
    // through UnresolvedNotice. Folding `malformed` into the predicate would
    // swallow that path; this assertion is what stops that "simplification".
    expect(hasNoCardLines("4x")).toBe(false);
    expect(hasNoCardLines("4")).toBe(false);
    expect(hasNoCardLines("// my deck\n4x")).toBe(false);
  });
});
