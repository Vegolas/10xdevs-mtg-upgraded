<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Comparer Failure-Surfacing E2E

- **Plan**: `context/changes/testing-comparer-failure-surfacing/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-28
- **Verdict**: REVISE → **SOUND** after triage (4 of 5 findings fixed)
- **Findings**: 2 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict | After fixes |
|-----------|---------|-------------|
| End-State Alignment | FAIL | PASS (F1 fixed; F5 skipped, non-blocking) |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING | PASS (F2 fixed) |
| Plan Completeness | WARNING | PASS (F3, F4 fixed) |

## Grounding

7/7 existing paths ✓, 7/7 symbols ✓, brief↔plan ⚠ (shared "three tests" error — F3, fixed).
Progress↔Phase: 5/5 phases matched, 35/35 criteria mapped, no stray checkboxes outside `## Progress` ✓.
Contract surfaces: all 5 H2 names in `docs/reference/contract-surfaces.md` grepped against the
plan, 0 hits — no registered surface is touched. The plan modifies `DeckComparer.tsx` and
`UnresolvedNotice.tsx` (accessibility semantics only); the fixture pins Scryfall's *external*
wire shape, not the `Card` / `ResolutionResult` module surfaces the registry documents.

## Findings

### F1 — Phase 3's overlap sequence never reaches the guard

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — the 7-step sequence, steps 6–7
- **Detail**: Run A parks on its base deck's POST, but `plan.ts:95-96` awaits base then
  target sequentially — so releasing A's base POST immediately issues A's *target* POST,
  which the original sequence never mentioned. The token comparison at
  `DeckComparer.tsx:73` runs only after `generateUpgradePlan` returns. If the fixture
  doesn't fulfil A's target request, that promise never settles, `:73` is never reached,
  and step 7's "plan B survived" passes trivially — risk #8's own named anti-pattern in a
  new costume.
- **Fix**: Fixture fulfils both of run A's requests; step 6 anchors on A's *second*
  (target) response; step 7 first asserts A's target POST was issued, so a never-settling
  promise cannot masquerade as a working guard. Deck A's own base and target halves must
  also not share names, or the target resolution is served from the session cache and no
  second POST fires.
  - Strength: Restores the only thing the spec exists to exercise.
  - Tradeoff: A slightly more elaborate fixture — selective parking rather than parking all.
  - Confidence: HIGH — verified against `plan.ts:95-96` and the post-await token check.
  - Blind spot: None significant after the deck-overlap constraint was added.
- **Decision**: FIXED

### F2 — Run 2's break orphans two imports; the lint warning sat on Run 1

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 5 — Run 2 contract
- **Detail**: Removing `DeckComparer.tsx:216-233` orphans `RotateCw` (imported `:2`, used
  only at `:229`) and `Button` (imported `:5`, used only at `:220`) — both verified by
  grep. `@typescript-eslint/no-unused-vars` is an error and `ci` runs `lint` before
  `typecheck`, so the job dies at lint and Run 2's "`ci` and `integration` green" criterion
  fails for the wrong reason. This is Phase 2's orphaned-`toPathStep` lesson reproduced
  exactly; the plan carried the rule in Critical Implementation Details but attached it to
  Run 1's contract, which inverts one comparison and orphans nothing.
- **Fix**: Moved the lint-clean instruction to Run 2 and named both imports explicitly.
- **Decision**: FIXED

### F3 — "Three tests" is four

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `plan.md:54`, `plan.md:681`, `plan-brief.md:28`
- **Detail**: Seed (1) + risk #7 (2) + risk #8 (1) = four tests across three spec files.
  All three places said "three tests" — the count had been taken from the file list.
- **Fix**: "four tests across three spec files" in all three places.
- **Decision**: FIXED

### F4 — Phase 2 Test 1 didn't say which POST fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Test 1 contract
- **Detail**: The contract said "induce the failure with `route.fulfill({status:500})`"
  without specifying whether the handler 500s all POSTs or only the target deck's — and
  that choice fully determines the session-cache caveat in the same paragraph. Failing the
  *first* POST means `fetchCardCollection` throws before the cache write at
  `resolve.ts:181`, so nothing was ever cached and Retry re-requests everything.
- **Fix**: Pinned the failure to the first POST, explained why that keeps recovery simple,
  and removed the now-inapplicable cache caveat from the Retry sentence.
- **Decision**: FIXED

### F5 — "Invert or delete" the guard aren't equivalent breaks

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 5 — Run 1 contract
- **Detail**: Inverting `:73` drops the *newest* run, so plan B never renders and the spec
  fails at step 5 — red, but reproducing a different bug than the risk. Deleting the
  comparison lets the stale run write over the newer one, which is risk #8 exactly, and
  fails at step 7. Only the second produces the attribution §6.6 will record.
- **Fix**: Specify delete, not "invert or delete".
- **Decision**: SKIPPED — either break goes red; the choice is left open for the implementer.

## Considered and not raised

- **Phase 4 bundling the gate with six document updates** is correct, not bloat: §5's e2e
  row can only be flipped after the branch-protection PATCH it depends on, so splitting
  them would separate a claim from its evidence.
- **Phase 1 running `npm run test:integration`** costs ~3.5 min for near-zero signal (the
  suite is API-level; the phase's only production change is component accessibility), but a
  component file does change, so the check is defensible.
