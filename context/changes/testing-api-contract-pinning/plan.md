# API Contract Pinning + Engine Golden Output Implementation Plan

## Overview

Test-plan §3 Phase 2. Declare the `/api/paths/*` wire contract as real types, pin it — request
and response — against a **decided** oracle, pin the engine's golden output at the two seams that
carry risk #6, and make both gates load-bearing. Covers risk #3 (a handler's contract changes and
a stale caller breaks silently) and risk #6 (the preserved full-paste add flow or the
resolve/diff/cost engine regresses behind the additive diff-mode change).

The phase is deliberately **not** test-only. Research established that the four highest-ranked
silent-break seams are cheaper to convert into `tsc` failures than to cover with assertions, and
that two contract holes (the 500-body leak, the missing `[id]` validation) cannot be honestly
pinned without first deciding them. Production changes are scoped to exactly those, plus the one
collation fix a reproducible golden requires.

## Current State Analysis

**The contract is real but undeclared.** Ten exported handlers across six route files, no schema
library, hand-written type guards. Success bodies are *domain* types (`UpgradePath`,
`PathStep` — `src/lib/path/types.ts:52,38`) routed through typed mappers (`toUpgradePath`,
`toPathStep` — `src/lib/api/paths.ts:47,83`), but the boundary itself is untyped:
`jsonResponse(data: unknown, status = 200)` (`src/lib/api/paths.ts:25`) accepts anything, so no
handler can be type-checked against a contract. Every client re-asserts with an unchecked `as`
cast (`PathEditor.tsx:287,442`, `NewPathForm.tsx:39`). The error envelope `{error: string}` is
declared **nowhere** server-side and re-declared inline in four places. The `{path, steps}`
composite is an inline object literal (`src/pages/api/paths/[id].ts:39-42`).

**The current suite pins statuses no client reads and misses the values every client depends on.**
`201` is pinned on both creates and `Array.isArray` on the list route
(`tests/integration/helpers/paths.ts:27,39`), yet every consumer only checks `response.ok` — so
`201 → 200` is invisible to users and fails CI, while `deltaText`, `position`, snapshot
round-trip, both `204`s, the `{path, steps}` envelope, every 400 body and the signin success
target are pinned by nothing.

**Risk #3's real mechanism is value drift, not rename drift.** Two of the seven handlers have no
application consumer: `GET /api/paths` is called by nothing and the `/paths` page uses a
*different* shape entirely (`toPathWithSummary` → `PathWithSummary[]`, `src/pages/paths/index.astro:22`);
`GET /api/paths/[id]` is duplicated by `src/pages/paths/[id].astro:22-30`, which runs the same
mappers with the same `.order()` clauses. The five mutating routes have exactly five call sites in
two components. The dangerous drift is `deltaText` collapsing `null → undefined`, the
server-assigned `position` the client ignores in favour of array order, and `snapshot`
round-tripping unvalidated.

**Risk #6 has a free lunch and a broken promise.** `diffDecks` (`src/lib/deck/diff.ts:105`) is
pure and order-stable by construction (fixed `CATEGORY_ORDER` at `:45`, in-group name sort at
`:87`) and needs zero stubbing — but today's `diff.test.ts` asserts only name/quantity
projections, its `card()` helper hard-coding every price and image to `null`. Meanwhile
`src/lib/path/derive.ts:6` claims a derived snapshot is "byte-equivalent" to a full-paste one,
while `deriveSnapshot` returns `[...working.values()]` (Map insertion order, `derive.ts:166`) and
full paste returns `resolved.map(...)` order (`src/lib/deck/quantity.ts:31`). The promise holds
as **multiset** equality only, and nothing verifies it in either direction.

**Constraints inherited from Phase 1.** A working DB-backed harness
(`tests/integration/**/*.int.test.ts` + `vitest.integration.config.ts` + `npm run test:integration`,
real HTTP through a `globalSetup`-spawned `astro dev` against local Supabase with RLS live);
`main` protected with `ci` + `integration` as required checks and `enforce_admins: true`; never
assert a bare status code (route through `helpers/http.ts#assertStatus`); and a suite that goes red
is not a gate — run the deliberate-break check as a PR, not locally.

## Desired End State

Every `/api/paths/*` route's request and response shape is declared in one importable module and
asserted against a written contract; the two `204`s, the `{path, steps}` envelope and every error
body are pinned for the first time; a realistic snapshot provably round-trips through
POST→persist→GET; the engine has committed goldens at the pure-diff and add-flow seams; and a
deliberate raw-row regression in `POST /api/paths/[id]/steps` turns `integration` red and reports
`BLOCKED` on a real PR.

Verify by: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:integration` all green locally; `ci` + `integration` green on the PR; and the
break-check PR showing red `integration` + `mergeStateStatus: BLOCKED`.

### Key Discoveries

- `jsonResponse(data: unknown, status = 200)` (`src/lib/api/paths.ts:25`) is the single point where
  the response type is erased — everything downstream is convention.
- `serializeSnapshot` rebuilds entries with `{...entry.card}` (`src/lib/path/snapshot.ts:78`) while
  `isCard` checks presence, not exhaustiveness (`:30-44`) — unknown keys inside a `card` survive
  validation and persist forever in an immutable row.
- On `POST steps`, body validation runs **before** the ownership check (`steps.ts:24` vs `:30`), so a
  malformed body aimed at another owner's path returns 400, not 404.
- `DELETE /api/paths/[id]/steps` never queries `upgrade_paths` — a cross-owner call gets
  `{error: "No steps to delete"}`, indistinguishable from an empty own path. Correct under RLS,
  but a contract fact worth pinning.
- `deltaText` never causes a 400: a non-string or blank value collapses to `null`
  (`src/lib/path/request.ts:60`).
- Astro's `security.checkOrigin` returns **403 plain text** (not JSON) for cross-origin non-GET
  requests that are form-like *or carry no `content-type` at all* — which covers both bodyless
  `DELETE` routes. That is why the harness sends `Origin` (`helpers/owners.ts:57`).
- `.snap` files are **not** gitignored (`.gitignore` has no `*.snap` or `__snapshots__` entry), and
  Vitest does not write new snapshots when `process.env.CI` is truthy — mismatches, **missing**
  snapshots and obsolete snapshots all fail the run. GitHub Actions sets `CI=true`, so the
  no-blind-`-u` guard is structural, not aspirational.
- `resolveCards` is imported at module scope (`plan.ts:16`, `derive.ts:27`) and `scryfall.ts` calls
  global `fetch` — no injection point exists. The established seam is
  `vi.mock("@/lib/card-data", importOriginal)` keeping `resolutionKey` real (`plan.test.ts:8-11`).
- Exactly two `localeCompare` sites exist: `src/lib/deck/diff.ts:87` and
  `src/components/deck/sort.ts:33`. Both are unlocalised.
- Two archived documents carry the "byte-equivalent" claim
  (`context/archive/2026-06-29-diff-style-checkpoint-entry/plan.md:27`, `plan-brief.md:17`) and are
  immutable per CLAUDE.md. The **live** copy is `src/lib/path/derive.ts:6`, and
  `context/foundation/prd-diff-checkpoint.md` does *not* use the phrase (FR-005/006/007 speak about
  the engine being unchanged, which remains true).

## What We're NOT Doing

- **Not** adding component or E2E tests (§7 exclusions). Seams #7/#8 are client-side couplings; we
  pin the server invariants that own those rules and document the coupling.
- **Not** re-testing the pure-logic engine's internals (§7). The goldens pin *output*; the 20-file
  unit suite keeps owning behavior.
- **Not** golden-testing `generateUpgradePlan` (seam B) — it would restate seam A's output under a
  mocked resolver.
- **Not** fixing three of the five contract holes found during research: `parseSnapshot`'s
  unknown-key passthrough, `toPathStep`'s silent corrupt-snapshot fallback, and `signup`'s unread
  `confirmPassword`. All three are filed as findings in Phase 4.
- **Not** touching `signup` / `signout`, the `?error=` auth failure channel, or page redirects.
  Only `signin`'s 302 + cookie + `Location` contract — the harness's own foundation — is pinned.
- **Not** deleting the consumer-less `GET /api/paths`, and **not** de-duplicating the
  `GET /api/paths/[id]` / SSR-page read path. Both are pinned; the duplication is recorded.
- **Not** changing branch protection. Contract tests ride the already-required `integration` job and
  goldens ride the already-required `ci` job.
- **Not** editing `context/archive/**` — archived changes are immutable.
- **Not** adding a sort to `derive.ts` / `quantity.ts`. We pin multiset equality, which is what the
  code guarantees.

## Implementation Approach

Production-first, then pin, then gate.

Phase 1 declares the contract and makes the two decisions that would otherwise force us to pin a
leak. This must come first: if the tests landed first they would pin the pre-fix 500 bodies and
then need editing, which is the oracle anti-pattern arriving through the back door.

Phase 2 pins `/api/paths/*` and `signin` in the existing harness. Phase 3 pins the engine goldens
and depends only on Phase 1 (the collation fix), so it can run in parallel with Phase 2. Phase 4
closes the gate, the cookbook and the registry. Phase 5 proves the whole thing with a
deliberate-break PR.

### The decided contract (the oracle)

Every assertion in Phase 2 cites this table, **not** the handler. `documented` = specified
independently of the current code by `context/archive/2026-06-26-user-accounts/plan.md:142-165` or
`context/archive/2026-06-29-testing-server-boundary-auth/research.md:90-103`. `decided` = the
archived docs are silent and this plan makes the call.

| Route | Status | Success body | Oracle |
| --- | --- | --- | --- |
| `GET /api/paths` | 200 | bare `UpgradePath[]`, `created_at` desc | documented (newest-first list) |
| `POST /api/paths` | 201 | `UpgradePath` | documented (created resource returned) |
| `GET /api/paths/[id]` | 200 | `{path, steps}`, steps by `position` asc | documented (path + ordered steps); the **envelope shape** is decided |
| `PATCH /api/paths/[id]` | 200 | `UpgradePath` (post-update) | **decided** — `PathEditor.tsx:444` reads `updated.title`, so a body is required; 204 is rejected |
| `DELETE /api/paths/[id]` | 204 | empty | **decided** — no consumer reads a body; `handleDeletePath` only checks `.ok` |
| `POST /api/paths/[id]/steps` | 201 | `PathStep`, incl. server-assigned `position` and `deltaText` | documented (`position = max+1`, base is 0) |
| `DELETE /api/paths/[id]/steps` | 204 | empty | **decided**; the delete-last invariant itself is documented |
| `POST /api/auth/signin` | 302 | `Location: /paths` + chunked `sb-*` `Set-Cookie` | documented (302 for pages, 401 JSON for API) |

Error bodies:

| Case | Status | Body | Oracle |
| --- | --- | --- | --- |
| no/invalid session on any `/api/paths/*` | 401 | `{error: "Unauthorized"}` | documented; already pinned |
| missing/blank `title` | 400 | `{error: "Title is required"}` | documented (reject-400 on invalid input) |
| malformed step body | 400 | `{error: "Invalid step payload"}` | **decided** |
| absent, not-owned, or **non-UUID** `[id]` | 404 | `{error: "Not found"}` | documented for absent/not-owned; **non-UUID is decided (changed)** |
| `DELETE steps` with no visible steps | 404 | `{error: "No steps to delete"}` | **decided**; also the cross-owner shape |
| unexpected server failure | 500 | `{error: "Internal error", ref: "<uuid>"}` | **decided (changed)** — the raw `PostgrestError.message` leaks table/column/constraint names |

Three contract-wide decisions:

1. **Key sets are closed.** Each success body's key set is pinned exactly — no extra keys, none
   missing. An additive field is therefore a deliberate test edit, not a silent pass.
2. **`deltaText` is `string | null`, never `undefined`, never absent.** On the request it is
   optional and collapses (non-string/blank → `null`); on the response it is always present.
3. **`position` is server-owned.** A `position` in the request body is ignored; the response
   carries `max+1` (base is 0).

## Critical Implementation Details

**`jsonResponse<T>` only gates if call sites are explicitly parameterized.** A bare
`jsonResponse<T>(data: T, …)` infers `T` from the argument and therefore checks nothing. The
contract enforcement comes from writing the type argument at each handler —
`jsonResponse<UpgradePath>(toUpgradePath(row), 201)` — so a mapper that stops producing an
`UpgradePath` fails at `tsc`. This is the mechanism that converts research's ranked seam #1 into a
compile error; without the explicit argument, Phase 1 buys nothing.

**Nothing currently typechecks in CI.** `npm run lint` (ESLint, type-aware) uses type information
for its own rules but does not report core assignability errors, and `astro build` does not
typecheck at all — `astro check` is a separate command. So the typed contract is not a gate until
`astro check` runs in the `ci` job. Phase 1 adds both the script and the CI step; skip it and
decision "types + tests" silently degrades to "tests only."

**Redacting the 500 body destroys Phase 1's diagnosis rule unless the dev-server log is surfaced
first.** `global-setup.ts:122-128` accumulates the spawned server's stdout/stderr into a local
`log` string that is printed **only** when boot fails; after boot it is captured and discarded. The
whole reason `assertStatus` exists is that a 500's body named the cause
(`permission denied for table upgrade_paths`). Moving that detail server-side without piping the
child's output to the parent's stderr sends it nowhere. Within Phase 1, the log-surfacing change
must land with (or before) the redaction, and the `ref` is what correlates the HTTP failure to the
logged line.

**Expected key lists must be literal in the tests.** The shape asserters may import the domain
types for compile-time convenience, but the runtime key arrays are written out as literal strings.
Deriving them from the type (or from `Object.keys` of a live response) reintroduces the tautology
this phase exists to avoid — a rename would silently rename the expectation.

**The page-agreement check compares ordering in raw HTML, not the DOM.** Seed steps with
distinctive timestamp-suffixed names, fetch `/paths/{id}` with owner cookies, and compare each
name's `indexOf` position in the response text against the API's `steps[].name` order. This
catches a divergent `.order()` clause or mapper without parsing markup, keeping the check clear of
§7's component-testing exclusion.

**Choose golden fixture prices that sum exactly in binary.** `planAddCost` accumulates raw floats
(`cost.ts:38`) and `PlanCost.total` is unrounded, so arbitrary prices produce a snapshot like
`12.870000000000001`. The accumulation *order* is deterministic (everything flows through
`groupByCategory`'s sort), so the value is stable — just ugly and fragile to read. Use prices that
are exact binary fractions (`.25`, `.5`, `.75`) so the recorded golden is reviewable.

**Seam C needs no `clearSessionCache()`.** With `resolveCards` mocked, the real `sessionCache` in
`resolve.ts` is never touched, so cache warmth cannot affect ordering. The order difference under
test is the genuine one — `derive.ts:166`'s Map order vs `quantity.ts:31`'s `resolved.map` order.
To prove the multiset equality is not an accident of the mock's return order, run the comparison
twice with the mock's `resolved` array permuted.

---

## Phase 1: Declare the contract

### Overview

Turn the wire contract into importable types with an explicitly parameterized response helper, make
the two decided contract changes (500 redaction, `[id]` validation), pin collation, put a typecheck
in CI, and correct the live "byte-equivalent" docstring.

### Changes Required

#### 1. The declared wire contract

**File**: `src/lib/api/contract.ts` (new)

**Intent**: Give the `/api/paths/*` boundary a single declaration site that both the server and the
browser can import, replacing the four inline `{error?: string}` re-declarations and the inline
`{path, steps}` literal.

**Contract**: Types only, no runtime imports beyond `@/lib/path` types, so it is safe to import
from a React island. Exports: `ApiError { error: string }`;
`ApiServerError extends ApiError { ref: string }`;
`PathWithStepsResponse { path: UpgradePath; steps: PathStep[] }`;
`PathTitleRequest { title: string }`;
`StepCreateRequest { name: string; listText: string; snapshot: StepSnapshot; deltaText?: string | null }`.

#### 2. Typed response helpers

**File**: `src/lib/api/paths.ts`

**Intent**: Make the response type checkable and stop every 500 from echoing Postgres text, while
keeping a correlation handle for diagnosis.

**Contract**: `jsonResponse<T>(data: T, status?: number): Response` (existing name, now generic —
call sites must pass the type argument explicitly, see Critical Implementation Details);
`errorResponse(message: string, status: number): Response` returning an `ApiError` body;
`serverError(detail: unknown): Response` which generates a `ref` via `crypto.randomUUID()`, calls
`console.error` with `ref` plus the detail, and returns `{error: "Internal error", ref}` at 500.
Also add `parsePathId(context: APIContext): string | null` — `null` for a missing **or non-UUID**
`params.id`, so a malformed id yields the decided 404 instead of a 500 with raw Postgres text.

#### 3. Handlers adopt the helpers

**File**: `src/pages/api/paths/index.ts`, `src/pages/api/paths/[id].ts`, `src/pages/api/paths/[id]/steps.ts`

**Intent**: Route every success body through an explicitly parameterized `jsonResponse<T>`, every
4xx through `errorResponse`, and all eleven 500 sites through `serverError`; replace the
falsiness-only `params.id` checks with `parsePathId`.

**Contract**: Per the decided-contract table — statuses and error strings unchanged except the 500
body and the non-UUID `[id]` path. Type arguments: `UpgradePath[]` (list), `UpgradePath` (create,
patch), `PathWithStepsResponse` (get one), `PathStep` (step create). The two `204`s keep
`new Response(null, { status: 204 })`. Validation still runs before the ownership check on
`POST steps`.

#### 4. One typed client seam

**File**: `src/lib/api/client.ts` (new)

**Intent**: Collapse the three ad-hoc `as` casts and four inline error-envelope re-declarations into
one place whose success type flows from `contract.ts`.

**Contract**: `requestJson<T>(input: string, init?: RequestInit): Promise<RequestResult<T>>` where
`RequestResult<T>` is a discriminated union of `{ ok: true; data: T }`,
`{ ok: false; status: number; error: string }` (error message taken from the `ApiError` body when
parseable, else a status-derived fallback) and a transport-failure variant. Browser-safe: no
imports from `paths.ts` (server-only plumbing).

#### 5. Client call sites

**File**: `src/components/path/PathEditor.tsx`, `src/components/path/NewPathForm.tsx`

**Intent**: Replace the five raw `fetch` + `as` sites with `requestJson<T>` so the response types
come from the declared contract, and keep the existing user-visible error messages.

**Contract**: `handleAddStep` → `requestJson<PathStep>`; `handleRename` → `requestJson<UpgradePath>`;
`NewPathForm.handleSubmit` → `requestJson<UpgradePath>`; the two 204 deletes keep checking success
only. The existing `addToken` / `checkToken` in-flight guards, the optimistic `slice(0, -1)`, and
every message string stay as they are — this is a plumbing swap, not a behavior change.

#### 6. Pin collation

**File**: `src/lib/deck/diff.ts`, `src/components/deck/sort.ts`

**Intent**: Make card ordering identical across a contributor's machine, CI and a Cloudflare worker.
Today collation depends on the runtime's default locale, so in-group order can differ between
environments — a user-visible ordering bug independent of any test, and the one nondeterminism
source that survives full stubbing.

**Contract**: Both `localeCompare` calls (`diff.ts:87`, `sort.ts:33`) take an explicit `"en"` locale.
No other call sites exist.

#### 7. Surface the dev-server log

**File**: `tests/integration/global-setup.ts`

**Intent**: Keep the Phase 1 diagnosis path alive now that 500 detail moves server-side.

**Contract**: The spawned child's `stdout`/`stderr` handlers additionally write to the parent's
`process.stderr` (the boot-failure buffer stays as-is). Server-side `console.error` lines — the
`ref` plus the Postgres detail — then appear in the CI log.

#### 8. Typecheck script + CI step

**File**: `package.json`, `.github/workflows/ci.yml`

**Intent**: Make the typed contract an actual gate. Without this, a genuine assignability error
passes both `eslint` and `astro build`.

**Contract**: `"typecheck": "astro check"` in scripts; a `npm run typecheck` step in the `ci` job
after `npm run lint`. No branch-protection change — `ci` is already required.

#### 9. Correct the live "byte-equivalent" claim

**File**: `src/lib/path/derive.ts`

**Intent**: Stop the module docstring from promising more than the function delivers.

**Contract**: The docstring's "byte-equivalent to the snapshot the same list entered via full paste
would build" becomes an explicit multiset statement — equal as a multiset of
`(card, quantity)` pairs, with array order unspecified because `deriveSnapshot` emits Map insertion
order while full paste emits resolver order. Note that everything user-visible flows through
`groupByCategory`'s sort, which is why the difference has never surfaced.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Typechecking passes: `npm run typecheck`
- Unit suite passes: `npm test`
- Build passes: `npm run build`
- Existing integration suite still passes: `npm run test:integration`
- `ci` job runs `npm run typecheck` and is green on the PR
- A non-UUID id returns the decided 404: `curl -i .../api/paths/not-a-uuid` with owner cookies
- No 500 body contains Postgres text: `grep -rn "error.message" src/pages/api/` returns nothing

#### Manual Verification

- Create, rename, add-checkpoint, delete-last and delete-path all still work in the browser, with
  unchanged error messages on a forced failure
- A forced 500 (e.g. temporarily revoked grant) shows `{error: "Internal error", ref}` in the
  response and the matching `ref` + Postgres detail in the dev-server console
- Card order inside a category is unchanged for an existing path after the collation fix

**Implementation Note**: After this phase and all automated verification passes, pause for manual
confirmation before proceeding. Phase blocks use plain bullets; the `- [ ]` checkboxes live in
`## Progress`.

---

## Phase 2: Pin `/api/paths/*` and signin

### Overview

Assert the decided contract through real HTTP in the existing harness — all seven path routes plus
signin, request side and response side, including the four surfaces nothing covers today.

### Changes Required

#### 1. Shape-assertion helper

**File**: `tests/integration/helpers/shape.ts` (new)

**Intent**: One place that enforces closed key sets and the per-field type rules, so each route test
reads as a contract statement rather than a pile of `expect`s.

**Contract**: `expectExactKeys(value: unknown, keys: readonly string[], label: string)` — fails on
any missing or extra key, naming both sets in the message. Plus `expectUpgradePath(value, label)`
and `expectPathStep(value, label)` asserting the literal key lists and each field's type
(`deltaText` explicitly `string | null`, never `undefined`; `position` a number; `snapshot` an
object with `cards` and `unresolved` arrays). Key lists are literal strings — never derived from the
types or from a live response.

#### 2. Realistic snapshot fixture

**File**: `tests/integration/helpers/snapshot.ts` (new)

**Intent**: A snapshot worth round-tripping — the minimal one the current helper sends
(`{cards: [], unresolved: []}`) exercises neither value-shaped seam.

**Contract**: A factory returning a `StepSnapshot` with cards across at least three categories, at
least one entry with `priceUsd: null` and `priceEur: null` (the `$NaN` seam), at least one
`imageUrl: null`, and at least one `unresolved` entry per reason variant the guard accepts. Values
are literal, not generated.

#### 3. Path-route contract suite

**File**: `tests/integration/contract-paths.int.test.ts` (new)

**Intent**: Pin the five `/api/paths` + `/api/paths/[id]` routes against the decided-contract table,
including the three surfaces no test has ever exercised: the `{path, steps}` happy path, the PATCH
response body, and a successful `DELETE` (204).

**Contract**: `GET /api/paths` → 200, bare array, `createdAt` descending across two seeded paths,
each element passing `expectUpgradePath`. `POST /api/paths` → 201 + `UpgradePath`; blank and
missing `title` → 400 `{error: "Title is required"}`; a `title` with surrounding whitespace comes
back trimmed. `GET /api/paths/[id]` → 200 with exactly the keys `path` and `steps`, `path` passing
`expectUpgradePath`, `steps` in ascending `position`. `PATCH` → 200 + the post-update
`UpgradePath` whose `title` is the new value and whose `updatedAt` advanced; blank title → 400.
`DELETE` → **204 with an empty body**, then a follow-up `GET` → 404. Non-UUID and unknown-UUID ids
→ 404 `{error: "Not found"}`. Owner cookies via `createSignedInOwner`; `Origin` header on every
mutating request; self-cleaning timestamped emails; status checks through `assertStatus`.

#### 4. Step-route contract suite

**File**: `tests/integration/contract-steps.int.test.ts` (new)

**Intent**: Pin the step routes plus the three value-drift seams research ranked highest —
`deltaText`, server-assigned `position`, and the snapshot round-trip.

**Contract**: `POST steps` → 201 + `PathStep` passing `expectPathStep`. `position` is `0` for the
first step and `1` for the second **even when the request body sends a conflicting `position`**.
`deltaText`: absent → `null`; blank string → `null`; non-string → `null` and still 201 (never a
400); a real delta string → returned verbatim. Snapshot round-trip: POST the realistic fixture,
read it back via `GET /api/paths/[id]`, and deep-compare `steps[0].snapshot` to the fixture —
including the null-priced card and every unresolved entry. Malformed bodies (missing `name`, blank
`name`, non-string `listText`, snapshot failing the guard) → 400
`{error: "Invalid step payload"}`, and a malformed body aimed at **another owner's** path → 400,
not 404 (validation precedes the ownership check). `DELETE steps` → **204 empty body**, removing
only the highest-position step; a second delete on a now-empty path → 404
`{error: "No steps to delete"}`; the same call against another owner's path → 404 with that same
body.

#### 5. Handler ↔ SSR page agreement

**File**: `tests/integration/contract-page-agreement.int.test.ts` (new)

**Intent**: Catch the one live drift risk — `GET /api/paths/[id]` and `src/pages/paths/[id].astro`
independently query and map the same rows with the same `.order()` clauses, and nothing notices when
one changes.

**Contract**: Seed a path with three distinctively named steps, fetch both `/api/paths/{id}` (JSON)
and `/paths/{id}` (HTML) with the same owner cookies, and assert each step name's first `indexOf` in
the HTML is strictly increasing in the same order as the API's `steps[].name`, and that the path
title appears. Raw-text index comparison, not DOM parsing (see Critical Implementation Details).

#### 6. Signin contract suite

**File**: `tests/integration/contract-signin.int.test.ts` (new)

**Intent**: Pin the harness's own foundation. Every suite depends on signin's 302 + cookie shape,
and a change there currently fails everything with a confusing error.

**Contract**: `POST /api/auth/signin` with urlencoded credentials and a matching `Origin`, using
`redirect: "manual"` → 302 with `Location: /paths` and at least one `sb-*` `Set-Cookie`; the
reassembled cookie header then authenticates `GET /api/paths` → 200. Also pin that a missing
`Origin` on the same request is rejected by Astro's CSRF check with **403 plain text**, not a JSON
error — the framework behaviour every future test author trips over.

#### 7. Retire the pinned-201-in-a-helper pattern

**File**: `tests/integration/helpers/paths.ts`

**Intent**: The helper's `201` and `CreatedPath {id, title}` are a third declaration of the create
response and an incidental contract pin inside setup code. Contract assertions belong in the
contract suites; setup should just work.

**Contract**: `createPath`/`addStep` keep `assertStatus` (a failure there must stay diagnosable) but
their return types come from `contract.ts` rather than the local `CreatedPath` interface. Behavior
unchanged; no existing suite's assertions move.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Typechecking passes: `npm run typecheck`
- Full integration suite passes: `npm run test:integration`
- The suite passes **twice in a row** without a DB reset (self-cleaning, per §6.2 rule 9)
- `integration` job green on the PR
- Every new file is globbed by the integration config: the run reports the five new
  `contract-*.int.test.ts` files

#### Manual Verification

- Each new assertion traces to a row in the decided-contract table, with `documented` vs `decided`
  visible in the test's comment
- No new test reads a value from the handler to build its own expectation
- Failure messages are diagnosable: force one shape break locally and confirm the message names the
  missing/extra key

**Implementation Note**: Pause for manual confirmation after this phase before proceeding.

---

## Phase 3: Engine goldens

### Overview

Pin the engine's output at the two seams that carry risk #6: the pure, order-stable diff (seam A)
and the full-paste-vs-diff-derived add flow (seam C). Depends only on Phase 1's collation fix.

### Changes Required

#### 1. Pure-diff golden

**File**: `src/lib/deck/diff.golden.test.ts` (new)

**Intent**: Capture everything today's `diff.test.ts` projects away. Its `card()` helper hard-codes
`imageUrl`, `priceUsd` and `priceEur` to `null` and its assertions flatten to name/quantity pairs,
so `typeLine`, images, both prices and group boundaries are unpinned — a golden adds all of them for
zero stubbing cost.

**Contract**: A literal fixture pair (base, target) covering: cards across at least four
`CATEGORY_ORDER` buckets; a partially-changed card that must appear in **both** `shared` and
`add`/`remove`; an unchanged-count card that must appear in neither; a null-priced card; and names
whose ordering exercises the in-group sort. Assert `diffDecks(base, target)` with `toMatchSnapshot()`
and `planAddCost(plan.add)` with a second `toMatchSnapshot()`. Fixture prices are exact binary
fractions so the recorded total is reviewable (see Critical Implementation Details). Matches repo
conventions: named `vitest` imports, local factory helper, `@/` alias.

#### 2. Add-flow equality golden

**File**: `src/lib/path/add-flow.golden.test.ts` (new)

**Intent**: Test risk #6's actual claim — that a diff-mode checkpoint and a full-paste checkpoint of
the same resulting list produce the same snapshot — at the only seam that can express it.

**Contract**: Mock `@/lib/card-data` with `importOriginal`, keeping `resolutionKey` real
(`plan.test.ts:8-11` pattern). Build a prior snapshot, apply a delta covering every branch
(`+` new card, `+` existing card bumping quantity, `-` partial reduction, `-` to zero removing the
card, `-` not-in-prior producing a `not-in-prior` warning, a malformed line), then resolve the
equivalent full list through `resolveDeck`. Assert:

- the two `cards` arrays are equal as multisets of `(card.name, quantity)` after canonical sorting,
  and equal in full card content — **and that array order differs**, so the weaker guarantee is
  pinned as a fact rather than left implicit;
- `unresolved` matches as a multiset, with `prior.unresolved` carried forward;
- warnings are preview-only and appear in **neither** snapshot;
- `toMatchSnapshot()` on the canonicalised derived snapshot and on `DeriveSummary`;
- re-running with the mock's `resolved` array **permuted** yields the same multiset result, proving
  the equality is not an artifact of mock ordering.

No `clearSessionCache()` — with `resolveCards` mocked the real cache is never touched.

#### 3. Snapshot guard verification

**File**: `context/changes/testing-api-contract-pinning/plan.md` (this file, Progress section)

**Intent**: `toMatchSnapshot` records the current output, which is the named anti-pattern
mechanised. Three guards make it honest, and each is verified rather than assumed.

**Contract**: (a) The recorded `.snap` files are reviewed line-by-line in the PR against the
fixture's hand-computed expectation before merge — a recorded value that surprises the reviewer is a
bug found, not a golden written. (b) `.snap` files are committed (`.gitignore` has no `*.snap` /
`__snapshots__` entry — confirmed). (c) `CI=1 npx vitest run` with a `.snap` file deleted must
**fail**, not silently rewrite — proving nobody can `-u` past the golden in CI.

### Success Criteria

#### Automated Verification

- Unit suite passes: `npm test`
- Linting and typechecking pass: `npm run lint`, `npm run typecheck`
- Snapshot files exist and are tracked: `git ls-files src/**/__snapshots__/*.snap` lists both
- CI refuses to write a missing snapshot: delete one `.snap`, run `CI=1 npx vitest run`, observe
  failure, restore
- Re-running `npm test` twice produces no snapshot churn (`git status` clean)
- `ci` job green on the PR

#### Manual Verification

- Each recorded `.snap` was read in full and matches the hand-computed expectation for its fixture —
  prices, categories, group order and boundaries
- The `planAddCost` golden's total is a clean decimal, not a float artifact
- The add-flow test's "array order differs" assertion actually holds (it documents the real
  guarantee; if it ever stops holding, the docstring correction from Phase 1 needs revisiting)

**Implementation Note**: Pause for manual confirmation after this phase before proceeding.

---

## Phase 4: Gate, cookbook, registry

### Overview

Make the two gates real (they need no branch-protection change), fill the §6.3 cookbook stub, update
the load-bearing-names registry, and file the three contract holes we chose not to fix.

### Changes Required

#### 1. Gate confirmation

**File**: `context/foundation/test-plan.md` (§5)

**Intent**: Record that the contract gate is enforced, and where. Per the Phase 1 lesson, a row in
this table is aspirational unless a required check actually runs the suite.

**Contract**: The `contract (/api/paths/*)` row moves from "required after §3 Phase 2" to required,
with an explicit note that it runs **inside** the existing `integration` job (the `.int.test.ts`
infix is what `vitest.integration.config.ts` globs) and that the goldens run inside `ci` via
`npm test` — so no job name was added and no branch-protection change was needed. Also record that
`ci` now runs `npm run typecheck`, making the declared wire types part of the gate.

#### 2. Cookbook §6.3

**File**: `context/foundation/test-plan.md` (§6.3)

**Intent**: Replace the TBD stub with the recipe, as §6.2 did for Phase 1.

**Contract**: Location/naming (`tests/integration/contract-*.int.test.ts`), the decided-contract
table as the oracle and the rule that assertions cite it rather than the handler, closed key sets
via `helpers/shape.ts` with literal key lists, `assertStatus` for statuses, `Origin` on every
mutating request, and the golden rules: `.snap` files are committed, CI fails on missing snapshots,
and **never run `-u` without diffing the recorded value against the fixture's expected output**.

#### 3. Phase note §6.6

**File**: `context/foundation/test-plan.md` (§6.6)

**Intent**: Capture what this phase taught, in the voice §6.6 established.

**Contract**: Three notes — (a) nothing typechecked in CI, so "types as a contract gate" was a
no-op until `astro check` was wired; (b) redacting a 500 body silently destroys the Phase 1
diagnosis rule unless the dev-server log is piped to the parent's stderr; (c) the archived
"byte-equivalent" promise was stronger than the code, and the live docstring was the copy worth
correcting — the two archived copies are immutable and now stand superseded.

#### 4. Registry update

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the surfaces this phase makes load-bearing and fix the three descriptions
research found stale. The file was last touched ~2026-06-16, so everything from `user-accounts`
onward is unrepresented.

**Contract**: Fix `generateUpgradePlan`'s description (it orchestrates parse → `resolveDeck` ×2 →
`diffDecks`, not parse → `resolveCards` → `attachQuantities` → `diffDecks`); note `splitCardLine`'s
third, **cross-module** consumer in `src/lib/path/delta.ts` (so it is no longer "module-internal" in
the sense implied); correct `formatUsd`'s "single USD display formatter" claim and register
`formatSignedUsd` (`src/components/deck/labels.ts:50`). Add rows for `resolveDeck` / `ResolvedDeck`.
Add a new **API wire contract** section registering the seven `/api/paths/*` routes with their
decided statuses and bodies, `signin`'s 302 + cookie contract, `src/lib/api/contract.ts` as the
declaration site, `jsonResponse` / `errorResponse` / `serverError` / `parsePathId`,
`requestJson`, and the snake_case→camelCase mapping convention (currently documented only in a code
comment).

#### 5. File the deferred findings

**File**: `context/changes/testing-api-contract-pinning/findings.md` (new)

**Intent**: The three contract holes we chose not to fix must not evaporate.

**Contract**: One entry each, with a code reference, the observed behavior, why it was deferred, and
a suggested owner-phase: `parseSnapshot`'s unknown-key passthrough (`snapshot.ts:78,102` — extra
keys inside a `card` survive validation and persist forever in an immutable row); `toPathStep`'s
silent `?? {cards: [], unresolved: []}` fallback turning corruption into an empty checkpoint
(`paths.ts:90`); and `signup` accepting an unread `confirmPassword` with `as string` casts that make
a missing field `null` typed `string` (`SignUpForm.tsx:66` vs `signup.ts:6-7`). Also record the two
duplications this phase pinned rather than removed: the consumer-less `GET /api/paths`, and the
`GET /api/paths/[id]` ↔ `paths/[id].astro` read-path copy.

#### 6. Change identity

**File**: `context/changes/testing-api-contract-pinning/change.md`, `context/foundation/test-plan.md` (§3)

**Intent**: Keep the orchestrator's state accurate.

**Contract**: `change.md` → `status: implementing` then `complete`, `updated` stamped. The §3 Phase 2
row's Status follows the fixed vocabulary (`planned` → `implementing` → `complete`).

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint` (Prettier formats the markdown via lint-staged)
- Both suites pass: `npm test`, `npm run test:integration`
- Every registry row resolves: each new `Location` path exists and each named export is exported
- `ci` + `integration` green on the PR

#### Manual Verification

- §6.3 is a recipe someone could follow without reading this plan
- Every registry claim is verified against the code, not copied from research
- The three findings each name a file and line that still exist

**Implementation Note**: Pause for manual confirmation after this phase before proceeding.

---

## Phase 5: Deliberate-break PR

### Overview

Prove the gate is load-bearing. Per Phase 1's closing lesson, a suite that goes red is not a gate,
and only a PR — not a local revert — proves the red actually blocks.

### Changes Required

#### 1. The break

**File**: `src/pages/api/paths/[id]/steps.ts` (temporary, on a throwaway branch)

**Intent**: Reproduce research's #1 ranked seam. Return the raw DB row instead of the mapped
`PathStep` — the change both sides currently compile through, where `deltaText` becomes `undefined`,
`undefined !== null` renders a spurious "diff" badge plus an empty "Entered changes" block on every
newly added checkpoint, and a page reload *heals* it because the SSR mapper is still correct. It
presents as a flake.

**Contract**: Swap `jsonResponse<PathStep>(toPathStep(data), 201)` for the raw row. Expected
failures, in order: `npm run typecheck` fails first (the row is not a `PathStep` — the Phase 1
mechanism working as designed), and with the type argument removed to get past that,
`contract-steps.int.test.ts` fails on both the closed key set (snake_case keys present, camelCase
absent) and the `deltaText` rule. Record both outcomes — the two-layer failure is the point.

#### 2. Verify the block

**File**: none (PR + branch protection observation)

**Intent**: Confirm `main` actually refuses the merge.

**Contract**: Open the break as a PR to `main`. Expect `ci` red (typecheck, then unit if applicable),
`integration` red on the contract suites, and `gh pr view --json mergeStateStatus` reporting
`BLOCKED`. Close the PR without merging and delete the branch. Nothing from this phase lands.

### Success Criteria

#### Automated Verification

- `gh pr checks` shows `integration` failing on `contract-steps.int.test.ts`
- `gh pr view --json mergeStateStatus` reports `BLOCKED`
- After closing the PR, `main` is unchanged: `git log origin/main -1` is the Phase 4 commit

#### Manual Verification

- The failure message names the missing/extra keys and the `deltaText` violation — diagnosable from
  the CI log alone, without reproducing locally
- The typecheck failure arrives before the test failure, confirming the declared contract is the
  cheaper gate
- §6.6 records the observed order of failures

---

## Testing Strategy

### Unit Tests (goldens, `npm test`, `ci` job)

- `diffDecks` golden: partitions, group order, in-group order, quantities, `typeLine`, `imageUrl`,
  both prices; partially-changed card in two partitions; unchanged-count card in neither
- `planAddCost` golden: total, `pricedCount`, `missingCount` with a null-priced card
- Add-flow equality: derived vs full-paste snapshot as multisets; array order differs; unresolved
  carried forward; warnings in neither snapshot; stable under a permuted mock order

### Integration / Contract Tests (`npm run test:integration`, `integration` job)

- All seven `/api/paths/*` routes against the decided-contract table: statuses, closed key sets,
  field types, ordering (`createdAt` desc, `position` asc)
- First-ever coverage: the `{path, steps}` happy path, the PATCH response body, both `204`s
- Request side: 400 bodies and strings, `deltaText` collapse rules, server-owned `position`,
  validation-before-ownership on `POST steps`
- Realistic snapshot round-trip through POST → persist → GET, including a null-priced card and every
  unresolved reason
- Handler ↔ SSR page ordering agreement for `/paths/[id]`
- `signin`: 302 + `Location` + chunked `sb-*` cookies that then authenticate; missing `Origin` → 403
  plain text

### Manual Testing Steps

1. Sign in, create a path, add a full-paste checkpoint, add a diff-mode checkpoint — confirm the
   diff badge appears only on the diff-entered one (the seam-#1 symptom, absent)
2. Rename a path; confirm the input closes and the new title shows without a reload
3. Delete the last checkpoint, then delete the path; confirm navigation to `/paths`
4. Force a 500 (temporarily revoke a grant); confirm the response body carries `ref` and no Postgres
   text, and the same `ref` appears in the server console
5. Request `/api/paths/not-a-uuid` with owner cookies; confirm 404 `{error: "Not found"}`
6. Open an existing path and confirm in-group card order is unchanged after the collation fix

## Performance Considerations

The contract suites add ~5 files to a serialized run (`fileParallelism: false`, one DB and one dev
server) with 30s timeouts. Each suite seeds its own owner, so the cost is dominated by signin round
trips — reuse one signed-in owner per file via `beforeAll` rather than per test. The goldens are
pure and add negligible time to `npm test`. No second Supabase stack or dev server is introduced.

## Migration Notes

No schema change and no data migration. Two behavior changes reach production:

- **500 bodies change shape** from `{error: <postgres message>}` to `{error: "Internal error", ref}`.
  No client reads a 500 body beyond `body?.error`, so the UI degrades from a Postgres string to a
  generic message — an improvement. Anyone debugging via the network tab now needs the server log,
  correlated by `ref`.
- **A non-UUID `[id]` returns 404 instead of 500.** No caller relies on the 500; the 404 is the shape
  the original design specified.

The collation fix may visibly reorder cards within a category for anyone whose runtime currently
collates differently from `"en"`. Snapshot card order is persisted immutably, but display order is
recomputed through `groupByCategory` on every read, so no stored data is affected.

## References

- Research: `context/changes/testing-api-contract-pinning/research.md`
- Change identity: `context/changes/testing-api-contract-pinning/change.md`
- Test plan: `context/foundation/test-plan.md` §2 (risks #3/#6 + Risk Response Guidance), §5 (gates),
  §6.2 (the harness recipe to reuse), §6.3 (the stub this phase fills), §7 (exclusions)
- Documented oracle: `context/archive/2026-06-26-user-accounts/plan.md:142-165`;
  `context/archive/2026-06-29-testing-server-boundary-auth/research.md:90-103`
- Superseded claim: `context/archive/2026-06-29-diff-style-checkpoint-entry/plan.md:27` and
  `plan-brief.md:17` (immutable; corrected in `src/lib/path/derive.ts` and recorded in §6.6)
- Phase 1 precedent: `context/archive/2026-06-29-testing-server-boundary-auth/plan.md:428-457`
- Harness patterns: `tests/integration/helpers/http.ts:12`, `helpers/owners.ts:57`,
  `tests/integration/global-setup.ts:55-75`
- Established mock seam: `src/lib/deck/plan.test.ts:8-11`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Declare the contract

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 00332d2
- [x] 1.2 Typechecking passes: `npm run typecheck` — 00332d2
- [x] 1.3 Unit suite passes: `npm test` — 00332d2
- [x] 1.4 Build passes: `npm run build` — 00332d2
- [x] 1.5 Existing integration suite still passes: `npm run test:integration` — 00332d2
- [x] 1.6 `ci` job runs `npm run typecheck` and is green on the PR — 00332d2
- [x] 1.7 A non-UUID id returns the decided 404 — 00332d2
- [x] 1.8 No 500 body contains Postgres text — 00332d2

#### Manual

- [x] 1.9 All five path mutations still work in the browser with unchanged error messages — 00332d2
- [x] 1.10 A forced 500 shows `{error, ref}` and the matching `ref` + detail in the server console — 00332d2
- [x] 1.11 In-category card order unchanged for an existing path after the collation fix — 00332d2

### Phase 2: Pin `/api/paths/*` and signin

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 6fedd2b
- [x] 2.2 Typechecking passes: `npm run typecheck` — 6fedd2b
- [x] 2.3 Full integration suite passes: `npm run test:integration` — 6fedd2b
- [x] 2.4 The suite passes twice in a row without a DB reset — 6fedd2b
- [x] 2.5 `integration` job green on the PR — 6fedd2b
- [x] 2.6 All five new `contract-*.int.test.ts` files are picked up by the integration config — 6fedd2b

#### Manual

- [x] 2.7 Every assertion traces to a decided-contract row, marked `documented` or `decided` — 6fedd2b
- [x] 2.8 No test builds its expectation from a handler's output — 6fedd2b
- [x] 2.9 A forced shape break produces a message naming the missing/extra key — 6fedd2b

### Phase 3: Engine goldens

#### Automated

- [x] 3.1 Unit suite passes: `npm test` — a0c41bd
- [x] 3.2 Linting and typechecking pass — a0c41bd
- [x] 3.3 Both `.snap` files exist and are git-tracked — a0c41bd
- [x] 3.4 CI refuses to write a missing snapshot (`CI=1` run fails, then restore) — a0c41bd
- [x] 3.5 Re-running `npm test` produces no snapshot churn — a0c41bd
- [x] 3.6 `ci` job green on the PR — a0c41bd

#### Manual

- [x] 3.7 Each recorded `.snap` read in full and matched to the fixture's hand-computed expectation — a0c41bd
- [x] 3.8 The `planAddCost` golden total is a clean decimal, not a float artifact — a0c41bd
- [x] 3.9 The "array order differs" assertion holds, documenting the real guarantee — a0c41bd

### Phase 4: Gate, cookbook, registry

#### Automated

- [x] 4.1 Linting passes: `npm run lint`
- [x] 4.2 Both suites pass: `npm test`, `npm run test:integration`
- [x] 4.3 Every registry row resolves to an existing path and export
- [ ] 4.4 `ci` + `integration` green on the PR

#### Manual

- [x] 4.5 §6.3 is followable without reading this plan
- [x] 4.6 Every registry claim verified against code, not copied from research
- [x] 4.7 Each of the three findings names a file and line that still exist

### Phase 5: Deliberate-break PR

#### Automated

- [ ] 5.1 `gh pr checks` shows `integration` failing on `contract-steps.int.test.ts`
- [ ] 5.2 `gh pr view --json mergeStateStatus` reports `BLOCKED`
- [ ] 5.3 After closing the PR, `main` is unchanged

#### Manual

- [ ] 5.4 The CI log alone is enough to diagnose the break
- [ ] 5.5 The typecheck failure arrives before the test failure
- [ ] 5.6 §6.6 records the observed order of failures
