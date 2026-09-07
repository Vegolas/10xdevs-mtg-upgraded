import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mockScryfallSuccess } from "./fixtures/scryfall";
import { gotoPathBuilder } from "./fixtures/app";
import { createSignedInOwner, deleteOwner, seedPathWithStep, type Owner } from "./fixtures/auth";

/**
 * FINDING F-6 — zero-card list validation. Four guards across two components tested RAW
 * TEXT with `trim()` while everything downstream worked on PARSED ENTRIES, so deck text
 * that is non-empty but parses to no cards — comments, section headers, blank lines —
 * slipped through all of them. Three of those four sites are in this component and are
 * what these specs cover; the comparer's is covered by `comparer-zero-cards.spec.ts`.
 *
 * The three sites, and why they are three specs rather than one:
 *
 *   - `runCheck` answered comment-only text with "✓ All cards resolved." — the one signal
 *     on this surface meaning "safe to save" (S1).
 *   - `runDiffCheck` answered it with a "+0 added, −0 removed" preview, because
 *     `deriveSnapshot` returns the prior snapshot unchanged when there is nothing to
 *     apply (S2).
 *   - `handleAddStep` PERSISTED it: a checkpoint whose snapshot is `{cards: [],
 *     unresolved: []}` in full mode, and in diff mode a silent duplicate of its
 *     predecessor reading 0 in / 0 out (S3).
 *
 * Each site has its own guard and its own predicate selection, so breaking or repairing
 * one does not move the others — the same reason risk #9 needed four specs and not one.
 * `plan.md`'s manual verification requires a per-site targeted break for exactly this.
 *
 * THESE SPECS ARE GREEN, NOT `test.fail()`-INVERTED — they ship in the change that
 * repairs the defect rather than ahead of it. `lessons.md` ("A repair covering N findings
 * needs a targeted break per finding") records that this is the EASIER case to get wrong:
 * there is no annotation to lift, so nothing forces the question of whether the spec ever
 * reproduced the defect at all. A green spec that never reproduced it is indistinguishable
 * from one that did. The per-site break is the only thing that separates them.
 *
 * THE ONE WAY TO MAKE EVERY SPEC HERE VACUOUS. The repro needs `entries === 0` AND
 * `malformed === 0`. Count-only text (`4x`) and, in diff mode, any UNSIGNED line are
 * *malformed* — a bad card line, not an absent one — so they route to `UnresolvedNotice`
 * or a `DeltaWarning` and the new guards deliberately do NOT fire for them. Every paste
 * below must therefore be comments, section headers and blank lines only.
 *
 * The two pastes are NOT interchangeable, and this is the trap worth naming: `Deck (99)`
 * is a skipped section header to `parseDeckList` but a MALFORMED line to `parseDeltaList`,
 * which skips only blank and comment lines before requiring a `+`/`-` sign. So
 * {@link FULL_ZERO_CARDS} used in diff mode leaves `hasNoDeltaLines` false, the guard
 * never fires, and S2 would assert against a banner that was never going to render.
 * Verified against both parsers before this file was written.
 *
 * NO SCRYFALL REQUEST FIRES ON ANY PATH HERE. `resolveCards([])` returns before queueing,
 * so `mockScryfallSuccess` is installed as a BACKSTOP — it keeps an unmocked call from
 * escaping on the surrounding steps — and nothing below waits on card-data traffic that
 * will never arrive.
 *
 * RETRIES ARE LEFT AT THE CONFIG DEFAULT. `lessons.md`'s `retries: 0` rule covers ORDERING
 * specs, where a failure is the signal and a retry could turn a genuine out-of-order bug
 * green. These are validation specs with no concurrency: every guard here returns
 * synchronously from a click, so a retry can only absorb infrastructure flake.
 *
 * AUTH. Each test provisions its OWN owner and deletes it in `afterEach`; the delete
 * cascades to every path and step that owner seeded, so one call is the whole teardown.
 * `adoptSession` is what makes the browser agree with the API context about who the test
 * is. Nothing here signs in through the UI. Setup lives in `beforeEach` per the house rule
 * from `lessons.md` — a hook failure must stay a real failure rather than being absorbed
 * into a test body.
 */

/**
 * Full-mode paste: two comment spellings, a section header with a count, and a blank line.
 * `parseDeckList` yields `{entries: [], malformed: []}` — non-empty by `trim()`, no cards.
 */
const FULL_ZERO_CARDS = "// my commander deck\n\nDeck (99)\n# end";

/**
 * Diff-mode paste: comments and blank lines ONLY. No section header, deliberately — see
 * the file header. `parseDeltaList` yields `{entries: [], malformed: []}`.
 */
const DIFF_ZERO_CHANGES = "// no changes yet\n\n# still thinking";

/** The two sentences the guards write, asserted verbatim so a reworded message is a failure
 *  someone has to look at rather than a silent drift. */
const NO_CARDS_MESSAGE = "No card lines found — comments, headers and blank lines aren't cards.";
const NO_CHANGES_MESSAGE = "No + / − changes found — comments, headers and blank lines aren't changes.";

/** The Check flows' error banner (`PathEditor.tsx:889-901`). Located by ACCESSIBLE NAME, not
 *  by class or text: this banner's class string is byte-identical to the add flow's below and
 *  to the path-level `mutationError` banner, so the name is the only thing that tells a query
 *  which of the three it found (test-plan §6.7 items 1 and 27). */
const CHECK_ERROR = "Check error";

/** The add flow's error banner (`PathEditor.tsx:905-917`). Same reasoning. That these two are
 *  distinct is F-3's repair, and asserting the right one per site is what proves each message
 *  went to the atom its own flow owns. */
const CHECKPOINT_ERROR = "Checkpoint error";

/** The full-mode success verdict this defect used to produce (`PathEditor.tsx:863`). Substring,
 *  so the non-aria-hidden `✓` glyph in that element is not in the way. */
const ALL_RESOLVED = "All cards resolved";

/** The diff-mode summary line's one unique word (`PathEditor.tsx:906`). Verified to appear in no
 *  other rendered string in this component, so it cannot collide with a label or a placeholder. */
const DIFF_SUMMARY = "unchanged";

/** The step `seedPathWithStep` creates. `exact: true` at every use: "Add base deck" is the add
 *  section's heading when a path has no steps, and it CONTAINS this name — the substring collision
 *  `lessons.md` records as having made an assertion read backwards. */
const SEEDED_STEP = "base";

/** The checkpoint S3 tries to save. A fixed string is safe: every test seeds its own path holding
 *  one step named "base", so nothing can collide with it. */
const REFUSED_STEP_NAME = "must not be saved";

/** Owner-email label; uniqueness comes from `createOwner`'s timestamp + random suffix. */
const OWNER_LABEL = "path-zero-cards";

/** Per-test state, handed from the hook to the body. Tests in a file run serially in one worker
 *  (`fullyParallel` is unset), so a module-level slot is safe. */
let owner: Owner | null = null;
let pathId: string | null = null;

test.beforeEach(async ({ page, request }, testInfo) => {
  owner = await createSignedInOwner(request, OWNER_LABEL);
  await adoptSession(page, request);
  const { path } = await seedPathWithStep(request, testInfo.title);
  pathId = path.id;
  // Registered before any navigation, or the route would not be in place when the page loads.
  await mockScryfallSuccess(page);
});

test.afterEach(async () => {
  pathId = null;
  if (owner === null) {
    return;
  }
  const doomed = owner;
  // Cleared BEFORE the await so a failing delete cannot leave a stale id behind for the next
  // test's teardown to trip over.
  owner = null;
  await deleteOwner(doomed);
});

/**
 * Hand the browser the session `request` is currently holding.
 *
 * The chromium project starts every context from the `setup` project's `storageState`, which
 * belongs to the RUN's owner. A test that provisions its own owner has therefore moved only the
 * API context; without this the page would still be browsing as the run owner and `/paths/[id]`
 * would answer 404 for a path it does not own. Duplicated from the two sibling path-builder
 * specs rather than shared, matching what they already do.
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

/**
 * S1 — the false success verdict, F-6 as filed.
 *
 * `runCheck`'s guard was `text.trim() === ""`, which comment-only text passes. `resolveCards([])`
 * then short-circuits before any fetch, so the run completed CLEANLY with an empty unresolved
 * list and the `checkState.status === "checked"` branch rendered "✓ All cards resolved." over a
 * list holding no cards. Nothing failed anywhere; every layer drew the wrong conclusion from a
 * clean result, which is why no error path or transport mock can reach this.
 *
 * The observation window opens BEFORE the click, not after the banner. With the guard reverted
 * the verdict lands one commit after a resolve that does no I/O at all — fast enough that a
 * `toBeHidden()` sampled after the click could read the instant before it, and a window opened
 * after the banner assertion would never open at all, because that assertion is the one that
 * times out under a revert. Test-plan §6.7 item 13 records the sampling version of this mistake
 * staying green while the superseded content rendered a frame later.
 */
test("a pre-save Check refuses a deck list that parses to no cards", async ({ page }) => {
  const main = await gotoPathBuilder(page, seededPathId());

  const deckBox = main.getByLabel("Deck list");
  await deckBox.fill(FULL_ZERO_CARDS);

  // `exact` is required: the add CTA's accessible name is "Add checkpoint", which contains
  // "check" and would otherwise match too.
  const check = main.getByRole("button", { name: "Check", exact: true });
  // Enabled, and that is deliberate rather than incidental: the CTA's `disabled` clause stays
  // `trim()`-based on purpose (plan: "What We're NOT Doing"), because a button that silently
  // deadens on comment-only text explains nothing while a click that answers with a sentence
  // does. If this ever fails, the guard was moved to the wrong place.
  await expect(check).toBeEnabled();

  const verdictEverRendered = main
    .getByText(ALL_RESOLVED)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  await check.click();

  // The Check flows' OWN banner, carrying the full-paste sentence.
  await expect(main.getByRole("alert", { name: CHECK_ERROR })).toHaveText(NO_CARDS_MESSAGE);

  // …and no verdict, ever, about a list with no cards in it.
  expect(await verdictEverRendered).toBe(false);
  await expect(deckBox).toHaveValue(FULL_ZERO_CARDS);
});

/**
 * S2 — the no-op diff preview.
 *
 * `runDiffCheck`'s guard was the same `text.trim() === ""`, and the consequence is quieter than
 * S1's but not smaller: `deriveSnapshot` seeds its working set from the prior snapshot and, with
 * no entries to apply, returns it unchanged — so the preview rendered "+0 added, −0 removed, N
 * unchanged → N cards" and described a change that does not exist.
 *
 * THE PREDICATE HERE IS NOT S1'S, and that is the correction this change makes to F-6's suggested
 * fix. F-6 names `parseDeckList(text).entries.length === 0` for all three sites. This text goes to
 * `parseDeltaList`, a different parser: `parseDeckList` would read `+ Sol Ring` as a card literally
 * named "+ Sol Ring", find one entry, and the guard would never fire. `lessons.md` ("A finding's
 * suggested FIX needs the same verification against the code as its symptom") is what makes this
 * a thing to check rather than inherit.
 *
 * The mode assertion between the click and the fill is what stops the switch being a silent no-op.
 * A toggle that never moved would leave the app in full mode, where the full-paste guard fires with
 * the WRONG sentence — and the spec would still see a banner. Asserting `aria-pressed` is what
 * makes this spec about the diff site at all.
 */
test("a diff-mode Check refuses changes text that parses to no changes", async ({ page }) => {
  const main = await gotoPathBuilder(page, seededPathId());

  // The toggle renders only when `steps.length >= 1` (`PathEditor.tsx:800`), which the seeded path
  // satisfies — so this needs no second seeded shape. Scoping to the group also keeps "Changes"
  // from colliding with the diff-mode textarea label, which contains that word.
  const entryMode = main.getByRole("group", { name: "Entry mode" });
  const changes = entryMode.getByRole("button", { name: "Changes" });
  await changes.click();
  await expect(changes).toHaveAttribute("aria-pressed", "true");

  // Regex rather than the literal label, which carries a U+2212 MINUS SIGN.
  const changeBox = main.getByLabel(/Changes \(\+ to add/);
  await changeBox.fill(DIFF_ZERO_CHANGES);

  const check = main.getByRole("button", { name: "Check", exact: true });
  await expect(check).toBeEnabled();

  const summaryEverRendered = main
    .getByText(DIFF_SUMMARY)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  await check.click();

  // Same banner as S1 — the two Check flows share `checkError`, because they share the `preview`
  // lane — but the diff-mode sentence.
  await expect(main.getByRole("alert", { name: CHECK_ERROR })).toHaveText(NO_CHANGES_MESSAGE);

  expect(await summaryEverRendered).toBe(false);
  await expect(changeBox).toHaveValue(DIFF_ZERO_CHANGES);
});

/**
 * S3 — the persist, which is the only one of the three that reaches the database.
 *
 * `handleAddStep`'s `listText.trim() === ""` guard passed comment-only text straight through to
 * `resolveDeck` and then to `POST /api/paths/[id]/steps`, saving an immutable checkpoint whose
 * snapshot is `{cards: [], unresolved: []}`. Checkpoints cannot be edited (FR-006), so this is
 * the one site whose damage outlives the page.
 *
 * WHY THE RELOAD IS THE LOAD-BEARING ASSERTION, and the banner is not. With the second guard
 * reverted, the add runs to completion and SUCCEEDS: `setAddState({status: "idle"})` fires on the
 * success path, so no banner renders — and a spec that stopped at the banner would redden for the
 * right reason by luck. It would also pass, vacuously, against any future change that showed a
 * message and saved anyway. Only a round trip to the server distinguishes "refused" from
 * "complained and persisted regardless". `plan.md`'s manual verification for this phase requires
 * the break to redden HERE.
 *
 * The seeded step is asserted present after the reload BEFORE the refused one is asserted absent.
 * Without that, a reload that landed on an error page, an empty path or a 404 would satisfy the
 * count-zero assertion trivially — a negative that passes because nothing rendered at all.
 */
test("Add refuses a deck list that parses to no cards, and persists nothing", async ({ page }) => {
  const main = await gotoPathBuilder(page, seededPathId());

  await main.getByLabel("Checkpoint name").fill(REFUSED_STEP_NAME);
  await main.getByLabel("Deck list").fill(FULL_ZERO_CARDS);

  const addButton = main.getByRole("button", { name: "Add checkpoint" });
  await addButton.click();

  // The ADD flow's banner, not the Check flows' — the atom `handleAddStep` owns.
  await expect(main.getByRole("alert", { name: CHECKPOINT_ERROR })).toHaveText(NO_CARDS_MESSAGE);

  // Still enabled, which is the observable proof that the guard sits AHEAD of the
  // `setAddState({status: "resolving"})` commit: the CTA is disabled while that state stands, so
  // an enabled button means no spinner was ever shown for a click that was already refused.
  await expect(addButton).toBeEnabled();

  // The round trip. A fresh navigation rather than `page.reload()`, so the assertions run against
  // the same hydration barrier and `main` scope every other spec uses.
  const reloaded = await gotoPathBuilder(page, seededPathId());
  await expect(reloaded.getByRole("heading", { name: SEEDED_STEP, exact: true })).toBeVisible();
  await expect(reloaded.getByRole("heading", { name: REFUSED_STEP_NAME, exact: true })).toHaveCount(0);
});
