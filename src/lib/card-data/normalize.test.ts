import { describe, it, expect } from "vitest";
import { normalizeCard } from "./normalize";
import type { ScryfallCard } from "./scryfall";
import collectionBasic from "./__fixtures__/collection-basic.json";
import collectionDfc from "./__fixtures__/collection-dfc.json";

describe("normalizeCard", () => {
  it("normalizes a single-faced card with full data", () => {
    const card = normalizeCard(collectionBasic.data[0]);
    expect(card.name).toBe("Sol Ring");
    expect(card.typeLine).toBe("Artifact");
    expect(card.category).toBe("artifact");
    expect(card.imageUrl).toBe("https://cards.scryfall.io/normal/sol-ring.jpg");
    expect(card.priceUsd).toBe(1.23);
    expect(card.priceEur).toBe(0.98);
  });

  it("uses the top-level type line but falls back to the front-face image for a transform card", () => {
    // Real transform cards carry a combined top-level `type_line` but no
    // top-level `image_uris`, so only the image falls back to the front face.
    const card = normalizeCard(collectionDfc.data[0]);
    expect(card.typeLine).toBe("Creature — Human Wizard // Creature — Human Insect");
    expect(card.category).toBe("creature");
    expect(card.imageUrl).toBe("https://cards.scryfall.io/normal/delver-front.jpg");
  });

  it("falls back to the front face for both type line and image when no top-level values exist", () => {
    // Some layouts (e.g. double_faced_token) expose neither a top-level
    // `type_line` nor `image_uris`, so both come from the front face.
    const raw: ScryfallCard = {
      name: "Token Front // Token Back",
      layout: "double_faced_token",
      prices: { usd: null, eur: null },
      card_faces: [
        {
          name: "Token Front",
          type_line: "Token Creature — Elf Warrior",
          image_uris: { normal: "https://cards.scryfall.io/normal/token-front.jpg" },
        },
        {
          name: "Token Back",
          type_line: "Token Creature — Bird",
          image_uris: { normal: "https://cards.scryfall.io/normal/token-back.jpg" },
        },
      ],
    };
    const card = normalizeCard(raw);
    expect(card.typeLine).toBe("Token Creature — Elf Warrior");
    expect(card.category).toBe("creature");
    expect(card.imageUrl).toBe("https://cards.scryfall.io/normal/token-front.jpg");
  });

  it("returns null for both prices when neither currency is present", () => {
    const raw: ScryfallCard = {
      name: "No Price Card",
      layout: "normal",
      type_line: "Instant",
      prices: { usd: null, eur: null },
    };
    const card = normalizeCard(raw);
    expect(card.priceUsd).toBeNull();
    expect(card.priceEur).toBeNull();
  });

  it("parses one currency while the other stays null", () => {
    const raw: ScryfallCard = {
      name: "One Price Card",
      layout: "normal",
      type_line: "Sorcery",
      prices: { usd: "2.50", eur: null },
    };
    const card = normalizeCard(raw);
    expect(card.priceUsd).toBe(2.5);
    expect(card.priceEur).toBeNull();
  });

  it("returns a null image when no image set is available", () => {
    const raw: ScryfallCard = {
      name: "Imageless Card",
      layout: "normal",
      type_line: "Enchantment",
      prices: { usd: "0.10", eur: "0.09" },
    };
    const card = normalizeCard(raw);
    expect(card.imageUrl).toBeNull();
  });
});
