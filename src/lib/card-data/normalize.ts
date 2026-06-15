import { classifyType } from "./classify";
import type { Card } from "./types";
import type { ScryfallCard, ScryfallImageUris } from "./scryfall";

/** Parse a Scryfall price ("1.23" | null | undefined) into a number | null. */
function parsePrice(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** The normal-size image URL from an image set, or null when unavailable. */
function normalImage(imageUris: ScryfallImageUris | undefined): string | null {
  return imageUris?.normal ?? null;
}

/**
 * Convert a raw Scryfall card into our flat {@link Card}.
 *
 * Multi-faced cards (`transform`, `modal_dfc`, `double_faced_token`) carry no
 * top-level `type_line`/`image_uris`, so we fall back to the front face
 * (`card_faces[0]`). Split/adventure/flip cards keep a top-level `type_line`, so
 * the top-level value is preferred and they need no special-casing.
 */
export function normalizeCard(raw: ScryfallCard): Card {
  const front = raw.card_faces?.[0];
  const typeLine = raw.type_line ?? front?.type_line ?? "";
  const imageUrl = normalImage(raw.image_uris ?? front?.image_uris);

  return {
    name: raw.name,
    typeLine,
    category: classifyType(typeLine),
    imageUrl,
    priceUsd: parsePrice(raw.prices.usd),
    priceEur: parsePrice(raw.prices.eur),
  };
}
