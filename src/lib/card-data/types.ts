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
 *
 * Which field to reach for: **`matched` to join by input, `resolved` to render.**
 * `resolved` is the caller-order-agnostic list of cards to display; `matched` is
 * the association back to the names the caller asked about, which is the only way
 * to attribute an input's copy count to the card it produced. See
 * {@link ResolutionResult.matched}.
 */
export interface ResolutionResult {
  resolved: Card[];
  unresolved: UnresolvedCard[];
  /**
   * Which input produced which card: the **caller's** `resolutionKey(inputName)`
   * → the resolved {@link Card}.
   *
   * Not derivable from `resolved` alone. `resolutionKey` is only front-face +
   * lowercase, while the card-data source matches names more forgivingly — it
   * answers "Jace the Mind Sculptor" with "Jace, the Mind Sculptor", whose key
   * differs. A caller joining copy counts on the *canonical* key therefore misses,
   * and before this map existed both add flows silently fell back to one copy.
   *
   * Deliberately partial: an entry is present only when the association is
   * unambiguous. A card the resolver could not confidently attribute to an input
   * is absent, and callers fall back to their pre-existing rule rather than to a
   * guess — see `resolveCards`. So `matched.size <= resolved.length`, and a key
   * here is always a key the caller passed.
   */
  matched: ReadonlyMap<string, Card>;
}
