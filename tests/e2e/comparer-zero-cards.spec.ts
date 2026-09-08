import { test, expect } from "@playwright/test";
import { mockScryfallSuccess } from "./fixtures/scryfall";
import { compare, gotoComparer } from "./fixtures/app";

/**
 * FINDING F-6 — zero-card list validation, the comparer's site. The path builder's three
 * sites are covered by `path-builder-zero-cards.spec.ts`; this file covers the fourth.
 *
 * THE COMPARER'S FAILURE IS THE QUIET ONE, and that is exactly what makes it worth a spec.
 * The other three answered wrongly — a "✓ All cards resolved." verdict, a "+0 added, −0
 * removed" preview, a persisted checkpoint. This one answered with SILENCE:
 * `generateUpgradePlan` already short-circuited on `entries.length === 0` and returned
 * `{status: "empty"}`, and `runPlan` mapped that to `{status: "idle"}` — which renders the
 * component's INITIAL PROMPT, "Paste a deck list into each box." So the user read an
 * instruction to do the thing they had visibly just done, with both boxes full in front of
 * them, and nothing anywhere said why. The outcome was computed correctly and discarded.
 *
 * WHAT THE BANNER HAS TO DO BEYOND EXISTING. `{status: "empty"}` was bare, so even a
 * component that rendered it could only say "one of these two boxes has no cards" — with
 * two boxes that is barely better than the silence. The outcome now carries `sides`, and
 * the second half of this spec is what proves the payload is real rather than decorative:
 * a banner hardcoded to name both decks would pass the first assertion and fail the second.
 *
 * THE ONE WAY TO MAKE THIS SPEC VACUOUS. The repro needs `entries === 0` AND
 * `malformed === 0`. Count-only text (`4x`) is a *bad* card line, not an absent one — it
 * parses to `malformed`, flows through `resolveDeck` into `unresolved`, and renders
 * `UnresolvedNotice` on a plan that built fine. Pasting it here would exercise the
 * partial-resolution path `comparer-failure-surfacing.spec.ts` already owns and would never
 * reach the new branch at all. {@link ZERO_CARDS} is therefore comments, a section header
 * and a blank line only.
 *
 * NO SCRYFALL REQUEST FIRES ON EITHER RUN. The short-circuit happens before `resolveDeck`,
 * and it fires when EITHER side is empty — so the second run, whose base deck is real, is
 * refused just as early. `mockScryfallSuccess` is installed purely as a BACKSTOP, to keep
 * an unmocked call from escaping if that ever stops being true; nothing below waits on
 * card-data traffic.
 *
 * All locators are scoped to the `main` landmark `gotoComparer` returns — `Layout.astro`
 * renders a config banner above the slot when Supabase keys are unset, so CI and a
 * contributor's machine see different DOM outside it. Retries stay at the config default:
 * this is a validation spec with no concurrency, so a retry can only absorb infrastructure
 * flake, never turn a genuine bug green.
 */

/**
 * Two comment spellings, a section header with a count, and a blank line. Non-empty by
 * `trim()` — which is what every guard used to test — and `{entries: [], malformed: []}`
 * to `parseDeckList`.
 */
const ZERO_CARDS = "// my commander deck\n\nDeck (99)\n# end";

/** A real list for the box that gets fixed. Any card resolves: the run never gets that far. */
const REAL_DECK = "1 Sol Ring\n1 Arcane Signet";

/** The banner's accessible name. `exact` at every use, per `lessons.md` — `getByRole`'s
 *  `name` is a case-insensitive SUBSTRING match by default, and a short name like this one
 *  is precisely the shape that quietly matches something else on the surface. */
const NO_CARDS_BANNER = "No card lines";

/** The three sentences, asserted verbatim. A reworded message should be a failure someone
 *  has to look at, not a silent drift — this copy is the entire remedy the user gets. */
const NEITHER = "Neither deck has any card lines — comments, headers and blank lines aren't cards.";
const TARGET_ONLY = "Target deck has no card lines — comments, headers and blank lines aren't cards.";

/** The initial prompt (`DeckComparer.tsx:218-222`) — the symptom itself, not just a
 *  bystander. Substring: the full sentence continues past this. */
const INITIAL_PROMPT = "Paste a deck list into each box";

/** The transport banner's headline (`DeckComparer.tsx:236`). Asserted ABSENT, because
 *  reusing that banner was the tempting shortcut and it is wrong advice here: nothing
 *  failed, and Retry on unchanged text answers identically. */
const TRANSPORT_HEADLINE = "Couldn't reach the card database.";

test.beforeEach(async ({ page }) => {
  // Registered before any navigation, or the route would not be in place when the page loads.
  await mockScryfallSuccess(page);
});

test("the comparer names the deck that parses to no cards, instead of resetting to its prompt", async ({ page }) => {
  const main = await gotoComparer(page);

  // `compare()` drives the Calculate CTA. NOT the 700ms debounce: the debounce effect's
  // cleanup clears the pending timer on every keystroke, so driving this component by typing
  // and waiting is the anti-pattern `lessons.md` records by name.
  await compare(main, ZERO_CARDS, ZERO_CARDS);

  const banner = main.getByRole("alert", { name: NO_CARDS_BANNER, exact: true });
  await expect(banner).toHaveText(NEITHER);

  // The symptom, gone. Asserting the banner alone would not prove the reset stopped — a
  // component that rendered both would still be telling the user to fill boxes that are full.
  await expect(main.getByText(INITIAL_PROMPT)).toHaveCount(0);

  // Informational, not destructive. No Retry: there is nothing transient to retry, and an
  // affordance that re-runs identical text to the identical answer is a dead end.
  await expect(main.getByText(TRANSPORT_HEADLINE)).toHaveCount(0);
  await expect(banner.getByRole("button", { name: "Retry" })).toHaveCount(0);

  // Nothing was consumed: both boxes still hold what was pasted, so the fix below is an edit
  // to one box rather than a re-entry of everything.
  await expect(main.getByLabel("Base deck — what you have now")).toHaveValue(ZERO_CARDS);

  // FIX ONE BOX. This is the assertion `sides` exists for: the message has to narrow to the
  // box still at fault. A banner naming both decks unconditionally — or one derived from
  // "either side is empty", which is all the outcome used to carry — passes the first
  // assertion above and fails here.
  await compare(main, REAL_DECK, ZERO_CARDS);

  await expect(banner).toHaveText(TARGET_ONLY);
  await expect(main.getByText(INITIAL_PROMPT)).toHaveCount(0);
});
