import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveCards, clearSessionCache } from "./resolve";
import collectionBasic from "./__fixtures__/collection-basic.json";
import collectionDfc from "./__fixtures__/collection-dfc.json";
import collectionWithNotFound from "./__fixtures__/collection-with-not-found.json";

interface CollectionRequestBody {
  identifiers: { name: string }[];
}

/** Fetch handlers routed by Scryfall endpoint. */
interface FetchHandlers {
  collection?: (identifiers: string[]) => unknown;
  fuzzy?: (query: string) => { status: number; payload: unknown };
}

/** Card objects captured from real Scryfall payloads, keyed by normalized name. */
const KNOWN_CARDS: Record<string, unknown> = {
  "sol ring": collectionBasic.data[0],
  "llanowar elves": collectionBasic.data[1],
  "delver of secrets": collectionDfc.data[0],
};

/** Collection identifiers requested in each call, in call order. */
let requestedBatches: string[][] = [];
/** Fuzzy queries requested in each call, in call order. */
let fuzzyQueries: string[] = [];

/** Build a Response-like object for a stubbed fetch. */
function statusResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

/** Extract the submitted identifier names from a collection request init. */
function identifiersOf(init: RequestInit | undefined): string[] {
  const body = typeof init?.body === "string" ? init.body : "";
  const parsed = JSON.parse(body) as CollectionRequestBody;
  return parsed.identifiers.map((identifier) => identifier.name);
}

/** Mimic Scryfall's collection endpoint: known cards resolve, others miss. */
function scryfallResponder(identifiers: string[]): unknown {
  const data: unknown[] = [];
  const notFound: { name: string }[] = [];
  for (const name of identifiers) {
    const card = KNOWN_CARDS[name.trim().toLowerCase()];
    if (card) {
      data.push(card);
    } else {
      notFound.push({ name });
    }
  }
  return { data, not_found: notFound };
}

/** A Scryfall card payload carrying just enough for normalizeCard. */
function cardPayload(name: string): unknown {
  return { object: "card", name, layout: "normal", type_line: "Artifact", prices: { usd: null, eur: null } };
}

/** Scryfall 404 "no match" error payload. */
function notFoundError(name: string): unknown {
  return { object: "error", code: "not_found", status: 404, details: `No cards found matching “${name}”.` };
}

/** Scryfall 404 "too ambiguous" error payload. */
function ambiguousError(name: string): unknown {
  return {
    object: "error",
    code: "ambiguous",
    status: 404,
    details: `Too many cards match ambiguous name “${name}”.`,
  };
}

/** Resolve a fetch input (string | URL | Request) to its URL string. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

/** Stub global fetch, routing by endpoint and recording each request. */
function installFetch(handlers: FetchHandlers): void {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.includes("/cards/collection")) {
      const identifiers = identifiersOf(init);
      requestedBatches.push(identifiers);
      const payload = handlers.collection ? handlers.collection(identifiers) : { data: [], not_found: [] };
      return Promise.resolve(statusResponse(200, payload));
    }
    const query = new URL(url).searchParams.get("fuzzy") ?? "";
    fuzzyQueries.push(query);
    const result = handlers.fuzzy ? handlers.fuzzy(query) : { status: 404, payload: notFoundError(query) };
    return Promise.resolve(statusResponse(result.status, result.payload));
  });
  vi.stubGlobal("fetch", mock);
}

beforeEach(() => {
  clearSessionCache();
  requestedBatches = [];
  fuzzyQueries = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveCards", () => {
  it("resolves names to classified cards with image and price", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["Sol Ring", "Llanowar Elves"]);

    expect(result.unresolved).toHaveLength(0);
    expect(result.resolved).toHaveLength(2);

    const solRing = result.resolved.find((card) => card.name === "Sol Ring");
    expect(solRing?.category).toBe("artifact");
    expect(solRing?.imageUrl).toBe("https://cards.scryfall.io/normal/sol-ring.jpg");
    expect(solRing?.priceUsd).toBe(1.23);

    const llanowar = result.resolved.find((card) => card.name === "Llanowar Elves");
    expect(llanowar?.category).toBe("creature");

    expect(requestedBatches).toHaveLength(1);
    expect(requestedBatches[0]).toEqual(["Sol Ring", "Llanowar Elves"]);
    expect(fuzzyQueries).toHaveLength(0);
  });

  it("collects an unmatched name and enriches it via a fuzzy lookup", async () => {
    installFetch({
      collection: () => collectionWithNotFound,
      fuzzy: (query) => ({ status: 404, payload: notFoundError(query) }),
    });
    const result = await resolveCards(["Sol Ring", "Notacard"]);

    expect(result.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
    expect(result.unresolved).toEqual([{ name: "Notacard", reason: "not-found", suggestion: null }]);
    expect(fuzzyQueries).toEqual(["Notacard"]);
  });

  it("flags blank names as malformed without calling the API", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["", "   ", "Sol Ring"]);

    expect(result.unresolved).toEqual([
      { name: "", reason: "malformed", suggestion: null },
      { name: "   ", reason: "malformed", suggestion: null },
    ]);
    expect(result.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
    expect(requestedBatches).toHaveLength(1);
    expect(requestedBatches[0]).toEqual(["Sol Ring"]);
    expect(fuzzyQueries).toHaveLength(0);
  });

  it("deduplicates repeated names to a single identifier", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["Llanowar Elves", "Llanowar Elves", "Llanowar Elves"]);

    expect(requestedBatches).toHaveLength(1);
    expect(requestedBatches[0]).toEqual(["Llanowar Elves"]);
    expect(result.resolved).toHaveLength(1);
  });

  it("resolves a multi-faced card to its front face", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["Delver of Secrets"]);

    expect(result.resolved).toHaveLength(1);
    const card = result.resolved[0];
    expect(card.category).toBe("creature");
    expect(card.imageUrl).toBe("https://cards.scryfall.io/normal/delver-front.jpg");
  });

  it("sends only the front face for a full `//` name and keeps the canonical name", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["Delver of Secrets // Insectile Aberration"]);

    // Front-only is what reaches Scryfall; the full `//` form would 404.
    expect(requestedBatches).toHaveLength(1);
    expect(requestedBatches[0]).toEqual(["Delver of Secrets"]);
    // Scryfall still returns the canonical full name, so the diff key stays canonical.
    expect(result.resolved.map((card) => card.name)).toEqual(["Delver of Secrets // Insectile Aberration"]);
    expect(result.unresolved).toHaveLength(0);
    expect(fuzzyQueries).toHaveLength(0);
  });

  it("reports the original `//` spelling on a genuine miss and fuzzes the front face", async () => {
    installFetch({
      collection: scryfallResponder,
      fuzzy: (query) => ({ status: 404, payload: notFoundError(query) }),
    });
    const result = await resolveCards(["Madeup Card // Fake Back"]);

    expect(result.resolved).toHaveLength(0);
    // The caller sees the spelling they pasted, not the truncated front face.
    expect(result.unresolved).toEqual([{ name: "Madeup Card // Fake Back", reason: "not-found", suggestion: null }]);
    // The fuzzy lookup runs on the front face for a sharper suggestion.
    expect(fuzzyQueries).toEqual(["Madeup Card"]);
  });

  it("treats an empty front face (`// Back`) as malformed without an API call", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["// Back", "Sol Ring"]);

    expect(result.unresolved).toEqual([{ name: "// Back", reason: "malformed", suggestion: null }]);
    expect(result.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
    expect(requestedBatches[0]).toEqual(["Sol Ring"]);
    expect(fuzzyQueries).toHaveLength(0);
  });

  it("splits more than 75 names into multiple batches", async () => {
    installFetch({ collection: (identifiers) => ({ data: identifiers.map(cardPayload), not_found: [] }) });
    const names = Array.from({ length: 76 }, (_unused, index) => `Test Card ${index + 1}`);

    await resolveCards(names);

    expect(requestedBatches).toHaveLength(2);
    expect(requestedBatches[0]).toHaveLength(75);
    expect(requestedBatches[1]).toHaveLength(1);
    expect(fuzzyQueries).toHaveLength(0);
  });

  it("serves repeated lookups from the in-session cache", async () => {
    installFetch({ collection: scryfallResponder });

    await resolveCards(["Sol Ring"]);
    expect(requestedBatches).toHaveLength(1);

    const second = await resolveCards(["Sol Ring"]);
    expect(requestedBatches).toHaveLength(1);
    expect(second.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
  });

  it("returns the full partial-success shape for mixed input", async () => {
    installFetch({
      collection: scryfallResponder,
      fuzzy: (query) => ({ status: 404, payload: notFoundError(query) }),
    });
    const result = await resolveCards([
      "Sol Ring",
      "Llanowar Elves",
      "Llanowar Elves",
      "Delver of Secrets",
      "Notacard",
      "",
    ]);

    expect(result.resolved.map((card) => card.name).sort()).toEqual([
      "Delver of Secrets // Insectile Aberration",
      "Llanowar Elves",
      "Sol Ring",
    ]);
    expect(result.unresolved).toEqual([
      { name: "", reason: "malformed", suggestion: null },
      { name: "Notacard", reason: "not-found", suggestion: null },
    ]);
  });
});

describe("resolveCards · fuzzy suggestions", () => {
  it("suggests a correction for a misspelled name", async () => {
    installFetch({
      collection: scryfallResponder,
      fuzzy: (query) =>
        query === "Sol Rng"
          ? { status: 200, payload: cardPayload("Sol Ring") }
          : { status: 404, payload: notFoundError(query) },
    });
    const result = await resolveCards(["Sol Rng"]);

    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toEqual([{ name: "Sol Rng", reason: "not-found", suggestion: "Sol Ring" }]);
    expect(fuzzyQueries).toEqual(["Sol Rng"]);
  });

  it("marks an ambiguous name as ambiguous with no suggestion", async () => {
    installFetch({
      collection: scryfallResponder,
      fuzzy: (query) => ({ status: 404, payload: ambiguousError(query) }),
    });
    const result = await resolveCards(["Bolt"]);

    expect(result.unresolved).toEqual([{ name: "Bolt", reason: "ambiguous", suggestion: null }]);
  });

  it("detects ambiguity from the error details when the code is generic", async () => {
    installFetch({
      collection: scryfallResponder,
      fuzzy: (query) => ({
        status: 404,
        payload: { object: "error", code: "bad_request", status: 404, details: `Too many cards match “${query}”.` },
      }),
    });
    const result = await resolveCards(["X"]);

    expect(result.unresolved).toEqual([{ name: "X", reason: "ambiguous", suggestion: null }]);
  });

  it("leaves pure gibberish as not-found with no suggestion", async () => {
    installFetch({
      collection: scryfallResponder,
      fuzzy: (query) => ({ status: 404, payload: notFoundError(query) }),
    });
    const result = await resolveCards(["Zzxqwerty"]);

    expect(result.unresolved).toEqual([{ name: "Zzxqwerty", reason: "not-found", suggestion: null }]);
    expect(fuzzyQueries).toEqual(["Zzxqwerty"]);
  });

  it("does not run a fuzzy lookup for malformed names", async () => {
    installFetch({ collection: scryfallResponder });
    const result = await resolveCards(["", "   "]);

    expect(result.unresolved).toEqual([
      { name: "", reason: "malformed", suggestion: null },
      { name: "   ", reason: "malformed", suggestion: null },
    ]);
    expect(requestedBatches).toHaveLength(0);
    expect(fuzzyQueries).toHaveLength(0);
  });
});
