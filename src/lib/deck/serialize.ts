/**
 * Deck-cards → text serialization (diff-style-checkpoint-entry).
 *
 * The inverse of {@link parseDeckList} for the display order the path builder
 * renders: render a resolved {@link DeckCard} list back to canonical
 * `"<qty> <name>"` deck-list text. Used so a diff-entered checkpoint's stored
 * `list_text` carries the *derived* full list and stays meaningful (the column is
 * never re-parsed on read, but it remains a faithful textual mirror of the
 * snapshot). Ordering matches the on-screen grouping ({@link groupByCategory}:
 * category order, then name within each category) so the text is stable.
 */

import { groupByCategory } from "./diff";
import type { DeckCard } from "./diff";

/**
 * Render a resolved deck to canonical deck-list text — one `"<qty> <name>"` line
 * per card, ordered by {@link groupByCategory} (category order, name-sorted
 * within). Round-trips through {@link parseDeckList} to the same `{name, quantity}`
 * entries (in this order).
 */
export function deckCardsToText(cards: DeckCard[]): string {
  return groupByCategory(cards)
    .flatMap((group) => group.cards)
    .map((entry) => `${entry.quantity} ${entry.card.name}`)
    .join("\n");
}
