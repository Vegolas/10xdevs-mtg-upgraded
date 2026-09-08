# Repository Guidelines

**DeckDelta** — Astro 6 SSR + React 19 islands, Tailwind 4, Supabase (auth + Postgres with RLS), deployed to Cloudflare Workers. It compares two Commander/EDH deck lists into a grouped, priced upgrade plan, and lets a signed-in user persist that upgrade as a chain of immutable checkpoints. See `@README.md` for what it is and how to run it.

## Hard rules

- **RLS is the security boundary.** Every `/api/paths/*` query runs under the caller's JWT via the cookie-bound client from `@src/lib/supabase.ts`. Never add an `owner_id` filter as the security mechanism, and never use the service-role key in app code — it belongs only to the test process. New tables: `enable row level security` with granular per-operation policies in the same migration.
- **Cross-owner denial is `404`, not `403`.** RLS makes the row invisible, so the handler cannot distinguish "absent" from "not yours". Do not "improve" this into a `403` — it would leak the existence of other users' paths, and the ownership suites pin it.
- **The server never resolves cards.** Parsing, Scryfall resolution, the diff, and cost all run in the browser (`@src/lib/card-data`, `@src/lib/deck`). A request handler that calls Scryfall is a design error.
- **`SUPABASE_URL` / `SUPABASE_KEY` are server-only secrets**, declared in `@astro.config.mjs` `env.schema` and read via `astro:env/server`. Never `import.meta.env`, never client-side. Both are `optional: true` — `createClient` returns `null` when unset and callers must handle it.
- **`src/lib/api/contract.ts` is the single declaration site for the wire contract.** Change a route's request/response shape there, and update the contract suites in `tests/integration/` in the same change. `jsonResponse<T>` is explicitly parameterized so `npm run typecheck` catches drift.
- **Never commit secrets.** `.env`, `.env.test`, `.dev.vars`, `tests/e2e/.auth/`, `/auth.json` are gitignored and must stay that way. Only `.env.example` and `.env.test.example` are tracked, with placeholders.
- **Do not write to `context/archive/`.** Archived changes are immutable.

## Project structure

- `src/pages/` — routes. `index.astro` is the anonymous comparer; `paths/` is the signed-in path builder; `api/paths/*` and `api/auth/*` are the endpoints. `@src/middleware.ts` resolves `context.locals.user` and gates the prefixes in `PROTECTED_ROUTES`.
- `src/lib/<module>/index.ts` — **every `src/lib` module has a barrel that is its public entry point.** Import `@/lib/deck`, not `@/lib/deck/cost`. Modules: `card-data/` (Scryfall + classification), `deck/` (parse, diff, cost, accept), `path/` (snapshot, delta, derive, verify, request guards), `api/` (contract, client, route helpers), `async/` (latest-run guard).
- `src/components/` — `deck/` and `path/` are the product islands; `auth/` the forms; `ui/` shadcn ("new-york", add via `npx shadcn@latest add <name>`); `.astro` for static chrome.
- `supabase/migrations/` — `YYYYMMDDHHmmss_short_description.sql`. `@src/lib/database.types.ts` is the row typing for `createServerClient<Database>` and is **hand-written** (shaped like `supabase gen types` output so it can be swapped later). A migration that adds or changes a column must update it in the same change — nothing regenerates it.
- `context/foundation/` — PRDs (read `prd-v3.md` for the current product; `prd.md` is v1 and describes a no-auth on-device tool that no longer exists), `roadmap.md`, `test-plan.md`, `lessons.md`. `context/changes/<change-id>/` for in-flight work.
- Path alias `@/*` → `./src/*` (`@tsconfig.json`).

## Commands

- `npm run dev` — dev server (Cloudflare workerd; reads `.dev.vars`, **not** `.env`).
- `npm run typecheck` — `astro check`. The only typechecker; `astro build` does not typecheck and ESLint does not report assignability.
- `npm run lint` / `lint:fix` / `format`.
- `npm test` — unit, DB-free, no network. `npm run test:integration` / `npm run test:e2e` — both need local Supabase up and `.env.test` filled.
- `npm run db:push` / `db:reset` / `db:new`.

## Testing conventions

`@context/foundation/test-plan.md` is the source of truth: §2 is a ranked register of 10 concrete risks, §6 has per-layer cookbook patterns, §7 lists what is deliberately not tested. Read the relevant section before adding a test.

- **Cheapest layer that gives real signal wins.** Pure logic → unit. Ownership, auth gate, contract, persist correctness → integration against real HTTP with RLS live. Only genuinely browser-shaped risks (async ordering, error surfacing) → E2E. Do not promote to E2E because it "feels safer"; component render and pixel tests are out of scope by §7.
- **Assert DB state, not just status codes**, for anything that claims a write was refused — the ownership suites read rows back with the service-role client to prove nothing changed.
- **Locators**: `getByRole` / `getByLabel` / `getByText` first; `getByTestId` only when accessibility attributes are ambiguous. Never CSS selectors, XPath, or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- **Test independence**: own setup, action, assertion, cleanup; unique ids (timestamp suffix) so parallel runs and re-runs don't collide. E2E specs scope locators to the `main` landmark — the config banner renders outside it and differs between CI and a contributor's machine.
- A spec guarding an ordering bug sets `retries: 0` locally (see `comparer-stale-response.spec.ts`) — a genuine race must never retry its way to green.
- ⚠️ `test:integration` and `test:e2e` both mutate `.dev.vars`; **never run them concurrently.**

## Coding style

- TypeScript strict; ESLint runs `strictTypeChecked` + `stylisticTypeChecked` (`@eslint.config.js`). `no-console` warns; prefix intentionally unused vars with `_`.
- **Always use braces; no one-liner `if`/`for` bodies.** Early-return guards over nested conditionals — this is the shape of every handler and guard in the codebase.
- **Validation is hand-written pure guards, not a schema library.** There is no zod dependency; follow `@src/lib/path/request.ts` — no Astro/Supabase/I/O imports, so guards are unit-testable directly. Guards return the parsed value or `null`; the route turns `null` into its own `400` message.
- **Order of checks in a handler is contract, not preference.** Body validation before the ownership read (so a malformed body aimed at another owner's path answers `400`, not `404`); concurrency (`409`) before correctness verification. Both are pinned by the contract suites — read the docstrings in `@src/pages/api/paths/[id]/steps.ts` before reordering.
- **Explain _why_, not _what_, in comments** — and cite the risk, roadmap slice, or plan that motivated a non-obvious decision, as the existing module docstrings do.
- React islands only: no Next.js directives. Hooks are colocated with their consumer (`useSortMode.ts` beside the deck components, `useLatestRun.ts` in `src/lib/async/`), not in a global hooks folder.
- Merge Tailwind classes with `cn()` from `@/lib/utils`. Never concatenate class strings.
- Prettier owns formatting (astro + tailwind plugins). Pre-commit husky + lint-staged auto-fixes staged `*.{ts,tsx,astro}` and formats `*.{json,css,md}`.
- Node v22.14.0 (`.nvmrc`).

## CI

`@.github/workflows/ci.yml` runs three parallel jobs on push and PR to **`main`**: `ci` (lint → typecheck → unit → build), `integration` and `e2e` (each boots an ephemeral local Supabase stack and derives its keys from it). Repo secrets `SUPABASE_URL` / `SUPABASE_KEY` are used only by the build step; no test job touches the cloud project.
