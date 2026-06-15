/**
 * Raw Scryfall transport for the card-data module (roadmap F-01).
 *
 * This is the only file that knows Scryfall's wire shapes and URLs, so it can be
 * mocked in tests and swapped for a server proxy later without touching the
 * orchestrator. Browsers forbid setting `User-Agent` (a forbidden header), so
 * Scryfall's UA etiquette cannot be honored client-side; a future server proxy
 * should add it back. We send only `Accept: application/json` (plus the JSON
 * content type on the POST body).
 */

const SCRYFALL_API_BASE = "https://api.scryfall.com";

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
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identifiers }),
  });

  if (!response.ok) {
    throw new Error(`Scryfall /cards/collection failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ScryfallCollectionResponse;
}
