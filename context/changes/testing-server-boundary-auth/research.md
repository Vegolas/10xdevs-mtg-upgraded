---
date: 2026-06-29T15:07:37+0200
researcher: Mateusz Tomanek
git_commit: b5102db994a7045cfc688beb2a6d0d9c207456be
branch: main
repository: Vegolas/10xdevs-mtg-upgraded (DeckDelta)
topic: "Server-boundary auth & ownership — grounding integration tests for risks #1 (cross-owner/IDOR) and #2 (auth gate) plus the CI test-gate change"
tags: [research, codebase, auth, rls, supabase, middleware, api-paths, integration-tests, ci]
status: complete
last_updated: 2026-06-29
last_updated_by: Mateusz Tomanek
---

# Research: Server-boundary auth & ownership (test-plan rollout Phase 1)

**Date**: 2026-06-29T15:07:37+0200
**Researcher**: Mateusz Tomanek
**Git Commit**: b5102db994a7045cfc688beb2a6d0d9c207456be
**Branch**: main
**Repository**: Vegolas/10xdevs-mtg-upgraded (DeckDelta)

## Research Question

Ground Phase 1 of [test-plan.md](context/foundation/test-plan.md) — "Server-boundary auth &
ownership" — by mapping the **real** query paths and gate so integration tests target live
behavior, not mocks or policy SQL. Two risks:

- **#1** — A signed-in user reads/mutates **another owner's** path because a query path bypasses
  RLS or skips an ownership check on `/api/paths/*`. Prove Owner A → Owner B's `path_id` is denied
  and B's rows never return. Challenge "logged in ⇒ authorized" and "RLS exists ⇒ every query path
  is scoped". Avoid happy-path-only and asserting policy SQL.
- **#2** — An unauthenticated/expired-session request reaches `/api/paths/*`, or a gated route is
  served signed-out (or a valid owner is wrongly bounced). Prove no-/expired-session gets
  401/redirect, gated routes redirect signed-out, valid owner gets through. Challenge "middleware
  runs everywhere" and "build-green ⇒ gate works". Avoid testing only the signed-in path.

Plus the **CI gate change**: add `npm test` to `ci.yml` between lint and build (health-check Fix #1).

## Summary

The findings are decisive and, in one place, **change the shape of the plan**:

1. **Ownership is enforced 100% by Postgres RLS.** There is exactly one Supabase client in the
   codebase — a cookie-bound `createServerClient` using the **anon key** — and **no handler ever
   filters by `owner_id`**. `auth.uid()` (from the caller's JWT) is the only owner scope. There is
   **no application-level defense-in-depth**. This is by design and validates the test-plan's
   instinct: the test *must* run the real handler against real local Supabase with RLS on — a mock
   or service-role client would invalidate the entire test because the guard *is* RLS.

2. **Denial manifests as `404`, never `403`** (single resource), or as a **filtered `200`**
   (the list). RLS makes other owners' rows invisible, so the handler can't tell "absent" from
   "not yours." Tests assert 404 + row-absence, not 403.

3. **`path_steps` has no `owner_id`** — it is protected *transitively* via an `EXISTS` subquery on
   the parent path. That is the classic IDOR seam. It is **currently closed correctly**, but two
   step routes (`POST`/`DELETE /api/paths/[id]/steps`) are the highest-value targets because a
   future too-broad policy could leak there silently — so those tests must assert **DB state**, not
   just the HTTP code.

4. **The real auth check is a single line**: `supabase.auth.getUser()` at
   [src/middleware.ts:15](src/middleware.ts). Everything downstream (`requireUser`, pages) only
   reads `context.locals.user`. So tests must drive **real HTTP requests through the running
   server** with real/absent/expired cookies — there is nothing in-process to mock, and mocking
   `locals.user` would bypass the actual revalidation.

5. **Middleware has NO matcher** (`output: "server"` → runs on every request) and self-filters via
   `PROTECTED_ROUTES = ["/dashboard", "/paths"]`. `/api/paths/*` is **deliberately not** in that
   list — API auth is enforced independently by `requireUser` returning 401. This directly answers
   the "middleware runs everywhere" challenge: it runs everywhere, but only *redirects* two page
   prefixes; the API gate is a separate code path that must be tested separately.

6. **CI cannot run these integration tests as-is.** CI has no Supabase/postgres service. Worse,
   the new integration tests need a live DB, but `npm test` currently globs `src/**/*.test.ts`
   (all pure-logic). **This is the central planning decision** — see Open Questions #1.

## Detailed Findings

### Area 1 — Risk #1: ownership / IDOR on `/api/paths/*`

**The single client.** [src/lib/supabase.ts:6-25](src/lib/supabase.ts) — `createClient(headers, cookies)`
returns `createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {...cookies})`. It is the *only*
client constructor; `SUPABASE_KEY` is the **anon** key (confirmed `.env.example`, README). No
`service_role` / `auth.admin` client exists under `src/`. The JWT rides every query → RLS sees the
caller as `auth.uid()`.

**Owner identity** comes from `requireUser()` at [src/lib/api/paths.ts:37-44](src/lib/api/paths.ts),
which reads `context.locals.user` (populated by middleware). `auth.user.id` is used as the **write
value** for `owner_id` on create, but is **never** a read/update/delete filter.

**Handlers** (methods, query, filter, return):

| Route / method | Query | Owner filter | Denial contract |
|---|---|---|---|
| [api/paths/index.ts:6-21](src/pages/api/paths/index.ts) GET | `upgrade_paths.select("*").order(created_at)` | **none — pure RLS** | filtered **200** (B's rows absent) |
| index.ts:24-46 POST | `.insert({owner_id: auth.user.id, title})` | owner stamped from session + RLS `with check` | 201 / 400 / 500 |
| [api/paths/[id].ts:6-43](src/pages/api/paths/[id].ts) GET | path `.eq("id",id).maybeSingle()` + steps `.eq("path_id",id)` | **`id` only** | **404** `{"error":"Not found"}` (:25-27) |
| [id].ts:46-76 PATCH | `.update(...).eq("id",id).maybeSingle()` | `id` only | **404** (:72-74) |
| [id].ts:79-98 DELETE | `.delete().eq("id",id).select("id")` | `id` only | **404** (:94-96) |
| [api/paths/[id]/steps.ts:13-76](src/pages/api/paths/[id]/steps.ts) POST | parent pre-check `.eq("id",id)` then insert into `path_steps` | `id` only (pre-check is *also* RLS-backed) | **404** (:39-41) |
| steps.ts:83-116 DELETE | `path_steps.select.eq("path_id",id)...` then delete by step id | `path_id` only | **404** `{"error":"No steps to delete"}` (:104-106) |

`path_id` is read from `context.params.id`. **No handler does an independent owner check** — the
`steps.ts` POST "pre-check" looks like one but only selects by `id` and trusts RLS.

**RLS — the real guard.** [supabase/migrations/20260626121519_user_accounts_paths.sql](supabase/migrations/20260626121519_user_accounts_paths.sql):

- `upgrade_paths` (:16-27): `owner_id uuid not null references auth.users(id) on delete cascade`;
  `visibility` default `'private'`; index on `owner_id`.
- `path_steps` (:29-41): `path_id ... references upgrade_paths(id) on delete cascade`, **no
  `owner_id`**; `unique(path_id, position)`. `delta_text` added by
  [20260629113006_path_step_delta_text.sql](supabase/migrations/20260629113006_path_step_delta_text.sql).
- `upgrade_paths_owner_all` (:51-54): `for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())`.
- `path_steps_owner_all` (:61-78): `for all` with `using`/`with check` = `exists (select 1 from
  upgrade_paths p where p.id = path_steps.path_id and p.owner_id = auth.uid())` — **transitive**.
- Unlisted/sharing read policies are **deliberately deferred** (:56-58, :80-81) — today only the
  owner can see/touch any row.

**Bypass-prone targets (priority for the test), all assert 404 + row absence:**
1. `GET /api/paths/[id]` as A on B's id → 404, B's `path`+`steps` absent from body.
2. `POST /api/paths/[id]/steps` as A on B's id → 404 **and DB shows no step inserted under B**.
3. `DELETE /api/paths/[id]/steps` as A on B's id → 404 **and B's last step still exists**.
4. `PATCH`/`DELETE /api/paths/[id]` as A on B's id → 404, B's row unchanged/present.
5. `GET /api/paths` as A → array contains none of B's ids.

### Area 2 — Risk #2: auth gate & middleware

**[src/middleware.ts](src/middleware.ts) is the whole gate (28 lines).** No `config.matcher`;
`output: "server"` ([astro.config.mjs:11](astro.config.mjs)) means it runs on **every** request and
self-filters:

- `PROTECTED_ROUTES = ["/dashboard", "/paths"]` (:7); match is
  `PROTECTED_ROUTES.some(r => pathname.startsWith(r))` (:21).
- **`/api/paths/*` is NOT protected by middleware** (comment :4-6) — `/api/paths` doesn't start with
  `/paths`. API auth is separate (see below).
- Client built via `createClient(request.headers, cookies)` (:10). Session read with
  **`supabase.auth.getUser()`** (:13-15) — the secure choice (revalidates token server-side; expired
  token → `user = null`, does not throw). Sets `context.locals.user = user ?? null` (:16).
- No session on a protected page → `context.redirect("/auth/signin")` (:23), Astro default **302**.
  Redirect target = **`/auth/signin`**.
- Downstream contract: only `context.locals.user` (`App.Locals` declares exactly `user: User | null`,
  [src/env.d.ts:1-5](src/env.d.ts)). The client is **not** stored on locals — every page/handler
  rebuilds its own.

**Page gating is single-point-of-failure.** [dashboard.astro](src/pages/dashboard.astro),
[paths/index.astro](src/pages/paths/index.astro), [paths/[id].astro](src/pages/paths/[id].astro) all
rely **solely on middleware** (their comments say "Middleware guards `/paths`, so a session
exists"); they guard only on `if (supabase)` / `if (supabase && id)`, never on `user`. If middleware
were bypassed, pages render their chrome (RLS still scopes the data).

**API auth is independent.** Every `/api/paths/*` handler's first line is `requireUser(context)`
then `if (auth instanceof Response) return auth;` (index GET:7/POST:25; [id] GET:7/PATCH:47/DELETE:80;
steps POST:14/DELETE:84). `requireUser` ([src/lib/api/paths.ts:37-44](src/lib/api/paths.ts)) rebuilds
the client AND reads `locals.user`; if client null **or** user falsy → **401**
`{"error":"Unauthorized"}` (:41). Note: the API does **not** itself call `getUser()` — it trusts
`locals.user` set by middleware (which ran first in the same request), so the real revalidation still
happens. Auth routes (`/api/auth/{signin,signout,signup}`) are intentionally public (no
`requireUser`); signin success → `/paths`.

**Session/cookie shape.** `@supabase/ssr` default cookie scheme (`sb-<ref>-auth-token`, chunked
`.0/.1`); names are not hardcoded — derived from `SUPABASE_URL`, parsed via
`parseCookieHeader(headers.get("Cookie"))` ([supabase.ts:13](src/lib/supabase.ts)). **No session** =
no cookie; **expired session** = present-but-invalid token → `getUser()` returns null user after
failed server validation/refresh. Both collapse to identical observable behavior (302 for pages, 401
for API). A successful refresh rotates cookies via `setAll → cookies.set` (:18-22) → response may
carry `Set-Cookie`.

**"Wrongly bounced owner" risks:** cookies read only from inbound `Cookie` header (drop it → owner
bounced); chunked-cookie loss (`.0`/`.1`); `getUser()` is a network call with no retry; null client
if `SUPABASE_URL`/`SUPABASE_KEY` unset bounces **everyone** (so confirm test env is set or the
valid-owner case fails for the wrong reason).

**Gate hit-points for the test:**

| Scenario | Request | Expected | Enforced at |
|---|---|---|---|
| No-session page | GET `/paths`,`/paths/<id>`,`/dashboard`, no cookie | **302 → /auth/signin** | middleware.ts:21-23 |
| No-session API | any `/api/paths*`, no cookie | **401** `{"error":"Unauthorized"}` | paths.ts:40-41 |
| Expired page | same pages, expired `sb-...-auth-token` | **302 → /auth/signin** | middleware.ts:13-23 |
| Expired API | same API, expired cookie | **401** | middleware → requireUser |
| Valid owner page | GET `/paths` w/ live cookies | **200** (RLS-scoped) | passes :21 |
| Valid owner API | GET `/api/paths` w/ live cookies | **200** owner's rows | index.ts:6-21 |

### Area 3 — Integration test harness (local Supabase)

**Current state:** [vitest.config.ts](vitest.config.ts) — `environment: "node"`, glob
`src/**/*.test.ts`, alias `@`→`./src`, **no setup files, no env loading, default parallelism, default
~5s timeout**. 20 pure-logic test files, all mocked, **zero DB**. So `npm test` today is fast and
DB-free.

**Tooling present:** [package.json](package.json) — `test: "vitest run"` (:14), `db:reset: "supabase
db reset"` (:17), Supabase CLI as **devDependency `supabase ^2.108.0`** (:58) → `npx supabase
start/db reset/test db` works with no global install. `@supabase/ssr ^0.10.3`, `@supabase/supabase-js
^2.99.1`. No `test:integration` script, no dotenv, no test factories.

**Local stack** ([supabase/config.toml](supabase/config.toml)): API `54321`, **DB `54322`**, Studio
`54323`; DB v17. Auth: `enabled`, `enable_signup = true`, **`enable_confirmations = false`** (signups
immediately usable — no email step), min password 6, anonymous sign-ins off. `db.seed` references
`./seed.sql` **which does not exist** → `db reset` seeds nothing.

**The canonical seeding recipe already exists:**
[supabase/tests/rls_paths.sql](supabase/tests/rls_paths.sql) (70 lines) is a manual SQL RLS-isolation
test (run via `psql -f`, **not** `supabase test db` — it's plain `do $$` blocks, not pgTAP). It
demonstrates the two-owner pattern Phase 1 wants:
- Privileged insert of two `auth.users` rows with fixed UUIDs + emails (:17-19).
- Impersonate via `set local role authenticated;` + `set local request.jwt.claims =
  '{"sub":"<uuid>","role":"authenticated"}'` (:22-23, :43).
- Wrapped in `begin; ... rollback;` (:14, :70) — idempotent against a reset DB.
- Already asserts B sees 0 of A's rows and cannot write into A's path (:45-66) — the exact guarantee,
  but at the DB level, not through the HTTP handlers.

**Two-owner seeding options:**
- **(A) RECOMMENDED for handler-level tests** — service-role client +
  `auth.admin.createUser({email, password, email_confirm: true})` for Owner A/B in setup, then
  `signInWithPassword` to get each owner's access token, then drive handlers with an anon-key client
  carrying each JWT. This is the only seam that exercises the real cookie/middleware/RLS path
  end-to-end. **Requires a service-role key** (setup/teardown only — the app has none today).
- **(B)** the `rls_paths.sql` `auth.users` + JWT-claim trick — fastest, but bypasses GoTrue/cookies
  (DB-direct only).
- **(C)** rewrite as pgTAP for `supabase test db` — pure-DB, no handler coverage; not aligned with
  "exercise `/api/paths/*`".

**Unit-test conventions to match:** named imports `import { describe, it, expect, vi, beforeEach }
from "vitest"` (no globals); top-level `describe`/`it` with behavioral sentences; local factory
helpers; `@/` alias; mock only the network seam (`vi.mock("@/lib/card-data")`). For integration:
**mock nothing, hit the real DB.**

**Env contract:** the app reads only `SUPABASE_URL` + `SUPABASE_KEY` (server-only secrets,
`optional: true`, [astro.config.mjs:17-22](astro.config.mjs)), consumed in
[src/lib/supabase.ts:3](src/lib/supabase.ts). `.env.example` points at a **cloud** project; there's no
`.env.test` and **no service-role var anywhere**. Local direct-DB string:
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### Area 4 — CI gate change + secret/PII check

**[.github/workflows/ci.yml](.github/workflows/ci.yml)** (single `ci` job, ubuntu, node 22):
```
- uses: actions/checkout@v4        # :13
- uses: actions/setup-node@v4      # :14 (node 22, cache npm)
- run: npm ci                      # :18
- run: npx astro sync              # :19
- run: npm run lint                # :20   ← lint
- run: npm run build               # :21   ← build (env: SUPABASE_URL/KEY from secrets)
```
**Insertion point:** add `- run: npm test` **between line 20 (lint) and line 21 (build)** — exactly
health-check Fix #1. Scripts invoked: `lint`→`eslint .`, `test`→`vitest run`, `build`→`astro build`.

**CI has no Supabase/postgres service** — no `services:` block, no `supabase start`. The build step's
`SUPABASE_URL`/`SUPABASE_KEY` secrets are scoped to that step and are **not** visible to `npm test`.

**Secret/PII verdict: ✅ clear.** Both keys are `context: "server"`, `access: "secret"` — never sent
to the browser; only imported from `astro:env/server` in `supabase.ts` and `config-status.ts`. No
`PUBLIC_`-prefixed key. No hardcoded credentials in `.ts/.tsx/.astro`. `.gitignore` excludes
`.env`/`.env.*` and tracks only `.env.example` (key masked `###`; the URL is a real-but-public
project ref). No service-role/admin secret anywhere. Anon key is expected-public — confirmed nothing
worse leaks.

## Code References

- [src/lib/supabase.ts:6-25](src/lib/supabase.ts) — the only Supabase client (cookie-bound anon `createServerClient`)
- [src/lib/api/paths.ts:37-44](src/lib/api/paths.ts) — `requireUser` → 401; reads `locals.user`
- [src/middleware.ts:7,13-23](src/middleware.ts) — `PROTECTED_ROUTES`, `getUser()`, 302 → `/auth/signin`
- [src/pages/api/paths/index.ts](src/pages/api/paths/index.ts) — GET (no filter, RLS-only) / POST (owner stamped)
- [src/pages/api/paths/[id].ts](src/pages/api/paths/[id].ts) — GET/PATCH/DELETE, `id`-only filter, 404 on cross-owner
- [src/pages/api/paths/[id]/steps.ts](src/pages/api/paths/[id]/steps.ts) — POST/DELETE on transitively-protected `path_steps`
- [supabase/migrations/20260626121519_user_accounts_paths.sql:51-78](supabase/migrations/20260626121519_user_accounts_paths.sql) — RLS policies (source of truth)
- [supabase/tests/rls_paths.sql](supabase/tests/rls_paths.sql) — existing two-owner RLS recipe (DB-level)
- [supabase/config.toml](supabase/config.toml) — local stack ports, `enable_confirmations = false`, missing `seed.sql`
- [vitest.config.ts](vitest.config.ts) — node env, `src/**/*.test.ts` glob, no DB wiring
- [.github/workflows/ci.yml:20-21](.github/workflows/ci.yml) — lint→build; insert `npm test` between
- [astro.config.mjs:11,17-22](astro.config.mjs) — `output: "server"`; server-only secret env schema

## Architecture Insights

- **RLS is the sole authorization mechanism.** No defense-in-depth. The test's whole reason to exist
  is to catch an RLS gap, so it must hit the live query path with the anon cookie client — never a
  mock, never service-role for the *assertion* (service-role only for setup/teardown).
- **Denial = 404, not 403; list = filtered 200.** Asserting 403 would be wrong.
- **`path_steps` transitive protection is the IDOR seam.** Step routes must assert DB state, not just
  status, because a too-broad future policy could 404 the client while still mutating B's rows.
- **Two enforcement code paths, by design:** middleware *redirects* pages (`/dashboard`, `/paths`);
  `requireUser` *401s* the API. "Middleware runs everywhere" is true but only redirects pages — the
  API gate is separate and must be tested separately. This is the literal answer to risk #2's
  challenge.
- **The real session check is one network call** (`getUser()` in middleware). Tests must go through
  the running server; there's nothing in-process to mock.
- **`npm test` is currently DB-free and fast.** Adding DB integration tests to the same glob would
  break CI (no DB) and slow local runs. They belong in a separate Vitest project/config with env
  loading, longer timeouts, and serialized execution (`fileParallelism: false`/`singleFork`).

## Historical Context (from prior changes)

- The diff-mode feature that added `path_steps.delta_text`
  ([20260629113006_path_step_delta_text.sql](supabase/migrations/20260629113006_path_step_delta_text.sql))
  is the recently-shipped `diff-style-checkpoint-entry` change (recent commits b227659/75db53e) —
  the churn on `src/lib/path` that test-plan risks #4/#5 (Phase 3) cover. Out of scope for Phase 1.
- [context/foundation/health-check.md](context/foundation/health-check.md) Fix #1 is the exact CI
  test-step gap this phase closes; §CI/CD confirms "Vitest suite exists and passes locally but CI
  never runs it."

## Related Research

- [context/foundation/test-plan.md](context/foundation/test-plan.md) §2 (Risk Map), §2 Risk Response
  Guidance (#1/#2), §3 (Phase 1 row), §5 (gate: integration required after Phase 1), §6.2 (cookbook
  stub to fill on implement).
- No prior `research.md` exists under `context/changes/**` for this surface (first auth/boundary
  research in this repo).

## Open Questions

1. **(Blocking the plan) How does CI run the new integration tests?** `npm test` globs
   `src/**/*.test.ts`. If integration tests join that glob, CI breaks (no Supabase service) — yet
   test-plan §5 makes "integration (API + ownership) | local + CI | required after Phase 1". Two
   coherent options:
   - **(a)** Keep `npm test` pure-logic (the health-check Fix #1 line), and add a **separate**
     `test:integration` script + a Supabase service step in CI (e.g. `supabase start` / a postgres
     service) gating PRs. Honors the §5 "CI required" intent but is more than a one-line CI change.
   - **(b)** Add `npm test` now for the existing unit suite (literal Fix #1), and **defer** the
     CI-side integration run to a follow-up, running integration locally only for Phase 1.
   Recommend surfacing this to the user at plan time — it's a genuine scope fork, not a detail.
2. **Service-role key provisioning.** Handler-level two-owner seeding (option A) needs a local
   service-role key for `auth.admin.createUser` + teardown. The app has no such var. Where does it
   live for tests (`.env.test`, gitignored) and CI (GitHub secret / `supabase status` output)?
3. **How are the handlers invoked in-process?** Astro + Cloudflare adapter — does the plan exercise
   handlers via a running dev/preview server (real HTTP, real middleware) or import the route module
   and call its `GET/POST` export with a synthesized `APIContext`? Risk #2 needs middleware to run,
   which argues for real HTTP (or a harness that runs middleware). Confirm the cheapest seam that
   still executes `getUser()` + `requireUser`. (Context7 has current Astro 6 testing APIs if needed.)
4. **`seed.sql` is referenced but absent.** Decide whether to add it (for deterministic base data) or
   keep seeding entirely in test setup.
