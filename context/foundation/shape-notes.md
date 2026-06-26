---
project: "DeckDelta"
context_type: brownfield
created: 2026-06-26
updated: 2026-06-26
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 5   # ~4–5 weeks, user-acknowledged (see Timeline acknowledgment)
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona"
      decision: "Returning EDH brewer — saves/iterates their own upgrade path across devices; sharing/forking is a strong secondary"
    - topic: "load-bearing insight"
      decision: "Both jointly: an upgrade is a PATH of named checkpoints (not a single diff) AND that path is a publishable, forkable artifact"
    - topic: "must-preserve"
      decision: "Anonymous core tool stays usable without login (quick check-up; paste→plan; engine unchanged). REVISED in Phase 4.5: on-device localStorage HISTORY is retired — persistence becomes account-only; only the stateless tool is preserved for logged-out users (see FR-009)"
    - topic: "auth method"
      decision: "Email + password — reuse the already-scaffolded Supabase forms/routes; no new auth integration for MVP"
    - topic: "sharing/visibility model"
      decision: "Private by default + per-path 'unlisted link' (anyone with link can view & fork); no public gallery/discovery for MVP"
    - topic: "email confirmation"
      decision: "Off for MVP (matches local enable_confirmations=false); no /auth/callback or transactional email needed yet"
    - topic: "MVP scope (slicing)"
      decision: "A+C only: accounts + multi-step checkpoint paths. Defer sharing/forking (D) to a fast-follow, but reserve owner_id + visibility in the schema now so D is additive. B (single saved comparison) collapses into C — a 2-step path is the degenerate case"
    - topic: "secondary success outcome"
      decision: "Cumulative cost roll-up across the whole path (sum of per-step add costs)"
    - topic: "delivery timeline"
      decision: "~4–5 weeks after-hours, explicitly acknowledged as sustained effort (delivery_weeks: 5)"
    - topic: "FR-006 scope (Socratic)"
      decision: "MVP = append step + delete-last + rename/delete path; mid-path step editing (downstream re-base cascade) deferred"
    - topic: "FR-008/FR-009 (Socratic)"
      decision: "Retire on-device localStorage history; logged-out = stateless quick check-up; persistence is account-only"
    - topic: "step persistence model"
      decision: "Store list text + resolved-card snapshot (name/type/image/price-at-save) per step; fast snapshot-rendered views, refresh-on-demand; resolution stays client-side"
    - topic: "cumulative cost definition"
      decision: "Sum of per-step add costs (approximate; double-counts churn by design; 'stage by stage' framing)"
  frs_drafted: 9
  quality_check_status: accepted
---

> Brownfield change `user-accounts`. Supersedes the original greenfield DeckDelta shape
> (archived at `context/foundation/archive/shape-notes-2026-06-26-1312.md`).
> Grounded in `context/changes/user-accounts/research.md`.
> Body is ordered to match the 11 brownfield PRD sections (`skills/10x-shape/references/prd-schema.md`);
> `## Timeline acknowledgment` and `## Non-Functional Requirements` are supplementary shape blocks.

## Current System Overview

- **System purpose (one sentence):** DeckDelta turns the manual side-by-side comparison of two Commander/EDH deck lists into an actionable, grouped upgrade plan (add/remove/shared by card type, with images, prices, and a total cost).
- **Key architecture:** Client-heavy Astro app — the entire deck flow (parse → resolve → diff → cost → history) runs in the browser inside a single React island. SSR is enabled but does no per-request deck work today. Auth-only server surface exists.
- **Tech stack:** TypeScript, Astro 6 + React 19 + Tailwind 4, deployed to Cloudflare Workers (Static Assets). Supabase is wired for auth (SSR cookie sessions via `@supabase/ssr`) but **currently unused** by the product. Card data comes from Scryfall, fetched directly from the browser.
- **Current user base:** Anonymous Commander/EDH players. No accounts in use; single-user, single-device. Small scale, low QPS.
- **Core functionality today:** Paste a base list + target list → automatic grouped upgrade plan; card images; approximate USD prices + total; "did you mean" name correction; sortable rows; **on-device comparison history** (localStorage, inputs-only — stores the two paste texts + a count summary, recomputes the plan on restore).

## Problem Statement & Motivation

- **The gap:** The current model captures only a single base→target diff, persisted on-device. It can't represent how players actually upgrade — as a **multi-step path of named checkpoints** (e.g. Precon base → "$50 upgrade" → "bracket 3", each step built on the previous one's list). On-device history is also fragile (clearing browser data loses everything) and single-device, and there is **no way to share** a plan with another player.
- **Why now:** After the first implementation shipped, it became clear that accounts are needed — the single-user, on-device model can't carry saved multi-step paths across devices or support sharing. This is a deliberate, acknowledged reversal of the original PRD's single-user / on-device-only / no-multi-user stance.
- **Current workaround & its cost:** Players keep upgrade stages in spreadsheets, text files, or separate Moxfield/Archidekt lists and manually re-diff each stage — losing the grouped-by-function view, the per-step cost, and any continuity between steps. DeckDelta's on-device history only mitigates the *single*-diff case.

## User & Persona

**Primary persona — the Returning EDH Brewer.** An existing DeckDelta-style Commander player who upgrades the *same* deck over time and wants their upgrade **path** saved durably and available across devices/sessions. They start from a precon (or budget base), then add successive named checkpoints ("$50 upgrade", "bracket 3"), each building on the prior step, and want every step visible and revisitable without re-pasting. The checkpoint chain is primarily for their own iterative brewing.

### Secondary persona — the Sharer / Forker
A player who either **publishes** a polished upgrade path for others (budget guides, "precon → bracket X" content) or **finds and forks** someone else's shared path into their own account to follow or customize. The path is treated as a publishable, forkable artifact — like a recipe. The load-bearing insight is **joint**: the path abstraction and its forkability together justify the pivot.

## Success Criteria

> **MVP scope = A+C** (accounts + checkpoint paths). Sharing/forking (D) is a deferred fast-follow; the schema reserves `owner_id` + `visibility` so D is purely additive. A 2-step path is the degenerate "single saved comparison," so milestone B folds into C.

### Primary
- A signed-in user can create an **upgrade path** from a base deck (e.g. a Precon), add **named checkpoint steps** ("$50 upgrade", "bracket 3") where each step builds on the previous step's list, and **revisit the whole path across devices** — every step's grouped upgrade plan and per-step cost visible — **without re-pasting** the lists.

### Secondary
- The path shows a **cumulative cost roll-up** from base → final checkpoint (sum of per-step add costs), so the brewer sees the whole upgrade's cost, not just per-step. Nice-to-have; not sufficient on its own.

### Guardrails
- **Per-user data isolation** — a user can never read or edit another user's private path; enforced in Postgres (Row-Level Security), not just app code. A leak here is existential for the multi-user pivot.
- **Anonymous core tool stays usable** — logged-out users can run the full paste→plan flow for a quick check-up without an account; engine output identical; accounts never gate the core tool. (Scope note: on-device *history* is being retired — FR-009 — so this guardrail covers the stateless tool, not local persistence.)
- **Engine output identical** — the diff/resolve/cost pipeline produces the same plan it does today; accounts add persistence *around* the engine, not inside it.

## Timeline acknowledgment

Acknowledged on 2026-06-26: ~4–5 week delivery (`delivery_weeks: 5`) for the A+C MVP requires sustained, after-hours dedication — including first-time DB schema + migration + RLS work plus the path UI. User accepted the sustained-effort cost eyes-open. (Sharing/forking deferred to keep this slice finishable.)

## User Stories

### US-01: Brewer saves and continues a multi-step upgrade path

- **Given** a signed-in user who has a base Precon deck list
- **When** they create a path (e.g. "My Dimir glow-up"), add a checkpoint named "$50 upgrade" whose base is the Precon list, then add "bracket 3" whose base is the "$50 upgrade" list
- **Then** each step shows its grouped upgrade plan (add / remove / shared by card type) and per-step cost, the whole path persists to their account, and they can reopen it later from another device without re-pasting
- **Before (delta):** this was a single on-device base→target diff — no chain of steps, no naming, no cross-device persistence.

#### Acceptance Criteria
- Steps are ordered; step N+1's base equals step N's list (target) exactly.
- The base step (Precon) has no diff, or diffs against an empty list.
- Each step's plan uses the existing grouped-by-type diff/cost engine — output is identical to today's two-list comparison.
- The path is private to its owner; another signed-in user cannot read or edit it.
- Reopening on another device shows all steps without re-pasting. Prices/images re-resolve on view and may differ from save time — acceptable, consistent with current on-device history behavior.

### US-02: Anonymous user is unaffected by accounts

- **Given** a visitor who is not signed in
- **When** they open the app and paste a base + target deck list
- **Then** they get the same grouped upgrade plan as before, with no prompt or requirement to log in (a stateless quick check-up)
- **Before (delta):** the paste→plan tool is preserved (FR-008), but on-device localStorage history is **gone** (FR-009) — saving now requires an account. The story exists to make the "core tool still works logged-out" guardrail testable.

## Scope of Change

> Captured as FR-NNN lines with a change category (`new` / `preserved` / `removed`) and priority. `/10x-prd` maps these into the brownfield **Scope of Change** section. Each FR carries its Socratic challenge inline.

### Accounts
- FR-001: A visitor can register, sign in, and sign out with email + password. Priority: must-have. Change: new
  > Socratic: Counter considered — "Discord OAuth fits MTG players better; email+password adds reset/support friction." Resolution: kept. The email/password flow is already scaffolded and working, so it ships at ~zero cost; OAuth can be added later without reworking the model.
- FR-002: The app shows authenticated state (header with a link to "My Paths") and links logged-out users to sign-in / sign-up. Priority: must-have. Change: new
  > Socratic: Counter considered — "a header clutters the clean single-purpose page." Resolution: kept. Without visible signed-in state and a route to saved paths, accounts are invisible and unusable; a minimal header is the necessary cost of the feature.

### Upgrade paths & checkpoints
- FR-003: A signed-in user can create a named upgrade path from a base deck list (the Precon / base). Priority: must-have. Change: new
  > Socratic: Counter considered — "auto-create the path on first checkpoint instead of an explicit step." Resolution: kept explicit creation — a named container makes the mental model obvious and gives the base a home before any checkpoint exists.
- FR-004: A user can append an ordered, named checkpoint step whose base is the previous step's list (step N's target becomes step N+1's base). Priority: must-have. Change: new
  > Socratic: Counter considered — "a strict linear chain can't express branching (forking 'bracket 3' off the Precon, not off '$50')." Resolution: linear for MVP; branching acknowledged as a real future need and parked (see Open Questions / Non-Goals).
- FR-005: A user can view the full path — each step's grouped plan + per-step cost — and revisit it from any device without re-pasting. Priority: must-have. Change: new
  > Socratic: Counter ACCEPTED — "re-resolving every step against Scryfall on each view is slow/costly for long paths." Resolution: FR stands, but the re-resolve strategy is an open design question — resolved by the Phase-5 persistence decision (per-step snapshot of resolved card data; see Business Logic Changes) plus Open Question 1 (refresh UX).
- FR-006: A user can manage paths and steps for the MVP: **create/rename/delete a path, append a step, and delete the last step**. Editing a *mid-path* step's list (which re-bases all downstream steps) is **deferred**. Priority: must-have (append + delete-last + path rename/delete); mid-path edit: deferred. Change: new
  > Socratic: Counter ACCEPTED — "editing a mid-path step cascades a recompute through every downstream diff — real complexity." Resolution: scoped down to append-only + delete-last for MVP; mid-path step editing (with its cascade) deferred to a later slice.
- FR-007: A user sees a cumulative, **approximate** cost roll-up across the whole path (base → final checkpoint). Priority: nice-to-have. Change: new
  > Socratic: Counter considered — "summing per-step add costs double-counts when a later step removes a card an earlier step added; the total may mislead." Resolution: kept as nice-to-have, framed as an approximate additive eye-measure (consistent with DeckDelta's existing approximate-pricing stance), not a purchase quote.

### Preserved
- FR-008: Logged-out users can use the full paste→plan tool **for a quick check-up without an account**, with identical engine output. Priority: must-have. Change: preserved
  > Socratic: Counter ACCEPTED (revised) — "maintaining both localStorage and server persistence doubles maintenance." Resolution: the *core tool* stays anonymous-usable (a locked guardrail — gating it behind login would kill DeckDelta's frictionless value), but on-device **history is dropped** (see FR-009). Logged-out use becomes **stateless**.

### Removed
- FR-009: The on-device localStorage comparison **history is retired** — saving and history become **account-only** (server-side). Priority: must-have. Change: removed
  > Socratic / rationale: the user explicitly resigned from anonymous local history. Logged-out = stateless quick check-up; all persistence (single comparisons and multi-step paths) lives in the account. This removes the double-persistence-path maintenance burden. Migration note: existing users' localStorage history is dropped (a one-time import-on-first-login is a possible nice-to-have, parked — see Open Questions).

## Constraints & Compatibility

- **Backward compatibility:** the anonymous paste→plan tool and its engine output are unchanged; existing tool routes keep working. No external/public API consumers exist to break.
- **Data migration:** this introduces the project's **first DB schema** (no migrations exist today) — a `supabase/migrations/*.sql` convention must be established (set `schema_paths`, add a migration npm script). Existing users' on-device localStorage history is **dropped** (FR-009); no server-side data exists to migrate. A one-time import-on-first-login is parked (see Open Questions).
- **Existing integrations:** Scryfall stays a **client-side** call (resolution unchanged); Supabase **auth scaffold is reused as-is** (email/password, SSR cookie sessions). The data Supabase client reachable from the deck flow is **new** (today only a server SSR auth client exists; `App.Locals` exposes only `user`).
- **Preserved behavior (must not change):** the diff/resolve/cost engine output; the logged-out quick-check-up flow.
- **Security boundary:** per-user isolation is enforced by **Postgres Row-Level Security**, not app code. A single Supabase key is used, so RLS is mandatory — paths/steps are readable/writable only by their owner (with the deferred `unlisted` read path designed to slot in later).

## Non-Functional Requirements

_(Supplementary shape block — `/10x-prd` may fold these into Success Criteria guardrails / Constraints for the brownfield template.)_

- A user's private path is never readable or editable by anyone other than its owner (binary; enforced at the data layer).
- A saved path is retrievable on any device once the user signs in — cross-device durability is the core value over the retired single-device on-device history.
- The logged-out paste→plan tool stays fully usable without an account and produces output identical to today.
- Opening a saved path shows continuous visible progress and renders a typical path (a handful of steps) without a jarring wait — the per-step snapshot means a view need not re-resolve every step against the card-data source.
- Stored prices and images are explicitly approximate and may be stale until refreshed; the product never presents them as live quotes.
- User credentials are handled by the auth provider and never exposed; only the user's own deck content (list text + resolved snapshots) is stored server-side.
- The product remains usable on the latest versions of the mainstream desktop browsers (carried from the original baseline).

## Business Logic Changes

**Current rule:** DeckDelta computes the grouped, quantity-aware set-difference between a base and a target deck list — cards to add / remove / shared, grouped by card type — with approximate Scryfall prices.

**Change (adds a rule):** An upgrade path is an **ordered chain of named deck lists (checkpoints)** where each checkpoint's upgrade plan is the existing base→target diff computed **against the previous checkpoint's list**, and the whole chain is a **persisted, user-owned object**.

Supporting detail:
- **Inputs (user-facing):** a base deck list (step 0 / Precon) and successive named checkpoint lists. Each checkpoint's list is the *target* for the diff against the previous step and the *base* for the next (strictly linear for MVP — FR-004).
- **Output:** a per-step grouped upgrade plan + per-step cost, plus a **cumulative cost = the sum of per-step add costs** (approximate; by design this double-counts churn — a card added in one step and cut in a later step still counts — and is framed as "what you'd spend stage by stage", not a net quote — FR-007).
- **Persistence rule:** each step stores its **list text AND a resolved-card snapshot** (name / type / category / image / price-at-save) captured at save time. Views render from the snapshot (fast, no full re-resolve; gives cost-at-save-time), with prices/images refreshable on demand. Card **resolution stays client-side** (engine unchanged); the client sends the resolved snapshot to the server to persist.
- **Ownership:** a path is owned (`owner_id`) and carries a `visibility` flag (`private` | `unlisted`) reserved from day one — only `private` is exercised in the A+C MVP; `unlisted` + fork-to-account is the deferred D slice.

## Access Control Changes

**Current model:** No auth in active use. Supabase email/password auth is scaffolded (SSR cookie sessions, signin/signup/signout routes, a protected `/dashboard` placeholder) but the product never references it; the app is effectively single-user and anonymous.

**What changes:**
- **Accounts are activated** using the existing **email + password** flow (reuse the scaffolded Supabase forms/routes; no OAuth or magic-link integration for MVP).
- **Flat ownership model** — each authenticated user owns their own decks/paths. No admin/member/guest tiers.
- **Shared-read for forking (reserved, not built in MVP)** — a path has a visibility setting: **private by default**, or **unlisted-link** (anyone holding the link can *view* the path and *fork* it into their own account). Only `private` is exercised now; the `unlisted` read/fork path is the deferred D slice. No public gallery, browse, or discovery surface ever in this scope.
- **Email confirmation off for MVP** — sign-up signs the user in immediately (matches the current local `enable_confirmations = false`); no `/auth/callback` token-exchange route or transactional-email sender is introduced yet.

**What's preserved:**
- **Anonymous access stays (stateless).** Logged-out users keep the full paste→plan experience for quick check-ups — no login required. Accounts are *additive* — they unlock saving/checkpoints (and later sharing). NOTE (Phase 4.5): on-device localStorage history is being **retired** (FR-009); logged-out use is now stateless, and all persistence is account-only.
- An unauthenticated user hitting a gated route (e.g. "my paths", or a private path they don't own) is redirected to sign-in, mirroring the existing `/dashboard` guard.

> Socratic (smallest useful access change): activating the already-built email/password auth + a single per-path `visibility` flag (private | unlisted) is the minimum that enables both private saving and (later) link-sharing-with-fork, without building a public gallery, collaborator ACLs, or new auth methods.

## Non-Goals

Functional non-goals:
- **Sharing & fork-to-account (the D slice)** — deferred to a second delivery. The schema reserves `owner_id` + `visibility` so it lands additively, but no sharing/fork UI or shared-read path ships in this MVP.
- **Public gallery / discovery / browse of paths** — never in this scope; when sharing lands it is unlisted-link only, with no searchable or listed public surface.
- **OAuth / social / passwordless login, password-reset, transactional email** — email + password only for this delivery (reuse the scaffold).
- **One-time localStorage → account history import** — not in the MVP; logged-out on-device history is simply dropped (FR-009). Parked as a possible later nice-to-have.
- **Branching / non-linear path trees** — paths are a strictly linear chain (FR-004); forking a step off an earlier step is parked.
- **Mid-path step editing** — editing a non-last step's list (which re-bases all downstream steps) is deferred (FR-006); the MVP is append + delete-last + rename/delete-path.
- **URL-based deck import** (Archidekt / Moxfield / EDHRec links) — carried from the original; text-paste only.
- **Real-time / collaborative simultaneous editing** of a path — out.

Non-functional non-goals:
- **Email confirmation required to use an account** — off for MVP; revisit before any public launch.
- **Mobile-optimized responsive design** — carried from the original; desktop-first, a functional-but-unoptimized mobile experience is acceptable.
- **Multi-region / high-availability SLA** — small-scale, single-region is fine.

## Open Questions

1. **Snapshot refresh UX** — how does a user refresh stale snapshot prices/images on a saved path (a manual "refresh prices" action is assumed)? — Owner: user / `/10x-plan`. Block: no.
2. **First migration-tooling convention** — establish `supabase/migrations/*.sql` + `schema_paths` + a migration npm script as part of this change (none exists today). — Owner: `/10x-plan`. Block: no.
3. **Branching (non-linear) paths** — parked; revisit post-MVP if brewers need alternative branches off an earlier step. — Owner: user. Block: no.
4. **localStorage → account history import** — parked nice-to-have; decide if/when to offer a one-time import. — Owner: user. Block: no.
5. **Email confirmation in production** — currently off; enabling it needs a real `/auth/callback` token-exchange route + a configured email sender before public launch. — Owner: user. Block: no.
6. **Deferred D-slice (sharing/forking) data model** — when D is planned, confirm unlisted-link visibility + fork-as-deep-copy (full path + steps) + author attribution (a `profiles` handle); `owner_id` + `visibility` are reserved now so D is additive. — Owner: user / `/10x-plan`. Block: no (does not gate the A+C MVP).
