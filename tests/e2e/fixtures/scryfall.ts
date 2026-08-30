import type { Page, Route, Request } from "@playwright/test";

/**
 * Scryfall interception for the E2E suite.
 *
 * Every spec routes through this helper — no test, including the seed, touches the live
 * API. Two endpoints are covered (`src/lib/card-data/scryfall.ts`):
 *
 * - `POST /cards/collection` — one request per deck, per 75-name chunk.
 * - `GET  /cards/named?fuzzy=` — one request per miss, after a 100ms throttle.
 *
 * Names arrive in their ORIGINAL spelling, not lowercased (`resolve.ts` keys the cache by
 * `resolutionKey` but sends the caller's text), so fixtures match on the name as written.
 *
 * `cards.scryfall.io` is a DIFFERENT host and is deliberately not routed. Mock cards omit
 * `image_uris`, which kills that traffic entirely — at the cost of the per-card
 * `<button aria-label={card.name}>` in CardRow, which no spec needs.
 */

const SCRYFALL_GLOB = "https://api.scryfall.com/**";

/**
 * Minimal card the client can consume without throwing.
 *
 * `normalize.ts` reads `name`, `type_line` and `prices` UNGUARDED, so omitting any of them
 * yields a TypeError rather than a partial result — and that TypeError lands in the same
 * catch as a real transport failure (`plan.ts`), making a broken fixture indistinguishable
 * from the failure under test. Build cards only through this helper.
 */
export function mockCard(name: string, typeLine = "Artifact", usd: string | null = "1.50") {
  return {
    name,
    type_line: typeLine,
    layout: "normal",
    prices: { usd, eur: null },
  };
}

/** A `/cards/collection` response. `data` and `not_found` are both read unguarded. */
export function collectionResponse(found: string[], notFound: string[] = []) {
  return {
    object: "list",
    data: found.map((name) => mockCard(name)),
    not_found: notFound.map((name) => ({ name })),
  };
}

/** The identifier names carried by a `/cards/collection` POST body. */
export function requestedNames(request: Request): string[] {
  const body = request.postDataJSON() as { identifiers?: { name?: string }[] } | null;
  return (body?.identifiers ?? []).map((identifier) => identifier.name ?? "");
}

function isCollectionPost(request: Request): boolean {
  return request.method() === "POST" && request.url().includes("/cards/collection");
}

/**
 * Resolve every card name the app asks for. The default handler for happy-path specs.
 *
 * Fuzzy lookups 404 as a clean not-found, which is NOT an error path in `scryfall.ts` —
 * it is the not-found branch, so it degrades into an `unresolved` entry rather than a
 * thrown transport failure.
 */
export async function mockScryfallSuccess(page: Page): Promise<void> {
  await page.route(SCRYFALL_GLOB, async (route: Route) => {
    const request = route.request();

    if (isCollectionPost(request)) {
      await route.fulfill({ json: collectionResponse(requestedNames(request)) });
      return;
    }

    await route.fulfill({
      status: 404,
      json: { object: "error", code: "not_found", status: 404, details: "No card found." },
    });
  });
}

/**
 * A parked request: fulfilled only when `release()` is called.
 *
 * Selective parking is the requirement, not parking everything. The ordering spec holds
 * one run's BASE deck POST while that same run's follow-up TARGET POST must still resolve
 * — `plan.ts` awaits base then target sequentially, and the stale-response guard is only
 * reached once `generateUpgradePlan` RETURNS. A handler that parked every request would
 * leave that promise unsettled and the guard never exercised.
 */
export interface ParkedRoute {
  /** Resolves once the parked request has actually arrived. */
  readonly arrived: Promise<void>;
  /** Fulfil the parked request with the response it was holding. */
  release(): Promise<void>;
}

/**
 * Route Scryfall so that the first `/cards/collection` POST whose names satisfy `parkWhen`
 * is held, while every other request resolves normally.
 */
export async function mockScryfallWithParkedCollection(
  page: Page,
  parkWhen: (names: string[]) => boolean,
): Promise<ParkedRoute> {
  let parkedRoute: Route | null = null;
  let parkedNames: string[] = [];
  let signalArrived: (() => void) | undefined;
  let released = false;

  // The executor runs synchronously, so `signalArrived` is assigned before any route
  // handler can fire — but it is typed optional rather than asserted, so the handler
  // below calls it defensively.
  const arrived = new Promise<void>((resolve) => {
    signalArrived = resolve;
  });

  await page.route(SCRYFALL_GLOB, async (route: Route) => {
    const request = route.request();

    if (isCollectionPost(request)) {
      const names = requestedNames(request);

      if (parkedRoute === null && parkWhen(names)) {
        parkedRoute = route;
        parkedNames = names;
        signalArrived?.();
        return; // held — neither fulfilled nor aborted until release()
      }

      await route.fulfill({ json: collectionResponse(names) });
      return;
    }

    await route.fulfill({
      status: 404,
      json: { object: "error", code: "not_found", status: 404, details: "No card found." },
    });
  });

  return {
    arrived,
    async release() {
      if (released || parkedRoute === null) {
        return;
      }
      released = true;
      await parkedRoute.fulfill({ json: collectionResponse(parkedNames) });
    },
  };
}
