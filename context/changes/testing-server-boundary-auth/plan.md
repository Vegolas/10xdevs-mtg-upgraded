# Server-boundary auth & ownership tests (test-plan rollout Phase 1) — Implementation Plan

## Overview

Build a local-Supabase integration test harness that drives **real HTTP** through a
running `astro dev` server, then use it to prove the two highest-priority server-boundary
risks from [test-plan.md](context/foundation/test-plan.md) §2:

- **Risk #1 (cross-owner / IDOR):** a signed-in user can never read or mutate another
  owner's path through any `/api/paths/*` route.
- **Risk #2 (auth gate):** no-session and invalid-session requests are rejected (pages
  redirect, API 401), while a valid owner still gets through.

Finally, wire the suite into CI so it actually gates PRs (health-check Fix #1 plus the
test-plan §5 "integration required after Phase 1" gate).

## Current State Analysis

- **RLS is the sole authorization mechanism.** There is exactly one Supabase client
  ([src/lib/supabase.ts:6-25](src/lib/supabase.ts)) — a cookie-bound `createServerClient`
  using the **anon** key. No handler filters by `owner_id`; `auth.uid()` from the caller's
  JWT is the only owner scope. There is no application-level defense-in-depth, so the test
  **must** hit the real query path against real local Supabase with RLS on — a mock or a
  service-role client used for the *assertion* would invalidate the test.
- **Denial manifests as `404`** (single resource) or a **filtered `200`** (the list), never
  `403`. RLS makes other owners' rows invisible, so the handler can't distinguish "absent"
  from "not yours." Tests assert 404 + row-absence, not 403.
- **`path_steps` has no `owner_id`** — it is protected transitively via an `EXISTS` subquery
  on the parent path ([migration :61-78](supabase/migrations/20260626121519_user_accounts_paths.sql)).
  This is the classic IDOR seam. It is currently closed, but the two step routes
  ([steps.ts:13,83](src/pages/api/paths/[id]/steps.ts)) are the highest-value targets — a
  future too-broad policy could 404 the client while still mutating B's rows, so these
  tests must assert **DB state**, not just the HTTP code.
- **Two enforcement code paths, by design.** Middleware
  ([src/middleware.ts:21-23](src/middleware.ts)) *redirects* `/dashboard` and `/paths`
  (302 → `/auth/signin`); the API gate is a separate code path — `requireUser`
  ([src/lib/api/paths.ts:37-44](src/lib/api/paths.ts)) returns 401 JSON. `/api/paths/*` is
  deliberately not middleware-protected. They must be tested separately.
- **The real session check is one network call** (`supabase.auth.getUser()` in middleware).
  Everything downstream reads `context.locals.user`. Tests must drive real HTTP through the
  running server — there is nothing in-process to mock without bypassing the thing under test.
- **The signin route emits real cookies.** `POST /api/auth/signin`
  ([signin.ts:13-19](src/pages/api/auth/signin.ts)) takes form-encoded `email`/`password`,
  calls `signInWithPassword`, and the cookie-bound client emits `Set-Cookie` in the exact
  `@supabase/ssr` chunked format, then 302s to `/paths`. This is the faithful way to obtain
  owner cookies for the test — no manual cookie formatting.
- **CI cannot run these tests as-is.** [ci.yml](.github/workflows/ci.yml) runs lint→build
  with no Supabase/postgres service, and `npm test` globs `src/**/*.test.ts` (20 pure-logic
  files, DB-free). Adding DB integration tests to that glob would break CI.
- **Tooling already present.** Supabase CLI as a devDependency (`supabase ^2.108.0`),
  `db:reset` script, `@supabase/ssr`/`@supabase/supabase-js`. Local stack: API `54321`,
  DB `54322`, `enable_confirmations = false` (signups immediately usable). The existing
  [rls_paths.sql](supabase/tests/rls_paths.sql) proves the two-owner guarantee at the DB
  level — this plan proves it through the HTTP handlers.

## Desired End State

- `npm run test:integration` boots local Supabase + a dev server, seeds two owners, runs the
  cross-owner and auth-gate suites against real HTTP, and tears everything down — all green.
- A cross-owner regression (e.g. an `owner_id` filter dropped + an over-broad RLS policy) or
  a gate regression (e.g. a route removed from `PROTECTED_ROUTES`, or `requireUser` weakened)
  makes a test fail loudly.
- `npm test` stays fast and DB-free (unit only). CI runs the unit suite (between lint and
  build) **and** a separate integration step that boots Supabase and runs `test:integration`,
  gating PRs.
- The test-plan cookbook §6.2 is filled with the real harness recipe; statuses are bumped.

### Key Discoveries:

- Denial = 404 / filtered 200, never 403 — see [research.md](context/changes/testing-server-boundary-auth/research.md) §Summary.2.
- `path_steps` transitive protection is the IDOR seam — assert DB state on step routes.
- `astro dev` runs the real Astro middleware regardless of the Cloudflare *build* adapter, so
  a dev server is the cheapest seam that executes `getUser()` + `requireUser` end-to-end.
- `enable_confirmations = false` ([config.toml:209](supabase/config.toml)) means seeded users
  are immediately usable — no email-confirmation step needed.

## What We're NOT Doing

- **Not** re-testing the pure-logic engine (test-plan §7) — the 20-file unit suite owns it.
- **Not** asserting policy SQL (the named anti-pattern) — we exercise the live query path.
- **Not** building contract tests (Phase 2) or derive-to-persist tests (Phase 3).
- **Not** any frontend/component render, browser/E2E, or pixel tests (test-plan §7).
- **Not** minting a *truly time-expired* JWT — an invalid/garbage token is the faithful proxy
  since no-session and expired-session collapse to identical observable behavior.
- **Not** adding a `seed.sql` — tests self-seed with unique ids and clean up.
- **Not** using a service-role client for any *assertion* — service-role is setup/teardown only.

## Implementation Approach

A separate Vitest integration project loads `.env.test` (local Supabase URL + anon key +
service-role key), points the app env at local Supabase, and uses a `globalSetup` that
spawns `astro dev`, waits for readiness, and tears it down. Setup seeds two owners with the
service-role admin API, then obtains each owner's real session cookies by POSTing to the
app's own `/api/auth/signin`. The ownership suite (#1) and the gate suite (#2) then issue
plain `fetch` calls with the right (or absent/garbage) cookies and assert HTTP status, body
row-absence, and — for the step routes — DB state read back with a service-role client.
CI gains a `npm test` step (unit) and a separate integration step that boots Supabase before
running `test:integration`.

## Critical Implementation Details

- **Cookie acquisition must not follow redirects.** The `fetch` to `/api/auth/signin` must use
  `redirect: "manual"` so the 302 → `/paths` is not followed and the `Set-Cookie` headers are
  captured. Reassemble all `sb-*` cookies (including chunked `.0`/`.1`) into a single `Cookie`
  header string for replay on subsequent requests.
- **The dev server process needs the env, not just the test process.** `globalSetup` must spawn
  `astro dev` with `SUPABASE_URL`/`SUPABASE_KEY` injected into its environment (pointing at
  local Supabase `http://127.0.0.1:54321` + the local anon key), and wait until the port
  answers before tests run. The service-role key is used **only by the test process** for
  admin seeding/teardown and DB-state read-back — it is never given to the dev server.
- **Step-route IDOR tests must read back with a service-role client.** Because RLS hides B's
  rows from A, A's `fetch` can only see the 404; proving "no write leaked into B's path"
  requires a privileged read of `path_steps` under B's `path_id` after A's blocked request.
- **Serialize integration execution.** The suite shares one DB and one dev server; run with a
  single fork / `fileParallelism: false` and a raised timeout (server boot + network).

## Phase 1: Integration harness foundation

### Overview

Stand up everything needed to run a DB-backed integration test against real HTTP: env wiring,
a separate Vitest config, the dev-server lifecycle, two-owner seeding, cookie acquisition, and
cleanup — proven by a single smoke test.

### Changes Required:

#### 1. Test env template + gitignore

**File**: `.env.test.example` (new), `.gitignore`

**Intent**: Document the integration env contract without committing secrets. `.env.test`
itself stays gitignored; contributors copy the example and fill values from `supabase status`.

**Contract**: `.env.test.example` lists `SUPABASE_URL` (=`http://127.0.0.1:54321`),
`SUPABASE_KEY` (local anon key, placeholder), `SUPABASE_SERVICE_ROLE_KEY` (placeholder).
`.gitignore` already excludes `.env*` except `.env.example` — confirm `.env.test` is excluded
and `.env.test.example` is tracked.

#### 2. Separate Vitest integration config

**File**: `vitest.integration.config.ts` (new), `package.json`

**Intent**: Isolate DB-backed tests from the fast unit suite so `npm test` stays DB-free.

**Contract**: New config with the `@`→`src` alias, `environment: "node"`, an integration-only
`include` glob (e.g. `tests/integration/**/*.int.test.ts`), `globalSetup` pointing at the
dev-server lifecycle (change #3), env loading from `.env.test`, serialized execution
(single fork / `fileParallelism: false`), and a raised `testTimeout`. Add `package.json`
script `test:integration` → `vitest run --config vitest.integration.config.ts`. `npm test`
(`vitest run`) is unchanged and continues to glob only `src/**/*.test.ts`.

#### 3. Dev-server + Supabase lifecycle (globalSetup)

**File**: `tests/integration/global-setup.ts` (new)

**Intent**: Boot the app against local Supabase before the suite and tear it down after, so
every test issues real HTTP that runs real middleware + handlers + RLS.

**Contract**: Exported default `async function setup()` returning a teardown function (Vitest
globalSetup contract). It assumes local Supabase is already running (documented prerequisite;
CI boots it explicitly in Phase 4), spawns `astro dev` with the local `SUPABASE_URL`/
`SUPABASE_KEY` in its env, polls until the base URL answers, exposes the base URL to tests
(env var or provide/inject), and on teardown kills the dev-server process. No DB reset here —
tests self-clean (change #5).

#### 4. Two-owner seeding + cookie acquisition helpers

**File**: `tests/integration/helpers/owners.ts` (new)

**Intent**: Create two distinct owners and obtain each one's real session cookies through the
app's own auth path, so ownership and gate tests share one faithful setup.

**Contract**: A service-role `supabase-js` client (from `SUPABASE_SERVICE_ROLE_KEY`) exposed
for setup/teardown and DB-state read-back. `createOwner()` → `auth.admin.createUser({ email,
password, email_confirm: true })` with a unique timestamp-suffixed email. `signIn(baseUrl,
email, password)` → `fetch(POST /api/auth/signin)` with `redirect: "manual"` and a
form-encoded body, capturing `Set-Cookie` and reassembling all `sb-*` (incl. chunked) cookies
into a single `Cookie` header string. Returns `{ user, cookieHeader }` per owner.

#### 5. Cleanup helper

**File**: `tests/integration/helpers/cleanup.ts` (new)

**Intent**: Keep tests independent and re-runnable — each test/file removes the owners and
rows it created.

**Contract**: A service-role teardown that deletes the test owners by id
(`auth.admin.deleteUser`), relying on `on delete cascade` to drop their `upgrade_paths` and
`path_steps`. Invoked from `afterAll`/`afterEach` per the unit-suite convention (named
`vitest` imports, no globals).

#### 6. Smoke test

**File**: `tests/integration/smoke.int.test.ts` (new)

**Intent**: Prove the whole harness works before writing risk suites.

**Contract**: One owner is seeded and signed in; `GET /api/paths` with the owner's cookies
returns **200** and an array; cleanup runs. No assertion beyond "the harness boots, seeds,
authenticates, and a real authorized request succeeds."

### Success Criteria:

#### Automated Verification:

- Unit suite still green and DB-free: `npm test`
- Integration smoke passes: `npm run test:integration` (with local Supabase up)
- Type checking passes: `npx astro sync && npx tsc --noEmit` (or `npm run lint` if type-aware)
- Linting passes: `npm run lint`

#### Manual Verification:

- `.env.test` is gitignored; `.env.test.example` is tracked and has no real secrets
- Killing the suite mid-run leaves no orphaned `astro dev` process
- Re-running the smoke test twice in a row passes (no residue / id collision)

**Implementation Note**: After this phase and all automated verification passes, pause for
manual confirmation before proceeding.

---

## Phase 2: Risk #1 — cross-owner / IDOR suite

### Overview

Prove Owner A can never read or mutate Owner B's path through any `/api/paths/*` route, using
the harness from Phase 1. Step routes assert DB state, not just status.

### Changes Required:

#### 1. Single-resource read/write isolation

**File**: `tests/integration/ownership-paths.int.test.ts` (new)

**Intent**: Cover the four single-resource bypass-prone targets where A acts on B's `path_id`.

**Contract**: A and B each seed a path (B with at least one step). As A, with A's cookies:
`GET /api/paths/{B.pathId}` → **404** and B's path/steps absent from the body;
`PATCH /api/paths/{B.pathId}` → **404** and B's title unchanged (verified via service-role
read-back); `DELETE /api/paths/{B.pathId}` → **404** and B's row still present (service-role
read-back). Each test seeds its own data and cleans up.

#### 2. List filter isolation

**File**: same suite (or `ownership-list.int.test.ts`)

**Intent**: Prove the list route returns only the caller's rows.

**Contract**: With A's cookies, `GET /api/paths` → **200** and the returned array contains
none of B's path ids.

#### 3. Step-route IDOR with DB-state assertions

**File**: `tests/integration/ownership-steps.int.test.ts` (new)

**Intent**: Cover the transitive `path_steps` seam — the highest-value targets — proving no
mutation leaks into B's path even though the client only sees a 404.

**Contract**: As A on B's `path_id`: `POST /api/paths/{B.pathId}/steps` → **404** **and** a
service-role read of `path_steps where path_id = B.pathId` shows no new step (count unchanged);
`DELETE /api/paths/{B.pathId}/steps` → **404** **and** B's last step still exists (service-role
read-back). Assertions check DB state, not just the HTTP code.

### Success Criteria:

#### Automated Verification:

- Ownership suite passes: `npm run test:integration`
- A deliberate break is caught: temporarily widen the `path_steps` policy (or stub an
  over-broad read) and confirm the step-route DB-state test fails (then revert)

#### Manual Verification:

- Every cross-owner test asserts row-absence / DB-state, not merely a 403/404 status
- No test builds its "expected" result by calling the code under test (no tautological oracle)

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Phase 3: Risk #2 — auth-gate suite

### Overview

Prove the signed-out and invalid-session gate on both enforcement paths (page redirect vs API
401), and that a valid owner is not wrongly bounced.

### Changes Required:

#### 1. Page-redirect gate

**File**: `tests/integration/gate-pages.int.test.ts` (new)

**Intent**: Cover the middleware redirect for protected pages with no session and with an
invalid-token cookie.

**Contract**: With `redirect: "manual"`, `GET /paths`, `GET /paths/{id}`, `GET /dashboard`
each return **302** with `Location: /auth/signin` when (a) no cookie is sent and (b) a
present-but-invalid `sb-...-auth-token` cookie is sent. With a valid owner's cookies, `GET
/paths` returns **200** (not redirected).

#### 2. API-401 gate

**File**: `tests/integration/gate-api.int.test.ts` (new)

**Intent**: Cover the independent API gate (`requireUser`) for the same negative cases.

**Contract**: For representative `/api/paths/*` routes (at least `GET /api/paths` and one
`[id]` route), no-cookie and invalid-token requests return **401** `{"error":"Unauthorized"}`.
A valid owner's request returns **200**. This confirms the API path is gated separately from
the page redirect.

### Success Criteria:

#### Automated Verification:

- Gate suite passes: `npm run test:integration`
- A deliberate break is caught: temporarily remove `/paths` from `PROTECTED_ROUTES` and
  confirm the page-redirect test fails (then revert)

#### Manual Verification:

- Both the no-cookie and invalid-token cases are exercised (not just no-cookie)
- The valid-owner case proves a real session is not bounced (rules out "everyone bounced"
  from a misconfigured env)

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Phase 4: CI wiring + cookbook

### Overview

Make CI run both suites, and capture the harness recipe in the test-plan cookbook so future
contributors follow it.

### Changes Required:

#### 1. Unit suite in CI

**File**: `.github/workflows/ci.yml`

**Intent**: Health-check Fix #1 — run the existing unit suite in CI.

**Contract**: Add `- run: npm test` between the `npm run lint` step (:20) and the `npm run
build` step (:21). No services needed (unit suite is DB-free).

#### 2. Integration step/job in CI

**File**: `.github/workflows/ci.yml`

**Intent**: Run the DB-backed integration suite in CI so cross-owner/gate regressions gate PRs
(test-plan §5).

**Contract**: A CI step (or parallel job) that, after `npm ci`, starts local Supabase
(`npx supabase start`), applies migrations (`supabase db reset` or the start-time migration
apply), writes the integration env from `supabase status` output (or maps it to
`SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` — the service-role key from
`supabase status`, not a long-lived repo secret), then runs `npm run test:integration`. The
build step's existing `SUPABASE_*` secrets are unchanged. Document that integration runs
against the ephemeral local stack, not the cloud project.

#### 3. Cookbook + status updates

**File**: `context/foundation/test-plan.md`, `context/changes/testing-server-boundary-auth/change.md`

**Intent**: Replace the §6.2 "TBD" stub with the real recipe and advance statuses.

**Contract**: Fill test-plan §6.2 with the harness recipe (separate config, `astro dev`
globalSetup, service-role seeding, signin-cookie acquisition, DB-state read-back for step
routes, cleanup). Move the §3 Phase 1 row Status to `implementing`/`complete` per the
orchestrator vocabulary, and set the gate rows that become enforced. Bump `change.md`
`status` and `updated`.

### Success Criteria:

#### Automated Verification:

- CI config is valid YAML and the workflow parses (push a branch / `gh workflow view`)
- The CI run shows lint → unit test → build, plus the integration step green
- Integration step boots Supabase and runs `test:integration` against the local stack

#### Manual Verification:

- A PR with a deliberate cross-owner regression is blocked by the integration step
- No service-role key is committed; CI sources it from `supabase status`, not from git
- test-plan §6.2 reads as a followable recipe, not a stub

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Testing Strategy

### Integration Tests (this plan IS the test suite):

- Cross-owner isolation across all five bypass-prone targets (Phase 2), with DB-state
  assertions on the two transitive step routes.
- Auth gate on both enforcement paths with no-session and invalid-token (Phase 3), plus the
  valid-owner control.

### Deliberate-break checks:

- Phase 2: widen the `path_steps` policy → step DB-state test must fail.
- Phase 3: drop `/paths` from `PROTECTED_ROUTES` → page-redirect test must fail.

### Manual Testing Steps:

1. With local Supabase down, `npm run test:integration` fails fast with a clear message
   (prerequisite not met) rather than a confusing timeout.
2. `npm test` (unit) runs with no DB and stays fast.
3. Run the integration suite twice consecutively — both pass (independence + cleanup).

## Performance Considerations

Integration is serialized (one DB, one dev server) and slower than unit by design — kept out
of `npm test`. Owner seeding via the admin API + a single signin per owner is the dominant
per-suite cost; reuse seeded owners within a file where tests don't conflict, but never share
mutable path state across tests.

## Migration Notes

No schema changes. `seed.sql` stays absent (tests self-seed); if `supabase db reset` warns
about the missing seed file in CI, either create an empty `seed.sql` or disable the
`[db.seed]` entry — decided at implement time, not a blocker.

## References

- Research: [context/changes/testing-server-boundary-auth/research.md](context/changes/testing-server-boundary-auth/research.md)
- Test plan: [context/foundation/test-plan.md](context/foundation/test-plan.md) §2, §5, §6.2
- Existing DB-level RLS recipe: [supabase/tests/rls_paths.sql](supabase/tests/rls_paths.sql)
- Handlers: [index.ts](src/pages/api/paths/index.ts), [[id].ts](src/pages/api/paths/[id].ts), [steps.ts](src/pages/api/paths/[id]/steps.ts)
- Gate: [src/middleware.ts](src/middleware.ts), [src/lib/api/paths.ts:37-44](src/lib/api/paths.ts), [signin.ts](src/pages/api/auth/signin.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration harness foundation

#### Automated

- [x] 1.1 Unit suite still green and DB-free: `npm test`
- [x] 1.2 Integration smoke passes: `npm run test:integration`
- [x] 1.3 Type checking passes
- [x] 1.4 Linting passes: `npm run lint`

#### Manual

- [ ] 1.5 `.env.test` gitignored; `.env.test.example` tracked with no real secrets
- [ ] 1.6 Killing the suite mid-run leaves no orphaned `astro dev` process
- [ ] 1.7 Re-running the smoke test twice passes (no residue / id collision)

### Phase 2: Risk #1 — cross-owner / IDOR suite

#### Automated

- [ ] 2.1 Ownership suite passes: `npm run test:integration`
- [ ] 2.2 Deliberate policy-widening break is caught by the step DB-state test (then reverted)

#### Manual

- [ ] 2.3 Every cross-owner test asserts row-absence / DB-state, not merely status
- [ ] 2.4 No test builds its expected result from the code under test (no tautological oracle)

### Phase 3: Risk #2 — auth-gate suite

#### Automated

- [ ] 3.1 Gate suite passes: `npm run test:integration`
- [ ] 3.2 Deliberate `PROTECTED_ROUTES` break is caught by the page-redirect test (then reverted)

#### Manual

- [ ] 3.3 Both no-cookie and invalid-token cases are exercised
- [ ] 3.4 Valid-owner case proves a real session is not bounced

### Phase 4: CI wiring + cookbook

#### Automated

- [ ] 4.1 CI config is valid YAML and the workflow parses
- [ ] 4.2 CI run shows lint → unit test → build, plus the integration step green
- [ ] 4.3 Integration step boots Supabase and runs `test:integration` against the local stack

#### Manual

- [ ] 4.4 A PR with a deliberate cross-owner regression is blocked by the integration step
- [ ] 4.5 No service-role key is committed; CI sources it from `supabase status`
- [ ] 4.6 test-plan §6.2 reads as a followable recipe, not a stub
