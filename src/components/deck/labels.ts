import type { CardCategory } from "@/lib/card-data";
import type { CardGroup } from "@/lib/deck";

/**
 * Human-facing (plural) labels for the card-type buckets, shared by the
 * Remove/Add columns and the shared-cards disclosure so both read the same.
 */
const CATEGORY_LABELS: Record<CardCategory, string> = {
  land: "Lands",
  creature: "Creatures",
  instant: "Instants",
  sorcery: "Sorceries",
  artifact: "Artifacts",
  enchantment: "Enchantments",
  planeswalker: "Planeswalkers",
  other: "Other",
};

/** Map a {@link CardCategory} to its display label (e.g. `"land"` → `"Lands"`). */
export function categoryLabel(category: CardCategory): string {
  return CATEGORY_LABELS[category];
}

/** Total copies in a group — sum of per-card quantities, not distinct cards. */
export function groupCopies(group: CardGroup): number {
  return group.cards.reduce((sum, entry) => sum + entry.quantity, 0);
}
