import { test, expect } from "@playwright/test";
import { mockScryfallWithParkedCollection } from "./fixtures/scryfall";
import { compare, gotoComparer } from "./fixtures/app";

/**
 * RISK #8 (test-plan.md §2, Medium × Low) — "A slow earlier comparison resolves AFTER a
 * newer one and clobbers it, so the user reads an upgrade plan built from deck text they
 * have already replaced."
 *
 * What would prove protection (§2 Risk Response Guidance): "Two overlapping comparisons
 * resolve out of order and the rendered plan matches the newest input, never the superseded
 * one."
 *
 * The named anti-pattern: "a test that passes because it never actually overlaps two runs —
 * sequential awaits cannot reproduce an out-of-order arrival." Three things defend against
 * writing that test by accident:
 *
 * 1. THE CTA, NOT THE DEBOUNCE. The 700ms debounce effect's cleanup clears the pending
 *    timer on every edit, so typing deck A then deck B starts ONE run — the token never
 *    advances and the drop at DeckComparer.tsx:73 is never reached. `compare()` routes
 *    through the Calculate CTA, which bypasses the debounce entirely.
 * 2. RUN A MUST FINISH, NOT JUST START. `plan.ts` awaits base THEN target, so releasing A's
 *    base POST immediately issues a second POST for A's target deck. The token comparison
 *    runs only after `generateUpgradePlan` RETURNS — so if A's target request is never
 *    fulfilled and awaited, that promise stays pending, the guard is never reached, and the
 *    final assertion passes while proving nothing.
 * 3. DECK CHOICE IS LOAD-BEARING. A and B share no card names and no line counts, because
 *    the drop path is silent (a bare `return`, no state change, no logging, and the token is
 *    a useRef that never reaches the DOM) — rendered content is the only way to tell
 *    guard-worked from guard-failed. A's own base and target halves also share no names, or
 *    A's target resolution would come from the session cache and the second POST would
 *    never fire.
 *
 * retries: 0 — ordinary infrastructure flake is absorbed elsewhere in CI, but a genuine
 * out-of-order bug must never retry its way to green. This is the only test covering it.
 */
test.describe.configure({ retries: 0 });

// Distinct names everywhere, and four distinct line counts (2 / 3 / 4 / 5).
const A_BASE = "1 Sol Ring\n1 Arcane Signet";
const A_TARGET = "1 Cyclonic Rift\n1 Rhystic Study\n1 Smothering Tithe";
const B_BASE = "1 Lightning Bolt\n1 Counterspell\n1 Brainstorm\n1 Ponder";
const B_TARGET = "1 Swords to Plowshares\n1 Path to Exile\n1 Wrath of God\n1 Damnation\n1 Day of Judgment";

/** A card that appears ONLY in run A's plan — its presence would mean A clobbered B. */
const A_ONLY_CARD = "Rhystic Study";
/** A card that appears ONLY in run B's plan. */
const B_ONLY_CARD = "Wrath of God";

function isCollectionPostFor(cardName: string) {
  return (request: { method(): string; url(): string; postDataJSON(): unknown }) => {
    if (request.method() !== "POST" || !request.url().includes("/cards/collection")) {
      return false;
    }
    const body = request.postDataJSON() as { identifiers?: { name?: string }[] } | null;
    return (body?.identifiers ?? []).some((identifier) => identifier.name === cardName);
  };
}

test("a superseded comparison never clobbers the newer plan", async ({ page }) => {
  // Park run A's FIRST request (its base deck) — everything else resolves normally.
  const parkedA = await mockScryfallWithParkedCollection(page, (names) => names.includes("Sol Ring"));
  const main = await gotoComparer(page);

  // Run A starts. Token -> 1.
  await compare(main, A_BASE, A_TARGET);

  // Prove A is genuinely in flight before starting B. Without this the overlap is asserted
  // rather than established, and the test could pass having run the two comparisons in
  // sequence — exactly the anti-pattern this risk names.
  await parkedA.arrived;

  // Run B starts while A is still parked. Token -> 2. The inputs are still on screen because
  // `inputsCollapsed` requires status === "ready", and A is still "loading".
  await compare(main, B_BASE, B_TARGET);

  // B completes and renders.
  await expect(main.getByText(B_ONLY_CARD)).toBeVisible();

  // Now let the superseded run finish. Listen for A's TARGET response before releasing its
  // base — `plan.ts` issues that second POST the moment the base resolves, and only once it
  // returns does runPlan reach the token comparison.
  const aTargetResponse = page.waitForResponse((response) => isCollectionPostFor(A_ONLY_CARD)(response.request()));

  // Watch CONTINUOUSLY for plan A ever reaching the screen, and start watching before the
  // release. A one-shot `toBeHidden()` after the response cannot prove this: it samples a
  // single instant and passes before React has committed the stale update. Verified — with
  // the guard disabled, the sampling version stayed green while plan A rendered a frame
  // later. A negative event needs an observation window, not a sample.
  const planAEverRendered = main
    .getByText(A_ONLY_CARD)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  await parkedA.release();
  await aTargetResponse;

  // A ran to completion and was dropped at the React boundary — it never reached the DOM.
  expect(await planAEverRendered).toBe(false);
  await expect(main.getByText(B_ONLY_CARD)).toBeVisible();

  // The sharpest observable, and the contradiction the risk describes in its own words: the
  // collapsed strip counts the LIVE textarea state (never the plan), so a guard failure
  // renders a strip reporting deck B's counts above columns showing deck A's cards.
  await expect(main.getByRole("button", { name: /base 4 · target 5/ })).toBeVisible();
});
