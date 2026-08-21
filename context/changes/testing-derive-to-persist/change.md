---
change_id: testing-derive-to-persist
title: Derive-to-persist correctness (test-plan rollout Phase 3)
status: implemented
created: 2026-08-19
updated: 2026-08-21
archived_at: null
---

## Notes

Rollout Phase 3 of context/foundation/test-plan.md §3: "Derive-to-persist correctness" —
the last phase of the logic-boundary rollout. Opened 2026-08-19, the day Phase 2
(`testing-api-contract-pinning`) archived. Goal: prove the persisted snapshot equals
`prior ± delta`, and that unapplicable/unresolved lines are flagged, not silently dropped.

Risks covered: #4 (a diff-mode checkpoint persists a list that does not equal `prior frozen
list ± delta`, silently corrupting an immutable saved step) and #5 (an unapplicable delta —
`− card` absent from the prior list — or an unresolved `+ card` is silently dropped at persist
instead of being flagged before save). Both High × Medium, both anchored in prd-v3
(§Guardrails, FR-003/US-02) rather than in a lived incident, and both sitting on the
most-churned logic dirs (`src/lib/path` 23 commits/30d, `src/lib/card-data` 23). Sequenced
last because it closes the correctness guardrail on the newest feature (diff-mode derive),
against contracts Phase 2 already froze.

Test types planned: integration.

Risk response intent (from test-plan §2 Risk Response Guidance):

- **#4**: prove the persisted list equals an **independently constructed** `prior ± delta`,
  verified through the POST→persist path — not just the pure function. Challenge "the derive
  logic is unit-tested, so the wired flow must be correct too". Research must ground the
  derive→resolve→persist seam and the frozen prior-snapshot source the delta reads from.
  Anti-pattern to avoid: building the "expected" list by calling the same derive function
  under test — a tautological oracle.
- **#5**: prove an unapplicable or unresolved line **blocks-or-flags** the save and that the
  wrong snapshot is never persisted. Challenge "no error returned ⇒ everything
  resolved/applied". Research must ground where the surfacing/rejection happens before
  persist, and how `− not present` differs from `+ unresolved`. Anti-pattern to avoid:
  happy-path-only, and asserting the *absence* of an error rather than the *presence* of the
  flag/rejection.

Starting context this phase inherits — reuse, don't rebuild:

- The DB-backed harness from Phase 1: `tests/integration/**/*.int.test.ts` +
  `vitest.integration.config.ts` + `npm run test:integration`, real HTTP through a
  `globalSetup`-spawned `astro dev` against local Supabase with RLS live (recipe: test-plan
  §6.2). This phase's tests are integration by design, so this is the harness — the open
  question is which seam they enter at, not whether to build a new rig.
- The frozen wire contracts from Phase 2: `src/lib/api/contract.ts`, the explicitly
  parameterized `jsonResponse<T>` / `requestJson<T>`, and the `contract-*.int.test.ts`
  suites. The shapes this phase asserts against are already pinned; do not re-pin them.
- The engine goldens from Phase 2, which establish that diff-mode ≡ full paste is
  **multiset** equality, not byte equality (`src/lib/path/derive.ts` docstring corrected;
  the two archived "byte-equivalent" copies stand superseded — cite test-plan §6.6, not
  them). Any "equals `prior ± delta`" assertion here must use the same multiset semantics.
- CI: `main` requires `ci` + `integration` with `enforce_admins`. Per Phase 2's cheap-gate
  lesson, **pick a filename that lands the suite in one of those two jobs before inventing
  a job** — `.int.test.ts` rides `integration`, `src/**/*.test.ts` rides `ci`. §5's
  "derive-to-persist integration" row becomes required when this phase lands.
- Durable rules from earlier phases that apply directly: never assert a bare status code
  (route through `tests/integration/helpers/http.ts#assertStatus`); a suite that goes red is
  not a gate until a **PR** shows it blocking; "the types will catch it" is a claim about a CI
  step, not about the types; a layered asserter reports its outermost violated rule, so a
  rule you want named in the log must fail first or be reached by a narrow enough break;
  and a deliberate break must be lint-clean or it measures the wrong gate.
- `docs/reference/contract-surfaces.md` is the load-bearing-names registry — check it before
  inventing vocabulary for the derive/persist seam, and update it if this phase adds any.
- test-plan §6.4 ("Adding a derive-to-persist correctness test") is still a TBD stub; filling
  it is this phase's cookbook duty, as §6.2 was for Phase 1 and §6.3 for Phase 2.

Scope boundary:

- **In**: integration coverage of the derive→resolve→persist path for risks #4 and #5;
  making the §5 "derive-to-persist integration" gate actually required; filling test-plan
  §6.4 and appending a §6.6 note.
- **Out**: browser-level E2E and frontend/component or pixel tests — deliberately deferred
  per test-plan §7, and only re-evaluated *after* this phase closes the logic boundary.
  Re-testing the pure-logic engine (`deck/diff`, `deck/plan`, `path/derive` internals) is
  also out: the 20-file unit suite plus Phase 2's goldens already cover it, so this phase
  tests the **wiring**, not the derivation. Re-pinning Phase 2's contracts is out. Risks #1,
  #2, #3, #6 are closed by Phases 1–2 and are not re-opened here.
