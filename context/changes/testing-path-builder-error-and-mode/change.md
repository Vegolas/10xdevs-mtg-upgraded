---
change_id: testing-path-builder-error-and-mode
title: Prove the path builder's error banner and mode switch drop superseded resolves
status: implemented
created: 2026-09-06
updated: 2026-09-06
archived_at: null
---

## Notes

Picks up the two scenarios `testing-path-builder-ordering` (test-plan §3 Phase 5)
deliberately scoped out — S3 and S4 — both filed with verified evidence in
`context/archive/2026-09-05-testing-path-builder-ordering/findings.md`. That file
is the starting point; its line numbers were verified 2026-09-06 and nothing in
`src/components/path/PathEditor.tsx` has changed since.

Both are **live defects**, not forecasts, so the same convention applies: this is
coverage, not repair — specs assert the correct behavior and carry `test.fail()`,
the suite stays green, and the build turns red the moment a guard is fixed. See
`context/foundation/lessons.md`, "Pin a live defect with `test.fail()`" and
test-plan §6.7 items 22–23.

### What this covers

- **S3 / finding F-3** — both Check flows write the add-error banner under a counter
  that does not guard it. `PathEditor.tsx:339` (`runCheck`'s catch, guarded by
  `checkToken` at `:335`) and `:367` (`runDiffCheck`'s catch, guarded at `:363`)
  both call `setAddState`, whose atom `addToken` guards. So the banner is written
  by whichever Check throws, superseded or not.
- **S4 / finding F-4** — `switchMode` (`:376-382`) clears `listText` and all three
  state atoms while bumping **neither** counter, so any of the three flows in
  flight survives the switch and writes into the other mode's surface.

### The blocker S3 carries, and why it is in scope

F-3 is not spec-able as-is: the add-error banner at `:759-762` is an unnamed `<p>`
whose class string is **byte-identical** to the path-level `mutationError` banner
at `:596`, so a locator for one matches the other. This is exactly the trap
test-plan §6.7 item 1 records — "make the surface addressable in production code,
not in the test" — and the accepted fix shape is the one Phase 4 used on the
comparer: a one-line `role="alert"` plus a distinguishing `aria-label`. That
production edit is **in scope here** and was only held out of the previous change
because it was a coverage phase that had declared no production edits.

S4 needs no production edit; the mode toggle already carries `aria-pressed` and
text names ("Full list" / "Changes").

### Open scope question — the plan must settle, do NOT treat as decided

`findings.md` F-4 argues against specing S4 at all: the mode toggle only renders
when `steps.length >= 1`, the asserted surfaces differ per mode, and — the real
objection — S4 is the finding most likely to **disappear entirely** under the F-5
shared-guard refactor, so a spec written now may be testing a structure about to
be deleted.

The plan must take a position rather than inherit one. Three live options:

1. Spec both S3 and S4 as planned.
2. Spec S3 only; leave S4 filed until the F-5 refactor decides the structure.
3. Do the **F-5 refactor first** (extract one guarded-async helper covering
   `DeckComparer.runPlan` plus `PathEditor`'s six flows), which retires F-1
   through F-5 together — and turns this change from coverage into repair, with
   the two existing `test.fail()` specs flipping to real regression tests.

Option 3 is the one `findings.md` F-5 actually recommends, and it changes what
this change *is*. Settle it before planning phases.

### Harness note — already built, do not re-litigate

The authenticated browser harness this needs exists and is documented:
`tests/e2e/global-setup.ts`, `tests/e2e/dev-vars.mjs`, the `setup` project +
`storageState`, and `tests/e2e/fixtures/auth.ts`. The recipe is test-plan §6.7
items 16–24. Both new specs belong in the existing
`tests/e2e/path-builder-stale-ordering.spec.ts` alongside S1 and S2, which
already carry the shared `beforeEach` / `afterEach` and the `adoptSession` helper.

Prerequisite for any run: `npx supabase start` plus `.env.test`. Never run
`npm run test:integration` and `npm run test:e2e` concurrently — they share
`.dev.vars`.

## Epilogue — closed 2026-09-06

**The open scope question above is answered: option 1, spec both.** S3 and S4 are in
`tests/e2e/path-builder-stale-ordering.spec.ts`, both `test.fail()`, and
`npm run test:e2e` reports four expected failures with zero unexpected ones. The F-5
shared-guard refactor is recorded as this change's **designated successor** in
`findings.md`, not folded into it.

The argument for that ordering, in one line: the refactor's own regression net is these
findings' specs, so it should run over **four** pins rather than two. F-3 and F-4 are
precisely the sites whose guard *mechanism* the refactor changes most — one writes an atom
a different counter owns, the other resets three atoms and owns no counter at all. Four
inverted specs are a specification of what the shared helper must do, written before the
helper exists, each naming a distinct invalidation site (`onChange`, the add success block,
a Check's catch, `switchMode`). Under two, half of that specification would have been prose.

Option 3 — refactor first — was declined for the same reason, not on effort. It would have
turned this change from coverage into repair with only S1 and S2 underneath it. Option 2 —
S3 only — was declined because the archived objection it rests on does not hold: see the
second correction below.

**The two `findings.md` corrections that came out of settling it.** Both were found while
establishing that the specs were writable at all, and both changed what a spec asserts —
which is why they are recorded in `context/foundation/lessons.md` (append-only, and the
archived source is immutable) rather than left in a change folder:

1. **F-3's mechanism.** The filed wording says the add-error banner is written "by whichever
   Check throws, **superseded or not**". Both catches *do* re-check `checkToken`
   (`PathEditor.tsx:335`, `:363`), and the Check button is disabled while a Check is in
   flight (`:792-797`), so the Check-versus-Check overlap that wording implies is both
   correctly dropped and undrivable through the UI. The defect is a write **guarded by the
   wrong counter** — the target is `addState`, and only `addToken` (`:189`) guards it. S3
   therefore drives Check-versus-**add**.
2. **F-4's stated impact, and its deferral reason.** The filed impact — "a full-list verdict
   under the diff-mode textarea" — is impossible: both previews are mode-gated (`:733`,
   `:745`). The observable defect needs a mode **round trip**, both switches landing before
   the release. And the deferral reason ("a faithful spec needs a second seeded shape",
   because the toggle requires `steps.length >= 1`) is stale — `seedPathWithStep` already
   seeds exactly one step, so `canDiff` (`:196`) is true on the shape S1 and S2 were already
   using. That is what removed the case for option 2.

**One production edit shipped**, held out of the predecessor change and in scope here as
stated above: `role="alert"` plus a distinguishing `aria-label` on **both** of
`PathEditor`'s byte-identical error banners — "Path error" (`:602-608`) and "Checkpoint
error" (`:777-783`). Naming both rather than only the one S3 needed is deliberate: F-3's own
recommended fix adds a third error banner to this surface, which would silently break a
locator relying on `role="alert"` being unique.

**Carried forward with no spec**: F-5 (three unguarded mutation flows) and F-6 (non-empty
text parsing to zero cards renders the success verdict), both re-verified against
post-Phase-1 line numbers in this folder's `findings.md`. F-6 is routed to the unit layer and
needs no browser.

Three items were added to test-plan §6.7 (25–27: release-as-failure on a parked route, the
mode-gating constraint on an observation window, and the two-identical-banners case), and
item 22's `findings.md` reference now names F-1 through F-4 and the four inverted specs.
