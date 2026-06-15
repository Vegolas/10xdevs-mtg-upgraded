import { fetchCardCollection, SCRYFALL_COLLECTION_MAX_IDENTIFIERS } from "./scryfall";
import { normalizeCard } from "./normalize";
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
 * Phase 2 collects misses as `not-found` with `suggestion: null`; Phase 3 will
 * enrich them with fuzzy suggestions and refine the reason.
 */
export async function resolveCards(names: string[]): Promise<ResolutionResult> {
  const resolved: Card[] = [];
  const unresolved: UnresolvedCard[] = [];

  // Dedup input while preserving first-seen order; remember the original
  // spelling per key so misses report the name the caller actually passed.
  const uniqueByKey = new Map<string, string>();
  for (const name of names) {
    if (name.trim() === "") {
      unresolved.push({ name, reason: "malformed", suggestion: null });
      continue;
    }
    const key = normalizeKey(name);
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, name);
    }
  }

  // Serve cache hits; queue the rest for fetching.
  const toFetch: string[] = [];
  for (const [key, name] of uniqueByKey) {
    const cached = sessionCache.get(key);
    if (cached) {
      resolved.push(cached);
    } else {
      toFetch.push(name);
    }
  }

  const batches = chunk(toFetch, SCRYFALL_COLLECTION_MAX_IDENTIFIERS);
  let isFirstBatch = true;
  for (const batch of batches) {
    if (!isFirstBatch) {
      await delay(REQUEST_THROTTLE_MS);
    }
    isFirstBatch = false;

    const response = await fetchCardCollection(batch);

    for (const raw of response.data) {
      const card = normalizeCard(raw);
      resolved.push(card);
      sessionCache.set(normalizeKey(card.name), card);
    }

    // Scryfall echoes back the identifiers it could not match; reason is
    // `not-found` here, refined and given a suggestion in Phase 3.
    for (const miss of response.not_found) {
      unresolved.push({ name: miss.name ?? "", reason: "not-found", suggestion: null });
    }
  }

  return { resolved, unresolved };
}

/** Test seam: clear the in-session cache. Not part of the public barrel. */
export function clearSessionCache(): void {
  sessionCache.clear();
}
