import type { APIResponse, Page, Route } from "@playwright/test";

/**
 * Selective interception of the app's OWN `/api/*` routes, for specs that need two
 * mutations genuinely in flight at once.
 *
 * Every other fixture in this directory routes `https://api.scryfall.com/**` and
 * nothing else; `fixtures/auth.ts` only ever *calls* the app API (to seed), never
 * intercepts it. So before this file there was no way to hold one `/api/paths/*`
 * request while a second one completed — and that overlap is the whole subject of
 * `path-builder-mutation-ordering.spec.ts`.
 *
 * Shaped on `mockScryfallWithParkedCollection` (`./scryfall.ts:211`) and sharing its
 * `arrived` promise and its single-shot release contract, with THREE structural
 * differences that must not be copied away:
 *
 * 1. THE DEFAULT BRANCH IS `route.continue()`, not a synthetic fulfil. Scryfall is
 *    mocked end to end, so its handler can answer everything itself. The app's own API
 *    is real: the page's navigation, the seed and the SECOND half of every overlap all
 *    have to reach the dev server, or the spec proves nothing about the app.
 * 2. THE PREDICATE SEES METHOD AND URL, because these routes are told apart by verb —
 *    `PATCH /api/paths/[id]` and `DELETE /api/paths/[id]` differ in nothing else.
 * 3. THERE ARE TWO WAYS TO PARK, and picking the wrong one makes a spec vacuous. See
 *    {@link ParkAppApiOptions.deliver}.
 */

/**
 * Every request the app makes to its own API. Broad on purpose: the predicate is what
 * selects, and everything it declines is passed straight through, so widening the glob
 * costs nothing and a future spec parking `/api/auth/*` needs no edit here.
 */
const APP_API_GLOB = "**/api/**";

export interface ParkAppApiOptions {
  /**
   * Send the parked request ON to the real server the moment it arrives, and hold the
   * server's OWN response until {@link ParkedAppRequest.releaseFromServer}.
   *
   * This is the difference between a spec that pins a defect and one that cannot. Take
   * the delete overlap: the false error banner exists because `DELETE /steps` removes
   * the highest-position step per CALL, so the first call empties a one-step path and
   * the second answers 404 "No steps to delete". Park the first request WITHOUT
   * delivering it and the server still holds that step, so the second call answers 204
   * as well — the 404 never happens, the banner never renders, and the spec passes
   * whether the guard is there or not. Under `test.fail()` that mistake is invisible;
   * green, it reports coverage it does not have (`lessons.md`, "When a finding names a
   * symptom surface"; test-plan §6.7 item 26).
   *
   * Off by default, which is what the rename overlap wants: see
   * {@link ParkedAppRequest.release}.
   */
  readonly deliver?: boolean;
}

/** A held `/api/*` request, answered only when one of the release doors is called. */
export interface ParkedAppRequest {
  /**
   * Resolves once the parked request has arrived — and, under
   * {@link ParkAppApiOptions.deliver}, once the SERVER HAS ANSWERED it. The response is
   * still held either way, so the client is still waiting when this settles.
   *
   * The second half is load-bearing and was found by deliberate break, not by reading.
   * Resolving on arrival alone leaves the delivered request and the spec's next action
   * racing at the server: a second DELETE issued in that window reads the same last step
   * the first one is still deleting, so both answer 204, the 404 never happens, and the
   * spec passes with its guard reverted. Waiting for the server is what orders the two.
   */
  readonly arrived: Promise<void>;
  /**
   * Answer the parked request with `body` as a 200 JSON payload — a response the real
   * server never produced and never saw the request for.
   *
   * The door the rename overlap uses, and deliberately: the held PATCH is answered with
   * a stale `UpgradePath` carrying the OLD title while the server was only ever told the
   * new one. That keeps the server holding exactly one title, so the spec's claim — the
   * newer title stands on screen — is about the client guard and nothing else. Delivering
   * it instead would make the assertion depend on which write the server applied last.
   */
  release(body: unknown): Promise<void>;
  /**
   * Answer the parked request with the response the REAL server gave it. Requires
   * {@link ParkAppApiOptions.deliver}; throws otherwise rather than silently inventing
   * one, because a spec that quietly gets a synthetic answer here is the vacuous spec
   * `deliver`'s own docs describe.
   */
  releaseFromServer(): Promise<void>;
  /**
   * Answer the parked request with `status` and an {@link import("@/lib/api/contract").ApiError}
   * envelope — the shape every `/api/*` failure actually carries, so `requestJson`'s
   * `fromBody` branch behaves as it does in production.
   *
   * For driving a failure the server cannot be made to produce on demand: notably the
   * 404 `DELETE /steps` answers once a path has no steps left. No green spec needs it
   * today; it is the third door because a spec that reaches for `route` itself would
   * double-fire the single-shot guard below (test-plan §6.7 item 25).
   */
  releaseWithStatus(status: number, body?: unknown): Promise<void>;
}

/**
 * Route the app's own API so that the FIRST request satisfying `parkWhen` is held while
 * every other request — including later ones the predicate also matches — reaches the
 * dev server untouched.
 */
export async function parkAppApi(
  page: Page,
  parkWhen: (method: string, url: string) => boolean,
  options: ParkAppApiOptions = {},
): Promise<ParkedAppRequest> {
  const deliver = options.deliver ?? false;

  let parkedRoute: Route | null = null;
  let serverResponse: Promise<APIResponse> | null = null;
  let signalArrived: (() => void) | undefined;
  let released = false;

  // The executor runs synchronously, so `signalArrived` is assigned before any route
  // handler can fire — but it is typed optional rather than asserted, so the handler
  // below calls it defensively. Same shape as `mockScryfallWithParkedCollection`.
  const arrived = new Promise<void>((resolve) => {
    signalArrived = resolve;
  });

  await page.route(APP_API_GLOB, async (route: Route) => {
    const request = route.request();

    if (parkedRoute === null && parkWhen(request.method(), request.url())) {
      parkedRoute = route;
      if (deliver) {
        // Started, not awaited: the handler must return so the browser goes on seeing a
        // request that is still outstanding. The server-side effect therefore lands while
        // the client is still waiting, which is the state the overlap needs.
        serverResponse = route.fetch();
        // `arrived` waits for the server's answer rather than for the request — see its
        // doc comment. A rejection is swallowed HERE only so it cannot surface as an
        // unhandled rejection with no test attached; `releaseFromServer` awaits the same
        // promise and reports it against the spec that asked for it.
        void serverResponse
          .catch(() => undefined)
          .then(() => {
            signalArrived?.();
          });
      } else {
        signalArrived?.();
      }
      return; // held — neither fulfilled nor continued until a release door is called
    }

    await route.continue();
  });

  return {
    arrived,
    async release(body: unknown) {
      if (released || parkedRoute === null) {
        return;
      }
      released = true;
      // `body` + `contentType` rather than `json`, so the payload can be typed `unknown`
      // at the call site instead of Playwright's `Serializable`.
      await parkedRoute.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    },
    async releaseFromServer() {
      if (released || parkedRoute === null) {
        return;
      }
      if (serverResponse === null) {
        throw new Error("parkAppApi: releaseFromServer() needs `deliver: true` — the server never saw the request.");
      }
      released = true;
      await parkedRoute.fulfill({ response: await serverResponse });
    },
    async releaseWithStatus(status: number, body?: unknown) {
      if (released || parkedRoute === null) {
        return;
      }
      released = true;
      await parkedRoute.fulfill({
        status,
        body: JSON.stringify(body ?? { error: `Parked request answered ${status} by the fixture.` }),
        contentType: "application/json",
      });
    },
  };
}
