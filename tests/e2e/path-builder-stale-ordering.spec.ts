import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mockScryfallWithParkedCollection } from "./fixtures/scryfall";
import { gotoPathBuilder } from "./fixtures/app";
import { createSignedInOwner, deleteOwner, seedPathWithStep, type Owner } from "./fixtures/auth";

/**
 * RISK #9 (test-plan.md §2, Medium × Medium) — "In the path builder, a pre-save Check
 * verdict, a diff preview, or an error banner describes deck text the user has already
 * edited or cleared — a slow earlier resolve lands after the input moved on, so the user
 * decides whether to save on a verdict about text that no longer exists."
 *
 * READ THIS BEFORE ACTING ON A RED BUILD. Every test in this file asserts the CORRECT
 * behavior and is annotated `test.fail()`, because risk #9 is a set of live defects rather
 * than a forecast. So:
 *
 *   - "expected failure" in the report is the CURRENT, KNOWN state. Nothing to do.
 *   - "expected to fail but passed" means somebody FIXED the guard. That is the signal
 *     this file exists to raise: delete the `test.fail()` line and the spec becomes an
 *     ordinary regression test protecting the fix.
 *
 * This is the coverage-not-repair convention from test-plan §6.7 item 15 — a spec for a
 * live defect would otherwise be red today, which would make this a bug-fix change. The
 * defects are filed as F-1 through F-6 in
 * `context/archive/2026-09-05-testing-path-builder-ordering/findings.md`; each test names
 * the one it pins. Two of those entries are superseded by what S3 and S4 had to establish
 * to be writable at all — see each spec's header, and `lessons.md`.
 *
 * WHY SETUP LIVES IN `beforeEach` AND NOT IN THE TEST BODY. `test.fail()` inverts
 * everything the body does, harness failures included — a broken sign-in or a rejected
 * seed would report as an "expected failure" and this file would go green while covering
 * nothing. A hook failure happens before the body registers the annotation, so it stays a
 * real failure. Only the code that drives the risk belongs under the inversion.
 *
 * WHY RETRIES ARE LEFT AT THE CONFIG DEFAULT, unlike `comparer-stale-response.spec.ts`,
 * which forces `retries: 0`. There a retry could turn a genuine out-of-order bug green —
 * the failure was the signal. Here the failure is the EXPECTED state, so a retry cannot
 * hide a defect; it can only absorb a timing flake that spuriously reports an unexpected
 * pass. The two settings are the same principle applied to inverted tests.
 *
 * AUTH. Each test provisions its OWN owner and deletes it in `afterEach`; the delete
 * cascades to every path and step that owner seeded (`on delete cascade`), so one call is
 * the whole teardown and no test can see another's data. The project-level `storageState`
 * is what the browser arrives with; `adoptSession` is what makes the browser agree with
 * the API context about who the test is. Nothing here signs in through the UI.
 */

/** Deck text for S1. S2's decks must share no names with these — `card-data/resolve.ts:15`
 *  is a module-level cache with no test seam, so a name already resolved in the same page
 *  would be answered from cache and its POST would never fire for the fixture to park. */
const S1_DECK = "1 Sol Ring\n1 Arcane Signet";
/** The name the parked POST is matched on — the card that must reach Scryfall. */
const S1_PARK_ON = "Sol Ring";

/** S2's two decks. Disjoint from each other AND from S1's, for the cache reason above and
 *  because the two `/cards/collection` POSTs have to stay tellable apart: the fixture parks
 *  on a name from A, and the release is awaited on a response carrying that same name. */
const S2_DECK_A = "1 Cyclonic Rift\n1 Rhystic Study";
const S2_PARK_ON = "Cyclonic Rift";
const S2_DECK_B = "1 Lightning Bolt\n1 Counterspell";

/** The checkpoint S2 adds while A's Check is parked. A fixed string is safe: every test
 *  seeds its OWN path holding one step named "base", so nothing can collide with it. */
const S2_STEP_NAME = "added mid-check";

/** S3's two decks. Disjoint from each other AND from S1's and S2's, for the same cache
 *  reason: the fixture parks on a name from A, and B's POST has to actually reach the
 *  network so the add it drives can run to completion while A is still held. */
const S3_DECK_A = "1 Smothering Tithe\n1 Dockside Extortionist";
const S3_PARK_ON = "Smothering Tithe";
const S3_DECK_B = "1 Swords to Plowshares\n1 Path to Exile";

/** The checkpoint S3 saves while A's Check is parked. Fixed string, same reasoning as S2's. */
const S3_STEP_NAME = "saved before the failure";

/** The pre-save Check verdict rendered when every card resolves (`PathEditor.tsx:724`).
 *  Substring, so the non-aria-hidden `✓` glyph in that element's text is not in the way. */
const ALL_RESOLVED = "All cards resolved";

/** The accessible name the add flow's error banner carries (`PathEditor.tsx:759-770`).
 *  It exists BECAUSE of this file: the banner's class string is byte-identical to the
 *  path-level `mutationError` banner at `:596`, so before both were named a locator for one
 *  matched the other and F-3 was not spec-able at all. Test-plan §6.7 item 1. */
const CHECKPOINT_ERROR = "Checkpoint error";

/** Owner-email label. Uniqueness comes from `createOwner`'s timestamp + random suffix; this
 *  only has to stay email-safe, so it is a constant rather than the test title. */
const OWNER_LABEL = "path-builder";

/** Per-test state, handed from the hook to the body. Tests in a file run serially in one
 *  worker (`fullyParallel` is unset, so it defaults to false), so a module-level slot is
 *  safe and keeps the hook signature free of a fixture just to carry two values. */
let owner: Owner | null = null;
let pathId: string | null = null;

test.beforeEach(async ({ page, request }, testInfo) => {
  owner = await createSignedInOwner(request, OWNER_LABEL);
  await adoptSession(page, request);
  const { path } = await seedPathWithStep(request, testInfo.title);
  pathId = path.id;
});

test.afterEach(async () => {
  pathId = null;
  if (owner === null) {
    return;
  }
  const doomed = owner;
  // Cleared BEFORE the await so a failing delete cannot leave a stale id behind for the
  // next test's teardown to trip over.
  owner = null;
  await deleteOwner(doomed);
});

/**
 * Hand the browser the session `request` is currently holding.
 *
 * The chromium project starts every context from the `setup` project's `storageState`,
 * which belongs to the RUN's owner. A test that provisions its own owner has therefore
 * moved only the API context; without this the page would still be browsing as the run
 * owner and `/paths/[id]` would answer 404 for a path it does not own.
 *
 * The cookies come from the app's own `Set-Cookie` by way of the request jar — never
 * hand-built — so what the browser replays is byte-for-byte what the middleware issued.
 */
async function adoptSession(page: Page, request: APIRequestContext): Promise<void> {
  const { cookies } = await request.storageState();
  await page.context().clearCookies();
  await page.context().addCookies(cookies);
}

/** The path the hook seeded for the running test. */
function seededPathId(): string {
  if (pathId === null) {
    throw new Error("beforeEach did not seed a path — setup was skipped or failed.");
  }
  return pathId;
}

/** Does this request carry the `/cards/collection` POST that asked for `cardName`? */
function isCollectionPostFor(cardName: string) {
  return (request: { method(): string; url(): string; postDataJSON(): unknown }) => {
    if (request.method() !== "POST" || !request.url().includes("/cards/collection")) {
      return false;
    }
    const body = request.postDataJSON() as { identifiers?: { name?: string }[] } | null;
    return (body?.identifiers ?? []).some((identifier) => identifier.name === cardName);
  };
}

/**
 * S1 — finding F-1: clearing the deck box invalidates nothing.
 *
 * `runCheck` guards its write with `checkToken` (`PathEditor.tsx:326`, `:330`), but the
 * textarea's `onChange` (`:708-710`) only calls `setListText` — it moves no token and
 * resets no state. So a resolve that was in flight when the box was emptied still passes
 * its own token check and writes `checked` over an input that is now empty.
 *
 * NOT the mechanism `lessons.md:78-81` records. That entry blames `runCheck`'s empty-text
 * branch (`:322-324`) for "returning without bumping", but the branch is unreachable: the
 * Check button is `disabled` on empty text (`:771-776`) and the four other call sites all
 * pass non-empty text. Adding a bump there would fix nothing. Load-bearing, because it is
 * the difference between a one-line fix and the right one.
 */
test("a pre-save verdict never describes a deck box the user cleared", async ({ page }) => {
  // Expected to fail until F-1 is fixed. An unexpected pass means it was — see the header.
  test.fail();

  // Park the Check's ONE `/cards/collection` POST; everything else resolves normally.
  // Registered before navigating, or the route would not be in place when it fires.
  const parked = await mockScryfallWithParkedCollection(page, (names) => names.includes(S1_PARK_ON));

  const main = await gotoPathBuilder(page, seededPathId());

  const deckBox = main.getByLabel("Deck list");
  await deckBox.fill(S1_DECK);

  // `exact` is required: the add CTA's accessible name is "Add checkpoint", which contains
  // "check" and would otherwise match too.
  const check = main.getByRole("button", { name: "Check", exact: true });
  await expect(check).toBeEnabled();
  await check.click();

  // Prove the resolve is genuinely in flight BEFORE clearing. Without this the whole test
  // is vacuous — a guard that is never reached cannot be shown to have failed, and the
  // negative assertion below would pass just as well on a Check that never started.
  await parked.arrived;

  // The user changes their mind and empties the box. No token moves; no state is reset.
  await deckBox.fill("");
  await expect(deckBox).toHaveValue("");

  // The parked run must be shown to have run to COMPLETION, not merely to have been
  // released: the token comparison at `:330` is reached only after `resolveDeck` returns.
  const checkResponse = page.waitForResponse((response) => isCollectionPostFor(S1_PARK_ON)(response.request()));

  // Watch CONTINUOUSLY, and start watching BEFORE the release. A `toBeHidden()` sampled
  // after the response cannot prove a negative: it reads one instant and passes before
  // React has committed the stale update. Test-plan §6.7 item 13 records that exact
  // sampling version staying green while the superseded content rendered a frame later.
  const verdictEverRendered = main
    .getByText(ALL_RESOLVED)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  await parked.release();
  await checkResponse;

  // The contradiction risk #9 describes, put as two facts that cannot both be right: a
  // verdict about resolved cards, above a box holding no cards.
  expect(await verdictEverRendered).toBe(false);
  await expect(deckBox).toHaveValue("");
});

/**
 * S2 — finding F-2: a successful add clears the verdict under the WRONG counter.
 *
 * `handleAddStep` resets `checkState` and `diffPreview` on success (`PathEditor.tsx:314`,
 * `:315`), but the whole add run is guarded by `addToken` (`:225`) — a different `useRef`
 * from the `checkToken` (`:191`) that `runCheck` bumps. So an add does not invalidate a
 * Check already in flight: the Check lands afterwards, passes its own token check, and
 * re-populates the atoms the add just cleared, over a box the add also emptied.
 *
 * This is drivable through real affordances only because the Add button is NOT disabled
 * during a Check — `:790` gates it on `addState === "resolving"` alone. Without that, the
 * overlap could not be produced by a user and the finding would be theoretical.
 *
 * Note what is NOT used here: typing to force the overlap. `lessons.md:9-22` names that as
 * the anti-pattern for the comparer, where a 700ms debounce coalesces keystrokes into one
 * run. The path builder has no debounce (`PathEditor.tsx:386`) — both runs are started by
 * explicit button clicks, so the overlap is real by construction rather than by timing.
 */
test("a pre-save verdict never survives the checkpoint that replaced it", async ({ page }) => {
  // Expected to fail until F-2 is fixed. An unexpected pass means it was — see the header.
  test.fail();

  // Park deck A's `/cards/collection` POST. Deck B's shares no names, so it is not matched
  // by the predicate and resolves normally — which is what lets the add run to completion.
  const parked = await mockScryfallWithParkedCollection(page, (names) => names.includes(S2_PARK_ON));

  const main = await gotoPathBuilder(page, seededPathId());

  const deckBox = main.getByLabel("Deck list");
  await deckBox.fill(S2_DECK_A);

  const check = main.getByRole("button", { name: "Check", exact: true });
  await expect(check).toBeEnabled();
  await check.click();

  // Deck A's resolve must be genuinely in flight before the add starts, or the two runs
  // never overlap and the assertion below proves nothing.
  await parked.arrived;

  // The user moves on: a different list, saved as a checkpoint. The Add CTA is reachable
  // because it is not disabled by an in-flight Check.
  await main.getByLabel("Checkpoint name").fill(S2_STEP_NAME);
  await deckBox.fill(S2_DECK_B);
  await main.getByRole("button", { name: "Add checkpoint" }).click();

  // Prove the add ran to COMPLETION rather than merely having been clicked. The rendered
  // step is the sharpest available proof: `setSteps` sits in the same synchronous block as
  // the `:314-315` resets, so a visible step card means those resets have already run.
  await expect(main.getByRole("heading", { name: S2_STEP_NAME })).toBeVisible();
  await expect(deckBox).toHaveValue("");

  // Deck A's superseded run must also be shown to complete — the token comparison at `:330`
  // is reached only after `resolveDeck` returns.
  const deckAResponse = page.waitForResponse((response) => isCollectionPostFor(S2_PARK_ON)(response.request()));

  // An observation window, not a sample, for the same reason as S1: the stale write lands a
  // React commit later than the response that triggered it.
  const verdictEverRendered = main
    .getByText(ALL_RESOLVED)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  await parked.release();
  await deckAResponse;

  // The checkpoint stands, the box is empty — and no verdict about deck A may appear over
  // either of them.
  expect(await verdictEverRendered).toBe(false);
  await expect(main.getByRole("heading", { name: S2_STEP_NAME })).toBeVisible();
  await expect(deckBox).toHaveValue("");
});

/**
 * S3 — finding F-3: a Check's transport failure writes the ADD flow's error banner.
 *
 * `runCheck`'s catch (`PathEditor.tsx:334-341`) and `runDiffCheck`'s (`:362-369`) both call
 * `setAddState({status: "error", …})`. `addState` is the add flow's atom, guarded by
 * `addToken` (`:189`), and neither Check ever advances that counter — so a Check that throws
 * writes the checkpoint-error banner regardless of what the add flow has since done.
 *
 * NOT the mechanism `findings.md` F-3 records, and the difference decides the test. That
 * entry says the banner is written "by whichever Check throws, SUPERSEDED OR NOT". Both
 * catches DO re-check `checkToken` (`:335`, `:363`) before writing, so a Check superseded by
 * another Check is correctly dropped — and the Check button is disabled while
 * `checkState.status === "checking"` (`:771-776`), so that overlap cannot be driven through
 * the UI in the first place. The defect is not an unguarded write; it is a write GUARDED BY
 * THE WRONG COUNTER. The reachable overlap is therefore Check-versus-ADD, which is what this
 * drives. A spec written to the filed mechanism would have chased an overlap the UI forbids.
 *
 * WHY THE ASSERTION NAMES THE BANNER AND NOT ITS MESSAGE. F-3's recommended fix routes each
 * Check's catch to a Check-owned error atom, so the same "could not reach the card database"
 * text would still be on screen afterwards — on a different banner. A text-matched assertion
 * would keep failing after the fix, and the inversion would never lift. Matching on the
 * banner's accessible name is what makes this spec retire when the guard is repaired.
 *
 * Structurally this is S2 with a failing release: same park-then-add shape, same completion
 * proofs, same observation window. Only the release differs.
 */
test("a checkpoint-error banner never describes a Check that failed after the save", async ({ page }) => {
  // Expected to fail until F-3 is fixed. An unexpected pass means it was — see the header.
  test.fail();

  // Park deck A's `/cards/collection` POST. Deck B shares no names, so the predicate does
  // not match it and it resolves normally — which is what lets the add run to completion.
  const parked = await mockScryfallWithParkedCollection(page, (names) => names.includes(S3_PARK_ON));

  const main = await gotoPathBuilder(page, seededPathId());

  const deckBox = main.getByLabel("Deck list");
  await deckBox.fill(S3_DECK_A);

  const check = main.getByRole("button", { name: "Check", exact: true });
  await expect(check).toBeEnabled();
  await check.click();

  // Deck A's resolve must be genuinely in flight before the add starts, or the two runs
  // never overlap and the assertion below proves nothing.
  await parked.arrived;

  // The user saves a different list as a checkpoint. The Add CTA is reachable because it is
  // NOT disabled by an in-flight Check — `:790` gates it on `addState` alone.
  await main.getByLabel("Checkpoint name").fill(S3_STEP_NAME);
  await deckBox.fill(S3_DECK_B);
  await main.getByRole("button", { name: "Add checkpoint" }).click();

  // Prove the add ran to COMPLETION and SUCCEEDED — both halves matter here. The rendered
  // step is the sharpest proof of each: `setSteps` sits in the same synchronous block as the
  // `setAddState({status: "idle"})` at `:313`, so a visible step card means the add's own
  // error state is already cleared and any banner appearing later came from somewhere else.
  await expect(main.getByRole("heading", { name: S3_STEP_NAME })).toBeVisible();
  await expect(deckBox).toHaveValue("");

  // Deck A's superseded run must also be shown to complete — `runCheck`'s catch is reached
  // only once `resolveDeck` has actually rejected.
  const deckAResponse = page.waitForResponse((response) => isCollectionPostFor(S3_PARK_ON)(response.request()));

  // An observation window, not a sample, for the same reason as S1 and S2: the stale write
  // lands a React commit later than the response that triggered it.
  const bannerEverRendered = main
    .getByRole("alert", { name: CHECKPOINT_ERROR })
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  // The failing release IS the mechanism under test. A 500 rather than `route.abort()`, so
  // the throw carries a deterministic message instead of a browser-dependent "Failed to
  // fetch" — test-plan §6.7 item 8, and the same choice `mockScryfallCollectionFailsOnce`
  // documents.
  await parked.releaseWithFailure();
  await deckAResponse;

  // The contradiction, as two facts that cannot both be right: a banner reporting that the
  // checkpoint errored, above the checkpoint that saved.
  expect(await bannerEverRendered).toBe(false);
  await expect(main.getByRole("heading", { name: S3_STEP_NAME })).toBeVisible();
});
