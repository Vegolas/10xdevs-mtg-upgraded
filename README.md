# DeckDelta

**Turn two Commander deck lists into an actionable upgrade plan — then track the upgrade as a path of named checkpoints.**

Commander/EDH players upgrading a precon or budget deck toward a target list do it by hand: two lists side by side in a text editor, no idea what a swap costs, no record of what changed or why. Existing tools show a raw text diff — "add card X, remove card Y". A diff is the wrong abstraction. What a brewer needs is a plan: swaps grouped by card function, priced, in an order they can shop.

DeckDelta does two things:

- **Compare** (anonymous, at `/`) — paste a base list and a target list; get cards to remove, cards to add, and cards that stay, grouped by card type, with images, approximate USD prices, and a total upgrade cost.
- **Path builder** (signed in, at `/paths`) — save an upgrade as an ordered chain of named checkpoints. Each checkpoint is an immutable snapshot; add the next one either by pasting a full list or by typing just the delta (`- Sol Ring` / `+ Smothering Tithe`), which the server verifies against the previous checkpoint before it persists.

Full product context lives in `context/foundation/` — see [Documentation](#documentation).

## Tech stack

| Layer       | Choice                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Framework   | [Astro](https://astro.build/) 6, `output: "server"` (SSR on every route)                  |
| Islands     | [React](https://react.dev/) 19 — only where interactivity is required                     |
| Language    | TypeScript 5, strict (`astro/tsconfigs/strict`)                                           |
| Styling     | [Tailwind CSS](https://tailwindcss.com/) 4 + shadcn/ui ("new-york")                       |
| Auth & data | [Supabase](https://supabase.com/) — email/password auth, Postgres with Row-Level Security |
| Card data   | [Scryfall](https://scryfall.com/docs/api) `/cards/collection`, fetched from the browser   |
| Runtime     | [Cloudflare Workers](https://workers.cloudflare.com/) via `@astrojs/cloudflare`           |
| Tests       | Vitest (unit + integration), Playwright (E2E)                                             |

**Where the work happens:** card resolution, the diff, grouping, and cost all run _in the browser_ (`src/lib/card-data`, `src/lib/deck`). The server never resolves a card. Its job is persistence, ownership, and verifying that a diff-authored checkpoint really equals `prior ± delta`.

## Prerequisites

- Node.js **v22.14.0** (see `.nvmrc`)
- npm
- [Docker](https://www.docker.com/) + ~7 GB RAM — only for the local Supabase stack (needed for the path builder and for the integration/E2E suites)

## Getting started

```bash
git clone <this repo>
cd 10xdevx
npm install
```

Start the local Supabase stack (first run downloads Docker images):

```bash
npx supabase start
```

This applies everything in `supabase/migrations/`, so RLS is live immediately. Copy the printed credentials into **both** env files — `.env` for the Node tooling and `.dev.vars` for the Cloudflare local runtime, which is what `astro dev` actually reads:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from `npx supabase status`>
```

Then:

```bash
npm run dev
```

Local Studio is at <http://localhost:54323>. Stop the stack with `npx supabase stop`.

> **Running without Supabase keys works, partially.** `src/lib/supabase.ts` returns `null` when the keys are unset and `src/layouts/Layout.astro` renders a config banner. The anonymous comparer at `/` still works fully — it needs no session. Everything under `/paths` redirects to sign-in.

### Skipping email confirmation locally

Supabase requires email confirmation before first sign-in. In Studio: **Authentication → Email → Confirm email → off**. Users can then sign in immediately after sign-up.

### Using a cloud Supabase project

Point the same two variables at a hosted project (Settings → API), and **push the migrations before using the app**:

```bash
npm run db:push
```

A missing push shows up as a `500` on path create, not as a helpful error. This has bitten this project before (roadmap S-08).

## Available scripts

| Command                                   | What it does                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`                             | Dev server (Cloudflare workerd runtime; reads `.dev.vars`)                                  |
| `npm run build` / `npm run preview`       | Production build / preview                                                                  |
| `npm run typecheck`                       | `astro check` — **the only typechecker in the pipeline** (`astro build` does not typecheck) |
| `npm run lint` / `lint:fix`               | ESLint, type-aware rules                                                                    |
| `npm run format`                          | Prettier (astro + tailwind plugins)                                                         |
| `npm test` / `test:watch`                 | Unit suite — DB-free, no network                                                            |
| `npm run test:integration`                | DB-backed suite (needs local Supabase + `.env.test`)                                        |
| `npm run test:e2e`                        | Playwright browser suite (needs local Supabase + `.env.test`)                               |
| `npm run db:push` / `db:reset` / `db:new` | Supabase migration helpers                                                                  |

## Routes

### Pages

| Route                                                 | Auth     | What it is                                                         |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `/`                                                   | public   | The deck comparer. Stateless — nothing is saved                    |
| `/paths`                                              | required | The signed-in user's upgrade paths, plus the create form           |
| `/paths/[id]`                                         | required | The path editor: checkpoint chain, add/rename/delete, cost summary |
| `/auth/signin`, `/auth/signup`, `/auth/confirm-email` | public   | Auth forms                                                         |
| `/dashboard`                                          | required | Starter scaffold's example protected page; not part of the product |

Page gating lives in `src/middleware.ts` (`PROTECTED_ROUTES = ["/dashboard", "/paths"]`). Add a prefix there to gate a new page.

### API

| Method + route                           | Behavior                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/paths`                         | The caller's paths, newest first (pure RLS, no `owner_id` filter in the query) |
| `POST /api/paths`                        | Create a path. `201`                                                           |
| `GET /api/paths/[id]`                    | Path + its `position`-ascending steps                                          |
| `PATCH /api/paths/[id]`                  | Rename                                                                         |
| `DELETE /api/paths/[id]`                 | Delete; steps cascade. `204`                                                   |
| `POST /api/paths/[id]/steps`             | Append a checkpoint. `201`                                                     |
| `DELETE /api/paths/[id]/steps`           | Delete the **highest-position** step only                                      |
| `POST /api/auth/{signin,signup,signout}` | Form-post auth, redirect responses                                             |

`/api/paths/*` routes are deliberately **not** in `PROTECTED_ROUTES` — they self-check via `requireUser` and answer `401` JSON rather than redirecting. Denial for someone else's path is `404`, not `403`: RLS makes the row invisible, so the handler genuinely cannot distinguish "absent" from "not yours".

The wire contract is declared once, as types, in **`src/lib/api/contract.ts`**, and pinned by the contract suites under `tests/integration/`. Change a handler's shape and the contract tests fail loudly instead of a caller breaking silently.

## Data model

Two owned tables (`supabase/migrations/20260626121519_user_accounts_paths.sql`):

- **`upgrade_paths`** — `id`, `owner_id → auth.users`, `title`, `visibility` (`'private' | 'unlisted'`; only `private` is exercised today), timestamps.
- **`path_steps`** — `id`, `path_id → upgrade_paths` (cascade), `position` (0-based, `unique (path_id, position)`), `name`, `list_text`, `snapshot` (`jsonb`, the client-resolved cards), `delta_text` (nullable provenance for diff-mode entry), timestamps.

**RLS is the security boundary, not app-layer checks.** Both tables have `enable row level security` with owner-only policies for all operations; `path_steps` inherits ownership through an `exists` check on its parent path. Every `/api/paths/*` query runs under the caller's JWT via the cookie-bound client, so ownership is enforced in Postgres even if a handler forgets.

Views recompute plans and costs from `snapshot`. The server never re-parses `list_text` or `delta_text`.

## How the interesting parts work

- **`diffDecks` / `groupByCategory`** (`src/lib/deck/diff.ts`) — partitions two resolved decks into add / remove / shared and groups each by card function in `CATEGORY_ORDER`. This is the product, not a text diff.
- **`classifyType`** (`src/lib/card-data/classify.ts`) — Scryfall type line → card category.
- **`planAddCost`** (`src/lib/deck/cost.ts`) — quantity-aware total that tracks `pricedCount` and `missingCount` separately, so a partially-priced plan renders `—` instead of a misleading `$0.00`. Prices are approximate and informational by design (US vs EU markets diverge); the total is a ballpark, never a quote.
- **`verifyDerived`** (`src/lib/path/verify.ts`) — the server-side gate on diff-authored checkpoints. Proves the submitted snapshot equals `prior ± deltaText` over a closed violation set (`unapplicable-removal`, `quantity-mismatch`, `untouched-card-changed`, `unresolved-prefix`, `excess-new-cards`), each mapped to its own `400` sentence in `src/pages/api/paths/[id]/steps.ts`. Before this gate, a `- <card the prior never held>` persisted as a removal that never happened.
- **Optimistic concurrency** — a diff-mode append must name the step it derived from (`priorStepId`). If the chain moved underneath it, the answer is `409 "Path changed since you started"`, checked _before_ verification so a stale client is told to reload instead of being shown a correctness error about cards it never touched.
- **`applyAllSuggestions`** (`src/lib/deck/accept.ts`) — one-click accept for Scryfall's "did you mean…?" near-matches, substituting in place and re-generating.

## Testing

Tests here are risk-driven, not coverage-driven. **`context/foundation/test-plan.md` is the source of truth** — it carries a ranked register of 10 concrete failure scenarios (§2 Risk Map), and every risk names the spec that proves it cannot happen. Read it before writing a new test; §7 lists what this project deliberately does _not_ test, and §6 has copy-paste cookbook patterns per layer.

| Layer       | Files                                        | Needs                                 | Covers                                                                                                                                                                |
| ----------- | -------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 24 files, 243 tests (`src/**/*.test.ts`)     | nothing                               | Pure logic: parse, diff, cost, verify, derive, sort, classify + golden snapshots (risks #4–#6). One test is skipped by default — the opt-in live Scryfall smoke below |
| Integration | 10 files (`tests/integration/*.int.test.ts`) | local Supabase, `.env.test`           | Real HTTP through `astro dev` with **RLS live**: cross-owner isolation (#1), auth gate (#2), contract pinning (#3), derive→persist (#4/#5)                            |
| E2E         | 7 specs (`tests/e2e/*.spec.ts`)              | local Supabase, `.env.test`, Chromium | Browser-only risks: partial-resolution and transport-failure surfacing (#7), out-of-order responses in the comparer (#8) and path builder (#9/#10)                    |

Setup for the DB-backed suites:

```bash
cp .env.test.example .env.test    # then paste keys from `npx supabase status`
npx playwright install chromium   # E2E only
```

`.env.test` needs the **service-role** key in addition to the anon key — the test process uses it for owner seeding, teardown, and reading DB state back to assert that a rejected cross-owner write really changed nothing. It is never handed to the dev server.

> ⚠️ **Do not run `test:integration` and `test:e2e` at the same time.** Both mutate `.dev.vars` in the repo root (`.dev.vars.intbak` / `.dev.vars.e2ebak`). The distinct sidecars stop the two snapshots corrupting each other; they do not make the file safe to share.

Two conventions worth knowing before you add a test:

- **Locators**: `getByRole` / `getByLabel` / `getByText` first, `getByTestId` only when accessibility attributes are ambiguous. Never CSS selectors or XPath.
- **Never `page.waitForTimeout()`.** Wait for state — `toBeVisible()`, `waitForURL()`, `waitForResponse()`.

An opt-in live smoke test hits the real Scryfall API; the default run never touches the network:

```bash
RUN_LIVE=1 npx vitest run src/lib/card-data/scryfall.live.test.ts
```

## CI

`.github/workflows/ci.yml` runs three parallel jobs on push and PR to `main`, so a red check is attributable on sight:

- **`ci`** — lint → typecheck → unit tests → build.
- **`integration`** — boots an **ephemeral** local Supabase stack, exports its keys, runs the DB-backed suite, stops the stack.
- **`e2e`** — same ephemeral stack + Chromium, runs Playwright, uploads the HTML report as an artifact.

Only the `build` step in `ci` uses the `SUPABASE_URL` / `SUPABASE_KEY` repo secrets. The DB-backed jobs derive their keys from the stack they just booted, so the service-role key is ephemeral and dies with the job — the cloud project is never touched by a test.

## Deployment

```bash
npm run build
npx wrangler deploy      # or: npm run deploy
```

Set the secrets on the Worker (`npx wrangler secret put SUPABASE_URL`, same for `SUPABASE_KEY`) and make sure migrations are pushed to the target project. Platform reasoning is recorded in `context/foundation/infrastructure.md`.

## Documentation

The written foundation this app was built from lives in `context/foundation/`:

| File                                                                           | What it holds                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `prd.md`                                                                       | **v1**, greenfield: the original single-user, on-device, no-auth product        |
| `prd-v2.md`                                                                    | **v2**, brownfield: user accounts + server-persisted checkpointed paths         |
| `prd-v3.md`                                                                    | **v3**, brownfield: diff-style checkpoint entry — the current product-level PRD |
| `prd-diff-checkpoint.md`                                                       | Feature-scoped PRD for the `diff-style-checkpoint-entry` change                 |
| `roadmap.md`                                                                   | Slices S-01…S-08 with done / parked status and per-slice lessons                |
| `shape-notes.md`                                                               | Discovery notes upstream of the PRDs                                            |
| `test-plan.md`                                                                 | Risk map, phased rollout, quality gates, cookbook patterns                      |
| `tech-stack.md`, `stack-assessment.md`, `infrastructure.md`, `health-check.md` | Stack choice, agent-friendliness scoring, platform, dependency/security audit   |
| `lessons.md`                                                                   | Recurring rules and pitfalls surfaced across changes                            |

> **Read the PRDs as a chain, not as alternatives.** `prd.md` describes a single-user tool with no auth and on-device history. That was true at v1 and is no longer the product: accounts arrived in v2 and on-device history was retired in favour of account-backed paths (roadmap S-04, retired 2026-06-27). `prd-v3.md` is the current product-level PRD.

Per-change records — plan, research, reviews — live under `context/changes/<change-id>/`, and completed ones are moved to `context/archive/<date>-<change-id>/` where they are immutable. `AGENTS.md` is the working-conventions guide for AI agents in this repo.

## License

MIT
