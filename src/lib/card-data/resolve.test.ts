import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveCards, clearSessionCache } from "./resolve";
import collectionBasic from "./__fixtures__/collection-basic.json";
import collectionDfc from "./__fixtures__/collection-dfc.json";
import collectionWithNotFound from "./__fixtures__/collection-with-not-found.json";

interface CollectionRequestBody {
  identifiers: { name: string }[];
}

/** Card objects captured from real Scryfall payloads, keyed by normalized name. */
const KNOWN_CARDS: Record<string, unknown> = {
  "sol ring": collectionBasic.data[0],
  "llanowar elves": collectionBasic.data[1],
  "delver of secrets": collectionDfc.data[0],
};

/** Identifiers requested in each fetch call, in call order. */
let requestedBatches: string[][] = [];

/** Build a minimal Response-like object for a stubbed fetch. */
function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

/** Extract the submitted identifier names from a fetch request init. */
function identifiersOf(init: RequestInit | undefined): string[] {
  const body = typeof init?.body === "string" ? init.body : "";
  const parsed = JSON.parse(body) as CollectionRequestBody;
  return parsed.identifiers.map((identifier) => identifier.name);
}

/** Mimic Scryfall: return known cards in `data`, unknowns in `not_found`. */
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

/** Stub global fetch with a responder, recording the identifiers per call. */
function installFetch(responder: (identifiers: string[]) => unknown): void {
  const mock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const identifiers = identifiersOf(init);
    requestedBatches.push(identifiers);
    return Promise.resolve(jsonResponse(responder(identifiers)));
  });
  vi.stubGlobal("fetch", mock);
}

beforeEach(() => {
  clearSessionCache();
  requestedBatches = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveCards", () => {
  it("resolves names to classified cards with image and price", async () => {
    installFetch(scryfallResponder);
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
  });

  it("collects unmatched names as not-found with no suggestion", async () => {
    installFetch(() => collectionWithNotFound);
    const result = await resolveCards(["Sol Ring", "Notacard"]);

    expect(result.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
    expect(result.unresolved).toEqual([{ name: "Notacard", reason: "not-found", suggestion: null }]);
  });

  it("flags blank names as malformed without calling the API", async () => {
    installFetch(scryfallResponder);
    const result = await resolveCards(["", "   ", "Sol Ring"]);

    expect(result.unresolved).toEqual([
      { name: "", reason: "malformed", suggestion: null },
      { name: "   ", reason: "malformed", suggestion: null },
    ]);
    expect(result.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
    expect(requestedBatches).toHaveLength(1);
    expect(requestedBatches[0]).toEqual(["Sol Ring"]);
  });

  it("deduplicates repeated names to a single identifier", async () => {
    installFetch(scryfallResponder);
    const result = await resolveCards(["Llanowar Elves", "Llanowar Elves", "Llanowar Elves"]);

    expect(requestedBatches).toHaveLength(1);
    expect(requestedBatches[0]).toEqual(["Llanowar Elves"]);
    expect(result.resolved).toHaveLength(1);
  });

  it("resolves a multi-faced card to its front face", async () => {
    installFetch(scryfallResponder);
    const result = await resolveCards(["Delver of Secrets"]);

    expect(result.resolved).toHaveLength(1);
    const card = result.resolved[0];
    expect(card.category).toBe("creature");
    expect(card.imageUrl).toBe("https://cards.scryfall.io/normal/delver-front.jpg");
  });

  it("splits more than 75 names into multiple batches", async () => {
    installFetch(scryfallResponder);
    const names = Array.from({ length: 76 }, (_unused, index) => `Test Card ${index + 1}`);

    await resolveCards(names);

    expect(requestedBatches).toHaveLength(2);
    expect(requestedBatches[0]).toHaveLength(75);
    expect(requestedBatches[1]).toHaveLength(1);
  });

  it("serves repeated lookups from the in-session cache", async () => {
    installFetch(scryfallResponder);

    await resolveCards(["Sol Ring"]);
    expect(requestedBatches).toHaveLength(1);

    const second = await resolveCards(["Sol Ring"]);
    expect(requestedBatches).toHaveLength(1);
    expect(second.resolved.map((card) => card.name)).toEqual(["Sol Ring"]);
  });

  it("returns the full partial-success shape for mixed input", async () => {
    installFetch(scryfallResponder);
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
