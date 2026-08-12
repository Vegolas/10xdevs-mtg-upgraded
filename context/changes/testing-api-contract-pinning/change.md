---
change_id: testing-api-contract-pinning
title: API contract pinning + engine golden output (test-plan rollout Phase 2)
status: new
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

Rollout Phase 2 of context/foundation/test-plan.md §3: "API contract pinning". Opened
2026-08-11, immediately after Phase 1 (`testing-server-boundary-auth`) archived.

Risks covered: #3 (a handler's request/response contract changes and a stale caller still
references the old shape — a path-builder flow breaks silently) and #6 (the preserved
full-paste add flow, or the resolve/diff/cost engine, regresses behind the additive
diff-mode change). Both are Medium × Medium; this phase is sequenced second because it
hardens the churny `/api/paths/*` surface the team changes without confidence
(interview Q3) and freezes the shapes Phase 3's derive-to-persist tests will assert against.

Test types planned: contract + integration + golden.

Risk response intent (from test-plan §2 Risk Response Guidance):

- #3: prove a change to a handler's shape makes a stale caller's test fail **loudly**
  rather than silently breaking the flow. Challenge "all callers get updated together with
  the handler". Research must ground the request/response contract of each `/api/paths/*`
  route **and who consumes it**. Anti-pattern to avoid: mirroring the handler's *current*
  output as the expected value — that pins the bug, not the contract (oracle problem).
- #6: prove the engine's golden output is unchanged and a full-paste add still produces an
  identical snapshot after the diff-mode change. Challenge "an additive change cannot touch
  the preserved path". Anti-pattern to avoid: duplicating the existing strong unit suite
  instead of pinning the engine output and the add-flow seam.

Starting context this phase inherits from Phase 1 — reuse, don't rebuild:

- A working DB-backed harness: `tests/integration/**/*.int.test.ts` +
  `vitest.integration.config.ts` + `npm run test:integration`, real HTTP through a
  `globalSetup`-spawned `astro dev` against local Supabase with RLS live. Recipe in
  test-plan §6.2; contract tests should decide deliberately whether they need that harness
  or a cheaper seam.
- CI enforces it: `main` has required status checks `ci` + `integration` with
  `enforce_admins`, verified by a regression PR. So a new suite is only a gate once its job
  is in that required list — and every change to `main`, docs included, goes through a PR.
- `docs/reference/contract-surfaces.md` is the existing load-bearing-names registry — check
  it before inventing new contract vocabulary, and update it if this phase adds any.
- test-plan §6.3 ("Adding a contract test for `/api/paths/*`") is still a TBD stub; filling
  it is part of this phase's cookbook duty, as §6.2 was for Phase 1.

Two durable rules Phase 1 produced that apply directly here: **never assert a bare status
code** (route through `tests/integration/helpers/http.ts#assertStatus`, which puts the
response body in the failure message), and **a suite that goes red is not a gate** — run the
deliberate-break check as a PR, not locally.

Next: `/10x-research testing-api-contract-pinning` — the contract surface and its consumers
need grounding before a plan can name what to pin.
