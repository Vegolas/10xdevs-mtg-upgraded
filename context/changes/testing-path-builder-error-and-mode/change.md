---
change_id: testing-path-builder-error-and-mode
title: Prove the path builder's error banner and mode switch drop superseded resolves
status: implementing
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
