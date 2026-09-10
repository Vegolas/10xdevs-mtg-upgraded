# Discarded failure results on four server paths — Implementation Plan

## Overview

Four server-side write/side-effect failures are discarded today: the caller is answered
`201` / `204` / a redirect, and nothing anywhere records that the operation failed. This
plan routes them onto a new, contract-registered **evidence channel** — `[api] degraded` —
**without changing any status code**, and separately fixes `src/pages/api/auth/signout.ts`,
which is not an observability gap but a live behavior defect: the token revoke fails, the
session survives, and the user is redirected as though signed out.

The direction here is deliberately the opposite of the change's own seed note. See
`frame.md` — propagating these failures to the caller manufactures duplicate checkpoints on
a POST retry and destroys a second checkpoint on a DELETE retry, so three of the four status
codes are already correct and stay untouched.

## Current State Analysis

`serverError` (`src/lib/api/paths.ts:79-85`) is the project's **only** `console.*` in all of
`src/`. It mints a correlation `ref`, logs the cause, and returns a redacted `500` body
carrying the same `ref` — a pairing `docs/reference/contract-surfaces.md:85-88` registers as
load-bearing. `wrangler.jsonc:14-16` already ships `observability.enabled`, so the channel
reaches production; it simply has nothing to ingest from these four sites.

The convention for exactly this condition already exists in-repo, three times over, which is
what makes these sites omissions rather than open questions:

- `src/pages/api/paths/[id].ts:71-80` error-checks the _same_ `upgrade_paths.update({updated_at})`
  that `steps.ts:190` / `:234` discard.
- `steps.ts:98-101` treats a `parseSnapshot` failure as a logged `500` on the write path,
  while `src/lib/api/paths.ts:142` / `:159` fall back silently on the read path.
- `signin.ts:15-19` and `signup.ts:15-19` both route their `error` to the `?error=` redirect
  channel. `signout.ts` is the only auth route that does not.

Verified independently against installed library source during planning:

- `_signOut` returns `{error}` for any revoke failure other than 401/403/404 **without
  reaching `_removeSession()`** (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`,
  the `admin.signOut` branch). Cookie clearing happens only via the `SIGNED_OUT` notification,
  so no `_removeSession` means **no `Set-Cookie` and an intact session**.
- `_getUser` **catches** and returns `{data: {user: null}, error}` for any `AuthError` —
  `AuthRetryableFetchError` included. So `middleware.ts` genuinely degrades to "anonymous"
  rather than throwing, and the frame's claim holds.
- Both `isAuthSessionMissingError` and `isAuthRetryableFetchError` are re-exported from
  `@supabase/supabase-js` (`dist/index.d.mts:7`, `export * from "@supabase/auth-js"`).

### Key Discoveries:

- **`serverError` cannot be reused for these sites.** Its `ref` exists because the `500` body
  carries the same value; a `201`/`204` has no body to pair with, so a `ref` there correlates
  to nothing — and `contract-surfaces.md:85-88` explicitly calls `ref` "the correlation
  handle, not decoration." These sites need a sibling shape keyed on the **entity**.
- **Destructuring `error` is not sufficient.** An RLS refusal or a path deleted mid-request
  matches **zero rows with `error === null`** (confirmed against `supabase/tests/rls_paths.sql:38-48`
  in the frame). Proving the bump landed requires rows-matched, and
  `update(values, { count: "exact" })` is supported — `node_modules/@supabase/postgrest-js/dist/index.mjs:4470`.
- **There is no unit-test seam for `src/lib/api/*` and one cannot simply be added.**
  `src/lib/api/paths.ts` transitively imports `astro:env/server` through `@/lib/supabase`, so
  a `src/lib/api/paths.test.ts` cannot load under `vitest.config.ts` (which globs
  `src/**/*.test.ts`). Any unit-testable helper must live in a module free of Astro and
  Supabase imports.
- **Sign-out has no client-side failure channel at all.** It is a plain HTML form POST from
  `src/components/app/Sidebar.astro:63` and `src/pages/dashboard.astro:15` — no JS — so the
  redirect target is the only channel, and `?error=` is rendered only by `signin.astro:5` and
  `signup.astro:5`.
- **`.dev.vars` is read exactly once per dev server, at startup** — the adapter's
  `astro:config:done` hook does `Object.assign(process.env, parsed)`
  (`node_modules/@astrojs/cloudflare/dist/index.js:292-303`). This is what makes a second dev
  server pointed at a fault proxy possible at all, and it is also the phase's main risk.
- **This observation was already found once and lost.**
  `context/archive/2026-08-11-testing-api-contract-pinning/research.md:123` records the
  discarded bumps verbatim; it reached no plan, no test, and no registry. F-2 (the
  `toPathStep` fallback) was filed at `.../findings.md:51-80` with the ruling "keep degrading,
  but log the step id" and never executed.

## Desired End State

Every one of the five sites emits exactly one `[api] degraded` line when its operation fails,
and none of them changes the answer it gives the caller — except `signout.ts`, which now
clears the browser session even when the server-side revoke fails.

Verify by: `npm test` covers the channel's formatting and branch selection at the unit layer;
`npm run test:integration` proves the `updated_at` bump lands on both `steps.ts` verbs and that
a failed revoke issues a clearing `Set-Cookie`; and a per-site deliberate break confirms each
site's own signal reddens on its own (not on a neighbour's).

## What We're NOT Doing

- **Not changing any status code on `steps.ts`.** POST stays `201`, DELETE stays `204`. The
  frame traced both propagation variants into client code and both are worse than the defect:
  a POST retry re-reads `max(position)` and manufactures a duplicate, a DELETE retry destroys
  a second checkpoint.
- **Not adding monitoring or error tracking** (Sentry, Cloudflare Observability MCP). Out of
  scope per `change.md`; `context/foundation/roadmap.md:63` owns it.
- **Not changing `middleware.ts` behavior.** No `503`, no new error page — a signed-in user
  during an auth outage is still redirected to sign-in. Only the log is added; the discard
  itself is correct as written.
- **Not making sign-out revoke globally on failure.** The fix clears the local session only,
  so the refresh token stays valid server-side until expiry. Accepted, and pinned by a test so
  a future change to it is deliberate.
- **Not adding an `?error=` surface for sign-out.** Clearing the cookies satisfies what the
  user clicked; there is nothing left for them to act on.
- **Not building fault injection for the two `steps.ts` bump sites.** No seam exists and their
  failure is benign; the proxy is scoped to the one auth route that needs it.
- **Not E2E-testing the stale `Saved <date>` symptom.** Per frame correction #1 it needs both a
  reload and a calendar-day boundary (`formatSavedDate`, `src/components/path/metadata.ts:16`,
  formats at day granularity), so a same-day run cannot observe it.
- **Not touching the adjacent discards** at `src/pages/paths/[id].astro:22`, `:25` and
  `src/pages/paths/index.astro:17`. Found by the frame, deliberately left for a follow-up.

## Implementation Approach

One import-free module owns the channel; five call sites use it; one of the five also changes
behavior. Build the module and its unit coverage first (Phase 1) because it is the only layer
where the branch logic can be tested automatically. Wire the three pure-evidence sites next
(Phase 2). Then buy the one fault-injection seam that is actually reachable and land the
sign-out spec **red-but-annotated** (Phase 3), remove the annotation with the fix (Phase 4),
and finally register the new channel everywhere the next developer will look (Phase 5).

## Critical Implementation Details

**Timing & lifecycle — the two-dev-server boot in Phase 3.** Both servers share one repo root
and therefore one `.dev.vars`, but the adapter reads it once at startup, so the boots must be
**sequential and each must observe its own value**: bring up the fault server while `.dev.vars`
is renamed aside (global-setup already does this for its backup) with `SUPABASE_URL` injected
via the spawn env, then write the local `.dev.vars` and bring up the main server. The residual
risk is that an `astro dev` config reload re-runs `astro:config:done` on the fault server and it
picks up the local URL, silently bypassing the proxy. That is exactly the vacuous-spec shape
`lessons.md:277` describes, so the proxy must expose a hit counter and the spec must assert on
it — a spec that never routed through the proxy has to fail, not pass.

**State sequencing — sign-out.** `context.cookies.delete(...)` must run before
`context.redirect("/")` returns, since Astro applies cookie mutations to the outgoing response.
Deleting after building the response silently drops the `Set-Cookie`, reproducing the defect
with the fix apparently in place.

**Debug & observability — the inverted spec.** `it.fails()` inverts the whole test body, so a
broken sign-in inside it reports as an expected failure and covers nothing. Keep setup in
`beforeAll` / `beforeEach`, and before believing the red, run once with the annotation removed
and read the actual error (`lessons.md:118`, traps 1 and 2).

---

## Phase 1: The evidence module

### Overview

Create the single definition of the `[api] degraded` channel in a module that plain vitest can
load, and cover its branch selection and exact line format at the unit layer.

### Changes Required:

#### 1. The channel

**File**: `src/lib/api/audit.ts` (new)

**Intent**: One place that decides whether a discarded result deserves a line, and formats it.
Exists as its own module — not beside `serverError` — purely so it stays loadable under
`vitest.config.ts`, which is the only layer that can test these branches automatically.

**Contract**: Imports nothing from `astro:*`, `@/lib/supabase`, or any module that reaches them.
Exports a `DegradedCause` union (`"write-failed" | "write-missed" | "snapshot-corrupt" | "auth-unavailable" | "revoke-failed"`),
a `logDegraded(event)` primitive taking `{ op, subject, cause, detail }` where `subject` is a
`Record<string, string>` of entity keys, and `auditSideEffect({ op, subject, error, count })`
which maps a Supabase write result onto the channel. Emitted line shape — this string is what
Phase 5 registers, so it is a contract:

```
[api] degraded op=<op> <k>=<v>… cause=<cause>
```

with `detail` passed as `console.error`'s second argument (matching `serverError`'s shape at
`paths.ts:83`). `auditSideEffect` logs `write-failed` when `error` is set, `write-missed` when
`count === 0`, and **stays silent when `count` is `null`** — an unsupported or absent count must
never be reported as a miss, or the channel floods on every success.

Carries one `// eslint-disable-next-line no-console` with a justification comment, following the
established precedent at `paths.ts:82` (`eslint.config.js:23` sets `no-console` to `warn`).

#### 2. Unit coverage

**File**: `src/lib/api/audit.test.ts` (new)

**Intent**: Pin the line format and every branch, since the wiring at the call sites has no
automated proof and this is the only place the logic is observable.

**Contract**: Spies on `console.error` (`vi.spyOn`). Asserts the exact emitted string for a
representative event, and covers all four `auditSideEffect` input combinations — `error` set,
`count === 0`, `count === 1`, `count === null` — including the two that must emit **nothing**.
Follows the local convention of a docstring naming the risk the file defends
(cf. `src/lib/path/verify.test.ts:1-24`).

### Success Criteria:

#### Automated Verification:

- Unit suite passes: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes with exactly one new justified exemption: `npm run lint`
- `audit.test.ts` covers all four `auditSideEffect` combinations and the exact line format

#### Manual Verification:

- `src/lib/api/audit.ts` imports nothing from `astro:*` or `@/lib/supabase`, directly or transitively

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Wire the three evidence sites

### Overview

Route the two discarded `updated_at` bumps, both read-path snapshot fallbacks, and
`middleware.ts`'s dropped `getUser` error onto the channel. No status code and no behavior
changes in this phase.

### Changes Required:

#### 1. The discarded parent bumps

**File**: `src/pages/api/paths/[id]/steps.ts` (lines 190 and 234)

**Intent**: Make a failed or zero-row `updated_at` bump leave a line, while the handler keeps
answering `201` / `204`. These two lines are the change's origin.

**Contract**: Both calls gain `{ count: "exact" }` as `update`'s second argument, destructure
`{ error, count }`, and pass the result to `auditSideEffect` with ops `steps.append.bump` and
`steps.deleteLast.bump` and subject `{ path: id }`. Response shape, status, and ordering are
untouched — the calls stay after the primary write and before the return.

#### 2. The read-path snapshot fallbacks

**File**: `src/lib/api/paths.ts` (lines 142 and 159)

**Intent**: Execute F-2 as filed — keep degrading to an empty snapshot, but log the step whose
stored snapshot failed to parse, so a silent data corruption becomes findable.

**Contract**: `toPathStep` and `toPathWithSummary` call `logDegraded` with cause
`snapshot-corrupt`, ops `paths.toPathStep.snapshot` / `paths.toPathWithSummary.snapshot`, and
subject `{ step: row.id }`. The `?? { cards: [], unresolved: [] }` fallback and both function
signatures stay exactly as they are. Note that the grid mapper runs per step per listed path,
so one corrupt row logs once per render — accepted.

#### 3. Type-discriminated auth logging

**File**: `src/middleware.ts` (lines 13-16)

**Intent**: Distinguish the ordinary anonymous visitor from an auth-backend outage. Today both
are indistinguishable, and logging indiscriminately would fire on every public request.

**Contract**: Destructure `error` alongside `data.user`, and call `logDegraded` with cause
`auth-unavailable`, op `middleware.getUser`, subject `{ route: context.url.pathname }` **only
when** `error` is set and `isAuthSessionMissingError(error)` is false — both helpers imported
from `@supabase/supabase-js`. `context.locals.user` assignment, `PROTECTED_ROUTES` handling, and
the sign-in redirect are unchanged.

#### 4. Pin that the bump actually lands

**File**: `tests/integration/contract-steps.int.test.ts`

**Intent**: The parent's `updatedAt` is currently asserted only for `PATCH`
(`contract-paths.int.test.ts:223`), which is why these two discards survived a contract-pinning
change. Close that hole for both verbs.

**Contract**: Two assertions — after a `POST /api/paths/[id]/steps` and after a
`DELETE /api/paths/[id]/steps`, the parent's `updatedAt` read back from `GET /api/paths/[id]` is
strictly greater than the value captured before the call. Compare the **raw ISO strings**, not
`formatSavedDate` output, which is day-granular and would pass unchanged.

### Success Criteria:

#### Automated Verification:

- Unit suite passes: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Integration suite passes, including the two new `updatedAt` assertions: `npm run test:integration`

#### Manual Verification:

- With the successful bump's `count` temporarily logged, confirm it is `1` — proving the
  `count === 0` branch is reachable and not dead code
- Per-site deliberate break: revert **only** one site's audit call at a time and confirm the
  signal that owns that site reddens, and that the others stay green (`lessons.md:277`)
- An ordinary anonymous request to a public page emits **no** `[api] degraded` line, confirming
  the middleware discrimination
- A corrupt snapshot (hand-written directly into a `path_steps` row) produces exactly one
  `snapshot-corrupt` line per mapper, and the path still loads

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: Fault-injection harness and the sign-out spec

### Overview

Build the one seam that is actually reachable — a proxy in front of Supabase's auth endpoint for
a second dev server — and land the sign-out spec asserting the **correct** behavior, annotated
`it.fails()` so the suite stays green on today's code.

### Changes Required:

#### 1. Reusable dev-server boot

**File**: `tests/integration/global-setup.ts`

**Intent**: The boot logic (spawn, stdout passthrough, readiness poll, cross-platform kill) is
needed twice now. Extract it rather than copy it.

**Contract**: A `bootDevServer({ port, env })` helper returning the child plus a teardown thunk,
with today's single-server behavior preserved exactly — including the stderr passthrough that
keeps `serverError`'s log lines reaching CI (`:122-135`) and the crash-safe `.dev.vars`
backup/restore (`:55-74`). The exported `setup` now boots the fault server **while `.dev.vars` is
renamed aside**, with `SUPABASE_URL` pointed at the proxy via the spawn env, then writes the local
`.dev.vars` and boots the main server. See Critical Implementation Details for why the order is
load-bearing.

#### 2. The fault proxy

**File**: `tests/integration/helpers/faultProxy.ts` (new)

**Intent**: Give exactly one route a failure the real stack will not produce on demand, and make
it impossible for a spec to pass without having actually gone through it.

**Contract**: A `node:http` server that forwards every request to the real Supabase URL
unchanged, plus a control surface on its own origin: a route to arm a failure mode for
`POST /auth/v1/logout` (answering `500`, deliberately **not** 401/403/404, which auth-js
swallows), and a stats route reporting how many times `/auth/v1/logout` was seen. Control is over
HTTP rather than in-process because global-setup runs in the main process while specs run in a
worker fork. Default state is fully transparent, so sign-in during setup behaves normally.

#### 3. The sign-out spec

**File**: `tests/integration/fault-signout.int.test.ts` (new)

**Intent**: Pin the behavior the fix will produce, against the fault server, while the suite stays
green on today's code.

**Contract**: Annotated `it.fails()`, with **all setup in `beforeAll`** — a sign-in against the
fault server through the transparent proxy to obtain real `sb-*` cookies. The body arms the
logout failure, POSTs `/api/auth/signout` with `redirect: "manual"` and an `Origin` header (per
`helpers/owners.ts`), and asserts: the response is a `302` to `/`; the proxy's stats show the
logout was actually routed through it (the anti-vacuity guard); and a clearing `Set-Cookie` is
present for each `sb-*` chunk. Cleans up its own owner via `helpers/cleanup.ts`.

### Success Criteria:

#### Automated Verification:

- Integration suite passes with the new spec annotated `it.fails()`: `npm run test:integration`
- Every pre-existing integration suite passes unchanged, proving the main dev server is unaffected
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Run once with the `it.fails()` annotation removed and read the actual error: it must be the
  missing clearing `Set-Cookie`, **not** a sign-in or harness failure (`lessons.md:118` trap 2)
- All setup is in `beforeAll`, nothing load-bearing inside the inverted body (trap 1)
- The proxy's stats show a non-zero logout hit count, proving the fault server read the proxy URL
  and not local Supabase
- Total integration run time is still acceptable with the second boot

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: The sign-out fix

### Overview

Clear the browser session ourselves when the revoke fails, log the failure, and remove Phase 3's
annotation.

### Changes Required:

#### 1. Cookie-name enumeration

**File**: `src/lib/api/authCookies.ts` (new) and `src/lib/api/authCookies.test.ts` (new)

**Intent**: The session cookie is chunked by `@supabase/ssr`, so clearing it means enumerating
names off the request. Kept as its own import-free module for the same reason as `audit.ts` — it
is the only way this gets unit coverage.

**Contract**: `authCookieNames(cookieHeader: string): string[]` returning every `sb-`-prefixed
cookie name, preferring `parseCookieHeader` from `@supabase/ssr` (already a direct dependency,
and the same parser `src/lib/supabase.ts:13` uses) over a hand-rolled split. Unit tests cover a
chunked token (`sb-…-auth-token.0`, `.1`), unrelated cookies that must be left alone, and an
empty header.

#### 2. The behavior fix

**File**: `src/pages/api/auth/signout.ts`

**Intent**: A failed revoke currently leaves the session fully intact while telling the user they
signed out. Honor what they clicked — clear the session locally — and record why it was necessary.

**Contract**: Destructure `{ error }` from `supabase.auth.signOut()`. On error, delete every name
from `authCookieNames` via `context.cookies.delete(name, { path: "/" })` — matching the path
`@supabase/ssr` set them on — and call `logDegraded` with cause `revoke-failed` and op
`auth.signOut.revoke`. The redirect target stays `/` in both cases. Deletion must precede the
redirect return (see Critical Implementation Details).

#### 3. Lift the annotation

**File**: `tests/integration/fault-signout.int.test.ts`

**Intent**: The spec becomes an ordinary regression test.

**Contract**: `it.fails()` → `it`. One assertion is **added**, not removed: replaying the original
cookie still authenticates `GET /api/paths`, documenting that the fix is a local sign-out and the
refresh token stays valid server-side. That makes any future move to a global revoke a deliberate
test edit rather than a silent behavior change.

### Success Criteria:

#### Automated Verification:

- `fault-signout.int.test.ts` passes un-annotated: `npm run test:integration`
- Unit suite passes, including `authCookies.test.ts`: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Deliberate break: revert **only** the cookie-clearing (keeping the log) and confirm
  `fault-signout.int.test.ts` reddens on the missing `Set-Cookie`
- Sign out through the real UI from both `Sidebar.astro` and `/dashboard` and confirm the happy
  path still redirects to `/` genuinely signed out
- The happy path emits **no** `[api] degraded` line

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 5: Registration

### Overview

Give the new channel a durable home. This phase exists because the frame traced the original loss
to precisely its absence: the same observation was recorded in an archived research doc and
reached no registry, no test, and no risk row.

### Changes Required:

#### 1. Contract surface

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the second log prefix beside the first, so a future developer cannot
reasonably reformat either.

**Contract**: Extend the section documenting the redacted `500` and its `ref` (`:85-88`) with the
`[api] degraded op=… cause=…` line, stating that it is entity-keyed rather than `ref`-keyed
**because no response body carries a handle**, and that its presence never implies a non-2xx
answer. Add a `POST /api/auth/signout` row to the route table — currently only `signin` appears —
recording the `302` to `/` and the clearing `sb-*` `Set-Cookie` on revoke failure.

#### 2. Risk row

**File**: `context/foundation/test-plan.md`

**Intent**: Put the class on the risk map so future coverage phases can cite it.

**Contract**: A new append-only row (`#11`, following `#10`) for "a discarded write/side-effect
result leaves no trace on any channel," with its rating paragraph in the established style,
naming what defends it (unit coverage of `audit.ts`, the two `updatedAt` assertions, the sign-out
fault spec) and what does not (no seam for the bump sites themselves).

#### 3. Lessons entry

**File**: `context/foundation/lessons.md`

**Intent**: Make the pattern a review prior, so the next instance is caught by reading rather than
by another sweep.

**Contract**: An entry in the file's established shape (Context / Problem / Rule / Applies to) on
the rule that a discarded write result is a decision requiring either an error check or a logged
line — and that a "check the error" fix is incomplete where zero rows with `error === null` is
reachable. Names the `serverError`-vs-`[api] degraded` split and cross-references F-2.

#### 4. Record F-2 as executed

**File**: `context/changes/swallowed-write-errors/change.md`

**Intent**: F-2's own `findings.md` lives under `context/archive/` and is immutable, so its
execution needs a home here.

**Contract**: A note recording that F-2 (`context/archive/2026-08-11-testing-api-contract-pinning/findings.md:51-80`)
was executed by Phase 2 as filed — keep degrading, log the step id — plus the frame's two
corrections to this change's own seed notes.

### Success Criteria:

#### Automated Verification:

- Formatting passes on every edited document: `npm run lint`

#### Manual Verification:

- `contract-surfaces.md` documents the `[api] degraded` prefix and carries a `POST /api/auth/signout` row
- `test-plan.md` carries risk row `#11` and its rating paragraph
- `lessons.md` carries the discarded-result entry
- `change.md` records F-2 as executed and the two frame corrections

---

## Testing Strategy

### Unit Tests:

- `audit.ts`: exact line format; all four `auditSideEffect` combinations, including the two that
  must emit nothing (`count === 1`, `count === null`)
- `authCookies.ts`: chunked token names, unrelated cookies untouched, empty header

### Integration Tests:

- `updatedAt` strictly advances after `POST` and after `DELETE` on `/api/paths/[id]/steps`
  (raw ISO comparison)
- A revoke failure issues a clearing `Set-Cookie` for every `sb-*` chunk, and the proxy's hit
  counter proves the failure was actually routed
- The replayed cookie still authenticates after a locally-cleared sign-out — the documented
  tradeoff

### Manual Testing Steps:

1. Confirm a successful bump reports `count === 1`, so the miss branch is live code.
2. Revert each audit call individually and confirm only its own signal reddens.
3. Run the sign-out spec with `it.fails()` removed and read the real error.
4. Write a corrupt snapshot into a `path_steps` row; confirm one line per mapper and that the
   path still loads.
5. Sign out through both UI entry points on the happy path.
6. Load a public page anonymously and confirm the log stays silent.

## Performance Considerations

`{ count: "exact" }` adds a `Prefer: count=exact` header to two `UPDATE`s already scoped to a
single row by primary key — negligible. The read-path logging is on a corruption branch that does
not execute in normal operation. Phase 3 adds one more `astro dev` boot to the integration run
(~15-20s), which is the phase's real cost.

## Migration Notes

None. No schema change, no data migration, and no wire-contract change — the only externally
visible delta is sign-out's `Set-Cookie` on a failure path that has never been observed to fire.

## References

- Frame brief: `context/changes/swallowed-write-errors/frame.md`
- Change identity and seed notes: `context/changes/swallowed-write-errors/change.md`
- Channel being mirrored: `src/lib/api/paths.ts:79-85`; registered at `docs/reference/contract-surfaces.md:85-88`
- In-repo counter-examples: `src/pages/api/paths/[id].ts:71-80`; `src/pages/api/paths/[id]/steps.ts:98-101`; `src/pages/api/auth/signin.ts:15-19`
- Prior records: `context/archive/2026-08-11-testing-api-contract-pinning/research.md:123`, `findings.md:51-80` (F-2)
- Binding lessons: `context/foundation/lessons.md:118` (inverted specs), `:241` (a fix worse than the defect), `:277` (targeted break per finding)
- Library source verified during planning: `@supabase/auth-js` `_signOut` / `_getUser`; `@supabase/postgrest-js` `update(values, {count})`; `@astrojs/cloudflare` `.dev.vars` load

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The evidence module

#### Automated

- [x] 1.1 Unit suite passes: `npm test` — f901e8e
- [x] 1.2 Type checking passes: `npm run typecheck` — f901e8e
- [x] 1.3 Linting passes with exactly one new justified exemption: `npm run lint` — f901e8e
- [x] 1.4 `audit.test.ts` covers all four `auditSideEffect` combinations and the exact line format — f901e8e

#### Manual

- [x] 1.5 `audit.ts` imports nothing from `astro:*` or `@/lib/supabase`, directly or transitively — f901e8e

### Phase 2: Wire the three evidence sites

#### Automated

- [x] 2.1 Unit suite passes: `npm test` — 83da84a
- [x] 2.2 Type checking passes: `npm run typecheck` — 83da84a
- [x] 2.3 Linting passes: `npm run lint` — 83da84a
- [x] 2.4 Integration suite passes, including the two new `updatedAt` assertions: `npm run test:integration` — 83da84a

#### Manual

- [x] 2.5 A successful bump reports `count === 1`, proving the miss branch is reachable — 83da84a
- [x] 2.6 Per-site deliberate break reddens only that site's own signal — 83da84a
- [x] 2.7 An anonymous request to a public page emits no `[api] degraded` line — 83da84a
- [x] 2.8 A corrupt snapshot logs once per mapper and the path still loads — 83da84a

### Phase 3: Fault-injection harness and the sign-out spec

#### Automated

- [x] 3.1 Integration suite passes with the new spec annotated `it.fails()`: `npm run test:integration` — 3e4c304
- [x] 3.2 Every pre-existing integration suite passes unchanged — 3e4c304
- [x] 3.3 Type checking passes: `npm run typecheck` — 3e4c304
- [x] 3.4 Linting passes: `npm run lint` — 3e4c304

#### Manual

- [x] 3.5 With the annotation removed, the failure is the missing `Set-Cookie`, not a harness error — 3e4c304
- [x] 3.6 All setup is in `beforeAll`, nothing load-bearing inside the inverted body — 3e4c304
- [x] 3.7 The proxy's logout hit count is non-zero, proving the fault server used the proxy — 3e4c304
- [x] 3.8 Total integration run time is still acceptable with the second boot — 3e4c304

### Phase 4: The sign-out fix

#### Automated

- [x] 4.1 `fault-signout.int.test.ts` passes un-annotated: `npm run test:integration` — c9e7708
- [x] 4.2 Unit suite passes, including `authCookies.test.ts`: `npm test` — c9e7708
- [x] 4.3 Type checking passes: `npm run typecheck` — c9e7708
- [x] 4.4 Linting passes: `npm run lint` — c9e7708

#### Manual

- [x] 4.5 Reverting only the cookie-clearing reddens `fault-signout.int.test.ts` — c9e7708
- [x] 4.6 Sign-out through both UI entry points still works on the happy path — c9e7708
- [x] 4.7 The happy path emits no `[api] degraded` line — c9e7708

### Phase 5: Registration

#### Automated

- [x] 5.1 Formatting passes on every edited document: `npm run lint` — b31970f

#### Manual

- [x] 5.2 `contract-surfaces.md` documents the `[api] degraded` prefix and a `POST /api/auth/signout` row — b31970f
- [x] 5.3 `test-plan.md` carries risk row `#11` and its rating paragraph — b31970f
- [x] 5.4 `lessons.md` carries the discarded-result entry — b31970f
- [x] 5.5 `change.md` records F-2 as executed and the two frame corrections — b31970f
