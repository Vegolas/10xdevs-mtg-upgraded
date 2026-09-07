---
change_id: shared-stale-response-guard
title: Extract one guarded-async helper and retire the five hand-copied stale-response guards
status: implementing
created: 2026-09-06
updated: 2026-09-07
archived_at: null
---

## Notes

The designated successor to `testing-path-builder-error-and-mode`, named as such in
`context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md` under F-5.
This is **repair**, not coverage — the first change in this chain that fixes rather than
pins.

### What it retires

Extract one guarded-async helper and route `DeckComparer.runPlan` plus `PathEditor`'s six
flows through it. That retires **F-1 through F-5** together, which is why none of the five
was worth a spot fix:

- **F-1** — the path builder's textarea `onChange` (`PathEditor.tsx:720-722`) invalidates
  nothing; a Check in flight when the box is edited or cleared still writes its verdict.
- **F-2** — `handleAddStep`'s success block resets `checkState` / `diffPreview` (`:314-315`)
  under `addToken`, but only `checkToken` guards those atoms.
- **F-3** — both Check catches (`:334-341`, `:362-369`) write `addState` under a
  `checkToken` guard; `addToken` (`:189`) is what owns that atom.
- **F-4** — `switchMode` (`:376-382`) resets three atoms and advances neither counter.
- **F-5** — `handleDeleteLast` (`:433-445`), `handleRename` (`:447-467`) and
  `handleDeletePath` (`:469-480`) carry no guard at all.

### The regression net already exists

Four `test.fail()` specs in `tests/e2e/path-builder-stale-ordering.spec.ts` pin F-1 through
F-4, each naming a distinct invalidation site (`onChange`, the add success block, a Check's
catch, `switchMode`). They are a written specification of what the shared helper must do,
authored before the helper exists.

**Success condition**: all four report `Expected to fail, but passed.`, and their
`test.fail()` annotations come off in one commit. A refactor that leaves any of them still
failing has not done the job. See `context/foundation/test-plan.md` §6.7 item 22 and
`context/foundation/lessons.md`, "Pin a live defect with `test.fail()`".

### The standing review obligation this change discharges

`lessons.md`, "Treat the stale-response guard as five hand copies, not one pattern", records
four verified ways the copies have already drifted: checkpoint count differs per flow; two
counters unevenly shared; the error path guarded by different means in each component; and
the Check flows writing an atom their token does not guard. Its rule — "never reason about
one of these five sites from another, and never let a review accept 'mirrors X' as evidence"
— is the reason this needs `/10x-research` before a plan. All five (six, counting
`DeckComparer`) must be re-read, not inferred from each other.

### Known harness cost — do not assume this is cheap

F-5's three flows call `requestJson` against the app's **own** `/api/paths/*`. Every fixture
in `tests/e2e/fixtures/scryfall.ts` routes `https://api.scryfall.com/**` and nothing else;
`tests/e2e/fixtures/auth.ts` only *calls* the app API for seeding and never intercepts it.
So browser coverage for F-5 needs a **new parked-route fixture for the app's own API**. That
is Phase-1-style harness work, and it is exactly the false cheapness premise test-plan §8
already records from risk #9 — read that entry before estimating.

Decision taken when this change was opened: F-5's own regression specs are written **green**,
against the repaired behavior, inside this change — not as `test.fail()` pins beforehand. The
four-pins argument does not extend to F-5, because those flows have no guard to specify;
the refactor's job there is to add one.

### Scope boundary

**F-6 is not in scope.** Non-empty text parsing to zero cards rendering "✓ All cards
resolved." (`PathEditor.tsx:322`, `:216`, verdict at `:741`) is a validation gap, not an
ordering one, and routes to the unit layer (`src/lib/deck/parse.test.ts`). It needs no
browser and no shared guard.

**Test-plan question this change must settle, not inherit.** §2 has no risk row covering
F-5's failure (a rendered step list disagreeing with the server after a mutation) — risk #9
is specifically about *pre-save* surfaces. §7 scopes browser E2E to "two phases and no
further". If this change wants browser coverage for F-5, it must either argue admissibility
in its own plan or route the decision to `/10x-test-plan --refresh`. Also note risk #9's row
carries two stale cells, recorded in test-plan §8 as owed corrections; if this change flips
#9 to protected, they should be fixed in the same pass.

### Resolved by the plan (2026-09-06)

**The open test-plan question is answered: this change takes the edits itself, and F-5 gets a
row of its own.** Browser coverage for F-5 is admissible on §7's own test — the divergence
exists nowhere but the rendered result, and there is no component-render layer that could see
it — and it adds no §3 phase and no CI job, so §7's "two phases and no further" is untouched.
It enters §2 as a **new risk #10**, append-only, rather than by widening #9's frozen cell.
Risk #9 itself moves to the protected table, which supersedes both owed corrections rather
than carrying them a third time. No `backport.md` is written.

**Three claims in the upstream record did not survive the planning pass**, and all three
change what gets built. F-5's stated symptom is wrong — two rapid deletes produce two server
deletes, not one, and the reachable divergence is a false error banner. F-5's implied fix is
worse than the defect: a latest-wins token on `handleDeleteLast` drops the successful 204 and
keeps the 404's error, leaving a step rendered against a server holding zero. And the four
pins are necessary but not sufficient — S2 and S3 both edit the textarea before adding, so a
two-line `onChange` bump flips all four while F-3's actual defect stays reachable. The plan
carries the evidence for each.

**An eighth site was found**: `NewPathForm.handleSubmit` (`:21-46`) reads `pending` before its
await, so two clicks in one tick both fire. It is in scope for the refactor and is recorded in
this change's `findings.md`.
