/**
 * Deck diff + grouping (roadmap S-01).
 *
 * Given two already-resolved decks, compute the upgrade plan: cards to remove
 * (base only), cards to add (target only), and shared cards (in both) — each
 * partition grouped by card type in a fixed display order.
 *
 * The diff is keyed on the canonical {@link Card.name} the resolver returns, not
 * on the raw pasted strings: `resolveCards` normalizes names (e.g. DFC faces are
 * joined as "Front // Back") and dedups input, so keying on anything else would
 * mis-diff normalized / double-faced cards. See
 * context/changes/grouped-upgrade-plan/plan.md (Critical Implementation Details).
 */

import type { Card, CardCategory } from "@/lib/card-data";

/** A set of cards sharing one category, ready to render as a labeled subsection. */
export interface CardGroup {
  category: CardCategory;
  cards: Card[];
}

/** The computed upgrade plan: each partition grouped by card type. */
export interface UpgradePlan {
  /** Cards in the base deck but not the target — drop these. */
  remove: CardGroup[];
  /** Cards in the target deck but not the base — acquire these. */
  add: CardGroup[];
  /** Cards present in both decks. */
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

/** Index a deck by canonical card name for set-difference by identity. */
function byName(cards: Card[]): Map<string, Card> {
  const map = new Map<string, Card>();
  for (const card of cards) {
    map.set(card.name, card);
  }
  return map;
}

/**
 * Group a flat card list into {@link CardGroup}s ordered by {@link CATEGORY_ORDER},
 * omitting categories with no cards. Within each group, cards are sorted by name.
 */
function groupByCategory(cards: Card[]): CardGroup[] {
  const buckets = new Map<CardCategory, Card[]>();
  for (const card of cards) {
    const bucket = buckets.get(card.category);
    if (bucket) {
      bucket.push(card);
    } else {
      buckets.set(card.category, [card]);
    }
  }

  const groups: CardGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const bucket = buckets.get(category);
    if (bucket && bucket.length > 0) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
      groups.push({ category, cards: bucket });
    }
  }
  return groups;
}

/**
 * Diff two resolved decks into an {@link UpgradePlan}.
 *
 * Set difference is computed by canonical {@link Card.name}: `remove` is base
 * names not in target, `add` is target names not in base, `shared` is the
 * intersection (the base copy is kept for shared cards). Each partition is then
 * grouped by category via {@link groupByCategory}.
 */
export function diffDecks(base: Card[], target: Card[]): UpgradePlan {
  const baseByName = byName(base);
  const targetByName = byName(target);

  const remove: Card[] = [];
  const shared: Card[] = [];
  for (const [name, card] of baseByName) {
    if (targetByName.has(name)) {
      shared.push(card);
    } else {
      remove.push(card);
    }
  }

  const add: Card[] = [];
  for (const [name, card] of targetByName) {
    if (!baseByName.has(name)) {
      add.push(card);
    }
  }

  return {
    remove: groupByCategory(remove),
    add: groupByCategory(add),
    shared: groupByCategory(shared),
  };
}
