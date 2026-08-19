---
change_id: testing-api-contract-pinning
title: API contract pinning + engine golden output (test-plan rollout Phase 2)
status: implementing
created: 2026-08-11
updated: 2026-08-19
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

Research landed 2026-08-12 (`research.md`) and the plan landed 2026-08-13 (`plan.md` +
`plan-brief.md`): 5 phases, production-first. The plan carries a **decided-contract table** that is
the oracle every assertion cites — `documented` where the archived design docs speak,
`decided` where they are silent — so no assertion is mirrored from a handler's current output.

Sixteen decisions were settled during planning; the load-bearing ones:

- **Types + tests, not tests alone.** A new types-only `src/lib/api/contract.ts` plus an explicitly
  parameterized `jsonResponse<T>` turns four of research's ranked seams into `tsc` errors. This
  required a discovery the plan acts on: **nothing typechecks in CI today** — ESLint doesn't report
  assignability errors and `astro build` doesn't typecheck — so `astro check` is wired into `ci` or
  the type layer gates nothing.
- **Two contract holes get fixed** (the 500 body's raw `PostgrestError.message` leak, the missing
  `[id]` UUID validation that produces those 500s); three are filed as findings. Redacting the 500
  body would silently destroy Phase 1's "never assert a bare status code" diagnosis rule, because
  `global-setup.ts` captures the dev-server log and prints it only on boot failure — so the
  log-surfacing change lands with the redaction.
- **Multiset, not byte, equality** for "diff-mode ≡ full paste". The archived promise is stronger
  than the code. The live copy of the claim is `src/lib/path/derive.ts:6` and gets corrected; the two
  archived copies are immutable and stand superseded (recorded in test-plan §6.6).
- **Goldens use `toMatchSnapshot`** (user's call over hand-authored literals), guarded by PR review of
  the first recording, committed `.snap` files, and CI's refusal to write missing snapshots.
- **No branch-protection change.** Contract suites use the `.int.test.ts` infix so they ride the
  already-required `integration` job; goldens ride `ci` via `npm test`.

Next: `/10x-implement testing-api-contract-pinning phase 1`.
