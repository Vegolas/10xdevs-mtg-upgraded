/**
 * Quantity attachment (deck-diff-quantities).
 *
 * The resolver returns deduped, canonical {@link Card}s but no quantities — those
 * live in the parsed {@link DeckEntry} lines. This joins the two: it sums the
 * parsed quantities per card identity (so duplicate lines, and the front-only and
 * full `//` spellings of one card, combine) and pairs each resolved card with its
 * total.
 *
 * The join runs through the resolution's `matched` map rather than by name, because
 * `resolutionKey` (front face, lowercased) is narrower than the card-data source's
 * own name matching: ask for "Jace the Mind Sculptor" and the canonical
 * "Jace, the Mind Sculptor" comes back under a different key. Joining on the
 * canonical key alone missed those and silently fell back to one copy — a listed
 * `3` persisting as `1` with nothing surfaced. `matched` says which input produced
 * the card, so the count follows the input.
 *
 * Shared with the diff-mode derive via `quantifyResolved`, so both add flows fall
 * back identically when the resolver declines to attribute a card.
 */

import { quantifyResolved, resolutionKey } from "@/lib/card-data";
import type { ResolutionResult } from "@/lib/card-data";
import type { DeckEntry } from "./parse";
import type { DeckCard } from "./diff";

/**
 * Pair each resolved card with the total quantity its deck listed.
 *
 * Takes the whole {@link ResolutionResult} rather than just its `resolved` array so
 * the cards and their input association cannot be passed separately and drift.
 * Quantities are summed per {@link resolutionKey} of the *listed* name; a resolved
 * card the resolution could not attribute to any entry falls back to quantity 1
 * (it was asked for, so it was listed at least once).
 */
export function attachQuantities(resolution: ResolutionResult, entries: DeckEntry[]): DeckCard[] {
  const quantityByKey = new Map<string, number>();
  for (const entry of entries) {
    const key = resolutionKey(entry.name);
    quantityByKey.set(key, (quantityByKey.get(key) ?? 0) + entry.quantity);
  }

  const quantities = quantifyResolved(resolution, quantityByKey);

  return resolution.resolved.map((card) => ({
    card,
    quantity: quantities.get(resolutionKey(card.name)) ?? 1,
  }));
}
