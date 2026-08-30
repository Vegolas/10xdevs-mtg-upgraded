import { test, expect } from "@playwright/test";
import { mockScryfallCollectionFailsOnce, mockScryfallPartial } from "./fixtures/scryfall";
import { compare, gotoComparer } from "./fixtures/app";

/**
 * RISK #7 (test-plan.md §2, High × Medium) — "A partial resolution or a card-data transport
 * failure reaches the user as a plan that LOOKS COMPLETE, because the unresolved notice or
 * the retryable error banner never renders."
 *
 * What would prove protection (§2 Risk Response Guidance): "A partial resolution and a
 * transport failure each surface their own notice in the rendered plan, instead of a plan
 * that reads as complete."
 *
 * The named anti-pattern for this row: "a happy-path browser test that never induces a
 * partial resolution or a transport failure, so no notice is ever exercised." Both tests
 * below induce the real failure through `page.route()` — neither can pass on a happy path.
 *
 * Modelled on `seed.spec.ts`; all locators scoped to the `main` landmark that
 * `gotoComparer` returns. Both tests are independent — own routing, own navigation, own
 * assertions — and the app is stateless (no account, no DB), so there is nothing to clean up.
 */

/** Two decks that differ, so a successful run has something to put in both columns. */
const BASE_DECK = "1 Sol Ring\n1 Arcane Signet";
const TARGET_DECK = "1 Sol Ring\n1 Cyclonic Rift";

test("a card-data transport failure surfaces a retryable banner, and Retry recovers", async ({ page }) => {
  await mockScryfallCollectionFailsOnce(page);
  const main = await gotoComparer(page);

  await compare(main, BASE_DECK, TARGET_DECK);

  // The failure must be VISIBLE, not merely handled. `role="alert"` is what distinguishes
  // this container from UnresolvedNotice, which renders a div with an identical class string.
  const banner = main.getByRole("alert");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Couldn't reach the card database.");

  // Assert the MESSAGE, not just the banner. A malformed fixture throws a TypeError into the
  // same catch as a real transport failure, so a banner-only assertion cannot tell "Scryfall
  // returned 500" from "our own mock is broken" — and would stay green for the wrong reason.
  // `statusText` is left unasserted: route.fulfill() does not reliably populate it.
  await expect(banner).toContainText(/cards\/collection failed: 500/);

  // The affordance the risk row names explicitly. Its accessible name is exactly "Retry" —
  // the lucide icon contributes nothing to the name.
  const retry = banner.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();

  // Recovery: the route now succeeds, and Retry re-runs the whole plan with a fresh token.
  await retry.click();

  await expect(main.getByRole("heading", { name: "Remove" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Add" })).toBeVisible();
  await expect(main.getByText("Cyclonic Rift")).toBeVisible();
  // The banner must actually go away — a plan rendered underneath a stale error is still a
  // failure to surface state honestly.
  await expect(banner).toBeHidden();
});

test("a partial resolution surfaces the unresolved notice alongside the rendered plan", async ({ page }) => {
  const MISSING = "Cyclonic Rifft"; // deliberate typo — resolves to nothing, no fuzzy match
  await mockScryfallPartial(page, [MISSING]);
  const main = await gotoComparer(page);

  await compare(main, BASE_DECK, `1 Sol Ring\n1 ${MISSING}`);

  // This is the risk in its sharpest form: the plan DID render, so on its own it reads as
  // complete. Asserting the plan alongside the notice is what makes the test fail if the
  // notice ever stops rendering — asserting the notice alone would not prove the pairing.
  await expect(main.getByRole("heading", { name: "Remove" })).toBeVisible();

  const notice = main.getByRole("region", { name: "Unresolved cards" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("1 card couldn't be matched");
  // Name the card, and the deck it came from — a count alone would not tell the user which
  // input was dropped.
  await expect(notice).toContainText(MISSING);
  await expect(notice).toContainText("(target, not found)");
});
