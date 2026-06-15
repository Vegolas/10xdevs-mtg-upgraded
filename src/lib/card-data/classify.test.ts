import { describe, it, expect } from "vitest";
import { classifyType } from "./classify";
import type { CardCategory } from "./types";

describe("classifyType", () => {
  describe("each grouping bucket", () => {
    const cases: [string, CardCategory][] = [
      ["Basic Land — Forest", "land"],
      ["Legendary Creature — Elf Druid", "creature"],
      ["Instant", "instant"],
      ["Sorcery", "sorcery"],
      ["Artifact", "artifact"],
      ["Enchantment — Aura", "enchantment"],
      ["Legendary Planeswalker — Teferi", "planeswalker"],
    ];

    it.each(cases)("classifies '%s' as '%s'", (typeLine, expected) => {
      expect(classifyType(typeLine)).toBe(expected);
    });
  });

  describe("precedence on overlapping types", () => {
    it("treats Artifact Creature as creature", () => {
      expect(classifyType("Legendary Artifact Creature — Golem")).toBe("creature");
    });

    it("treats Artifact Land as land", () => {
      expect(classifyType("Artifact Land")).toBe("land");
    });

    it("treats Land Creature as land", () => {
      expect(classifyType("Land Creature — Dryad")).toBe("land");
    });

    it("treats Enchantment Creature as creature", () => {
      expect(classifyType("Enchantment Creature — God")).toBe("creature");
    });
  });

  describe("fallbacks", () => {
    it("classifies an unmodeled type as other", () => {
      expect(classifyType("Battle — Siege")).toBe("other");
    });

    it("classifies an empty type line as other", () => {
      expect(classifyType("")).toBe("other");
    });
  });

  it("is case-insensitive", () => {
    expect(classifyType("legendary creature — elf")).toBe("creature");
  });

  it("ignores subtypes that collide with type words", () => {
    // "Forest" is a Land subtype; "Saga" etc. never reintroduce a type keyword,
    // but verify a subtype after the dash cannot flip the category.
    expect(classifyType("Enchantment — Saga")).toBe("enchantment");
  });
});
