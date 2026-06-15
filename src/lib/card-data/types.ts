/**
 * Card-data resolution contract (roadmap F-01).
 *
 * These are the load-bearing types every later slice consumes:
 * S-01 (grouping) reads `category`, S-02 reads `imageUrl`, S-03 reads the prices.
 * See docs/reference/contract-surfaces.md.
 */

/** The card-type buckets the upgrade plan groups by (PRD FR-004), plus a catch-all. */
export type CardCategory =
  | "land"
  | "creature"
  | "instant"
  | "sorcery"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "other";

/** A successfully resolved card, normalized from the card-data source. */
export interface Card {
  /** Canonical card name (front face for multi-faced cards). */
  name: string;
  /** Raw type line from the source (front face for multi-faced cards). */
  typeLine: string;
  /** Derived from {@link typeLine} via classifyType. */
  category: CardCategory;
  /** Normal-size image URL (front face); null when unavailable. */
  imageUrl: string | null;
  /** Approximate USD market price; null when the source has none. */
  priceUsd: number | null;
  /** Approximate EUR market price; null when the source has none. */
  priceEur: number | null;
}

/** Why an input name could not be resolved to a card. */
export type UnresolvedReason = "not-found" | "ambiguous" | "malformed";

/** An input name that did not resolve, with an optional "did you mean" suggestion. */
export interface UnresolvedCard {
  /** The input name that failed to resolve. */
  name: string;
  reason: UnresolvedReason;
  /** Nearest fuzzy match, when one is available (populated in Phase 3). */
  suggestion: string | null;
}

/**
 * Partial-success result: resolution never throws on an unknown name.
 * Callers render `resolved` and surface `unresolved` (PRD Guardrail: clear
 * error, not silent omission).
 */
export interface ResolutionResult {
  resolved: Card[];
  unresolved: UnresolvedCard[];
}
