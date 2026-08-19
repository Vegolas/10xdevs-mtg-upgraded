<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: API Contract Pinning + Engine Golden Output

- **Plan**: `context/changes/testing-api-contract-pinning/plan.md`
- **Scope**: All 5 phases (full plan)
- **Date**: 2026-08-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
| --- | --- |
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

All 27 planned changes across phases 1–4 verified MATCH — no DRIFT, no MISSING. Automated
criteria pass on the merged tree: `npm test` 180 passed / 1 skipped (a pre-existing
live-network test), zero snapshot churn, both `.snap` files git-tracked, every registry row
resolves to a real file and export, `ci` + `integration` green on PR #6.

The golden output was hand-verified rather than trusted: Mountain 8→5 splits across
`remove` 3 / `shared` 5; Sol Ring 1→1 appears in `shared` only and in neither `add` nor
`remove`; the creature `add` group sorts Anafenza/Meren/Zurgo from a Zurgo→Meren→Anafenza
fixture order; and `planAddCost` totals `$27.25` from 4×0.50 + 1×2.50 + 2×4.75 + 3×0.25 +
1×12.50 with Zurgo null-priced giving `missingCount: 1`, `pricedCount: 5`. The
binary-fraction price discipline produced a clean decimal exactly as criterion 3.8 required.

## Findings

### F1 — test-plan §3 rollout row never advanced to `complete`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/test-plan.md` §3, Phase 2 row
- **Detail**: Phase 4 item 6 required the row's Status to reach `complete`. It still read
  `implementing` after all 5 phases landed and merged. No Phase 4 success criterion covered
  the item — Changes Required listed it, Success Criteria did not check it, so it slipped.
- **Fix**: Flip the §3 Phase 2 row Status to `complete`.
- **Decision**: FIXED

### F2 — Ticked criterion 2.6 counts five contract suites; only four exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `plan.md:497`, Progress row 2.6 (`plan.md:864`)
- **Detail**: Both lines said "the five new `contract-*.int.test.ts` files". Phase 2's
  Changes Required defines exactly four suites (paths, steps, page-agreement, signin) and
  four exist; the integration run reports 9 files = 5 pre-existing + 4 new. The criterion was
  unsatisfiable as written and was marked `[x] — 6fedd2b`. The suites themselves are fine;
  what was wrong is the evidence trail — a Progress row asserting a count never achievable.
- **Fix**: Correct both lines to "four".
- **Decision**: FIXED

### F3 — `null as T` reintroduces the unchecked cast client.ts exists to remove

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/api/client.ts:84`, consumed at `src/components/path/PathEditor.tsx:451`
- **Detail**: An empty body yields `{ ok: true, data: null as T }` — unchecked in exactly the
  way the module's docstring criticizes. `handleRename` calls `requestJson<UpgradePath>` and
  dereferences `result.data.title` with no null check, so a route that started answering 204
  would throw a TypeError at the call site rather than surfacing a typed failure. What
  guards it is `contract-paths.int.test.ts` pinning PATCH → 200 + `UpgradePath`: a test, not
  the compiler. Nothing is broken today; the 204 delete call sites correctly use
  `requestJson<null>`.
- **Fix A ⭐ Recommended**: Leave the runtime behavior; record the coupling in code.
  - Strength: Costs nothing, and the guarding test sits in a required job. Consistent with
    the plan's own stance that some seams are cheaper to pin than to type.
  - Tradeoff: The escape hatch stays; a route that switches to 204 breaks at a call site,
    not at `tsc`.
  - Confidence: HIGH — the guarding test exists and is required.
  - Blind spot: Have not checked whether any roadmap slice plans a body→204 switch.
- **Fix B**: Return a transport-style failure when a non-null `T` gets an empty body.
  - Strength: Closes the hole at the source; call sites already branch on `!result.ok`.
  - Tradeoff: TS cannot distinguish `T = null` at runtime, so it needs an opt-in flag or a
    separate `requestNoContent()` helper — an API change to a seam that just landed.
  - Confidence: MEDIUM — mechanically simple but re-opens finished work.
  - Blind spot: Would need the two 204 delete sites re-verified.
- **Decision**: FIXED via Fix A — coupling recorded as a comment at the empty-body branch,
  naming the guarding test and the rule (redeclare a route as no-content → change its call
  site to `requestJson<null>` in the same commit).

### F4 — Two files changed outside any phase's Changes Required

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `tests/integration/helpers/http.ts`, `tests/integration/ownership-steps.int.test.ts`
- **Detail**: Neither appears in a Changes Required list, but both are forced consequences of
  planned work rather than scope creep. `http.ts` is a docstring-only fix — its claim that
  500s carry a Postgres message became false when Phase 1 redacted them, and the new text
  documents the two-step `ref` → server-log diagnosis path. `ownership-steps.int.test.ts` is
  one line, forced by Phase 2 item 7 changing `addStep`'s return type from `string` to
  `PathStep`.
- **Fix**: None needed. Recorded so the plan-to-diff mapping reads clean in the archive:
  a plan that changes a helper's signature should list its call sites.
- **Decision**: NO ACTION — benign, correctly scoped
