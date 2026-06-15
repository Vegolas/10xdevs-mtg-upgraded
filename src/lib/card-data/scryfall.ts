/**
 * Raw Scryfall transport for the card-data module (roadmap F-01).
 *
 * This is the only file that knows Scryfall's wire shapes and URLs, so it can be
 * mocked in tests and swapped for a server proxy later without touching the
 * orchestrator.
 *
 * Scryfall requires a `User-Agent` and returns HTTP 400 without one. We set a
 * static app identifier ({@link SCRYFALL_USER_AGENT}): in browsers `User-Agent`
 * is a forbidden header, so the value is silently ignored and the browser sends
 * its own (harmless); in Node / SSR / a future server-proxy it is honored. The
 * static string carries no user data, so the privacy NFR is unaffected.
 */

const SCRYFALL_API_BASE = "https://api.scryfall.com";

/**
 * Descriptive User-Agent for Scryfall API etiquette (see the file header for why
 * deliberately setting a forbidden header is correct here).
 */
const SCRYFALL_USER_AGENT = "DeckDelta/0.1 (card-data resolution)";

/** Shared request headers; the JSON `Content-Type` is added per-call for POSTs. */
const SCRYFALL_HEADERS = {
  "User-Agent": SCRYFALL_USER_AGENT,
  Accept: "application/json",
};

/** Max identifiers Scryfall accepts per `/cards/collection` request. */
export const SCRYFALL_COLLECTION_MAX_IDENTIFIERS = 75;

/** Image URLs for a card or a single card face, keyed by size. */
export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

/** Market prices; each field is a decimal string or null. */
export interface ScryfallPrices {
  usd: string | null;
  usd_foil?: string | null;
  eur: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

/** One face of a multi-faced card (`transform`, `modal_dfc`, …). */
export interface ScryfallCardFace {
  name: string;
  type_line?: string;
  image_uris?: ScryfallImageUris;
}

/** The subset of a Scryfall card object the card-data module consumes. */
export interface ScryfallCard {
  name: string;
  type_line?: string;
  layout: string;
  image_uris?: ScryfallImageUris;
  prices: ScryfallPrices;
  card_faces?: ScryfallCardFace[];
}

/** A `/cards/collection` identifier that Scryfall could not match. */
export interface ScryfallNotFound {
  name?: string;
}

/** Parsed `/cards/collection` payload. */
export interface ScryfallCollectionResponse {
  data: ScryfallCard[];
  not_found: ScryfallNotFound[];
}

/**
 * POST one batch of names (must be ≤ {@link SCRYFALL_COLLECTION_MAX_IDENTIFIERS})
 * to `/cards/collection` and return the parsed payload. Chunking and throttling
 * live in the orchestrator; this performs exactly one request. Throws on a
 * network failure or a non-2xx response so the caller can decide how to degrade.
 */
export async function fetchCardCollection(names: string[]): Promise<ScryfallCollectionResponse> {
  const identifiers = names.map((name) => ({ name }));
  const response = await fetch(`${SCRYFALL_API_BASE}/cards/collection`, {
    method: "POST",
    headers: {
      ...SCRYFALL_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identifiers }),
  });

  if (!response.ok) {
    throw new Error(`Scryfall /cards/collection failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ScryfallCollectionResponse;
}

/** Scryfall error payload returned alongside a non-2xx response. */
export interface ScryfallError {
  object: string;
  code: string;
  status: number;
  details: string;
}

/** Outcome of a single-card fuzzy lookup. */
export type FuzzyMatch = { kind: "match"; name: string } | { kind: "ambiguous" } | { kind: "not-found" };

/**
 * Look up one name via `GET /cards/named?fuzzy=`. Returns the canonical name on
 * a 200 match; on a 404 distinguishes "ambiguous" (too many matches) from a
 * clean not-found via the error `code`/`details`. Throws only on an unexpected
 * (non-200, non-404) response or network failure so the orchestrator can decide
 * how to degrade.
 */
export async function fetchFuzzyName(name: string): Promise<FuzzyMatch> {
  const url = `${SCRYFALL_API_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: SCRYFALL_HEADERS });

  if (response.ok) {
    const card = (await response.json()) as ScryfallCard;
    return { kind: "match", name: card.name };
  }

  if (response.status === 404) {
    const error = (await response.json()) as ScryfallError;
    if (error.code === "ambiguous" || /ambiguous|too many/i.test(error.details)) {
      return { kind: "ambiguous" };
    }
    return { kind: "not-found" };
  }

  throw new Error(`Scryfall /cards/named failed: ${response.status} ${response.statusText}`);
}
