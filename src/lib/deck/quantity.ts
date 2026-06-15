/**
 * Quantity attachment (deck-diff-quantities).
 *
 * The resolver returns deduped, canonical {@link Card}s but no quantities — those
 * live in the parsed {@link DeckEntry} lines. This joins the two: it sums the
 * parsed quantities per card identity (so duplicate lines, and the front-only and
 * full `//` spellings of one card, combine) and pairs each resolved card with its
 * total. The join key is {@link resolutionKey} — the SAME key the resolver dedups
 * on — so a card resolved to its canonical `A // B` name still matches an entry
 * that listed only the front face.
 */

import { resolutionKey } from "@/lib/card-data";
import type { Card } from "@/lib/card-data";
import type { DeckEntry } from "./parse";
import type { DeckCard } from "./diff";

/**
 * Pair each resolved card with the total quantity its deck listed.
 *
 * Quantities are summed per {@link resolutionKey}; a resolved card with no matching
 * entry falls back to quantity 1 (it was asked for, so it was listed at least once).
 */
export function attachQuantities(resolved: Card[], entries: DeckEntry[]): DeckCard[] {
  const quantityByKey = new Map<string, number>();
  for (const entry of entries) {
    const key = resolutionKey(entry.name);
    quantityByKey.set(key, (quantityByKey.get(key) ?? 0) + entry.quantity);
  }

  return resolved.map((card) => ({
    card,
    quantity: quantityByKey.get(resolutionKey(card.name)) ?? 1,
  }));
}
