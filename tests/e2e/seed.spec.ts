import { test, expect } from "@playwright/test";
import { mockScryfallSuccess } from "./fixtures/scryfall";
import { compare, gotoComparer } from "./fixtures/app";

/**
 * SEED TEST — the exemplar every generated spec is modeled on.
 *
 * What you show is what you get. Five things this file demonstrates, all of which the
 * risk specs inherit:
 *
 * 1. ROLE-BASED LOCATORS. `getByLabel` / `getByRole` / `getByText` only — never CSS,
 *    never XPath, never DOM structure. This repo has zero `data-testid`, so the
 *    accessibility tree IS the test surface.
 * 2. SCOPE EVERY LOCATOR TO `main`. `gotoComparer` hands back that scope; chain off it.
 *    A contributor's `.dev.vars` makes the page render a config banner locally that CI
 *    never shows, and the landmark is what keeps both DOMs the same for a spec.
 * 3. WAIT FOR STATE, NEVER FOR TIME. No `waitForTimeout`. No `networkidle` either — it
 *    can never settle here: `Layout.astro` stylesheet-links fonts.googleapis.com on every
 *    page and Vite's HMR socket stays open.
 * 4. GO THROUGH THE HELPERS FOR NAVIGATION AND INPUT. `gotoComparer` owns the hydration
 *    barrier and `compare` owns the CTA-vs-debounce choice. Both are traps that produce a
 *    test which passes while exercising nothing — see `fixtures/app.ts` for why.
 * 5. ALL SCRYFALL TRAFFIC IS INTERCEPTED. No spec touches the live API.
 *
 * Risk: none directly — this is infrastructure, and it proves the harness works.
 */

test("a complete comparison renders the Remove and Add columns", async ({ page }) => {
  await mockScryfallSuccess(page);
  const main = await gotoComparer(page);

  await compare(main, "1 Sol Ring\n1 Arcane Signet", "1 Sol Ring\n1 Cyclonic Rift");

  // The glyph spans in CardGroupColumn's headings are aria-hidden, so these names are clean.
  await expect(main.getByRole("heading", { name: "Remove" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Add" })).toBeVisible();
  await expect(main.getByText("Cyclonic Rift")).toBeVisible();
  await expect(main.getByText("Arcane Signet")).toBeVisible();
});
