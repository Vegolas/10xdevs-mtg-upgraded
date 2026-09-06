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
 *    Astro's island removes its `ssr` attribute only AFTER `await this.hydrator(...)`
 *    resolves (see `astro-island` in astro's runtime), so its absence is a trustworthy
 *    "React has committed" signal. This is the one place a framework-internal selector is
 *    used, and it is a WAIT, never an assertion target.
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

/** The shared barrier: navigate, wait for React to have committed, scope to `main`. */
async function gotoHydrated(page: Page, url: string): Promise<Locator> {
  await page.goto(url);
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
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
