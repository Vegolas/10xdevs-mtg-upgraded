/**
 * localStorage bridge for the upgrade-plan sort preference (roadmap S-06).
 *
 * Mirrors the history storage module (`src/lib/history/storage.ts`): a versioned
 * envelope, a *pure* parse that degrades to the grouped default on any failure
 * (null/corrupt JSON, version mismatch, out-of-range field), and SSR-guarded
 * load/save as the only impure wrappers. The preference is a global view setting,
 * independent of saved comparisons — its own key, its own version.
 */

import { DEFAULT_SORT_MODE } from "./sort";
import type { SortDirection, SortKey, SortLayout, SortMode } from "./sort";

/** localStorage key; the `.v1` suffix is belt-and-suspenders over the envelope version. */
export const STORAGE_KEY = "deckdelta.sort.v1";

/** Current persisted-schema version; bump to invalidate older payloads. */
export const SORT_VERSION = 1;

/** The envelope actually written to localStorage; `version` gates migration. */
interface SortEnvelope {
  version: number;
  mode: SortMode;
}

const LAYOUTS: readonly SortLayout[] = ["grouped", "flat"];
const KEYS: readonly SortKey[] = ["name", "price"];
const DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

/** Narrow an unknown value to a well-formed {@link SortMode} with in-range fields. */
function isSortMode(value: unknown): value is SortMode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    LAYOUTS.includes(candidate.layout as SortLayout) &&
    KEYS.includes(candidate.key as SortKey) &&
    DIRECTIONS.includes(candidate.direction as SortDirection)
  );
}

/**
 * Parse a raw localStorage string into a clean {@link SortMode}. Returns
 * {@link DEFAULT_SORT_MODE} for null/empty input, invalid JSON, a non-object
 * payload, a version mismatch, or an out-of-range field. Otherwise rebuilds the
 * mode from validated fields (dropping any extras). Pure — no DOM access.
 */
export function parseSortMode(raw: string | null): SortMode {
  if (raw === null || raw === "") {
    return DEFAULT_SORT_MODE;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — degrade to the grouped default rather than throwing.
    return DEFAULT_SORT_MODE;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return DEFAULT_SORT_MODE;
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== SORT_VERSION) {
    return DEFAULT_SORT_MODE;
  }

  const mode = envelope.mode;
  if (!isSortMode(mode)) {
    return DEFAULT_SORT_MODE;
  }

  return { layout: mode.layout, key: mode.key, direction: mode.direction };
}

/** Wrap a mode in the current envelope and stringify. Pure; round-trips parseSortMode. */
export function serializeSortMode(mode: SortMode): string {
  const envelope: SortEnvelope = { version: SORT_VERSION, mode };
  return JSON.stringify(envelope);
}

/** Load the saved sort preference; the grouped default under SSR or any parse failure. */
export function loadSortMode(): SortMode {
  if (typeof window === "undefined") {
    return DEFAULT_SORT_MODE;
  }
  return parseSortMode(window.localStorage.getItem(STORAGE_KEY));
}

/**
 * Persist the sort preference to localStorage. No-op under SSR. Quota/serialization
 * failures are swallowed (non-fatal) — the preference is a single tiny value.
 */
export function saveSortMode(mode: SortMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeSortMode(mode));
  } catch {
    // Quota exceeded or storage unavailable — the preference is best-effort, so ignore.
  }
}
