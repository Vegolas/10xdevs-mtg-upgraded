---
date: 2026-06-26T00:00:00Z
researcher: Mateusz Tomanek
git_commit: f931a3df1205cf2a234852c99dc0b07da5d00a51
branch: main
repository: 10xdevs-mtg-upgraded (Vegolas/10xdevs-mtg-upgraded)
topic: "User accounts with saved decks, checkpointed upgrade paths, and forking"
tags: [research, codebase, auth, supabase, persistence, data-model, multi-user, rls]
status: complete
last_updated: 2026-06-26
last_updated_by: Mateusz Tomanek
---

# Research: User accounts with saved decks, checkpointed upgrade paths, and forking

**Date**: 2026-06-26
**Researcher**: Mateusz Tomanek
**Git Commit**: f931a3df1205cf2a234852c99dc0b07da5d00a51
**Branch**: main
**Repository**: Vegolas/10xdevs-mtg-upgraded

## Research Question

Plan a large feature for DeckDelta: let users create accounts and log in, then save their decks and "upgrade paths with checkpoints" — e.g. upload a Precon as a base deck, add a step named "$50 upgrade", then a step "bracket 3" built on the upgraded list, with every step visible in the app — and let a whole plan be **shared** so other users can **"fork to my account"** it.

## Pivot acknowledgement (decided)

This feature deliberately **reverses three locked product decisions**. The user has explicitly accepted this as a conscious pivot after the first implementation made it clear accounts are needed:

- **PRD §Access Control** — "Single user; no auth; data lives on-device only. No roles, no login flow." ([prd.md:99-101](context/foundation/prd.md))
- **PRD §NFR** — "No user data … leaves the user's device … The app does not operate a backend that receives or stores user content." ([prd.md:89-90](context/foundation/prd.md))
- **PRD §Non-Goals** — "No multi-user features (sharing upgrade plans, public links, collaboration). This is a single-user local tool." ([prd.md:103-107](context/foundation/prd.md)); mirrored in roadmap §Parked ([roadmap.md:192-196](context/foundation/roadmap.md))

**Action item:** the PRD, roadmap (§Parked, §Baseline auth note), and shape-notes (auth-model gray area) should be updated to reflect the new direction so the foundation stops contradicting the codebase. This is documentation debt the plan should schedule, not a blocker.

## Summary

The pivot is **far cheaper than it looks**, for two reasons the research confirmed:

1. **Supabase Auth is already fully wired** (SSR cookie sessions via `@supabase/ssr`, middleware that populates `Astro.locals.user`, working signin/signup/signout routes and forms, a protected `/dashboard`). It is functional but **orphaned** — nothing in the product surface links to it, there's no header/nav, and there is **no database schema at all**. It's a starter-template auth shell, ready to activate. ([supabase.ts](src/lib/supabase.ts), [middleware.ts](src/middleware.ts), [api/auth/*](src/pages/api/auth/signin.ts))

2. **The existing on-device history is already the right shape for server-side storage.** A saved comparison persists **inputs only** — the two raw deck-list texts plus a tiny count summary — and the plan is fully **recomputed from text** on restore. A DB row needs essentially the same columns. ([history/types.ts:19-31](src/lib/history/types.ts))

The **checkpoint feature is a generalization of the existing two-list diff**: today the engine computes `diffDecks(base, target)` over exactly two lists; an upgrade path is an **ordered chain of N named lists** where each step's target becomes the next step's base, i.e. `N−1` reuses of the same pure `diffDecks` call. The diff/resolve/cost pipeline needs **no change** — only a new chain container, per-step naming, and the rule "target of step *i* = base of step *i+1*". ([diff.ts:18-37](src/lib/deck/diff.ts), [plan.ts:60-91](src/lib/deck/plan.ts))

The genuinely **new** work is: (a) a Postgres schema (`profiles`/`decks`/`upgrade_paths`/`path_steps`/fork lineage) with **RLS** for per-user isolation and a public/shared visibility model; (b) a data Supabase client usable from the deck flow (today only a server SSR client exists, and `locals` exposes only `user`); (c) fork semantics (deep-copy a path into another account with lineage); (d) product-surface integration (header, "my decks", connecting `/` to auth); (e) the email-confirmation callback (currently cosmetic only). The card-data privacy posture can be **preserved** — keep Scryfall resolution client-side and persist only stable names/text, re-resolving volatile prices/images on read.

## Detailed Findings

### 1. Existing auth infrastructure — wired but orphaned

**Supabase client** ([supabase.ts:1-23](src/lib/supabase.ts))
- One factory `createClient(requestHeaders, cookies)` → `createServerClient` from `@supabase/ssr`. **Server-only; no browser/data client exists anywhere.**
- Reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server` ([supabase.ts:3](src/lib/supabase.ts)). **No `PUBLIC_` vars exist in the codebase** — both are declared server-secret `optional: true` in [astro.config.mjs:17-22](astro.config.mjs), which is what lets the app run unconfigured.
- Returns `null` if env missing ([supabase.ts:6-8](src/lib/supabase.ts)); every caller null-checks (graceful degradation).
- Cookie bridge (`getAll`/`setAll` → Astro `cookies`) is the standard SSR session-persistence pattern ([supabase.ts:10-22](src/lib/supabase.ts)).

**Middleware / session** ([middleware.ts](src/middleware.ts))
- Runs on every request; if client non-null calls `supabase.auth.getUser()` (validates JWT — safer than `getSession()`) and sets `context.locals.user = user ?? null` ([middleware.ts:10-13](src/middleware.ts)).
- **Only `user` is placed on locals — no `session`, no `supabase` client.** `App.Locals` types only `user: User | null` ([env.d.ts:1-5](src/env.d.ts)). This is the entire locals contract and a key gap for data queries.
- Route guard: `PROTECTED_ROUTES = ["/dashboard"]`; unauthenticated → redirect `/auth/signin` ([middleware.ts:4,18-22](src/middleware.ts)).

**Auth API routes** (all POST, form-encoded, redirect-based)
- `signin.ts` → `signInWithPassword`, success **redirects to `/`** (not `/dashboard`) ([api/auth/signin.ts:13-19](src/pages/api/auth/signin.ts)).
- `signup.ts` → `signUp`, success → `/auth/confirm-email` ([api/auth/signup.ts:13-19](src/pages/api/auth/signup.ts)).
- `signout.ts` → `signOut`, always → `/` ([api/auth/signout.ts:6-9](src/pages/api/auth/signout.ts)).
- Errors surface only as `?error=<message>` query params. **No CSRF, no rate limiting** (beyond Supabase's own); server ignores `confirmPassword`; client validation is bypassable.

**Auth UI** ([components/auth/*](src/components/auth/SignInForm.tsx))
- React forms are real HTML `<form method="POST">` islands (`client:load`); `SubmitButton` uses `useFormStatus()`.
- `dashboard.astro` reads `Astro.locals.user`, greets `{user?.email}`, has a sign-out form, but renders **only placeholder copy** — no per-user data ([dashboard.astro:4-24](src/pages/dashboard.astro)).
- **`index.astro` has zero auth wiring** — no link to signin/signup, no user display, no sign-out. There is **no shared header/nav anywhere**. A signed-in user landing on `/` sees no indication they're logged in. ([index.astro](src/pages/index.astro))

**Config degradation** ([config-status.ts](src/lib/config-status.ts), [Layout.astro:4,22-37](src/layouts/Layout.astro))
- `configStatuses` flags Supabase configured iff both env vars present; `Layout.astro` renders a site-wide Polish error banner when unconfigured. App never crashes; auth simply no-ops.

**Email confirmation is cosmetic** ([auth/confirm-email.astro:4](src/pages/auth/confirm-email.astro))
- Branches copy on `import.meta.env.DEV` only. There is **no `/auth/callback` / token-exchange route** to handle the confirmation or magic-link redirect (`exchangeCodeForSession`). Note local config has `enable_confirmations = false` ([supabase/config.toml:209](supabase/config.toml)), so dev signups auto-confirm — but production email confirm would have nowhere to land.

### 2. On-device history & the deck data model — already serialization-ready

**Saved-comparison shape** — inputs-only ([history/types.ts:19-31](src/lib/history/types.ts)):
```ts
interface SavedComparison {
  id: string;          // crypto.randomUUID()
  baseText: string;    // base deck list text, verbatim
  targetText: string;  // target deck list text, verbatim
  savedAt: number;     // epoch ms
  summary: ComparisonSummary; // { addCount, removeCount } — denormalized drawer label
}
```
- **Stores raw paste text only** — never resolved `Card[]`, never the computed `UpgradePlan`. The summary counts are the one deliberate denormalization (cheap drawer labels). ([history.ts:50-55](src/lib/history/history.ts))
- Content dedup key `historyKey = normalize(base) + "\n\n" + normalize(target)` — order-sensitive, not stored ([history.ts:34-36](src/lib/history/history.ts)).
- Cap 30, newest-first, oldest evicted; re-saving refreshes `savedAt` and moves to top ([history.ts:83-87](src/lib/history/history.ts), [types.ts:43](src/lib/history/types.ts)).
- Versioned envelope `{ version: 1, items }`; version mismatch → empty (bump-to-invalidate, no migration) ([types.ts:34-40](src/lib/history/types.ts), [storage.ts:44-67](src/lib/history/storage.ts)).

**Storage** — `localStorage`, single key `deckdelta.history.v1`, JSON, SSR-guarded (`typeof window` checks), best-effort writes (quota errors swallowed). ([storage.ts:15,70-96](src/lib/history/storage.ts))

**Hook + restore round-trip** — `useDeckHistory` is a module-level external store via `useSyncExternalStore` (server snapshot `[]`, no hydration mismatch); API `{ items, save, remove, clear }`. `save(base, target, plan)` takes the plan **only to compute the summary** — it isn't stored ([useDeckHistory.ts:14-73](src/components/deck/useDeckHistory.ts)). Restore sets the two texts and lets a ~700ms debounced effect rebuild the plan via `generateUpgradePlan`; a monotonic `requestToken` guards against stale in-flight results ([DeckComparer.tsx:73-131](src/components/deck/DeckComparer.tsx)).

**Core types** ([diff.ts:18-37](src/lib/deck/diff.ts), [card-data/types.ts:21-56](src/lib/card-data/types.ts), [plan.ts:41-44](src/lib/deck/plan.ts), [cost.ts:15-22](src/lib/deck/cost.ts)):
- `Card { name, typeLine, category, imageUrl|null, priceUsd|null, priceEur|null }` — last three are **runtime-resolved and drift**.
- `DeckCard { card, quantity }`; `CardGroup { category, cards }`; `UpgradePlan { remove, add, shared }` (each `CardGroup[]`).
- `PlanOutcome = ok|empty|error`; `PlanCost { total, pricedCount, missingCount }` (honest partial total).
- **Minimal data to reconstruct a plan = the two text strings** + resolver access. Everything else is recomputed. The current `SavedComparison` already stores exactly this.

### 3. Card-data resolution & client/server boundary — 100% client-side today

- **Resolution runs entirely in the browser**, inside the `DeckComparer` island (`client:load`, [index.astro:21](src/pages/index.astro)). Call path: `DeckComparer.runPlan` → `generateUpgradePlan` → `resolveCards` → `fetch()` straight to `https://api.scryfall.com`. No SSR, no API route, no Worker code touches it ([DeckComparer.tsx:59](src/components/deck/DeckComparer.tsx), [plan.ts:72-73](src/lib/deck/plan.ts), [scryfall.ts:87,123](src/lib/card-data/scryfall.ts)).
- **Scryfall integration** is isolated in one swappable transport file ([scryfall.ts:3-6](src/lib/card-data/scryfall.ts)): `POST /cards/collection` (batch ≤75 names) + `GET /cards/named?fuzzy=` for "did you mean". 100ms throttle between sequential requests, in-session `Map` cache, partial-resolution via `ResolutionResult { resolved, unresolved }` ([resolve.ts:7,15,73,105-144](src/lib/card-data/resolve.ts)). Pulls `name`, `typeLine`, `imageUrl` (normal size), `priceUsd`, `priceEur` ([normalize.ts:27-40](src/lib/card-data/normalize.ts)).
- **Privacy stance today**: deck text, parsing, resolution, diffing, cost, and history all run client-side; only card-name lookups leave the device. `imageService: "passthrough"` ([astro.config.mjs:16](astro.config.mjs)) and `cardImage.ts` (pure `/normal/`→`/small/` URL swap, no network) mean images load directly from `cards.scryfall.io`, never proxied through the Worker.
- The transport file **explicitly anticipates a future server proxy** ([scryfall.ts:3-12](src/lib/card-data/scryfall.ts)) — the orchestrator imports only from `./scryfall`, so a proxy can be swapped in without touching `resolveCards`.

**Implication for accounts:** keep resolution client-side and **persist only stable data** (canonical `name`, quantities, raw text) — re-resolve volatile `priceUsd`/`priceEur`/`imageUrl` on read. Moving resolution server-side would put throttled, sequential, 75-name batches onto the Worker (subrequest-count / wall-clock risk) and the in-isolate `sessionCache` wouldn't be shared across requests.

### 4. Database & migration state — empty, convention not yet established

- **No schema, no migrations.** `supabase/migrations/` does not exist; zero `.sql` files in the repo. ([supabase tree](supabase/config.toml))
- `config.toml`: project_id `10x-astro-starter`; Postgres 17; `db.migrations.enabled = true` but `schema_paths = []`; seed references a non-existent `./seed.sql`; **`auth.enable_confirmations = false`**; signup enabled; JWT expiry 3600s; refresh-token rotation on. ([supabase/config.toml](supabase/config.toml))
- README states: *"No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only."* (this becomes stale with this change).
- Supabase CLI present (`supabase@^2.23.4` devDep); **no npm scripts invoke it** — migration workflow must be established. To add schema: create `supabase/migrations/<timestamp>_<name>.sql`, set `schema_paths`, `supabase db push`, commit the migration files.
- Relevant deps: `@supabase/ssr@^0.10.3`, `@supabase/supabase-js@^2.99.1`, Astro `^6.3.1`, React `^19.2.6`, `@astrojs/cloudflare@^13.5.0`.

## Proposed server-side data model (for `/10x-plan` to refine)

A natural mapping of the feature description onto Postgres. **Names are illustrative**, not final.

```
auth.users (Supabase built-in)
  └─ profiles            (1:1, optional public handle/display name for sharing attribution)

upgrade_paths            -- "this whole plan" — the shareable/forkable unit
  id            uuid pk
  owner_id      uuid → auth.users
  title         text                 -- e.g. "My Precon glow-up"
  visibility    enum(private|unlisted|public)   -- drives sharing
  forked_from   uuid → upgrade_paths null        -- fork lineage
  created_at / updated_at

path_steps               -- ordered checkpoints within a path
  id            uuid pk
  path_id       uuid → upgrade_paths (cascade)
  position      int                  -- 0 = base (Precon), 1 = "$50 upgrade", 2 = "bracket 3"
  name          text                 -- per-step label
  list_text     text                 -- the deck-list paste for THIS step
  add_count     int null             -- denormalized summary vs previous step (optional)
  remove_count  int null
  unique(path_id, position)
```

**Why this shape:**
- A **step's `list_text` is the only persisted input** — mirrors today's inputs-only history. Step *i*'s diff is `diffDecks(resolve(steps[i-1].list_text), resolve(steps[i].list_text))`, reusing every existing pure function unchanged. Step 0 (the Precon base) has no diff / diffs against empty.
- The existing single comparison (`baseText`/`targetText`) is just a **2-step path** — the on-device history concept generalizes cleanly, and a migration/import path from localStorage → account is feasible.
- **Fork = deep-copy** a path and all its `path_steps` into a new `owner_id`, stamping `forked_from`. Lineage is one nullable FK.
- **Sharing = `visibility`** + a read path that allows `public`/`unlisted` rows to be fetched by non-owners (read-only) so they can fork.

**RLS (mandatory — single `SUPABASE_KEY`, isolation must come from Postgres):**
- `upgrade_paths`: owner can CRUD own rows; anyone can `SELECT` where `visibility in ('public','unlisted')`; fork is an `INSERT` with `owner_id = auth.uid()` reading a visible source.
- `path_steps`: access derived from parent path's policy (owner full; readable when parent is shared).
- `profiles`: self-write, public-read of the display fields used for attribution.

**Client wiring needed:** add a data Supabase client reachable from the deck flow — either a `locals.supabase` per-request instance (extend `App.Locals` in [env.d.ts](src/env.d.ts), set it in [middleware.ts](src/middleware.ts)) or new `/api/paths/*` endpoints. Today neither exists; `locals` carries only `user`.

## Code References

GitHub permalinks at commit `f931a3d`:

- [`src/lib/supabase.ts`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/lib/supabase.ts) — SSR-only Supabase client factory; null when unconfigured.
- [`src/middleware.ts:4-22`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/middleware.ts#L4-L22) — session population (`locals.user` only) + `/dashboard` guard.
- [`src/env.d.ts:1-5`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/env.d.ts#L1-L5) — `App.Locals` contract (only `user`).
- [`src/pages/api/auth/signin.ts`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/pages/api/auth/signin.ts) — sign-in route; success redirects to `/`.
- [`src/pages/auth/confirm-email.astro:4`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/pages/auth/confirm-email.astro#L4) — cosmetic confirm copy; no callback route.
- [`src/lib/history/types.ts:19-31`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/lib/history/types.ts#L19-L31) — `SavedComparison` (inputs-only).
- [`src/lib/history/storage.ts:15-96`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/lib/history/storage.ts#L15-L96) — localStorage envelope + SSR guards.
- [`src/components/deck/DeckComparer.tsx:73-131`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/components/deck/DeckComparer.tsx#L73-L131) — debounced rebuild + restore round-trip.
- [`src/lib/deck/diff.ts:18-137`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/lib/deck/diff.ts#L18-L137) — `UpgradePlan`/`diffDecks` (the per-step engine).
- [`src/lib/deck/plan.ts:60-91`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/lib/deck/plan.ts#L60-L91) — `generateUpgradePlan` (parse→resolve→diff).
- [`src/lib/card-data/scryfall.ts:3-139`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/src/lib/card-data/scryfall.ts#L3-L139) — the swappable Scryfall transport (proxy seam).
- [`supabase/config.toml`](https://github.com/Vegolas/10xdevs-mtg-upgraded/blob/f931a3df1205cf2a234852c99dc0b07da5d00a51/supabase/config.toml) — migrations enabled, `schema_paths = []`, `enable_confirmations = false`.

## Architecture Insights

- **The expensive parts are already paid for.** Auth, SSR session, the diff/resolve/cost engine, and an inputs-only persistence model all exist. The new surface is mostly **Postgres schema + RLS + fork semantics + UI glue**, not core engine work.
- **The checkpoint chain is `diffDecks` applied pairwise.** Resist building a new diff engine; build a chain container that reuses the pure functions. The cleanest invariant is "step *i*'s `list_text` is the base for step *i+1*."
- **Persist inputs, not outputs.** The codebase already learned this lesson on-device (prices/images drift; store text, recompute). Carry it to the DB: store names/text, re-resolve volatile fields on read. Decide separately whether a checkpoint should snapshot a **cost-at-save-time** number for historical accuracy (nothing is snapshotted today except count summaries).
- **RLS is the security boundary, not app code.** With one `SUPABASE_KEY` and client-reachable data, per-user isolation and shared-read must live in Postgres policies.
- **Keep the privacy reversal scoped.** Only saved-account data needs to leave the device; the anonymous, on-device flow can remain for logged-out users. This limits blast radius and lets the on-device history coexist as the "not signed in" experience.

## Historical Context (from prior changes)

- [`context/archive/2026-06-16-on-device-history/plan.md`](context/archive/2026-06-16-on-device-history/plan.md) — the closest analog. Explicitly states the **"No backend / cross-device sync. On-device only (privacy NFR)"** decision, and that revisit does a **fresh Scryfall lookup** so "prices may differ from when saved — acceptable." It **considered and rejected** persisting the full plan result, confirming the inputs-only design. The new feature consciously overturns the "no backend" half while keeping the "recompute on read" insight.
- [`context/foundation/shape-notes.md:25-26`](context/foundation/shape-notes.md) — auth-model gray area resolved as "local profile — browser storage, no server, no login." Now superseded.
- [`context/foundation/roadmap.md:57-59,192-196`](context/foundation/roadmap.md) — §Baseline notes auth is "present … Unused by DeckDelta"; §Parked lists multi-user features as out-of-scope per PRD. Both need updating.

## Related Research

- No prior `research.md` exists for auth/accounts. The card-data and deck-diff surfaces are documented in [`docs/reference/contract-surfaces.md`](docs/reference/contract-surfaces.md) (load-bearing names registry) — consult before renaming any `Card`/`UpgradePlan`/`diffDecks` surface this feature touches.

## Open Questions

1. **Scope split.** Is this one change or a sequence? It naturally decomposes into: (A) activate accounts + connect auth to the product surface (header, link `/`↔auth, real confirm-email callback); (B) server-persisted single saved deck/comparison (server-ify history, with optional localStorage→account import); (C) multi-step upgrade paths (the chain container); (D) sharing + fork-to-my-account. Strong recommendation: plan A→B→C→D as separate slices; A+B alone is shippable value. *(Consider `/10x-shape` + a roadmap update before `/10x-plan`.)*
2. **Cost-at-save-time snapshot?** Should a checkpoint freeze its total cost for historical accuracy, or always re-resolve (accepting drift, as on-device history does today)?
3. **Anonymous flow retained?** Keep the current on-device, no-login experience for logged-out users (recommended), or gate everything behind auth?
4. **Visibility model granularity.** Is `private | unlisted | public` enough, or is per-user share-grant (named collaborators) needed? The description only requires "share so others can fork" → `unlisted` link + `public` likely suffice for MVP.
5. **Fork depth.** Does forking copy the entire path (all steps) — recommended — and should the original author be attributed (needs the `profiles` handle)?
6. **Key model.** Today `SUPABASE_KEY` is one undifferentiated secret. Does any sharing/admin operation need a service-role path that bypasses RLS, or can everything run under the user's RLS context? (Prefer the latter.)
7. **Confirm-email in production.** With `enable_confirmations = false` locally, dev is fine — but do we enable email confirmation in prod, and therefore need a real `/auth/callback` token-exchange route?
8. **Migration convention.** First migration in the project — establish `supabase/migrations/*.sql` + `schema_paths` + an npm script as part of this change.
