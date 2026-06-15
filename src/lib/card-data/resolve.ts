import { fetchCardCollection, fetchFuzzyName, SCRYFALL_COLLECTION_MAX_IDENTIFIERS } from "./scryfall";
import { normalizeCard } from "./normalize";
import type { FuzzyMatch } from "./scryfall";
import type { Card, ResolutionResult, UnresolvedCard } from "./types";

/** Delay between sequential Scryfall requests (ms) — keeps us a good citizen. */
const REQUEST_THROTTLE_MS = 100;

/**
 * In-session cache: normalized input name -> resolved Card, persisting across
 * calls so re-pastes and repeated basic lands cost a single lookup.
 */
const sessionCache = new Map<string, Card>();

/** Normalize a name for cache keys and within-call dedup. */
function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Reduce a `Front // Back` name (double-faced, split, adventure, MDFC) to its
 * front face. Scryfall's `/cards/collection` matches a `name` identifier only
 * against the front face, so the full `//` form returns `not_found`. A name
 * without `//` is returned trimmed and unchanged.
 */
function frontFace(name: string): string {
  return name.split("//")[0].trim();
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
 * Resolve a list of (already-clean) card names against the card-data source.
 *
 * Never throws on an unknown name: returns partial success with `resolved` cards
 * and `unresolved` misses. Blank/whitespace names short-circuit to `malformed`
 * with no API call. Repeated names are deduplicated within the call and resolved
 * cards are memoized in a session-level cache.
 *
 * Misses are collected from the batch pass, then each unmatched name is enriched
 * with a fuzzy "did you mean" suggestion and a refined reason.
 */
export async function resolveCards(names: string[]): Promise<ResolutionResult> {
  const resolved: Card[] = [];
  const unresolved: UnresolvedCard[] = [];

  // Dedup input on the front-face form while preserving first-seen order, so the
  // front-only and full `//` spellings of one card collapse to a single lookup.
  // Remember the original spelling per key so misses report the name the caller
  // actually passed. A blank name — or an input whose front face is empty, e.g.
  // "// Back" — is malformed and never hits the API.
  const uniqueByKey = new Map<string, string>();
  for (const name of names) {
    const front = frontFace(name);
    if (front === "") {
      unresolved.push({ name, reason: "malformed", suggestion: null });
      continue;
    }
    const key = normalizeKey(front);
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, name);
    }
  }

  // Serve cache hits; queue the front face of the rest for fetching.
  const toFetch: string[] = [];
  for (const [key, name] of uniqueByKey) {
    const cached = sessionCache.get(key);
    if (cached) {
      resolved.push(cached);
    } else {
      toFetch.push(frontFace(name));
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

    const response = await fetchCardCollection(batch);

    for (const raw of response.data) {
      const card = normalizeCard(raw);
      resolved.push(card);
      // Key on the front face of the canonical name so a later lookup by either
      // the front-only or the full `//` form hits this entry.
      sessionCache.set(normalizeKey(frontFace(card.name)), card);
    }

    // Scryfall echoes back the identifiers it could not match; collect them for
    // fuzzy enrichment below.
    for (const miss of response.not_found) {
      missedNames.push(miss.name ?? "");
    }
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
    const original = uniqueByKey.get(normalizeKey(missName)) ?? missName;
    unresolved.push(toUnresolvedCard(original, fuzzy));
  }

  return { resolved, unresolved };
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
