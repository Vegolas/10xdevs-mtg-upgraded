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

/**
 * Format a nullable USD price for display. `null` (no resolved price) becomes the
 * em-dash missing marker; a number becomes an approximate two-decimal amount with
 * a leading `~` (e.g. `1.5` → `"~$1.50"`). The single formatter for both the
 * per-card row and the headline total, so money reads identically everywhere.
 */
export function formatUsd(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `~$${value.toFixed(2)}`;
}

/**
 * Format a nullable USD price as a signed amount for the merged ledger rows —
 * `+$94.38` for an added card, `−$4.77` for a removed one (true minus glyph,
 * U+2212). `null` (no resolved price) becomes the same em-dash marker as
 * {@link formatUsd}. The signed sibling of `formatUsd`; the `~` family is dropped
 * because the sign already carries the meaning. Does not change `formatUsd`.
 */
export function formatSignedUsd(value: number | null, sign: "add" | "remove"): string {
  if (value === null) {
    return "—";
  }

  const amount = value.toFixed(2);
  return sign === "add" ? `+$${amount}` : `−$${amount}`;
}
