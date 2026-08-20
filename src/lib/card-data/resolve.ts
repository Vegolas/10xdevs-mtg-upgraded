import { fetchCardCollection, fetchFuzzyName, SCRYFALL_COLLECTION_MAX_IDENTIFIERS } from "./scryfall";
import { normalizeCard } from "./normalize";
import type { FuzzyMatch } from "./scryfall";
import type { Card, ResolutionResult, UnresolvedCard } from "./types";

/** Delay between sequential Scryfall requests (ms) — keeps us a good citizen. */
const REQUEST_THROTTLE_MS = 100;

/**
 * In-session cache: normalized front-face name -> resolved Card, persisting across
 * calls so re-pastes and repeated basic lands cost a single lookup. Keying on the
 * front face lets either the front-only or the full `//` form of a card hit the
 * same entry.
 */
const sessionCache = new Map<string, Card>();

/**
 * Reduce a `Front // Back` name (double-faced, split, adventure, MDFC) to its
 * front face. Scryfall's `/cards/collection` matches a `name` identifier only
 * against the front face, so the full `//` form returns `not_found`. A name
 * without `//` is returned trimmed and unchanged.
 */
function frontFace(name: string): string {
  return name.split("//")[0].trim();
}

/**
 * Identity key for a card name: its front face, lowercased. The front-only and
 * full `//` spellings of one card collapse to the same key. This is the key the
 * resolver dedups and caches on, AND the key the deck layer joins quantities on
 * (see `@/lib/deck`) — the two MUST share this one definition or the forms won't
 * line up. Returns "" for a blank or front-less name (e.g. "// Back").
 */
export function resolutionKey(name: string): string {
  return frontFace(name).toLowerCase();
}

/** Split a list into consecutive chunks of at most `size` items. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Resolve after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Attribute one batch's returned cards back to the identifiers that fetched them,
 * recording only unambiguous pairs in `matched`.
 *
 * Two passes, and the second is deliberately timid:
 *
 *  1. **Direct.** A returned card whose own `resolutionKey` equals a sent
 *     identifier's key pairs with it. This is the overwhelming majority and needs
 *     no assumption about response ordering.
 *  2. **Sole residual.** Whatever is left over is a card the source canonicalized
 *     past `resolutionKey`'s reach ("Jace the Mind Sculptor" → "Jace, the Mind
 *     Sculptor"). Pair it **only when exactly one card and exactly one identifier
 *     remain**, where the association is unambiguous no matter what order the
 *     response came back in.
 *
 * Positionally pairing two or more residuals would rest on the source returning
 * found cards in submitted order — a guarantee this codebase has never depended on.
 * If it did not hold, two cards would silently swap copy counts, which is a worse
 * failure than the one `matched` exists to fix. So a multi-residual batch records
 * nothing and its cards fall back to {@link quantifyResolved}'s old rule: the fix
 * simply does not apply, exactly as before. Revisit only with a cited ordering
 * guarantee.
 */
function pairBatch(
  batch: { key: string; identifier: string }[],
  cards: Card[],
  notFound: { name?: string }[],
  matched: Map<string, Card>,
): void {
  const missedKeys = new Set(notFound.map((miss) => resolutionKey(miss.name ?? "")));
  const candidates = batch.filter((item) => !missedKeys.has(item.key));

  const pairedKeys = new Set<string>();
  const residualCards: Card[] = [];
  for (const card of cards) {
    const canonical = resolutionKey(card.name);
    const direct = candidates.find((item) => item.key === canonical && !pairedKeys.has(item.key));
    if (direct) {
      matched.set(direct.key, card);
      pairedKeys.add(direct.key);
    } else {
      residualCards.push(card);
    }
  }

  const residualKeys = candidates.filter((item) => !pairedKeys.has(item.key));
  if (residualCards.length === 1 && residualKeys.length === 1) {
    matched.set(residualKeys[0].key, residualCards[0]);
  }
}

/**
 * Resolve a list of card names against the card-data source.
 *
 * A `Front // Back` name (double-faced, split, adventure, MDFC) is reduced to its
 * front face before the lookup, since Scryfall's `/cards/collection` matches only
 * the front face. The canonical full name still comes back, so `Card.name` (the
 * diff key) stays canonical. Dedup and the session cache key on the front face, so
 * the front-only and full `//` spellings of one card collapse to a single lookup.
 *
 * Never throws on an unknown name: returns partial success with `resolved` cards
 * and `unresolved` misses. A blank name — or one whose front face is empty, e.g.
 * "// Back" — short-circuits to `malformed` with no API call. Repeated names are
 * deduplicated within the call and resolved cards are memoized in a session-level
 * cache.
 *
 * Misses are collected from the batch pass, then each unmatched name is enriched
 * with a fuzzy "did you mean" suggestion and a refined reason; the original
 * spelling the caller passed is what gets reported.
 */
export async function resolveCards(names: string[]): Promise<ResolutionResult> {
  const resolved: Card[] = [];
  const unresolved: UnresolvedCard[] = [];
  // Which caller input produced which card — see `ResolutionResult.matched`.
  const matched = new Map<string, Card>();

  // Dedup input on the front-face form while preserving first-seen order, so the
  // front-only and full `//` spellings of one card collapse to a single lookup.
  // Remember the original spelling per key so misses report the name the caller
  // actually passed. A blank name — or an input whose front face is empty, e.g.
  // "// Back" — is malformed and never hits the API.
  const uniqueByKey = new Map<string, string>();
  for (const name of names) {
    const key = resolutionKey(name);
    if (key === "") {
      unresolved.push({ name, reason: "malformed", suggestion: null });
      continue;
    }
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, name);
    }
  }

  // Serve cache hits; queue the front face of the rest for fetching. A queued
  // item carries the caller's key alongside the identifier we send, so a returned
  // card can be attributed back to the input that asked for it.
  const toFetch: { key: string; identifier: string }[] = [];
  for (const [key, name] of uniqueByKey) {
    const cached = sessionCache.get(key);
    if (cached) {
      resolved.push(cached);
      // A cache hit needs no pairing: the key that found it IS the caller's key.
      matched.set(key, cached);
    } else {
      toFetch.push({ key, identifier: frontFace(name) });
    }
  }

  const batches = chunk(toFetch, SCRYFALL_COLLECTION_MAX_IDENTIFIERS);
  const missedNames: string[] = [];
  let requestsMade = 0;

  for (const batch of batches) {
    if (requestsMade > 0) {
      await delay(REQUEST_THROTTLE_MS);
    }
    requestsMade += 1;

    const response = await fetchCardCollection(batch.map((item) => item.identifier));

    const cards: Card[] = [];
    for (const raw of response.data) {
      const card = normalizeCard(raw);
      cards.push(card);
      resolved.push(card);
      // Key on the front face of the canonical name so a later lookup by either
      // the front-only or the full `//` form hits this entry.
      sessionCache.set(resolutionKey(card.name), card);
    }

    // Scryfall echoes back the identifiers it could not match; collect them for
    // fuzzy enrichment below.
    for (const miss of response.not_found) {
      missedNames.push(miss.name ?? "");
    }

    pairBatch(batch, cards, response.not_found, matched);
  }

  // Enrich each unmatched name with a fuzzy suggestion and a refined reason.
  // Sequential + throttled; malformed names (handled above) are never queried.
  // `missName` is the front face we sent: fuzz on it for a sharper suggestion,
  // but report the original spelling the caller passed.
  for (const missName of missedNames) {
    if (requestsMade > 0) {
      await delay(REQUEST_THROTTLE_MS);
    }
    requestsMade += 1;

    const fuzzy = await fetchFuzzyName(missName);
    const original = uniqueByKey.get(resolutionKey(missName)) ?? missName;
    unresolved.push(toUnresolvedCard(original, fuzzy));
  }

  return { resolved, unresolved, matched };
}

/**
 * Total each resolved card's copy count from the caller's per-input counts.
 *
 * `quantityByInputKey` is keyed by the caller's own `resolutionKey(inputName)`;
 * the returned map is keyed by the *canonical* `resolutionKey` of each resolved
 * card. {@link ResolutionResult.matched} bridges the two, so an input whose name
 * the source canonicalized still contributes its count.
 *
 * The fallback chain is the load-bearing part, and both add flows share it here so
 * they cannot drift: a card `matched` covers takes the summed count; a card it does
 * not cover falls back to a direct lookup on the canonical key, then to 1. That
 * last step is the pre-`matched` behavior, kept deliberately — when the resolver
 * declines to guess an association, the caller degrades to the old rule rather
 * than to a wrong number.
 */
export function quantifyResolved(
  resolution: ResolutionResult,
  quantityByInputKey: ReadonlyMap<string, number>,
): Map<string, number> {
  const viaMatched = new Map<string, number>();
  for (const [inputKey, card] of resolution.matched) {
    const canonical = resolutionKey(card.name);
    viaMatched.set(canonical, (viaMatched.get(canonical) ?? 0) + (quantityByInputKey.get(inputKey) ?? 0));
  }

  const quantities = new Map<string, number>();
  for (const card of resolution.resolved) {
    const canonical = resolutionKey(card.name);
    const total = viaMatched.get(canonical);
    quantities.set(canonical, total !== undefined && total > 0 ? total : (quantityByInputKey.get(canonical) ?? 1));
  }
  return quantities;
}

/** Map a fuzzy lookup outcome to the unresolved-card reason taxonomy. */
function toUnresolvedCard(name: string, fuzzy: FuzzyMatch): UnresolvedCard {
  if (fuzzy.kind === "match") {
    return { name, reason: "not-found", suggestion: fuzzy.name };
  }
  if (fuzzy.kind === "ambiguous") {
    return { name, reason: "ambiguous", suggestion: null };
  }
  return { name, reason: "not-found", suggestion: null };
}

/** Test seam: clear the in-session cache. Not part of the public barrel. */
export function clearSessionCache(): void {
  sessionCache.clear();
}
