import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Navigate to the comparer and hand back the `main` scope, hydrated and ready to drive.
 *
 * Two hazards are handled here ONCE so no spec has to remember them:
 *
 * 1. HYDRATION. `index.astro` mounts the comparer with `client:load`. SSR renders both
 *    textareas, so `fill()` succeeds immediately — but it sets the DOM value without React
 *    state, React then hydrates with its own empty state, and `bothFilled` stays false
 *    forever. The Calculate CTA never enables and the run never fires. Waiting for the
 *    CTA to enable does NOT rescue this: the fill has already been orphaned.
 *
 *    The signal for it is {@link gotoHydrated}'s commit barrier — NOT the absence of the
 *    island's `ssr` attribute, which this file used to treat as "React has committed" and
 *    which is not that. See that function for the ordering and the proof.
 *
 * 2. THE `main` SCOPE. A contributor's gitignored `.dev.vars` sets the Supabase keys
 *    locally while CI has none, and `Layout.astro` renders a config error banner above the
 *    slot when they are unset. Scoping every query to the `<main>` landmark in
 *    `AppLayout.astro` is what keeps the same spec seeing the same DOM in both places.
 */
export async function gotoComparer(page: Page): Promise<Locator> {
  return gotoHydrated(page, "/");
}

/**
 * Navigate to a path builder and hand back the `main` scope, hydrated and ready to drive.
 *
 * Both hazards above apply here unchanged. `PathEditor` mounts `client:load`
 * (`src/pages/paths/[id].astro:43`) exactly as the comparer does, so the orphaned-fill
 * trap is the same trap: SSR renders the deck textarea, `fill()` succeeds against the
 * DOM before React has committed, and the React state the Check button reads stays empty.
 *
 * The page is behind the session gate (`src/middleware.ts:21-25`), so this only works
 * from a project carrying the `setup` project's `storageState`.
 */
export async function gotoPathBuilder(page: Page, pathId: string): Promise<Locator> {
  return gotoHydrated(page, `/paths/${pathId}`);
}

/** Headroom for a cold dev server's first compile of a route's island graph. */
const HYDRATION_TIMEOUT = 30_000;

/**
 * Pages already carrying the commit counter. `addInitScript` ACCUMULATES, and specs
 * navigate more than once (`path-builder-zero-cards.spec.ts` reloads to prove a refusal
 * persisted nothing), so registering per call would run N copies of the stub on the Nth
 * navigation. One registration per page is all that is ever needed: an init script
 * applies to every subsequent document in that page, not just the next one.
 */
const counterInstalled = new WeakSet<Page>();

/**
 * Install React's own commit callback as a wait signal, before any document script runs.
 *
 * `react-dom` looks for `__REACT_DEVTOOLS_GLOBAL_HOOK__` once, at module init
 * (`injectInternals`), and from then on calls `onCommitFiberRoot` at the tail of every
 * commit — after the mutation and layout phases, which is exactly where a controlled
 * input's DOM value is re-taken from props. `isDisabled: false` and `supportsFiber: true`
 * get past that function's two early returns, `inject` hands back a renderer id, and the
 * counter is the callback we actually want.
 *
 * THE SHAPE IS NOT REACT-DOM'S TO DICTATE, and getting that wrong breaks the app rather
 * than the wait. Vite serves this app through react-refresh, whose `injectIntoGlobalHook`
 * ADOPTS an existing hook instead of installing its own and, while doing so, calls
 * `hook.renderers.forEach` unguarded — so a stub without `renderers` throws inside the
 * island's client module and it never hydrates AT ALL. The members below are exactly the
 * hook react-refresh installs when it finds none, which is the one shape both consumers
 * are known to handle. `isDisabled` stays FALSE for the same reason: react-refresh reads
 * a truthy value as "something has shimmed the hook" and disables Fast Refresh.
 *
 * react-refresh then wraps `onCommitFiberRoot` and delegates to ours, so the count still
 * arrives. This is instrumentation, not a fake: it is the same hook React DevTools
 * installs, and the DEV-only bookkeeping its presence enables (`isDevToolsPresent`) is
 * the code path every developer with that extension already runs.
 */
async function installCommitCounter(page: Page): Promise<void> {
  if (counterInstalled.has(page)) {
    return;
  }
  counterInstalled.add(page);
  await page.addInitScript(() => {
    const target = window as unknown as {
      __reactCommits: number;
      __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown;
    };
    target.__reactCommits = 0;
    let nextRendererId = 0;
    const ignored = (): void => undefined;
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      inject: () => nextRendererId++,
      onScheduleFiberRoot: ignored,
      onCommitFiberUnmount: ignored,
      onCommitFiberRoot: () => {
        target.__reactCommits += 1;
      },
    };
  });
}

/**
 * The shared barrier: navigate, wait for React to have committed, scope to `main`.
 *
 * TWO waits, because the obvious one is not sufficient. `astro-island` removes its `ssr`
 * attribute one microtask after calling the hydrator — and `@astrojs/react`'s client
 * hydrator wraps `hydrateRoot` in `startTransition`
 * (`node_modules/@astrojs/react/dist/client.js`), so it returns having only SCHEDULED the
 * hydration render. The commit lands a scheduler task later. The attribute therefore drops
 * BEFORE React has committed, every single time; a spec that fills a textarea in that
 * window has its fill orphaned, React commits with its own empty state and re-takes the
 * DOM value, and the Check CTA — `disabled` on `listText.trim() === ""` — never enables.
 *
 * That is not theoretical. It is the flake that reddened three path-builder specs in the
 * full suite while every one of them passed in isolation: `astro dev` is single-threaded,
 * so four Playwright workers hammering it stretch the window until `fill()` fits inside
 * it. THE TARGETED BREAK, for anyone re-verifying this: warm the route, then
 * `Emulation.setCPUThrottlingRate` at 10 over CDP. Against the `ssr` wait alone that
 * leaves React uncommitted at the barrier on every run (no `__reactFiber$` key on
 * `#step-list` yet) — while whether the orphaned fill is then actually wiped stays a
 * race, since `fill()`'s own round trips sometimes hand the commit the time it needed.
 * Against the barrier below, React is committed before it lets go, every run.
 *
 * So the `ssr` wait is kept for what it genuinely proves — every island's hydrator has
 * been CALLED — and the commit counter proves each of those hydrations actually landed.
 * Every island on the pages this drives is `client:load` (`grep -rn "client:" src/`), so
 * one commit per island is the right count and none of them can legitimately stay
 * un-hydrated.
 *
 * The generous timeouts are deliberate and cost nothing when things are quick: both are
 * "wait until ready" and neither is an assertion about the product. A cold `astro dev`
 * fetches the island's module graph through Vite AFTER `load` fires, which is outside
 * `page.goto`'s own timeout and does not fit in `expect`'s 5s default.
 */
async function gotoHydrated(page: Page, url: string): Promise<Locator> {
  await installCommitCounter(page);
  await page.goto(url);
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0, { timeout: HYDRATION_TIMEOUT });
  await page.waitForFunction(
    () => {
      const islands = document.querySelectorAll("astro-island").length;
      const commits = (window as unknown as { __reactCommits?: number }).__reactCommits ?? 0;
      return commits >= islands;
    },
    undefined,
    { timeout: HYDRATION_TIMEOUT },
  );
  return page.getByRole("main");
}

/** The Calculate CTA needs a regex: `◆`, `→` and two &nbsp; sit inside the button text
 *  and are NOT aria-hidden, so an exact-name match fails. */
export const CALCULATE = /Calculate the Delta/;

/** Fill both decks and trigger an immediate run through the CTA.
 *
 *  The CTA — not the 700ms debounce — is deliberate: the debounce effect's cleanup clears
 *  the pending timer on every keystroke, so it collapses rapid edits into a single run.
 *  Specs that need two genuinely overlapping runs must go through here. */
export async function compare(main: Locator, baseDeck: string, targetDeck: string): Promise<void> {
  await main.getByLabel("Base deck — what you have now").fill(baseDeck);
  await main.getByLabel("Target deck — what you want").fill(targetDeck);

  const calculate = main.getByRole("button", { name: CALCULATE });
  await expect(calculate).toBeEnabled();
  await calculate.click();
}
