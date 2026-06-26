---
project: "DeckDelta"
version: 2
status: draft
created: 2026-06-26
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 5
  hard_deadline: null
  after_hours_only: true
---

> Brownfield PRD for the `user-accounts` change. Generated from `context/foundation/shape-notes.md`
> (v2, brownfield) and grounded in `context/changes/user-accounts/research.md`.
> The original greenfield single-user PRD remains at `context/foundation/prd.md`.

## Current System Overview

- **System purpose (one sentence):** DeckDelta turns the manual side-by-side comparison of two Commander/EDH deck lists into an actionable, grouped upgrade plan — cards to add, remove, and shared, grouped by card type, with images, approximate prices, and a total cost.
- **Key architecture:** A client-heavy web app. The entire deck flow — parsing the lists, resolving each card, computing the difference, and totalling the cost — runs in the browser. Server-side rendering is enabled but performs no deck work today; the only server surface is an unused authentication scaffold.
- **Tech stack:** TypeScript, Astro (with React and Tailwind), deployed to Cloudflare Workers. Supabase email/password authentication is wired but currently unused by the product. Card identity, images, and prices come from Scryfall, fetched directly by the browser.
- **Current user base:** Anonymous Commander/EDH players. No accounts in use; effectively single-user, single-device. Small scale, low request volume.
- **Core functionality today:** Paste a base list and a target list → an automatic grouped upgrade plan; card images; approximate USD prices and a total; a "did you mean…?" correction for unresolved names; sortable rows; and an on-device history of past comparisons (stored in the browser, inputs-only, recomputed on revisit).

## Problem Statement & Motivation

- **The gap:** The current model captures only a single base→target comparison, saved on the user's device. It can't represent how players actually upgrade — as a multi-step path of named checkpoints (for example: a precon base → a "$50 upgrade" → a "bracket 3" list, each step built on the previous step's list). On-device history is also fragile (clearing the browser loses everything) and trapped on one device, and there is no way to share a plan with another player.
- **Why now:** After the first version shipped, it became clear that accounts are needed. The single-user, on-device model can't carry saved multi-step paths across devices, and it can't support sharing. This is a deliberate, acknowledged reversal of the original product's single-user, on-device-only, no-multi-user stance.
- **Current workaround and its cost:** Players track upgrade stages in spreadsheets, text files, or separate deck-building-site lists and manually re-compare each stage — losing the grouped-by-function view, the per-step cost, and any continuity between steps. The existing on-device history only helps the single-comparison case.

## User & Persona

**Primary persona — the Returning EDH Brewer.** An existing DeckDelta player who upgrades the same deck over time and wants their upgrade path saved durably and available across devices and sessions. They start from a precon or budget base, then add successive named checkpoints ("$50 upgrade", "bracket 3"), each building on the prior step, and want every step visible and revisitable without re-pasting. The checkpoint chain is primarily for their own iterative brewing.

### Secondary persona — the Sharer / Forker
A player who either publishes a polished upgrade path for others (budget guides, "precon → bracket X" content) or finds and forks someone else's shared path into their own account to follow or customize. The path is treated as a publishable, forkable artifact — like a recipe. The load-bearing insight is joint: the path abstraction and its forkability together justify the change.

## Success Criteria

### Primary
- A signed-in user can create an upgrade path from a base deck, add named checkpoint steps where each step builds on the previous step's list, and revisit the whole path from any device — every step's grouped upgrade plan and per-step cost visible — without re-pasting the lists.

### Secondary
- The path shows a cumulative cost roll-up from base to final checkpoint (the sum of per-step addition costs), so the brewer sees the whole upgrade's approximate cost, not just per-step. Nice-to-have; not sufficient on its own.

### Guardrails
- **Per-user isolation** — a user can never view or edit another user's private path. A leak here is existential for the multi-user change.
- **Anonymous core tool preserved** — a logged-out visitor can still run the full paste→plan flow for a quick check-up, with no requirement to sign in and identical plan output.
- **Engine output unchanged** — the upgrade plan produced for a given pair of lists is identical to today's; accounts add saving and checkpoints around the existing comparison, not inside it.
- _(Note: the original on-device history is being retired — see Scope of Change — so the anonymous-preservation guardrail covers the stateless tool, not local saving.)_

## User Stories

### US-01: Brewer saves and continues a multi-step upgrade path

- **Given** a signed-in user who has a base precon deck list
- **When** they create a path (e.g. "My Dimir glow-up"), add a checkpoint named "$50 upgrade" whose base is the precon list, then add "bracket 3" whose base is the "$50 upgrade" list
- **Then** each step shows its grouped upgrade plan (add / remove / shared by card type) and per-step cost, the whole path is saved to their account, and they can reopen it later from another device without re-pasting

Before (delta): this was a single on-device base→target comparison — no chain of steps, no naming, no cross-device saving.

#### Acceptance Criteria
- Steps are ordered; each step's base equals the previous step's list exactly.
- The base step (precon) has no difference, or compares against an empty list.
- Each step's plan uses the existing grouped-by-type comparison — output is identical to today's two-list comparison.
- A path is private to its owner; another signed-in user cannot view or edit it.
- Reopening on another device shows all steps without re-pasting. Prices and images may differ from when the step was saved — acceptable and consistent with today's approximate-pricing stance.

### US-02: Anonymous user is unaffected by accounts

- **Given** a visitor who is not signed in
- **When** they open the app and paste a base and a target deck list
- **Then** they get the same grouped upgrade plan as before, with no prompt or requirement to sign in (a stateless quick check-up)

Before (delta): the paste→plan tool is preserved, but on-device history is gone — saving now requires an account.

## Scope of Change

### Accounts
- `[new]` FR-001 — A visitor can register, sign in, and sign out with an email and password. Priority: must-have.
  > Socratic: Counter considered — social sign-in might fit the audience better and avoids password management. Resolution: kept email + password — that sign-in is already available at near-zero cost; other methods can be added later without reworking the model.
- `[new]` FR-002 — The app shows whether a user is signed in and gives them a way to reach their saved paths; logged-out users are pointed to sign-in / registration. Priority: must-have.
  > Socratic: Counter considered — adding navigation could clutter the single-purpose page. Resolution: kept — without a visible signed-in state and a route to saved paths, accounts are invisible and unusable; minimal navigation is the necessary cost.

### Upgrade paths & checkpoints
- `[new]` FR-003 — A signed-in user can create a named upgrade path from a base deck list (the precon / base). Priority: must-have.
  > Socratic: Counter considered — auto-create the path on the first checkpoint instead. Resolution: kept explicit creation — a named container makes the model obvious and gives the base a home before any checkpoint exists.
- `[new]` FR-004 — A user can append an ordered, named checkpoint step whose base is the previous step's list (each step's target becomes the next step's base). Priority: must-have.
  > Socratic: Counter considered — a strictly linear chain can't express branching (e.g. forking "bracket 3" off the precon, not off "$50"). Resolution: linear for the MVP; branching parked (see Open Questions / Non-Goals).
- `[new]` FR-005 — A user can view the full path — each step's grouped plan and per-step cost — and revisit it from any device without re-pasting. Priority: must-have.
  > Socratic: Counter accepted — re-resolving every step on each view is slow for long paths. Resolution: the FR stands; a saved step keeps a snapshot of its resolved cards so a view need not re-resolve everything (see Business Logic Changes), with the price-refresh detail routed to Open Questions.
- `[new]` FR-006 — A user can manage their paths and steps: create, rename, and delete a path; append a step; and delete the last step. Editing a non-last step's list (which re-bases all later steps) is deferred. Priority: must-have for create/rename/delete/append/delete-last; mid-path editing deferred.
  > Socratic: Counter accepted — editing a mid-path step cascades a recompute through every later step. Resolution: scoped to append + delete-last for the MVP; mid-path editing deferred to a later delivery.
- `[new]` FR-007 — A user sees a cumulative, approximate cost roll-up across the whole path (base → final checkpoint). Priority: nice-to-have.
  > Socratic: Counter considered — summing per-step additions double-counts churn (a card added then later cut still counts). Resolution: kept as nice-to-have, framed as an approximate, stage-by-stage eye-measure, not a purchase quote.

### Preserved
- `[preserved]` FR-008 — A logged-out visitor can use the full paste→plan tool for a quick check-up without an account, with identical plan output. Priority: must-have.
  > Socratic: Counter accepted (revised) — maintaining both on-device and account-based saving doubles upkeep. Resolution: the core tool stays usable without sign-in (a locked guardrail — gating it would kill the frictionless value), but on-device history is dropped (see FR-009); logged-out use becomes stateless.

### Removed
- `[removed]` FR-009 — The on-device history of past comparisons is retired; saving and history become account-only. Priority: must-have. Existing on-device history is not carried over (a one-time import is a possible later nice-to-have — see Open Questions).

## Constraints & Compatibility

- **Backward compatibility:** the anonymous paste→plan tool and its plan output are unchanged; the existing tool keeps working for everyone. No external API consumers exist to break.
- **Data migration:** this change introduces durable, account-based storage for the first time. Existing users' on-device history is not migrated — it is dropped (a one-time import is parked). There is no prior stored data to convert.
- **Existing integrations:** card identity, images, and prices continue to come from the same card-data source, resolved the same way they are today. The existing email/password sign-in is reused as-is.
- **Preserved behavior (must not change):** the upgrade-plan output for a given pair of lists; the logged-out quick-check-up flow.
- **Isolation:** each user's private paths are accessible only to that user — viewing and editing are restricted to the owner. The later sharing feature adds an "unlisted" read path; the model reserves room for it from the start.

## Business Logic Changes

**Current rule:** DeckDelta computes the grouped, quantity-aware difference between a base and a target deck list — cards to add, remove, and shared — grouped by card type, with approximate prices.

**Change (adds a rule):** An upgrade path is an ordered chain of named deck lists (checkpoints) where each checkpoint's upgrade plan is the existing base→target comparison computed against the previous checkpoint's list, and the whole chain is a saved, user-owned object.

Supporting detail:
- **Inputs (user-facing):** a base deck list (the precon) and successive named checkpoint lists. Each checkpoint's list is the target for the comparison against the previous step and the base for the next (strictly linear for the MVP).
- **Output:** a per-step grouped upgrade plan and per-step cost, plus a cumulative cost equal to the sum of per-step addition costs. This is approximate and, by design, double-counts churn — a card added in one step and cut in a later step still counts — and is framed as "what you'd spend stage by stage", not a net quote.
- **Saved form:** each step keeps its list text and a snapshot of its resolved cards (name, type, image, and price at the time it was saved). A saved path is shown from that snapshot, so revisiting is fast and reflects the cost at save time; prices and images can be refreshed on demand. Card resolution itself is unchanged from today.
- **Ownership:** a path belongs to one user and carries a visibility setting (private or unlisted). Only private is used in the MVP; unlisted is reserved for the later sharing feature.

## Access Control Changes

**Current model:** No authentication is in active use; the product is effectively single-user and anonymous (an email/password sign-in exists but is unused).

**What changes:**
- Accounts are activated using email + password sign-in. No social or passwordless methods in the MVP.
- Flat ownership: each signed-in user owns their own paths. No admin / member / guest roles.
- A path has a visibility setting — private by default, or unlisted (anyone with the link can view and fork it). Only private is exercised in the MVP; the unlisted view-and-fork path is the deferred sharing feature. No public, browsable, or searchable listing is ever in scope.
- Email confirmation is off for the MVP — registering signs the user in immediately.

**What's preserved:**
- Anonymous access stays: a logged-out visitor keeps the full paste→plan experience for quick check-ups, with no sign-in required. Accounts are additive — they unlock saving and checkpoints (and later sharing). On-device history is retired, so logged-out use is stateless.
- A visitor who reaches a gated area (their saved paths, or a private path they don't own) is sent to sign-in.

## Non-Goals

Functional non-goals:
- **Sharing and fork-to-account** — deferred to a later delivery. The model reserves room (ownership + visibility) so it lands additively, but no sharing or fork experience ships in this MVP.
- **Public gallery / discovery / browsing of paths** — never in scope; when sharing lands it is unlisted-link only, with no searchable or listed public surface.
- **Social or passwordless sign-in, password reset, and confirmation email** — out of this delivery; email + password only.
- **One-time import of prior on-device history into an account** — not in the MVP; existing on-device history is dropped. Parked as a possible later nice-to-have.
- **Branching / non-linear path trees** — paths are a strictly linear chain; forking a step off an earlier step is parked.
- **Mid-path step editing** — editing a non-last step (which re-bases later steps) is deferred; the MVP is append + delete-last + rename/delete-path.
- **URL-based deck import** (from deck-building sites) — carried from the original; text-paste only.
- **Real-time or collaborative simultaneous editing** of a path — out.

Non-functional non-goals:
- **Email confirmation required to use an account** — off for the MVP; revisit before any public launch.
- **Mobile-optimized responsive design** — carried from the original; desktop-first, a functional-but-unoptimized mobile experience is acceptable.
- **Multi-region / high-availability** — small scale, single region is fine.

## Open Questions

1. **Price/image refresh on a saved path** — how should a user refresh stale prices and images on a saved path (a manual refresh is assumed)? — Owner: user. Block: no.
2. **Branching (non-linear) paths** — parked; revisit after the MVP if brewers need alternative branches off an earlier step. — Owner: user. Block: no.
3. **Import of prior on-device history into an account** — parked nice-to-have; decide whether and when to offer a one-time import. — Owner: user. Block: no.
4. **Email confirmation before public launch** — currently off; decide whether to require it before opening the product publicly. — Owner: user. Block: no.
5. **Deferred sharing/forking model** — when sharing is planned, confirm unlisted-link visibility, fork-as-full-copy (the path plus all its steps), and author attribution. Ownership + visibility are reserved now so the feature stays additive. — Owner: user. Block: no (does not gate the MVP).
