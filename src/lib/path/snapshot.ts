/**
 * Snapshot (de)serialization for the `path_steps.snapshot` jsonb column
 * (user-accounts).
 *
 * Snapshots are client-produced and server-stored, so the read path is
 * untrusted: {@link parseSnapshot} is a structural type-guard that degrades a
 * malformed payload to `null` rather than throwing (mirrors `history/storage.ts`'s
 * `isSavedComparison` guard). {@link serializeSnapshot} produces a plain,
 * JSON-safe value that round-trips back through {@link parseSnapshot}. Both are
 * pure and unit-tested without a DOM.
 */

import { CATEGORY_ORDER } from "@/lib/deck";
import type { DeckCard } from "@/lib/deck";
import type { Card, CardCategory, UnresolvedReason } from "@/lib/card-data";
import type { StepSnapshot, UnresolvedLite } from "./types";

/** The card categories that may appear in a snapshot, reused from the engine's display order. */
const CARD_CATEGORIES: ReadonlySet<CardCategory> = new Set(CATEGORY_ORDER);

/** The resolver's failure reasons a stored unresolved entry may carry. */
const UNRESOLVED_REASONS: ReadonlySet<UnresolvedReason> = new Set(["not-found", "ambiguous", "malformed"]);

/** A value that is either a number or `null` (Scryfall coverage and image availability vary). */
function isNumberOrNull(value: unknown): value is number | null {
  return typeof value === "number" || value === null;
}

/** Narrow an unknown value to a well-formed {@link Card}. */
function isCard(value: unknown): value is Card {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const card = value as Record<string, unknown>;
  return (
    typeof card.name === "string" &&
    typeof card.typeLine === "string" &&
    typeof card.category === "string" &&
    CARD_CATEGORIES.has(card.category as CardCategory) &&
    (typeof card.imageUrl === "string" || card.imageUrl === null) &&
    isNumberOrNull(card.priceUsd) &&
    isNumberOrNull(card.priceEur)
  );
}

/** Narrow an unknown value to a well-formed {@link DeckCard}. */
function isDeckCard(value: unknown): value is DeckCard {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.quantity === "number" && isCard(entry.card);
}

/** Narrow an unknown value to a well-formed {@link UnresolvedLite}. */
function isUnresolvedLite(value: unknown): value is UnresolvedLite {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === "string" &&
    typeof entry.reason === "string" &&
    UNRESOLVED_REASONS.has(entry.reason as UnresolvedReason) &&
    (typeof entry.suggestion === "string" || entry.suggestion === null)
  );
}

/**
 * Produce a plain, JSON-safe representation of a snapshot for the `jsonb` column.
 * The shape is already JSON-serializable; rebuilding it explicitly keeps the
 * stored payload to exactly the fields {@link parseSnapshot} validates and
 * round-trips. Pure.
 */
export function serializeSnapshot(snapshot: StepSnapshot): unknown {
  return {
    cards: snapshot.cards.map((entry) => ({
      card: { ...entry.card },
      quantity: entry.quantity,
    })),
    unresolved: snapshot.unresolved.map((entry) => ({ ...entry })),
  };
}

/**
 * Parse an untrusted `jsonb` value into a clean {@link StepSnapshot}, or `null`
 * when the payload is not an object, is missing either array, or carries any
 * malformed card / unresolved entry. Never throws — pure, so it is unit-tested
 * directly and is the server's validation gate before storing a step.
 */
export function parseSnapshot(raw: unknown): StepSnapshot | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const { cards, unresolved } = candidate;

  if (!Array.isArray(cards) || !Array.isArray(unresolved)) {
    return null;
  }
  if (!cards.every(isDeckCard)) {
    return null;
  }
  if (!unresolved.every(isUnresolvedLite)) {
    return null;
  }

  return { cards, unresolved };
}
