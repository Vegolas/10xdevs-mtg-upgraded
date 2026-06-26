# User Accounts & Checkpointed Upgrade Paths — Implementation Plan

## Overview

Activate the existing (scaffolded-but-unused) email/password authentication and add **server-persisted, multi-step upgrade paths**: a path is an ordered chain of named checkpoints, each diffing against the previous step. This is the **A+C MVP** from `shape-notes.md` (sharing/forking deferred). The anonymous `/` comparer stays intact and stateless; the existing diff/cost engine is reused unchanged; the browser-only on-device history is retired in favor of account storage.

## Current State Analysis

- **Auth is wired but orphaned.** A cookie-bound Supabase server client exists ([src/lib/supabase.ts](src/lib/supabase.ts)); middleware sets `locals.user` and guards `/dashboard` ([src/middleware.ts](src/middleware.ts)); `/api/auth/{signin,signup,signout}` work; `/auth/*` forms work. Nothing in the product links to any of it, and `signin` success redirects to `/` ([src/pages/api/auth/signin.ts](src/pages/api/auth/signin.ts)).
- **`SUPABASE_KEY` is server-secret only** — declared `access: "secret"` in [astro.config.mjs:17-22](astro.config.mjs); there is **no `PUBLIC_` anon key**. The cookie-bound server client runs queries under the signed-in user's JWT, so Row-Level Security applies as that user.
- **The engine already operates on resolved cards.** `diffDecks(base: DeckCard[], target: DeckCard[])` ([src/lib/deck/diff.ts:103](src/lib/deck/diff.ts)) and `planAddCost(add: CardGroup[])` ([src/lib/deck/cost.ts](src/lib/deck/cost.ts)) take resolved structures — so a saved step's plan and cost recompute from a stored snapshot with **no engine change**. `generateUpgradePlan` ([src/lib/deck/plan.ts:60](src/lib/deck/plan.ts)) already does parse→resolve→attach per side; a `resolveDeck` helper extracts cleanly from it.
- **Database is empty.** No `supabase/migrations/` dir, no `.sql` files; `db.migrations.enabled = true`, `schema_paths = []`, `enable_confirmations = false` ([supabase/config.toml](supabase/config.toml)). Supabase CLI is a devDep; no `db:*` npm scripts.
- **On-device history** lives in [src/lib/history/](src/lib/history/index.ts) + [useDeckHistory.ts](src/components/deck/useDeckHistory.ts) + [HistoryDrawer.tsx](src/components/deck/HistoryDrawer.tsx); its only consumer is [DeckComparer.tsx](src/components/deck/DeckComparer.tsx).
- **Tests** are pure-logic vitest (`npm test`); no jsdom/RTL. Type/lint: `astro check`, `eslint .`.

## Desired End State

A signed-in user visits **/paths**, creates a named path from a base deck, appends named checkpoints (each diffing against the prior step), and sees every step's grouped plan, per-step cost, and a cumulative cost — reopenable from any device without re-pasting. A logged-out visitor still uses `/` as a stateless quick-check tool (no Save/History). Another user can never read or edit a private path (enforced by RLS). The diff/cost output for any list pair is byte-identical to today's.

### Key Discoveries:
- `diffDecks` / `planAddCost` are snapshot-ready — chain a path as `diffDecks(steps[i-1].cards, steps[i].cards)` ([src/lib/deck/diff.ts:103](src/lib/deck/diff.ts)).
- The cookie-bound server client gives per-user RLS for free — no public key, no second client ([src/lib/supabase.ts:9](src/lib/supabase.ts)).
- `generateUpgradePlan` is the extraction source for `resolveDeck` ([src/lib/deck/plan.ts:71-86](src/lib/deck/plan.ts)); the refactor must keep its sequential resolution + `DeckSide` tagging so output is unchanged.
- History has a single consumer (DeckComparer), so retirement is contained.

## What We're NOT Doing

- **No sharing / fork-to-account / unlisted read path** — deferred D slice. `visibility` column exists but only `private` is exercised; no `profiles` table.
- **No public gallery / discovery / browse.**
- **No price/image refresh** on saved steps — snapshot-only; refresh is a later slice (PRD Open Question 1).
- **No mid-path step editing** — append + delete-last only (FR-006). No branching / non-linear paths.
- **No OAuth / passwordless / password-reset / confirmation-email** — email+password only; `enable_confirmations` stays off.
- **No localStorage→account import** — on-device history is dropped, not migrated (FR-009).
- **No server-side card resolution** — resolution stays client-side; the Worker never calls the card-data source.
- **No new component-test tooling** (jsdom/RTL).

## Implementation Approach

Five phases in dependency order: **DB foundation + RLS** → **pure engine-reuse helpers** → **server data API** → **path builder UI** → **auth wiring + history retirement**. Data access is server-side via new `/api/paths/*` routes on the existing cookie-bound client (RLS as the user). A step stores its raw `list_text` plus a **client-produced resolved snapshot** (`jsonb`); views recompute plans/costs from the snapshot. The existing engine and the anonymous `/` flow are preserved throughout.

## Critical Implementation Details

- **RLS is the security boundary, not app code.** Every `/api/paths/*` handler must use the cookie-bound `createClient(headers, cookies)` so queries run under the user's JWT and RLS enforces ownership. Never introduce a service-role/elevated client for this feature.
- **Engine output must stay identical.** The `resolveDeck` extraction is a pure refactor of `generateUpgradePlan`: same sequential resolution order, same `DeckSide` tagging, same merge of malformed + unresolved. The existing `deck/plan` and `deck/diff` tests must pass unchanged.
- **Base step has no diff.** Position 0 (the precon/base) renders as a grouped card list, not an add/remove plan. `stepPlan` applies only to position ≥ 1 (`diffDecks(prev.cards, cur.cards)`).
- **Snapshots are client-produced and validated, never re-resolved.** The server validates the snapshot's JSON shape (a structural guard mirroring `history/storage.ts`'s `isSavedComparison`) and stores it; it does not call the card-data source. Prices/images are at-save values and may be stale (NFR — acceptable).
- **Card resolution stays off the Worker.** Keep resolution in the browser to avoid the throttled/sequential Scryfall calls hitting Cloudflare subrequest/CPU limits flagged in research.

---

## Phase 1: Database foundation & RLS

### Overview
Introduce the project's first migration: the `supabase/migrations` convention, the two tables, and owner-only RLS. No app code yet.

### Changes Required:

#### 1. Migration tooling convention
**File**: `package.json` (scripts), `supabase/migrations/<timestamp>_user_accounts_paths.sql` (new)

**Intent**: Establish a repeatable migration workflow (none exists). Add `db:*` scripts wrapping the Supabase CLI and create the first migration file via `supabase migration new`.

**Contract**: New scripts `"db:push": "supabase db push"`, `"db:reset": "supabase db reset"`, `"db:new": "supabase migration new"`. Migration files live in `supabase/migrations/`; `schema_paths` stays `[]` (standard migrations, not declarative schemas). Commit migration `.sql` files (they are not secrets).

#### 2. Schema: paths & steps
**File**: `supabase/migrations/<timestamp>_user_accounts_paths.sql`

**Intent**: Create the owned path and its ordered steps, with the resolved snapshot stored as `jsonb` and a reserved `visibility` flag.

**Contract**: Two tables.
- `upgrade_paths`: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete cascade`, `title text not null`, `visibility text not null default 'private' check (visibility in ('private','unlisted'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Index on `owner_id`.
- `path_steps`: `id uuid pk default gen_random_uuid()`, `path_id uuid not null references upgrade_paths(id) on delete cascade`, `position int not null`, `name text not null`, `list_text text not null`, `snapshot jsonb not null`, `created_at`, `updated_at`. `unique(path_id, position)`; index on `(path_id, position)`.

#### 3. Row-Level Security
**File**: same migration file

**Intent**: Enforce per-user isolation in Postgres (Success Criteria guardrail). Owner-only for both tables; the `unlisted` read path is intentionally NOT added (deferred), with a comment marking where it will go.

**Contract**: `alter table … enable row level security` on both. Policies:
- `upgrade_paths`: all actions allowed `using (owner_id = auth.uid())` / `with check (owner_id = auth.uid())`.
- `path_steps`: all actions allowed where the parent path is owned — `using (exists (select 1 from upgrade_paths p where p.id = path_id and p.owner_id = auth.uid()))` and matching `with check`.
- A SQL comment placeholder notes the future `unlisted` read policy.

### Success Criteria:

#### Automated Verification:
- Migration applies cleanly locally: `npm run db:reset`
- RLS isolation assertion passes: a committed SQL script (`supabase/tests/rls_paths.sql` or a `db:reset`-seeded check) sets two `auth.uid()` contexts and asserts user B sees 0 of user A's rows
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:
- In Supabase Studio, both tables exist with RLS enabled and the two policies attached
- Inserting a row as one user and querying as another returns nothing

---

## Phase 2: Engine-reuse helpers (pure logic)

### Overview
Extract a single-deck resolver and add the path-chain math — all pure, unit-tested, no I/O. This is what both the UI (to build a snapshot) and the views (to render a chain) call.

### Changes Required:

#### 1. `resolveDeck` extraction
**File**: `src/lib/deck/plan.ts`, `src/lib/deck/index.ts`

**Intent**: Pull the per-side parse→resolve→attach logic out of `generateUpgradePlan` into a reusable `resolveDeck`, then have `generateUpgradePlan` call it twice. Behavior must be identical.

**Contract**: `resolveDeck(text: string): Promise<{ deck: DeckCard[]; unresolved: { name: string; reason: UnresolvedReason; suggestion: string | null }[] }>`. `generateUpgradePlan` keeps its `empty`/`error`/`ok` outcome, sequential resolution order, and `DeckSide` tagging (it tags `resolveDeck`'s untagged `unresolved`). Exported from `@/lib/deck`.

#### 2. Path domain types & snapshot (de)serialization
**File**: `src/lib/path/types.ts` (new), `src/lib/path/snapshot.ts` (new), `src/lib/path/index.ts` (new)

**Intent**: Define the in-app path/step/snapshot types and a defensive serialize/parse for the `jsonb` snapshot (mirroring `history/storage.ts`'s guarded parse).

**Contract**: `StepSnapshot = { cards: DeckCard[]; unresolved: UnresolvedLite[] }`. `serializeSnapshot(s: StepSnapshot): unknown` and `parseSnapshot(raw: unknown): StepSnapshot | null` (structural type-guard; returns `null` on malformed, never throws). Domain types `PathStep`, `UpgradePath` mirror DB rows.

#### 3. Path chain helpers
**File**: `src/lib/path/chain.ts` (new)

**Intent**: Compute a step's plan and the path's costs by reusing `diffDecks` / `planAddCost`.

**Contract**:
- `stepPlan(prev: StepSnapshot | null, cur: StepSnapshot): UpgradePlan | { base: CardGroup[] }` — for `prev === null` (position 0) return the base's grouped card list; otherwise `diffDecks(prev.cards, cur.cards)`.
- `cumulativePathCost(steps: StepSnapshot[]): PlanCost` — sum `planAddCost(stepPlan(...).add)` over positions ≥ 1, aggregating `total` / `pricedCount` / `missingCount`.
- A grouping helper for the base list reuses the existing category grouping (extract/export `groupByCategory` from `diff.ts` if not already exposed).

### Success Criteria:

#### Automated Verification:
- New unit tests pass: `npm test` — covering `resolveDeck` parity, `parseSnapshot` guard (valid/malformed/round-trip), `stepPlan` (base vs ≥1), `cumulativePathCost` (sum + missing-price handling)
- Existing deck tests still pass unchanged (engine-output-identical guardrail): `npm test`
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:
- Spot-check that a 3-snapshot chain produces the same per-step plan as pasting the same lists pairwise into the `/` comparer

---

## Phase 3: Server data API

### Overview
CRUD endpoints for paths and steps on the cookie-bound client, with ownership and snapshot validation. Gate `/paths` pages in middleware.

### Changes Required:

#### 1. Path & step endpoints
**File**: `src/pages/api/paths/index.ts`, `src/pages/api/paths/[id].ts`, `src/pages/api/paths/[id]/steps.ts` (all new)

**Intent**: Expose create/list/rename/delete for paths and append/delete-last for steps, each scoped to the signed-in user via RLS.

**Contract**: All handlers build `createClient(request.headers, cookies)` and require `locals.user` (else `401` JSON). 
- `paths/index.ts`: `GET` → user's paths (newest first); `POST {title}` → new path (`title` non-empty).
- `paths/[id].ts`: `GET` → path + ordered steps; `PATCH {title}` → rename; `DELETE` → delete path (cascades steps).
- `paths/[id]/steps.ts`: `POST {name, listText, snapshot}` → append step; server computes `position = max(position)+1`, validates `snapshot` via `parseSnapshot` (reject `400` on null), sets `updated_at` on the parent. `DELETE` → remove the highest-position step only (delete-last invariant).
- RLS makes cross-user access return empty/again `404`; handlers translate to appropriate status codes.

#### 2. Route gating
**File**: `src/middleware.ts`

**Intent**: Protect the `/paths` pages (not the API, which self-checks and returns 401).

**Contract**: Add `"/paths"` to `PROTECTED_ROUTES`. API routes under `/api/paths` handle auth themselves (401 JSON, no redirect).

### Success Criteria:

#### Automated Verification:
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Snapshot-validation unit test passes (a malformed `snapshot` body is rejected): `npm test`

#### Manual Verification:
- Signed-in: create a path, append two steps, fetch the path → steps return in order with snapshots intact
- Append with a malformed snapshot body → `400`
- Unauthenticated request to any `/api/paths/*` → `401`
- A second account cannot `GET`/`PATCH`/`DELETE` the first account's path (RLS)
- `DELETE` step removes only the last step; position sequence stays contiguous

---

## Phase 4: Path builder UI

### Overview
The `/paths` list and `/paths/[id]` editor: create paths, add named checkpoints (client resolves → POST snapshot), and render each step's plan + per-step + cumulative cost, reusing the existing render components.

### Changes Required:

#### 1. Paths list page
**File**: `src/pages/paths/index.astro` (new)

**Intent**: SSR-list the user's paths with a "New path" action.

**Contract**: Frontmatter fetches the user's paths via `createClient` (cookie-bound); renders titles linking to `/paths/[id]` and a create form (`POST /api/paths`). Uses `Layout.astro`. Empty-state when none.

#### 2. Path editor page + island
**File**: `src/pages/paths/[id].astro` (new), `src/components/path/PathEditor.tsx` (new)

**Intent**: SSR-load a path + its steps and hand them to a client island that renders the chain and drives add/delete.

**Contract**: `[id].astro` fetches path+steps server-side and passes them as the island's initial props (`client:load`). `PathEditor`:
- Renders steps in order. Position 0 → grouped base list; position ≥ 1 → `stepPlan` via `CardGroupColumn` (Remove/Add) + `SharedCardsDisclosure` + `CostSummary` (per-step) + `UnresolvedNotice` from the stored snapshot's `unresolved`.
- Shows `cumulativePathCost` at the top.
- "Add checkpoint": name + paste textarea → on submit, client runs `resolveDeck(listText)` (request-token guarded like `DeckComparer`), builds `StepSnapshot`, `POST /api/paths/[id]/steps`, then updates local state.
- "Delete last step", "Rename path", "Delete path" wired to their endpoints.
- Loading/empty/error states mirror `DeckComparer`'s patterns.

### Success Criteria:

#### Automated Verification:
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:
- Create a path; add base (precon) + "$50 upgrade" + "bracket 3"; each step shows the correct grouped plan vs the previous step and its per-step cost; cumulative cost shown at top
- Reopen the path in a fresh browser/session (same account) → all steps render from snapshot without re-pasting
- A step with an unrecognized card name saves the resolved subset and shows the unresolved notice
- Delete-last removes only the final step; rename/delete path work
- Re-verify via `wrangler dev` (workerd runtime fidelity) before considering done

---

## Phase 5: Auth-to-product wiring & retire on-device history

### Overview
Connect auth to the product surface (header + redirect) and remove the browser on-device history (FR-009), leaving `/` a stateless anonymous tool.

### Changes Required:

#### 1. Shared header / auth state
**File**: `src/layouts/Layout.astro`

**Intent**: Make sign-in state visible and reachable from every page.

**Contract**: Header reads `Astro.locals.user`: signed-in → show email + "My Paths" link (`/paths`) + sign-out form (`POST /api/auth/signout`); signed-out → "Sign in" / "Sign up" links. Existing config banner retained.

#### 2. Sign-in destination
**File**: `src/pages/api/auth/signin.ts`

**Intent**: Land a freshly signed-in user on their paths.

**Contract**: Change the success `redirect("/")` to `redirect("/paths")`. (Error redirects unchanged.)

#### 3. Retire on-device history
**File**: `src/components/deck/DeckComparer.tsx`; delete `src/lib/history/*`, `src/components/deck/HistoryDrawer.tsx`, `src/components/deck/useDeckHistory.ts` and their `*.test.ts`

**Intent**: Remove localStorage persistence (FR-009); `/` becomes stateless.

**Contract**: From `DeckComparer`: remove the Save button + `savedFlash`, the History button + `HistoryDrawer`, `useDeckHistory`, `handleSave`/`handleRestore`, and related imports/state. Keep paste→plan, sort, unresolved-accept. Delete the history module + history components/tests; confirm no remaining imports (DeckComparer is the only consumer).

### Success Criteria:

#### Automated Verification:
- Type check passes (no dangling history imports): `npx astro check`
- Lint passes: `npm run lint`
- Test suite passes with history tests removed: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:
- Logged out: `/` builds a plan from two pasted lists; no Save or History controls present
- Header shows correct state when signed in vs out; "My Paths" reaches `/paths`; sign-out works; sign-in lands on `/paths`
- No console errors referencing removed history modules

---

## Testing Strategy

### Unit Tests (vitest, pure logic):
- `resolveDeck` parity with prior `generateUpgradePlan` behavior; existing deck/plan/diff tests unchanged (engine guardrail).
- `parseSnapshot` guard: valid, malformed, round-trip.
- `stepPlan`: base (position 0) vs diff (position ≥ 1); identical/empty steps.
- `cumulativePathCost`: summation, missing-price exclusion.
- API snapshot validation: malformed body rejected.

### Integration / Security:
- RLS isolation assertion (committed SQL run via `db:reset`): user B cannot read/write user A's rows.

### Manual Testing Steps:
1. Sign up → land on `/paths` → create a path.
2. Add base + 2 named checkpoints; verify per-step plans, per-step cost, cumulative cost.
3. Reopen path in a fresh session (cross-device proxy) → renders from snapshot, no re-paste.
4. Add a step with a typo card → resolved subset saved + unresolved notice.
5. Delete-last, rename, delete path.
6. Second account cannot see the first's path (UI + API).
7. Logged out: `/` works, no Save/History.
8. Re-run key flows under `wrangler dev`.

## Performance Considerations

- Saved-path views render from snapshots → **no Scryfall calls on view** (the reason for the snapshot decision). Only adding a step resolves (client-side, throttled as today).
- Keep resolution off the Worker to respect Cloudflare's 10ms-CPU / subrequest limits (research finding).
- `jsonb` snapshots are small (a Commander deck ≈ 100 cards); no pagination needed at MVP scale.

## Migration Notes

- First migration in the project — establishes `supabase/migrations/` + `db:*` scripts. Apply locally with `npm run db:reset`; apply to the linked project with `npm run db:push` (human-run; destructive DB actions stay manual per infra policy).
- On-device localStorage history is **dropped, not migrated** (FR-009). Existing users lose local history; this is accepted (a one-time import is parked).
- `visibility` ships now but only `private` is used; the `unlisted` read policy is deferred to the sharing slice.

## References

- Research: [context/changes/user-accounts/research.md](context/changes/user-accounts/research.md)
- Shape notes: [context/foundation/shape-notes.md](context/foundation/shape-notes.md)
- PRD (brownfield): [context/foundation/prd-v2.md](context/foundation/prd-v2.md)
- Engine reuse seam: [src/lib/deck/diff.ts:103](src/lib/deck/diff.ts), [src/lib/deck/plan.ts:60](src/lib/deck/plan.ts), [src/lib/deck/cost.ts](src/lib/deck/cost.ts)
- Auth seam: [src/lib/supabase.ts](src/lib/supabase.ts), [src/middleware.ts](src/middleware.ts)
- Contract surfaces registry: [docs/reference/contract-surfaces.md](docs/reference/contract-surfaces.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database foundation & RLS

#### Automated
- [x] 1.1 Migration applies cleanly locally: `npm run db:reset` — ac7f846
- [x] 1.2 RLS isolation assertion passes (user B sees 0 of user A's rows) — ac7f846
- [x] 1.3 Type check passes: `npx astro check` — ac7f846
- [x] 1.4 Lint passes: `npm run lint` — ac7f846

#### Manual
- [x] 1.5 Both tables exist in Studio with RLS enabled and policies attached — ac7f846
- [x] 1.6 Insert as one user, query as another → nothing returned — ac7f846

### Phase 2: Engine-reuse helpers (pure logic)

#### Automated
- [x] 2.1 New unit tests pass (`resolveDeck`, `parseSnapshot`, `stepPlan`, `cumulativePathCost`): `npm test` — 7c5a891
- [x] 2.2 Existing deck tests still pass unchanged: `npm test` — 7c5a891
- [x] 2.3 Type check passes: `npx astro check` — 7c5a891
- [x] 2.4 Lint passes: `npm run lint` — 7c5a891

#### Manual
- [x] 2.5 3-snapshot chain matches pairwise `/` comparer output — 7c5a891

### Phase 3: Server data API

#### Automated
- [x] 3.1 Type check passes: `npx astro check` — 0f4ae5b
- [x] 3.2 Lint passes: `npm run lint` — 0f4ae5b
- [x] 3.3 Snapshot-validation unit test passes (malformed body rejected): `npm test` — 0f4ae5b

#### Manual
- [x] 3.4 Create path + append two steps + fetch → ordered steps with snapshots — 0f4ae5b
- [x] 3.5 Malformed snapshot body → 400 — 0f4ae5b
- [x] 3.6 Unauthenticated `/api/paths/*` → 401 — 0f4ae5b
- [x] 3.7 Second account cannot GET/PATCH/DELETE the first's path (RLS) — 0f4ae5b
- [x] 3.8 Delete-last removes only the last step; positions stay contiguous — 0f4ae5b

### Phase 4: Path builder UI

#### Automated
- [x] 4.1 Type check passes: `npx astro check` — 8925ecc
- [x] 4.2 Lint passes: `npm run lint` — 8925ecc
- [x] 4.3 Build succeeds: `npm run build` — 8925ecc

#### Manual
- [x] 4.4 Create path; add base + "$50 upgrade" + "bracket 3"; per-step plans + per-step cost + cumulative cost correct — 8925ecc
- [x] 4.5 Reopen in a fresh session → all steps render from snapshot, no re-paste — 8925ecc
- [x] 4.6 Step with an unrecognized card → resolved subset saved + unresolved notice — 8925ecc
- [x] 4.7 Delete-last / rename / delete path work — 8925ecc
- [x] 4.8 Verified under `wrangler dev` — 8925ecc

### Phase 5: Auth-to-product wiring & retire on-device history

#### Automated
- [x] 5.1 Type check passes (no dangling history imports): `npx astro check` — 7a819c2
- [x] 5.2 Lint passes: `npm run lint` — 7a819c2
- [x] 5.3 Test suite passes with history tests removed: `npm test` — 7a819c2
- [x] 5.4 Build succeeds: `npm run build` — 7a819c2

#### Manual
- [x] 5.5 Logged out: `/` builds a plan; no Save/History controls — 7a819c2
- [x] 5.6 Header state correct signed in/out; "My Paths" reaches `/paths`; sign-out works; sign-in lands on `/paths` — 7a819c2
- [x] 5.7 No console errors referencing removed history modules — 7a819c2
