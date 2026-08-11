# Server-boundary auth & ownership tests — Plan Brief

> Full plan: `context/changes/testing-server-boundary-auth/plan.md`
> Research: `context/changes/testing-server-boundary-auth/research.md`

## What & Why

Phase 1 of the test-plan rollout. Build a local-Supabase integration harness and use it to
prove the two highest-priority server-boundary risks: **#1** a signed-in user can never read
or mutate another owner's path through `/api/paths/*` (cross-owner / IDOR), and **#2** no-/
invalid-session requests are rejected while a valid owner still gets through. Then wire the
suite into CI so it actually gates PRs. This is the only High × High risk in the test plan —
a lived cross-tenant incident on the most-churned untested boundary.

## Starting Point

Authorization is enforced **100% by Postgres RLS** through one cookie-bound anon-key client;
no handler filters by `owner_id`. Denial shows up as a 404 (single) or filtered 200 (list),
never 403. `path_steps` has no `owner_id` (transitive `EXISTS` protection — the IDOR seam).
The auth gate is two code paths: middleware redirects pages, `requireUser` 401s the API. CI
runs lint→build only; `npm test` is a fast, DB-free 20-file unit suite.

## Desired End State

`npm run test:integration` boots local Supabase + a dev server, seeds two real owners, drives
real HTTP requests, and proves cross-owner denial (with DB-state checks on step routes) and
the signed-out/invalid gate — all green and re-runnable. `npm test` stays fast and DB-free.
CI runs the unit suite (between lint and build) and a separate integration step that boots
Supabase, gating PRs. The test-plan §6.2 cookbook documents the recipe.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| CI integration strategy | Separate job + Supabase in CI | Honors test-plan §5 "integration required after Phase 1" so leaks are caught in CI, not just locally | Plan |
| Harness seam | Real HTTP via `astro dev` server | Only seam that runs middleware (getUser) + requireUser + RLS end-to-end with nothing mocked | Plan |
| Two-owner seeding | service-role `createUser` + sign-in | Yields genuine GoTrue sessions/cookies; compatible with the real-HTTP seam | Plan |
| Cookie acquisition | POST the app's own `/api/auth/signin` | Emits cookies in the exact `@supabase/ssr` format — no manual formatting | Plan |
| Test config | Separate Vitest project/config | Keeps unit suite fast & DB-free; integration gets env + serialization | Plan |
| Route scope | All 5 bypass-prone targets + gate matrix | Covers every read/write seam a cross-owner leak could appear in | Plan |
| Auth-negative depth | No-session + invalid-token + valid owner | Covers all three legs of risk #2; invalid token is the faithful expired proxy | Plan |
| Env / secrets | `.env.test` (gitignored) from `supabase status` | Secrets stay out of git; one source for local + CI; service-role used only in setup | Plan |
| Seed data | No `seed.sql`; seed in test setup | Matches independence + cleanup rule; no shared mutable base to drift | Plan |

## Scope

**In scope:** integration harness (env, separate config, dev-server lifecycle, two-owner
seeding, cookie acquisition, cleanup); cross-owner/IDOR suite across all `/api/paths/*` routes
with DB-state assertions on step routes; auth-gate suite (pages 302, API 401, valid owner
through); CI wiring (unit + integration); test-plan §6.2 cookbook.

**Out of scope:** contract tests (Phase 2), derive-to-persist (Phase 3), frontend/component,
browser/E2E, pixel tests; re-testing the pure-logic engine; asserting policy SQL; real
time-expired tokens; a `seed.sql`.

## Architecture / Approach

A separate Vitest integration project loads `.env.test` (local Supabase URL + anon + service-
role). Its `globalSetup` spawns `astro dev` pointed at local Supabase, waits for readiness,
tears it down after. Per-suite setup seeds Owners A/B via the service-role admin API and gets
each one's real cookies by POSTing to `/api/auth/signin` (no-follow redirect). Tests issue
`fetch` calls with the right/absent/garbage cookies and assert status + body row-absence;
step-route tests read back DB state with a service-role client to prove no write leaked. CI
boots Supabase before `test:integration`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness foundation | Env, separate config, dev-server lifecycle, seeding, cookies, cleanup, smoke test | Dev-server lifecycle / cookie reassembly across chunked `sb-*` cookies |
| 2. Risk #1 — IDOR suite | Cross-owner denial across all routes; DB-state on step routes | Tautological oracle; asserting status instead of DB state |
| 3. Risk #2 — gate suite | No-session + invalid-token on pages (302) and API (401); valid owner through | Misconfigured env bouncing everyone (false pass on the negative case) |
| 4. CI wiring + cookbook | `npm test` in CI + integration step booting Supabase; §6.2 recipe | Supabase startup in CI; sourcing service-role key without committing it |

**Prerequisites:** local Supabase (`supabase ^2.108.0` devDep already present); a populated
`.env.test`; `npm ci`.
**Estimated effort:** ~3-4 sessions across 4 phases (harness is the heaviest; the two suites
are fast once it exists).

## Open Risks & Assumptions

- `astro dev` runs the real middleware regardless of the Cloudflare build adapter (assumed;
  validated by the Phase 1 smoke test before any suite is written).
- CI Supabase startup adds minutes to the pipeline — acceptable for the gate it provides.
- Invalid-token is a faithful proxy for expired (both collapse to identical behavior); a truly
  time-expired token is deliberately not minted.

## Success Criteria (Summary)

- Owner A is denied B's path on every read/write route, and no mutation leaks into B's rows.
- No-/invalid-session is rejected (302 pages / 401 API); a valid owner still gets through.
- CI runs unit + integration and blocks a PR carrying a deliberate cross-owner regression.
