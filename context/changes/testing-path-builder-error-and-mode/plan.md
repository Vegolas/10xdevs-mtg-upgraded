# Path Builder Error Banner & Mode Switch Implementation Plan

## Overview

Pin the two remaining risk-#9 defects — F-3 (both Check flows write the add flow's error
banner from a branch the add flow's counter does not guard) and F-4 (`switchMode` resets
three atoms and advances neither counter) — as `test.fail()` specs in the existing
`tests/e2e/path-builder-stale-ordering.spec.ts`, alongside S1 and S2.

Two enablers come first: the production addressability edit F-3 cannot be spec'd without,
and a fixture capability S3 needs (`ParkedRoute` can release a held request successfully
but cannot fail one).

This is **coverage, not repair** — the same convention S1 and S2 established. Both specs
assert the correct behavior, carry `test.fail()`, keep the suite green on today's code,
and turn the build red the moment someone fixes a guard. See `context/foundation/lessons.md`
"Pin a live defect with `test.fail()`" and test-plan §6.7 items 22–23.

The change also corrects two claims in the archived upstream `findings.md` that do not
survive contact with the code. Both corrections are load-bearing: each one changes what its
spec asserts.

## Current State Analysis

`src/components/path/PathEditor.tsx` (811 lines) carries six async flows and two counters.
Four flows are guarded by hand; three carry no guard at all (F-5). S1 and S2 already pin
F-1 and F-2. What remains:

**F-3 — the cross-atom write.** `runCheck`'s catch (`:334-341`) and `runDiffCheck`'s catch
(`:362-369`) both call `setAddState({status: "error", …})`. `addState` is the add flow's
atom, guarded by `addToken` (`:189`). Neither Check ever advances `addToken`, so a Check
that throws writes the add flow's banner regardless of what the add flow has since done.

**F-4 — the unguarded reset.** `switchMode` (`:376-382`) sets `listText` to `""` and resets
`checkState`, `diffPreview` and `addState`, bumping neither counter. A Check in flight
across the switch passes its own token check and repopulates the atom the switch just
cleared.

**The blocker.** The `addState` error banner (`:759-762`) carries a class string
byte-identical to the path-level `mutationError` banner (`:596`). Neither has a role or a
name, so a locator for one matches the other. This is test-plan §6.7 item 1's trap verbatim.

### Key Discoveries

Verified against the code on 2026-09-06 during this planning session. The first two
contradict the archived upstream `findings.md` and change what the specs assert.

- **F-3's mechanism as filed is wrong.** `findings.md` says the banner is written "by
  whichever Check throws, **superseded or not**." Both catches re-check `checkToken` before
  writing (`PathEditor.tsx:335`, `:363`), so a Check superseded *by another Check* is
  correctly dropped. The defect is not "unguarded" — it is **guarded by the wrong counter**:
  the write targets `addState`, and only `addToken` guards that. The drivable overlap is
  therefore Check-versus-**add**, not Check-versus-Check.
- **F-4's stated impact is impossible.** `findings.md` predicts "a full-list verdict under
  the diff-mode textarea." Both previews are mode-gated — `activeMode === "full" &&
  checkState.status === "checked"` (`:723`) and `activeMode === "diff" &&
  diffPreview.status === "checked"` (`:735`) — so neither can render under the other mode's
  textarea. The only atom that is **not** mode-gated is `addState` (`:759`). The Check
  verdict's stale write is real, but becomes visible only on a mode **round trip**.
- **F-4's deferral reason is stale.** `findings.md` defers S4 partly because "the mode
  toggle only renders when `steps.length >= 1`" and "a faithful spec needs a second seeded
  shape." `seedPathWithStep` (`tests/e2e/fixtures/auth.ts`) already seeds exactly one step,
  so `canDiff` is true and the toggle renders on the shape S1 and S2 already use.
- **The mode toggle is already addressable.** `PathEditor.tsx:649-653` wraps both buttons in
  `role="group" aria-label="Entry mode"`, with text names "Full list" and "Changes" plus
  `aria-pressed`. S4 needs no production edit — `change.md` said so and it holds.
- **The Check button is disabled while a Check is in flight.** `:771-776` is a four-way OR
  (`listText.trim() === ""` **or** `checkState.status === "checking"` **or**
  `diffPreview.status === "checking"` **or** `addState.status === "resolving"`), not the
  bare empty-text test `change.md` quotes. A Check cannot be superseded by another Check
  through the button — which is *why* S3 routes through the add flow and S4 through the
  toggle.
- **The Add button is not disabled by an in-flight Check.** `:790` gates it on
  `addState.status === "resolving"` alone. This is what makes S3's overlap reachable through
  ordinary affordances, and it is the same fact S2 already depends on.
- **`ParkedRoute` cannot fail a held request.** `release()` in
  `tests/e2e/fixtures/scryfall.ts` fulfills with `collectionResponse(parkedNames)` and
  nothing else. S3 needs a 500 — never `route.abort()` (§6.7 item 8).
- **The 500 message is already conventional.** `src/lib/card-data/scryfall.ts:96-98` throws
  `Scryfall /cards/collection failed: ${status} ${statusText}`, which the existing suite
  matches as `/cards\/collection failed: 500/`. Leave `statusText` unasserted —
  `route.fulfill()` does not reliably populate it (§6.7 item 7).
- **`getByRole`'s `name` is substring by default.** S1 already needs `exact: true` on "Check"
  because "Add checkpoint" contains it. Every new locator gets the same scrutiny.

## Desired End State

`tests/e2e/path-builder-stale-ordering.spec.ts` carries four specs — S1, S2, S3, S4 — all
annotated `test.fail()`, all naming the finding they pin. `npm run test:e2e` reports four
expected failures and zero unexpected ones. `PathEditor`'s two error banners are
distinguishable by role and name, in production code. `ParkedRoute` can release a held
request as a failure. The two upstream corrections live in `lessons.md`, where every skill
that reads it will pick them up.

Verify by: a full `npm run test:e2e` run showing 4 expected failures; and, for each new
spec, one run with the `test.fail()` line commented out whose error is read and confirmed to
be the defect rather than a locator typo.

## What We're NOT Doing

- **Not fixing F-1 through F-5.** Every spec here asserts correct behavior and is inverted.
  No guard is repaired, no counter is bumped. Test-plan §6.7 item 15.
- **Not doing the F-5 shared-guard refactor.** It is recorded as this change's successor.
  Refactoring `PathEditor`'s six flows is a production change that wants four pins under it,
  not two — which is the whole reason S3 and S4 land first.
- **Not spec'ing F-6** (non-empty text parsing to zero cards). It is a validation gap, not an
  ordering one, and `findings.md` correctly routes it to the unit layer
  (`src/lib/deck/parse.test.ts`). It needs no browser.
- **Not adding a Check-owned error atom.** That is F-3's *fix*, and it belongs to whoever
  responds to the red build.
- **Not spec'ing the reverse F-3 direction** (an add's error message overwritten by a
  Check's). It would need two induced failures and would assert message content, which §6.7
  item 6 shows cannot distinguish a broken fixture from the defect.
- **Not spec'ing the add-error banner crossing a mode switch.** Real, but its assertion
  duplicates S3's, so a single fix would flip both and leave `switchMode` unpinned.
- **Not touching `retries`.** Config default, per §6.7 item 23 — on an inverted spec a retry
  can only absorb a flake that would report a spurious unexpected pass.
- **No new CI job, no branch-protection change.** Both specs join an existing file in an
  existing job.

## Implementation Approach

Enablers first, in one phase, so a regression in the existing suite unambiguously blames the
production edit rather than a new spec. Then one phase per spec, because each `test.fail()`
spec carries its own mandatory deliberate-break verification and that is not a step worth
batching. Then the record.

Each spec follows the structure S1 and S2 established and which §6.7 items 11 and 13
codify: park selectively, prove the parked run is genuinely in flight before acting, prove
it ran to **completion** before asserting the drop, and assert the negative through an
observation window opened *before* the release — never a sample after it.

## Critical Implementation Details

**State sequencing — S4's round trip must precede the release.** The obvious ordering is
wrong. Park the Check, switch to "Changes", release, then switch back: the released
`runCheck` writes `checkState` while `activeMode` is `"diff"`, the verdict does not render,
and the second `switchMode` resets `checkState` to `idle` before the user returns to full
mode. The stale write is real but never observable. Both switches must happen **before**
`release()`, so the released write lands while `activeMode` is already back to `"full"`.

**Timing — `switchMode` clears the textarea, so the assertion has a box to point at.** The
empty box in S4 comes from `switchMode`'s own `setListText("")` (`:378`), not from anything
the test does. That is what makes the contradiction the same one S1 names — a verdict about
resolved cards above a box holding none — reached through a different invalidation event.

**Deck-name disjointness is a hard constraint, not hygiene.** `src/lib/card-data/resolve.ts:15`
is a module-level cache with no test seam and no barrel export for `clearSessionCache()`
(§6.7 item 9). S3's two decks must share no names with each other **or with S1's and S2's**
three decks, or the second POST is served from cache, never fires, and the fixture has
nothing to park. S4 needs one deck, subject to the same rule.

## Phase 1: Enablers — addressable banners and a failing release

### Overview

Two independent enablers, landed together because neither is observable on its own and both
must be in place before Phase 2 can be written. The production edit is the only change to
`src/` in this plan.

### Changes Required:

#### 1. Distinguish the two error banners

**File**: `src/components/path/PathEditor.tsx`

**Intent**: The `addState` error banner (`:759-762`) and the path-level `mutationError`
banner (`:596`) carry byte-identical class strings and neither has a role or an accessible
name, so no locator can tell them apart. Give both a role and a distinguishing name, in
production code — §6.7 item 1, and the accepted shape from Phase 4
(`DeckComparer.tsx:217-220`). Naming **both** rather than only the add banner is deliberate:
a locator that works because nothing else happens to carry `role="alert"` is relying on
accidental uniqueness, and F-3's own recommended fix adds a third error banner to this
surface. Two error banners where one is announced and the other silently is not is also an
accessibility defect in its own right.

**Contract**: `:596` gains `role="alert"` and `aria-label="Path error"`. `:759-762` gains
`role="alert"` and `aria-label="Checkpoint error"`. Class strings, conditions, and message
text are unchanged. Follow the comment convention at `DeckComparer.tsx:217-219` — state that
the role exists both to announce the failure and to make the container addressable against
its byte-identical twin.

#### 2. Let a parked route fail

**File**: `tests/e2e/fixtures/scryfall.ts`

**Intent**: `ParkedRoute` can release a held request successfully but has no way to fail one,
and S3's whole mechanism is a Check whose parked POST comes back an error. Add a second
release that fulfills with a 500 — never `route.abort()`, which yields a browser-dependent
`"Failed to fetch"` no spec can assert on (§6.7 item 8, and the same reasoning already
written into `mockScryfallCollectionFailsOnce`).

**Contract**: `ParkedRoute` gains `releaseWithFailure(status?: number): Promise<void>`,
defaulting to 500 and fulfilling with the `{object: "error", status}` shape
`mockScryfallCollectionFailsOnce` already uses. `release()` keeps its exact signature and
behavior — S1 and S2 must not change. The existing single-shot `released` flag covers both
methods, so a route can be released once, either way. Document why the default is a status
and not an abort, so the next fixture author does not re-derive it.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck`
- Unit suite passes: `npm run test`
- Browser suite passes with S1 and S2 still reporting exactly two expected failures and zero unexpected ones: `npm run test:e2e`

#### Manual Verification:

- The path builder renders unchanged — both banners keep their existing appearance, position and copy
- A screen reader announces the checkpoint error banner when an add fails, and the path error banner when a rename or delete fails

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human that the manual testing was successful
before proceeding to the next phase.

---

## Phase 2: S3 — a Check's failure never lands on a saved checkpoint

### Overview

Pin F-3. The spec drives the one overlap the guards actually admit: a Check in flight when an
add succeeds, whose transport failure then writes the add flow's error banner over a
checkpoint that saved cleanly.

### Changes Required:

#### 1. The S3 spec

**File**: `tests/e2e/path-builder-stale-ordering.spec.ts`

**Intent**: Assert that a checkpoint-error banner never describes a Check that failed after
the checkpoint was saved. Structurally this is S2 with a failing release: park deck A's Check
POST, add a disjoint deck B successfully, then fail deck A's held request and show the banner
never appears. Red today — `runCheck`'s catch writes `setAddState` under a `checkToken` guard
while `addToken` is what owns that atom — so the spec carries `test.fail()`.

**Contract**: A new `test()` in the existing file, using the file's existing `beforeEach` /
`afterEach`, `adoptSession`, `seededPathId()` and `isCollectionPostFor` helpers unchanged.
Two new module-level deck constants sharing no card names with `S1_DECK`, `S2_DECK_A` or
`S2_DECK_B`, plus a park-on name from the Check's deck. The assertion targets
`main.getByRole("alert", { name: "Checkpoint error" })` — never the message text, which after
F-3's fix would still appear on a Check-owned banner. Sequence: fill deck A → Check →
`await parked.arrived` → fill the checkpoint name and deck B → Add → prove the step rendered
and the box emptied → open the observation window → `releaseWithFailure()` → `await` the
deck-A response → assert the window resolved false, and that the checkpoint and empty box
both still stand.

**Intent (header comment)**: Record why this shape and not the one `findings.md` describes.
The catches *do* re-check `checkToken` (`:335`, `:363`), so "superseded or not" is wrong and a
Check-versus-Check overlap would be correctly dropped; the defect is a write to an atom a
different counter guards. Also record why the assertion targets the banner's identity rather
than its message: F-3's recommended fix moves the message to a Check-owned banner, so a
text-matched assertion would keep failing after the fix and the inversion would never lift.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck`
- Browser suite reports exactly three expected failures and zero unexpected ones: `npm run test:e2e`
- The spec run alone with `test.fail()` commented out fails on the checkpoint-error banner appearing — not on a locator, a timeout, or a rejected seed (§6.7 item 22b)

#### Manual Verification:

- The trace from the deliberate-break run shows the checkpoint rendered and the deck box empty at the moment the banner appears — i.e. the add genuinely completed before the Check's failure landed
- Reading the spec cold, it is clear which finding it pins and what an unexpected pass means

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human that the manual testing was successful
before proceeding to the next phase.

---

## Phase 3: S4 — switching entry mode invalidates the Check in flight

### Overview

Pin F-4. The spec drives a mode round trip across a parked Check and asserts the verdict never
lands, at the one control whose stated purpose is stopping the two modes bleeding into each
other.

### Changes Required:

#### 1. The S4 spec

**File**: `tests/e2e/path-builder-stale-ordering.spec.ts`

**Intent**: Assert that switching entry mode invalidates a Check already in flight. Park the
full-mode Check, toggle to "Changes" and back to "Full list" — both switches before the
release — then release and show the verdict never renders over the box `switchMode` emptied.
Red today: `switchMode` bumps neither counter, so the released `runCheck` passes its own token
check and repopulates `checkState`. `test.fail()`.

**Contract**: A new `test()` in the same file, reusing the same hooks and helpers. One new
deck constant, disjoint from all three existing decks and from S3's two, plus its park-on
name. The mode buttons are reached through the existing production affordance:
`main.getByRole("group", { name: "Entry mode" })`, then `getByRole("button", …)` for "Full
list" and "Changes" — assert `aria-pressed` flips, which also proves the toggle rendered at
all rather than silently no-op'ing. The verdict assertion reuses the file's existing
`ALL_RESOLVED` constant and the `waitFor`-race observation-window shape from S1. Sequence:
fill deck → Check → `await parked.arrived` → click "Changes" → click "Full list" → confirm the
box is empty → open the observation window → `release()` → `await` the response → assert the
window resolved false and the box is still empty.

**Intent (header comment)**: Record three things a reader will otherwise re-derive. (1) Why
the round trip is required and why it must precede the release — the verdict is mode-gated at
`:723`, and a switch *after* the release resets `checkState` before the user returns to full
mode, so the stale write would be real but never observable. (2) That `findings.md`'s
predicted impact — "a full-list verdict under the diff-mode textarea" — cannot happen for the
same mode-gating reason, and that `addState` (`:759`) is the only atom that genuinely crosses.
(3) Why this is not S1 with extra steps: `switchMode` (`:376-382`) is a distinct guard site
from the textarea's `onChange` (`:708-710`), and fixing one leaves the other live — so the two
specs retire independently.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck`
- Browser suite reports exactly four expected failures and zero unexpected ones: `npm run test:e2e`
- The spec run alone with `test.fail()` commented out fails on the verdict rendering — not on a locator, a timeout, or a rejected seed (§6.7 item 22b)
- Bumping `checkToken` inside `switchMode` locally makes the spec report `Expected to fail, but passed.`, confirming it pins the guard rather than the timing

#### Manual Verification:

- Driving the round trip by hand in the browser reproduces the stale verdict over an empty deck box
- The `aria-pressed` assertions genuinely fail if the toggle is removed, rather than passing vacuously

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human that the manual testing was successful
before proceeding to the next phase.

---

## Phase 4: The record

### Overview

Carry forward what this change proved, and hand F-5 to its successor. The archived
`findings.md` is immutable, so the two corrections land where the skills will read them.

### Changes Required:

#### 1. This change's findings

**File**: `context/changes/testing-path-builder-error-and-mode/findings.md`

**Intent**: Record what this change found and deliberately did not fix, in the shape its two
predecessors used. F-3 and F-4 are now pinned by spec and self-retiring; F-5 and F-6 remain
prose-only and must not evaporate with the change folder.

**Contract**: One entry per surviving finding, each naming file and verified line, observed
behavior, why deferred, and suggested owner. Carries forward F-5 (three unguarded mutation
flows) and F-6 (zero-entry text rendering a success verdict) from the archived list, each
re-verified against current line numbers. Names F-5's refactor as this change's designated
successor and states the argument for the ordering: four pins under the refactor, not two.
Also records that the F-3 fix will add a third error banner to `PathEditor`, which is why
Phase 1 named both existing banners rather than relying on `role="alert"` being unique.

#### 2. The corrections register

**File**: `context/foundation/lessons.md`

**Intent**: Both upstream misstatements changed what a spec asserts, which is exactly the bar
the register's two existing correction entries were written to. Append rather than edit — the
register is append-only and the archived source cannot be changed anyway.

**Contract**: One new entry in the file's existing section shape (Context / Problem / Rule /
Applies to), superseding two claims: F-3's "superseded or not" (the catches do re-check their
token; the defect is a write to an atom a *different* counter guards) and F-4's "a full-list
verdict under the diff-mode textarea" (impossible — both previews are mode-gated; only
`addState` crosses). The generalizable rule is the one both share: when a finding names a
*symptom surface*, verify the render actually reaches that surface before writing a spec
against it — a mode-gated or conditionally-rendered target can make a real defect
unobservable and a faithful-looking spec vacuous. `Applies to`: frame, research, plan,
plan-review, implement, impl-review.

#### 3. The cookbook

**File**: `context/foundation/test-plan.md`, §6.7

**Intent**: Three facts the next browser phase would otherwise pay for again.

**Contract**: New numbered items continuing §6.7's authenticated-spec subsection, covering:
release-as-failure on a parked route (and why 500 rather than abort, cross-referencing item
8); the mode-gating constraint — verify the asserted surface actually renders in the state the
spec leaves the app in, or the observation window watches an element that can never appear;
and the two-identical-banners case as a second instance of item 1, with the note that naming
*both* twins beats relying on one being incidentally unique. Also correct the §6.7 item 22
reference to `findings.md` so it points at F-1/F-2 *and* the two specs added here.

#### 4. Change status

**File**: `context/changes/testing-path-builder-error-and-mode/change.md`

**Intent**: Close the change out and answer, in the file that asked it, the open scope
question it forbade inheriting.

**Contract**: `status: complete`, `updated` stamped. A short epilogue recording the position
taken on the three-option scope question (spec both; F-5 refactor as successor) and the two
`findings.md` corrections that came out of settling it.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Full browser suite reports four expected failures and zero unexpected ones: `npm run test:e2e`
- Every file:line reference introduced in this phase resolves to the line it claims

#### Manual Verification:

- A reader who never saw this change can find F-5's successor argument from `findings.md` alone
- The `lessons.md` entry is legible without opening the archived `findings.md` it supersedes

---

## Testing Strategy

There are no new unit or integration tests — this change adds browser coverage only, for
exactly the reason test-plan §7 admits: the drop path in each guarded flow is a silent
`return` that never reaches the DOM, so no cheaper layer can see it.

### Browser Tests

- **S3**: a Check's transport failure must not write the checkpoint-error banner over a
  successfully saved checkpoint.
- **S4**: a mode round trip must invalidate a Check in flight; its verdict must not render
  over the box the switch emptied.

Both are `test.fail()` and both assert a negative through an observation window opened before
the release (§6.7 item 13).

### Edge Cases Covered by Construction

- **The overlap is real, not asserted.** Each spec awaits `parked.arrived` before the second
  action — a guard that is never reached cannot be shown to fail.
- **The superseded run completes.** Each spec awaits the parked run's response before
  asserting, because the token comparison at `:330` is reached only after `resolveDeck`
  returns.
- **No cross-spec cache bleed.** Every deck in the file is name-disjoint from every other.

### Manual Testing Steps

1. `npx supabase start`, confirm `.env.test` carries both keys, and confirm no integration run is active — the two suites share `.dev.vars`.
2. `npm run test:e2e` — expect four expected failures, zero unexpected.
3. Comment out `test.fail()` in S3, run that spec alone, and read the actual error. Restore.
4. Comment out `test.fail()` in S4, run that spec alone, and read the actual error. Restore.
5. Add a `checkToken` bump inside `switchMode`, re-run S4, confirm `Expected to fail, but passed.` Revert.
6. In a browser, fail an add and confirm the checkpoint-error banner announces; fail a rename and confirm the path error banner announces.

## Performance Considerations

Two specs on an existing job. Each parks one request and releases it explicitly, so neither
waits on a timeout — except the 3000 ms observation windows, which resolve early on a visible
element and only run to full duration in the passing (inverted-failing) case. Adds roughly the
cost of two page loads plus two seeded paths to a job already paying ~90s for
`npx supabase start`. No new job, no new required check.

## Migration Notes

None. The production edit adds a role and a name to two existing elements; no state, no
schema, no contract changes. The fixture change is purely additive — `release()` keeps its
signature, so S1 and S2 are untouched.

## References

- Upstream findings (immutable): `context/archive/2026-09-05-testing-path-builder-ordering/findings.md` — F-3, F-4, F-5, F-6
- Change brief: `context/changes/testing-path-builder-error-and-mode/change.md`
- Conventions: `context/foundation/lessons.md` — "Pin a live defect with `test.fail()`", "Treat the stale-response guard as five hand copies"
- Recipe: `context/foundation/test-plan.md` §6.7 items 1, 8, 9, 11, 13, 15, 16–24; §7's path-builder bullet
- Sibling specs: `tests/e2e/path-builder-stale-ordering.spec.ts` (S1, S2)
- Addressability precedent: `src/components/deck/DeckComparer.tsx:217-220`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Enablers — addressable banners and a failing release

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 24ff393
- [x] 1.2 Type checking passes: `npm run typecheck` — 24ff393
- [x] 1.3 Unit suite passes: `npm run test` — 24ff393
- [x] 1.4 Browser suite passes with S1 and S2 still reporting exactly two expected failures and zero unexpected ones: `npm run test:e2e` — 24ff393

#### Manual

- [x] 1.5 The path builder renders unchanged — both banners keep their existing appearance, position and copy — 24ff393
- [x] 1.6 A screen reader announces the checkpoint error banner when an add fails, and the path error banner when a rename or delete fails — 24ff393

### Phase 2: S3 — a Check's failure never lands on a saved checkpoint

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Type checking passes: `npm run typecheck`
- [x] 2.3 Browser suite reports exactly three expected failures and zero unexpected ones: `npm run test:e2e`
- [x] 2.4 The spec run alone with `test.fail()` commented out fails on the checkpoint-error banner appearing

#### Manual

- [x] 2.5 The deliberate-break trace shows the checkpoint rendered and the box empty when the banner appears
- [x] 2.6 Reading the spec cold, it is clear which finding it pins and what an unexpected pass means

### Phase 3: S4 — switching entry mode invalidates the Check in flight

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Type checking passes: `npm run typecheck`
- [ ] 3.3 Browser suite reports exactly four expected failures and zero unexpected ones: `npm run test:e2e`
- [ ] 3.4 The spec run alone with `test.fail()` commented out fails on the verdict rendering
- [ ] 3.5 Bumping `checkToken` inside `switchMode` locally makes the spec report `Expected to fail, but passed.`

#### Manual

- [ ] 3.6 Driving the round trip by hand in the browser reproduces the stale verdict over an empty deck box
- [ ] 3.7 The `aria-pressed` assertions genuinely fail if the toggle is removed

### Phase 4: The record

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`
- [ ] 4.2 Full browser suite reports four expected failures and zero unexpected ones: `npm run test:e2e`
- [ ] 4.3 Every file:line reference introduced in this phase resolves to the line it claims

#### Manual

- [ ] 4.4 A reader who never saw this change can find F-5's successor argument from `findings.md` alone
- [ ] 4.5 The `lessons.md` entry is legible without opening the archived `findings.md` it supersedes
