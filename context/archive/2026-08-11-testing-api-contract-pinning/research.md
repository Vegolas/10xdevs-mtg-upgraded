---
date: 2026-08-12T10:52:46+0200
researcher: Mateusz Tomanek
git_commit: 1a76d75b94ae23f3cdcc8d6dd400d219f88f67e4
branch: change/testing-api-contract-pinning
repository: Vegolas/10xdevs-mtg-upgraded
topic: "What must test-plan Phase 2 pin — the /api/paths/* wire contract (risk #3) and the engine golden output + preserved add flow (risk #6)?"
tags: [research, codebase, api-contract, wire-shapes, golden-output, path-steps, contract-surfaces]
status: complete
last_updated: 2026-08-12
last_updated_by: Mateusz Tomanek
---

# Research: API contract pinning + engine golden output (test-plan rollout Phase 2)

**Date**: 2026-08-12T10:52:46+0200
**Researcher**: Mateusz Tomanek
**Git Commit**: 1a76d75b94ae23f3cdcc8d6dd400d219f88f67e4
**Branch**: change/testing-api-contract-pinning
**Repository**: Vegolas/10xdevs-mtg-upgraded

## Research Question

Test-plan §3 Phase 2 must "freeze `/api/paths/*` request/response shapes and the engine golden
output so a stale caller or preserved-flow regression fails loudly", covering risk #3 (a handler's
contract changes, a stale caller breaks silently) and risk #6 (the preserved full-paste add flow or
the resolve/diff/cost engine regresses behind the additive diff-mode change).

So: **what is the contract today, who actually depends on it, where would a change break something
silently, and what is the cheapest honest seam to freeze — without committing the two named
anti-patterns** (mirroring the handler's current output as the oracle; duplicating the existing
20-file unit suite)?

## Summary

Five findings shape the plan.

**1. There is no declared HTTP contract, and the type link is broken in the middle.** Success bodies
are *domain* types — `UpgradePath` / `PathStep`, declared once at `src/lib/path/types.ts:52,38` — and
the server does route every row through a typed mapper (`toUpgradePath`, `toPathStep` at
`src/lib/api/paths.ts:47,83`). But the boundary itself is untyped: `jsonResponse(data: unknown, status = 200)`
(`src/lib/api/paths.ts:25`) accepts anything, so **no handler can be type-checked against a contract**,
and every client re-asserts with an unchecked `as` cast. Request bodies have no wire type at all
(`StepInput` at `src/lib/path/request.ts:15` types the *post-validation* value, not the wire).
The error envelope `{error: string}` is declared **nowhere** server-side and re-declared inline in at
least four places. The one composite body — `{path, steps}` — is an inline object literal at
`src/pages/api/paths/[id].ts:39-42`.

**2. Risk #3's real mechanism is not what the risk statement assumes.** The risk imagines a stale
caller of a renamed field. Reality:

- **Two of the seven `/api/paths/*` handlers have no application consumer at all.** `GET /api/paths`
  and `GET /api/paths/[id]` are called by nothing — the `/paths` and `/paths/[id]` pages query
  Supabase directly (`src/pages/paths/index.astro:18-22`, `src/pages/paths/[id].astro:22-30`) using
  the *same mappers*. The read path is **duplicated** between handler and page, `.order()` clauses
  included. Pinning those two response shapes protects a surface nobody calls; the live risk is the
  two copies drifting apart.
- The five mutating routes have exactly **five call sites**, all in two components
  (`PathEditor.tsx:273,422,436,454`, `NewPathForm.tsx:28`), each an `as` cast over an untyped
  `res.json()`.
- The dangerous drift is therefore **silent-value drift, not shape-rename drift**: `deltaText`
  collapsing `null` → `undefined`, the server-assigned `position` the client ignores in favour of
  array order, and `snapshot` round-tripping unvalidated.

**3. The current suite pins statuses no client reads, and misses the values every client depends on.**
Integration tests pin `201` on both creates and `Array.isArray` on the list route
(`tests/integration/helpers/paths.ts:27,39`) — yet every consumer only checks `response.ok`, so
`201 → 200` is invisible to users and fails CI, while `deltaText`, `position`, snapshot round-trip,
both `204`s, the `{path, steps}` envelope, every 400 body, and the whole auth `?error=` channel are
pinned by nothing. The suite currently fails on changes no user notices and passes changes that
corrupt user data.

**4. Risk #6 has a free lunch and a broken promise.** `diffDecks` (`src/lib/deck/diff.ts:105`) is a
fully pure, **order-stable** seam (fixed `CATEGORY_ORDER` at `:45`, in-group name sort at `:87`) that
produces a complete `UpgradePlan` and needs **zero stubbing** — today's `diff.test.ts` drives it but
asserts only name/quantity projections, so a golden adds `typeLine`, `imageUrl`, both prices and
group boundaries for free. The snapshot-level claim is the opposite: the archived plan promises a
diff-mode step is "byte-equivalent to one entered via full paste"
(`context/archive/2026-06-29-diff-style-checkpoint-entry/plan.md:27`), but `deriveSnapshot` returns
`[...working.values()]` (`src/lib/path/derive.ts:166`) while a full paste returns `resolved.map(...)`
order (`src/lib/deck/quantity.ts:31`) — which itself depends on how warm the module-level
`sessionCache` is (`src/lib/card-data/resolve.ts:15,96-123`). **The promise holds as multiset
equality, not array equality, and nothing verifies it in either direction.**

**5. A documented oracle exists, so the anti-pattern is avoidable.** The contract can be drawn from
`context/archive/2026-06-29-testing-server-boundary-auth/research.md:90-103` (a route → denial-contract
table) and `context/archive/2026-06-26-user-accounts/plan.md:142-165` (the original design: newest-first
list, `position = max+1`, delete-last invariant, reject-400-on-null-snapshot, 401 JSON for API routes).
Those documents specify most of the surface **independently of the current code**. Where they are
silent — the two `204`s, the PATCH response body, the `{path, steps}` envelope, error-body strings —
the plan must make an explicit decision rather than copy the handler.

## Detailed Findings

### 1. The wire contract as it exists

Ten exported handlers across six route files; no zod or schema library — validation is hand-written
type guards. `output: "server"`, no `prerender` anywhere under `src/pages`.

| Route | Success | Error bodies |
| --- | --- | --- |
| `GET /api/paths` (`index.ts:6`) | 200, **bare array** of `UpgradePath`, `created_at` desc (`:20`) | 401, 500 `{error: <pg msg>}` |
| `POST /api/paths` (`index.ts:24`) | **201**, single `UpgradePath` (`:45`) | 400 `{error:"Title is required"}`, 401, 500 |
| `GET /api/paths/[id]` (`[id].ts:6`) | 200, **envelope** `{path, steps}`, steps by `position` asc (`:39-42`) | 404 `{error:"Not found"}`, 401, 500 |
| `PATCH /api/paths/[id]` (`[id].ts:46`) | 200, single `UpgradePath` (`:75`) | 400, 404, 401, 500 |
| `DELETE /api/paths/[id]` (`[id].ts:79`) | **204, null body** (`:97`) | 404, 401, 500 |
| `POST /api/paths/[id]/steps` (`steps.ts:13`) | **201**, single `PathStep` (`:75`) | 400 `{error:"Invalid step payload"}`, 404, 401, 500 |
| `DELETE /api/paths/[id]/steps` (`steps.ts:83`) | **204, null body** (`:115`) | 404 `{error:"Not found"}` / `{error:"No steps to delete"}` (`:105`), 401, 500 |
| `POST /api/auth/{signin,signup,signout}` | **302** + `Set-Cookie`, `Location: /paths` / `/auth/confirm-email` / `/` | failure = 302 back with `?error=<encodeURIComponent(msg)>` |

Mapping is explicit and consistent: `owner_id→ownerId`, `created_at→createdAt`, `updated_at→updatedAt`,
`path_id→pathId`, `list_text→listText`, `delta_text→deltaText`. Every query is `select("*")` or
`select("id, position")` with **no SQL aliasing**, so no raw snake_case column name reaches a success
body — rows always pass through a mapper first.

Server-side ordering facts a contract test will encode:

- `position` is server-computed `(last?.position ?? -1) + 1` (`steps.ts:54`) and never read from the body.
- On `POST steps`, **body validation runs before the ownership check** (`:24` vs `:30`), so a malformed
  body aimed at another owner's path returns 400, not 404.
- `DELETE steps` never queries `upgrade_paths` — ownership rests entirely on RLS scoping the
  `path_steps` select/delete.
- The parent `updated_at` bumps (`steps.ts:73,113`, `[id].ts:64`) are awaited but their `error` is
  **discarded**; a failure there cannot change the status code.
- `deltaText` never causes a 400: a non-string or blank value collapses to `null` (`request.ts:60`).

Framework behaviour that precedes every handler (and that any new test must live with):

- **403** `Cross-site <METHOD> form submissions are forbidden` — plain text, not JSON — from Astro's
  `security.checkOrigin`, which rejects non-GET/HEAD/OPTIONS requests that are cross-origin **and**
  either form-like *or carry no `content-type` header at all*. That last branch covers both bodyless
  `DELETE` routes, which is why the harness sends `Origin` (`tests/integration/helpers/owners.ts:57`).
- **404** empty body for any unexported method on an existing route (`PUT /api/paths`,
  `PATCH /api/paths/[id]/steps`); `HEAD` silently reuses `GET`.
- `X-Astro-Reroute: no` added to every 404/500.
- `/api/paths/*` is deliberately **not** middleware-gated: `PROTECTED_ROUTES = ["/dashboard", "/paths"]`
  (`src/middleware.ts:7`) does not match it; middleware only populates `context.locals.user`.

### 2. Where the contract is (and is not) declared

| Wire shape | Declared? | Shared with client? |
| --- | --- | --- |
| `UpgradePath` body | once, `src/lib/path/types.ts:52` | server imports it for the mapper; client re-asserts `as UpgradePath` (`NewPathForm.tsx:39`, `PathEditor.tsx:442`) |
| `PathStep` body | once, `src/lib/path/types.ts:38` | same pattern, `as PathStep` (`PathEditor.tsx:287`) |
| `{path, steps}` envelope | **no** — inline literal (`[id].ts:39-42`) | no consumer |
| `{error: string}` | **no** — literal at 8 handler sites + `paths.ts:41` | re-declared inline ×4: `PathEditor.tsx:282`, `NewPathForm.tsx:34`, `gate-api.int.test.ts:36,44` |
| `POST /api/paths` request | **no** — `parseTitleInput(raw: unknown)` reads structurally | client sends untyped literal `{title}` |
| `POST steps` request | only post-validation `StepInput` (`request.ts:15`) | client sends untyped literal (`PathEditor.tsx:276`) |
| create-response, 3rd declaration | test-only `CreatedPath {id,title}` (`helpers/paths.ts:15`) | — |
| auth bodies | none; `form.get("email") as string` (`signin.ts:6-7`) | field names duplicated as JSX ids |

`jsonResponse(data: unknown)` is the single point where the type is erased. Tests do share **DB row**
types (`Database` from `@/lib/database.types` in `helpers/owners.ts:2`) — so DB shapes are shared and
HTTP shapes are not.

### 3. Ranked silent-break seams (risk #3)

1. **`PathEditor.tsx:287` — `as PathStep` on the step-create response, appended to an array whose other
   elements come from a different producer** (the SSR page's `toPathStep`). Return the raw row instead
   of the mapped one and both sides still compile: `deltaText` becomes `undefined`, and
   `undefined !== null` is **true**, so every newly added checkpoint renders a "diff" badge plus an
   empty "Entered changes" block (`:111,121-127`). A page reload *heals* it, because the SSR mapper is
   still correct — so it presents as a flake.
2. **`PathEditor.tsx:276` — request-key drift on `deltaText`.** Rename it in `parseStepInput` and the
   POST still returns **201** while provenance silently collapses to `null`. Because saved steps are
   immutable, the provenance is lost permanently. Nothing tests `deltaText`.
3. **`PathEditor.tsx:436-447` — PATCH response parsed with no try/catch**, invoked as
   `void handleRename()` (`:492`). Make PATCH a 204 (a natural REST tidy-up) and `res.json()` throws
   into an unhandled rejection: the rename input stays open showing the old title while the rename
   *did* persist.
4. **`NewPathForm.tsx:39-40` — `created.id` off a cast.** Rename `id` → navigation to `/paths/undefined`
   → "Path not found", while the path exists and shows up on the next visit.
5. **Error envelope `error`** — declared in 0 places, read in 4. A rename confined to the 400/404 paths
   fails no test (only the 401 string is pinned) and silently replaces `"Title is required"` with a
   generic fallback in the UI.
6. **Non-2xx flattened; 401 invisible.** No island has any 401 handling, though `requireUser` returns
   401 JSON. Conversely `response.ok` spans 200-299, so `201 → 200` breaks CI and no user.
7. **`position` ignored by the client** (`:288,602,109`) — it appends to the array and diffs each step
   against `steps[index - 1]`, while the server assigns `max+1`. Change the server's ordering rule and
   the badge and the diff base disagree: plausible-but-wrong Add/Remove columns and cumulative cost,
   **no error of any kind**.
8. **Optimistic `slice(0, -1)`** (`:424`) assumes the server's delete-last invariant.
9. **Required→optional drift inside `snapshot` → `NaN`.** `isCard` requires prices to be number-or-null
   (`snapshot.ts:41-42`) and `planAddCost` guards only `null` (`cost.ts:37`); relax the guard and
   `total += undefined * quantity` renders `$NaN` in the cumulative cost. Nothing asserts snapshot
   round-trip over HTTP.
10. **Auth error channel is two unlinked string literals** — server writes `?error=`, pages read
    `searchParams.get("error")`; rename either and sign-in failures render *nothing*
    (`ServerError.tsx:8` returns null on falsy). The success target `/paths` is also unpinned.

### 4. What the suite pins today

Pinned (a change fails loudly): `POST /api/paths` → 201 with `id`/`title`; `POST steps` → 201 with `id`
(and `deltaText` optional, pinned *by omission* — the helper never sends it); `GET /api/paths` → 200 +
`Array.isArray` + elements have `id`; the 401 body string `"Unauthorized"` (the only pinned error
string); cross-owner 404s incl. "no `path`/`steps` keys in the 404 body"; signin accepting urlencoded
creds with a matching `Origin` and answering with chunked `sb-*` cookies; page 302s to `/auth/signin`.

Unpinned: the `{path, steps}` happy path (never successfully called), any PATCH response field, **both
204s** (no test performs a successful delete — teardown is service-role), `position` assignment,
snapshot round-trip through HTTP, the 400 bodies, the auth `?error=` channel, the signin success target.

### 5. Contract holes found while inventorying (candidate product bugs)

- **No UUID validation on `[id]`.** `context.params.id` is only checked for falsiness, so a non-UUID id
  reaches PostgREST and surfaces as **500 with a raw Postgres message**, not 404.
- **Every 500 body echoes `PostgrestError.message`** (`index.ts:18,43`, `[id].ts:23,36,70,92`,
  `steps.ts:37,52,70,102,110`) — Postgres text carries table, column and constraint names. Pinning
  these bodies as-is would freeze a leak into the contract.
- **`snapshot` is an unvalidated passthrough.** `parseSnapshot` returns the *original* arrays
  (`snapshot.ts:109`) and `isCard`/`isUnresolvedLite` check presence, not exhaustiveness — so unknown
  extra keys inside each `card` / `unresolved` entry survive validation, get persisted by the
  `{...entry.card}` spread, and are echoed back in the 201 and every later read, forever (steps are
  immutable). Entry-level siblings of `card`/`quantity` *are* dropped.
- **`signup` accepts a `confirmPassword` field the server never reads** (`SignUpForm.tsx:66` vs
  `signup.ts:6-7`), and `as string` casts mean a missing field becomes `null` typed `string` — never a 400.
- **`toPathStep` silently falls back** to `{cards: [], unresolved: []}` on a corrupt snapshot
  (`paths.ts:83`), turning data corruption into an empty checkpoint rather than an error.

### 6. Risk #6 — the golden seam and every nondeterminism source

Three candidate seams, increasing in cost:

- **Seam A — `diffDecks(base, target) → UpgradePlan`** (`diff.ts:105`). Pure, no I/O, no `Date`, no ids,
  and **order-stable** by construction. Zero stubbing. Pair with `planAddCost` for money.
- **Seam B — `generateUpgradePlan(baseText, targetText)`** (`plan.ts:86`). The literal
  "two pasted lists → a plan" seam; needs `resolveCards` mocked (the established
  `vi.mock("@/lib/card-data", …)` pattern from `plan.test.ts:8-11`, `derive.test.ts:10-13`).
- **Seam C — `resolveDeck` + `deriveSnapshot`** (`plan.ts:61`, `derive.ts:108`). The only pair that can
  pin "full paste and diff mode produce the same snapshot" — and the only one that is *not* order-stable.

Nondeterminism, enumerated:

| Source | Evidence | Bites which seam |
| --- | --- | --- |
| Network (`fetch` to `https://api.scryfall.com`, module const, no injection) | `scryfall.ts:15,85,121` | B, C |
| Price drift (`priceUsd/Eur` straight from Scryfall) | `normalize.ts:37-38` | B, C (and any `PlanCost.total`) |
| Fuzzy-suggestion drift; `not-found` ↔ `ambiguous` can flip | `resolve.ts:142-151`, `scryfall.ts:130-136` | B, C |
| **`sessionCache` warmth changes `resolved` array order** (cache hits first, then fetch order) | `resolve.ts:15,96-123` | C |
| `deriveSnapshot` returns Map insertion order; full paste returns `resolved.map` order | `derive.ts:166`, `quantity.ts:31` | C |
| **`localeCompare` with no explicit locale** — collation depends on runtime ICU/default locale | `diff.ts:87`, `sort.ts:33` | **A, B, C — survives full stubbing** |
| Float money accumulated in nested loops; `PlanCost.total` is raw, unrounded | `cost.ts:38`, `chain.ts:53` | A, B, C |
| `Date` / ids | `steps.ts:73,113`, `[id].ts:64`; `gen_random_uuid()` in the migration | only API/`PathStep`-level goldens |

Injection is **not** available: no function in the chain accepts a resolver, fetcher, clock or id
generator — `resolveCards` is imported at module scope (`plan.ts:16`, `derive.ts:27`) and `scryfall.ts`
calls the global `fetch`. So the only seams are `vi.mock` of `@/lib/card-data`, `vi.stubGlobal("fetch")`
(with the existing fixtures under `src/lib/card-data/__fixtures__/`), and `clearSessionCache()` —
which is a **deep import**, deliberately absent from the barrel (`card-data/index.ts:8`) and required in
`beforeEach` for reproducible ordering.

Two structural gaps: **zero snapshot tests exist** anywhere in the repo (`toMatchSnapshot` appears only
as prose in `CLAUDE.md`), and **there are no component tests at all** — no `*.test.tsx` file exists, so
`handleAddStep`, `runCheck`, `runDiffCheck` and `switchMode` are untested by construction.

### 7. Risk #6 — the two add flows and the promise that outruns the code

`handleAddStep` (`PathEditor.tsx:212-300`) is **one function with two branches**: full paste resolves
the pasted list (`:247-258`), diff mode derives from `steps.at(-1)!.snapshot` (`:234-246`) and sets
`postListText = deckCardsToText(result.snapshot.cards)`. Both then share the same POST (`:272-299`) and
the same route handler — `delta_text` is the only differing field.

Shared surface where a one-flow regression lands in the other: `splitCardLine` (`parse.ts:72` — now
consumed cross-module by `src/lib/path/delta.ts:65,99`), `resolutionKey`, `resolveCards` + its mutable
`sessionCache`, the single `listText`/`name` state and single textarea, the single `checkToken` ref
shared by both preview functions (`:310,338` — a mode switch mid-flight invalidates the other mode's
run), the single `addState` error channel, `toEditableEntries`, `UnresolvedNotice` (also used by the
anonymous `/` comparer), and `parseStepInput`/`parseSnapshot`. **None of it is covered at flow level.**

What was promised (quoted, not paraphrased):

- "The saved step is a normal immutable snapshot **byte-equivalent to one entered via full paste**…
  Full-paste mode and the engine behave exactly as before." — archived `plan.md:27`
- "Not changing the resolve/diff/cost engine, the anonymous `/` comparer, `DeckComparer`, or any
  access-control rule." — archived `plan.md:41`
- FR-005 "[preserved] The full-paste checkpoint input remains available and unchanged"; FR-006
  "[preserved] Saved checkpoint snapshots remain immutable"; FR-007 "[preserved] The resolve/diff/cost
  engine and the anonymous `/` comparer are unchanged" — `context/foundation/prd-diff-checkpoint.md:103-108`
- "`list_text` is assumed display/reference-only on read… **If anything re-parses `list_text`, revisit.**"
  — archived `plan-brief.md:54`

As established in finding 4 above, "byte-equivalent" is **stronger than what the code guarantees**.
Phase 2 has to choose which equality it pins — and if it pins the literal promise, that is a code
change inside a "do not touch the engine" boundary.

### 8. Inherited harness and CI — reuse, don't rebuild

- `vitest.config.ts` — 16 lines: `@`→`src`, node env, `include: ["src/**/*.test.ts"]`. The live Scryfall
  test sits inside that glob but self-gates via `describe.skipIf(!RUN_LIVE)`, so `npm test` stays
  network-free.
- `vitest.integration.config.ts` — hand-rolled `.env.test` loader using `process.env[key] ??= value`
  (`:41`) so **real env wins over the file** (that is how CI overrides without a file); only five vars
  forwarded to worker forks (`:49-59`); `pool: "forks"` + `fileParallelism: false`; 30 s test/hook
  timeouts; `globalSetup` at `:70`.
- `global-setup.ts` — fails fast with a copy-`.env.test.example` message and an
  `/auth/v1/health` ping rather than a confusing timeout; **overrides `.dev.vars`** because the
  Cloudflare adapter resolves `astro:env/server` from it via `getPlatformProxy` and that wins over the
  spawn env (crash-safe via a `.intbak` recovery); process-tree kill (`taskkill /t` on Windows,
  negative-pid `SIGTERM` elsewhere); passes the **anon key only** to the dev server.
- Helpers: `assertStatus(res, expected, label)` puts label + expected + actual + up to 800 chars of the
  raw body in the failure message and **consumes the body** (so callers must only call it on the
  success path); `signIn` requires the `Origin` header or Astro's CSRF check 403s first, and
  reassembles chunked `sb-*` cookies; `corruptCookies` keeps names and replaces values — the faithful
  expired-session proxy; `paths.ts` writes through the app's JSON API with owner cookies and reads back
  with service-role, which is **never the oracle** for "was this allowed"; `deleteOwners` swallows
  errors so cleanup never masks a failure.
- CI: two jobs, `ci` (lint → `npm test` → build) and `integration` (boots an ephemeral Supabase, exports
  keys from `supabase status`, runs `test:integration`, stops with `if: always()`), running in parallel;
  both are **required status checks** on `main` with `enforce_admins: true`.

### 9. Registry state (`docs/reference/contract-surfaces.md`)

All 20 rows resolve — nothing renamed, moved, or gone. Three **description** drifts:

1. `generateUpgradePlan` is described as orchestrating parse → `resolveCards` → `attachQuantities` →
   `diffDecks`; since the `user-accounts` extraction it orchestrates parse → **`resolveDeck`** (twice) →
   `diffDecks`. `resolveDeck` / `ResolvedDeck` are barrel-exported and have **no row**, though
   `fuzzy-fix-on-save` treated `resolveDeck` as load-bearing.
2. `splitCardLine` is described as shared by `parseDeckList` and `applySuggestion`, "module-internal".
   It now has a **third, cross-module** consumer in `src/lib/path/delta.ts` — a rename breaks
   `src/lib/path` too.
3. `formatUsd` is described as "the single USD display formatter"; `formatSignedUsd`
   (`labels.ts:50`) now also formats money and is unregistered.

Unregistered entirely: **the whole `src/pages/api/**` layer** (no route, status code or body anywhere in
the registry), **`src/lib/api/paths.ts`** (including the snake_case→camelCase convention, which lives
only in a code comment), and **everything on the `@/lib/path` barrel** — `StepSnapshot`, `PathStep`,
`UpgradePath`, `StepInput`, `parseSnapshot`, `parseStepInput`, `stepPlan`, `deriveSnapshot`, the delta
helpers. Note the irony: `src/lib/path/types.ts:5-11` points readers *at* the registry while being
absent from it. The file was last touched ~2026-06-16, so everything from `user-accounts` onward is
unrepresented.

## Code References

- `src/lib/api/paths.ts:25` — `jsonResponse(data: unknown, status = 200)`: the point where the response type is erased
- `src/lib/api/paths.ts:41` — the only pinned error string, `{error: "Unauthorized"}`
- `src/lib/api/paths.ts:47,83` — `toUpgradePath` / `toPathStep`, the de-facto response contract
- `src/lib/api/paths.ts:83` — silent `?? {cards: [], unresolved: []}` fallback on a corrupt snapshot
- `src/lib/path/types.ts:38,52` — `PathStep` / `UpgradePath`, declared once, shared by convention only
- `src/lib/path/request.ts:15,45,60` — `StepInput`, `parseStepInput`, and `deltaText`'s collapse to `null`
- `src/lib/path/snapshot.ts:91,109` — `parseSnapshot` and the original-array return that lets extra keys survive
- `src/pages/api/paths/[id].ts:39-42` — the inline `{path, steps}` envelope with no type and no consumer
- `src/pages/api/paths/[id]/steps.ts:24,30,54` — validation-before-ownership, and server-assigned `position`
- `src/components/path/PathEditor.tsx:212-300` — `handleAddStep`, one function, both add flows
- `src/components/path/PathEditor.tsx:287,442` / `NewPathForm.tsx:39` — the three `as` casts over untyped JSON
- `src/pages/paths/index.astro:18-22`, `src/pages/paths/[id].astro:22-30` — the duplicated read path that bypasses the API
- `src/lib/deck/diff.ts:45,87,105` — the order-stable golden seam (and the unlocalised `localeCompare`)
- `src/lib/card-data/resolve.ts:15,96-123,162` — `sessionCache`, the order it imposes, and `clearSessionCache`
- `src/lib/path/derive.ts:166` vs `src/lib/deck/quantity.ts:31` — the two array orders behind the "byte-equivalent" claim
- `tests/integration/helpers/http.ts:12` — `assertStatus`, the mandated status-check route
- `tests/integration/helpers/paths.ts:27,39` — where 201 is pinned today
- `tests/integration/global-setup.ts:55-75` — the `.dev.vars` override the Cloudflare adapter forces

## Architecture Insights

- **The security boundary and the contract boundary are the same code, by design.** RLS is the only
  authorization mechanism (`user-accounts/plan.md:43`), handlers do no owner filtering, and denial
  therefore *is* a contract fact: 404 for single resources, filtered 200 for the list, never 403. Any
  contract test that asserts a status is also asserting an authorization behaviour.
- **Snapshots are a client-owned passthrough.** The server validates JSON shape and never re-resolves
  cards (`user-accounts/plan.md:46`). That is a deliberate boundary — and it is why the contract's most
  valuable assertion is a *round-trip* (POST a snapshot, read it back, compare), not a field-name check.
- **Domain types are doing double duty as wire types.** This is why the contract feels declared but is
  not: `PathStep` is a domain type the mapper happens to emit. A change to it for domain reasons is
  silently a wire change.
- **Two read paths, one shape.** The SSR pages and the GET handlers independently query and map the same
  rows. That duplication is invisible to the type system and to every test.
- **The engine is order-stable at the plan level and order-unstable at the snapshot level.**
  `groupByCategory` sorts, so `UpgradePlan` is reproducible; `StepSnapshot.cards` is not. Everything
  user-visible flows through the sort, which is exactly why the instability has never been noticed.
- **Established test conventions to match:** named `vitest` imports (no globals), behavioural `it`
  sentences, local factory helpers, `@/` alias, and mock **only the network seam**.

## Historical Context (from prior changes)

- `context/archive/2026-06-26-user-accounts/plan.md:142-165` — the original `/api/paths/*` design, and the
  best documented oracle: newest-first list, path+ordered steps, `position = max+1`, reject 400 on a null
  snapshot, delete-last invariant, 401 JSON for API routes (no redirect).
- `context/archive/2026-06-26-user-accounts/plan.md:28-36,300` — `visibility` ships but only `private` is
  exercised; the `unlisted` read policy is deferred to the sharing slice, which is also why the `anon`
  grant is still absent.
- `context/archive/2026-06-29-testing-server-boundary-auth/research.md:90-103` — a route → query → owner
  filter → denial-contract table, plus "no handler does an independent owner check".
- `context/archive/2026-06-29-testing-server-boundary-auth/plan.md:81` — this phase was explicitly parked
  there: "**Not** building contract tests (Phase 2)".
- `context/archive/2026-06-29-testing-server-boundary-auth/plan.md:428-457` — the three findings that phase
  bought: migrations must grant explicitly (privileges are checked *before* RLS); a green local suite
  proves nothing bootstrap- or privilege-shaped; and a red job blocks nothing without a required check.
- `context/archive/2026-06-29-diff-style-checkpoint-entry/plan.md:27,33,41,147-187` — the "byte-equivalent"
  promise, the "engine untouched" boundary, and the additive `delta_text` contract (nullable, no backfill,
  absent → `null`).
- `context/archive/2026-06-28-fuzzy-fix-on-save/plan.md:73,258` — precedent for a change that explicitly
  altered nothing on the wire.
- Registry-update duty is a recurring plan step, established in `card-data-resolution/plan.md:167,185` and
  repeated as a success criterion in three later changes.

## Related Research

- `context/archive/2026-06-29-testing-server-boundary-auth/research.md` — the Phase 1 sweep; §Summary.2
  (denial = 404 / filtered 200, never 403) and the route table at :90-103 are direct inputs here.
- `context/archive/2026-06-26-user-accounts/research.md:115-116` — confirms the policies are still owner-only.
- `context/foundation/test-plan.md` §2 (risks #3/#6 + Risk Response Guidance), §5 (the contract gate,
  "required after §3 Phase 2"), §6.3 (still a `TBD` stub — filling it is this phase's cookbook duty).

## Open Questions

1. **Do we pin the two consumer-less GET routes, or address the duplication first?** Pinning
   `GET /api/paths` and `GET /api/paths/[id]` freezes shapes no caller reads while the real read path
   (the SSR pages) stays unpinned. Options: pin both *and* assert page/handler agreement; pin the
   handlers and accept the gap; or narrow Phase 2 to the five called routes. Needs a scope decision.
2. **Contract *tests*, or a contract *type* — or both?** Typing `jsonResponse<T>` and having both sides
   import one response type would convert seams 1, 3, 4 and 5 from runtime surprises into compile
   errors, which no test can do as cheaply. But that is production-code change inside a testing phase.
3. **Which equality do we pin for "diff-mode ≡ full paste"?** Multiset/canonicalised (what the code
   guarantees) or literal array order (what the archived plan promised)? The latter needs a sort in
   `derive.ts`/`quantity.ts` — a change inside the "engine untouched" boundary — or a correction to the
   archived claim. Product-shaped; owner: user.
4. **Do we fix the 500-body leak before or after pinning?** Every 500 currently returns raw
   `PostgrestError.message` (table/column/constraint names). Pinning it as-is freezes a leak; changing it
   is scope creep. Same question for the missing UUID validation that produces those 500s.
5. **Locale for `localeCompare`.** A golden at Seam A is reproducible only if collation is pinned. Setting
   an explicit locale touches `diff.ts`/`sort.ts` — again inside the "engine untouched" boundary, though
   arguably a bug fix.
6. **Are the auth routes in scope?** §5's gate row says contract tests cover `/api/paths/*`, but the whole
   harness depends on `signin`'s 302 + cookie contract, and the `?error=` channel is entirely unpinned.
7. **Which new job name gates this suite?** Per the Phase 1 lesson, a new suite is only a gate once its job
   is in the required-check list on `main` — decide whether contract tests join the existing `integration`
   job or get their own.
