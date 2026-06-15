/**
 * Deck diff + grouping (roadmap S-01; quantity-aware per deck-diff-quantities).
 *
 * Given two already-resolved, quantity-tagged decks, compute the upgrade plan as
 * per-card quantity deltas: copies to remove, copies to add, and shared copies —
 * each partition grouped by card type in a fixed display order.
 *
 * The diff is keyed on the canonical {@link Card.name} the resolver returns, not
 * on the raw pasted strings: `resolveCards` normalizes names (e.g. DFC faces are
 * joined as "Front // Back") and dedups input, so keying on anything else would
 * mis-diff normalized / double-faced cards. See
 * context/changes/grouped-upgrade-plan/plan.md (Critical Implementation Details).
 */

import type { Card, CardCategory } from "@/lib/card-data";

/** A card paired with a copy count — a deck's holding, or a diff partition's delta. */
export interface DeckCard {
  card: Card;
  quantity: number;
}

/** A set of cards sharing one category, ready to render as a labeled subsection. */
export interface CardGroup {
  category: CardCategory;
  cards: DeckCard[];
}

/** The computed upgrade plan: each partition grouped by card type. */
export interface UpgradePlan {
  /** Copies in the base deck beyond the target — drop these. */
  remove: CardGroup[];
  /** Copies in the target deck beyond the base — acquire these. */
  add: CardGroup[];
  /** Copies present in both decks (the overlap that stays). */
  shared: CardGroup[];
}

/**
 * Display order for the card-type subsections (PRD FR-004). Empty categories are
 * omitted from the output, so this is purely the order surviving buckets appear
 * in. Mirrors the precedence in card-data/classify.ts but is a separate concern:
 * that decides classification, this decides presentation.
 */
export const CATEGORY_ORDER: readonly CardCategory[] = [
  "land",
  "creature",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "planeswalker",
  "other",
];

/** Index a deck by canonical card name for quantity-aware set difference. */
function byName(deck: DeckCard[]): Map<string, DeckCard> {
  const map = new Map<string, DeckCard>();
  for (const entry of deck) {
    map.set(entry.card.name, entry);
  }
  return map;
}

/**
 * Group a flat {@link DeckCard} list into {@link CardGroup}s ordered by
 * {@link CATEGORY_ORDER}, omitting categories with no cards. Within each group,
 * cards are sorted by name.
 */
function groupByCategory(cards: DeckCard[]): CardGroup[] {
  const buckets = new Map<CardCategory, DeckCard[]>();
  for (const entry of cards) {
    const bucket = buckets.get(entry.card.category);
    if (bucket) {
      bucket.push(entry);
    } else {
      buckets.set(entry.card.category, [entry]);
    }
  }

  const groups: CardGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const bucket = buckets.get(category);
    if (bucket && bucket.length > 0) {
      bucket.sort((a, b) => a.card.name.localeCompare(b.card.name));
      groups.push({ category, cards: bucket });
    }
  }
  return groups;
}

/**
 * Diff two resolved, quantity-tagged decks into an {@link UpgradePlan}.
 *
 * Matched by canonical {@link Card.name}, per card: `shared` = min(base, target),
 * `remove` = max(0, base − target), `add` = max(0, target − base). A partially
 * changed card therefore appears in both `shared` and `remove`/`add`; a partition
 * with quantity 0 contributes nothing, so unchanged-count cards never reach
 * remove/add and empty categories stay omitted. The base card object is kept for
 * remove/shared, the target's for add. Each partition is then grouped by category
 * via {@link groupByCategory}.
 */
export function diffDecks(base: DeckCard[], target: DeckCard[]): UpgradePlan {
  const baseByName = byName(base);
  const targetByName = byName(target);

  const remove: DeckCard[] = [];
  const shared: DeckCard[] = [];
  for (const [name, baseEntry] of baseByName) {
    const targetQuantity = targetByName.get(name)?.quantity ?? 0;

    const sharedQuantity = Math.min(baseEntry.quantity, targetQuantity);
    if (sharedQuantity > 0) {
      shared.push({ card: baseEntry.card, quantity: sharedQuantity });
    }

    const removeQuantity = baseEntry.quantity - targetQuantity;
    if (removeQuantity > 0) {
      remove.push({ card: baseEntry.card, quantity: removeQuantity });
    }
  }

  const add: DeckCard[] = [];
  for (const [name, targetEntry] of targetByName) {
    const baseQuantity = baseByName.get(name)?.quantity ?? 0;
    const addQuantity = targetEntry.quantity - baseQuantity;
    if (addQuantity > 0) {
      add.push({ card: targetEntry.card, quantity: addQuantity });
    }
  }

  return {
    remove: groupByCategory(remove),
    add: groupByCategory(add),
    shared: groupByCategory(shared),
  };
}
