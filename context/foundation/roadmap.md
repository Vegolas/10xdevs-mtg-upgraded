---
project: DeckDelta
version: 1
status: draft
created: 2026-06-09
updated: 2026-06-27
prd_version: 1
main_goal: low-complexity
top_blocker: external
---

# Roadmap: DeckDelta

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.
> **Update 2026-06-27:** the original v1 MVP is delivered (F-01, S-01–S-03, S-05–S-06). **S-08 (`user-accounts`)** extends scope beyond v1 — driven by the brownfield `prd-v2.md` (accounts + server-persisted checkpointed paths) — and **retires S-04** (on-device history). S-07 is parked.

## Vision recap

DeckDelta turns the tedious side-by-side comparison of two Commander/EDH deck lists into an actionable upgrade plan. Instead of a flat "add X, remove Y" diff, it groups the swaps by card function — lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers — and attaches card images, approximate prices, and a total upgrade cost, so a player can see the strategic shape of the upgrade and prioritize purchases. The core bet is that grouping-by-function plus pricing, not a raw diff, is the right abstraction for planning a deck upgrade. Originally an on-device single-user tool; as of **S-08** the app adds optional accounts with server-persisted, checkpointed upgrade paths, while the anonymous `/` comparer stays stateless (nothing stored). Card-data lookups by name remain the core external touchpoint.

## North star

**S-01: User can paste two deck lists and see the swaps grouped by card type** — this is the smallest end-to-end flow that proves DeckDelta's core bet (grouping by card function beats a raw diff), so it ships first; under the `low-complexity` goal it deliberately excludes images and prices, which arrive as thin follow-on slices.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID   | Change ID               | Outcome (user can …)                                                              | Prerequisites         | PRD refs                                      | Status |
| ---- | ----------------------- | --------------------------------------------------------------------------------- | --------------------- | --------------------------------------------- | ------ |
| F-01 | card-data-resolution    | (foundation) card-data source selected; name→type resolution lands                | —                     | Guardrails (accuracy), NFR (lookups)          | done   |
| S-01 | grouped-upgrade-plan    | paste base+target and see add/remove/shared grouped by card type                  | F-01                  | US-01, FR-001, FR-002, FR-003, FR-004, FR-008 | done   |
| S-02 | card-images-in-plan     | see a card image for each card in the upgrade plan                                | S-01                  | US-01, FR-005                                 | done   |
| S-03 | upgrade-cost-and-prices | see per-card prices and the total upgrade cost                                    | S-01                  | US-01, FR-006, FR-007                         | done   |
| S-04 | on-device-history       | ~~save and revisit past comparisons from on-device storage~~ (retired by S-08)     | S-01                  | FR-009                                        | retired |
| S-05 | did-you-mean-accept     | accept a "did you mean …?" suggestion in one click to fix an unresolved card name | S-01                  | Guardrails (input handling), US-01            | done   |
| S-06 | sortable-card-rows      | sort the cards in the plan by name, type, or price                                | S-01 (S-03 for price) | US-01, FR-004, FR-008                         | done   |
| S-07 | alt-cost-vendors        | see per-card prices and the total in EUR / from an alternative vendor             | S-03                  | US-01, FR-006, FR-007                         | parked |
| S-08 | user-accounts           | sign in and build server-persisted, checkpointed upgrade paths (cross-device)     | S-01, Supabase Auth   | brownfield prd-v2; supersedes FR-009          | done   |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                                        | Note                                                                                                                                                                                                                                          |
| ------ | ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Upgrade-plan core  | `F-01` → `S-01` → `S-02` / `S-03` (parallel) | The critical path. `S-02` and `S-03` enrich the same plan in parallel once `S-01` lands; matches the `low-complexity` goal (smallest core first).                                                                                             |
| B      | On-device history  | `S-04`                                       | **Retired 2026-06-27** — superseded by Stream D (`S-08`). On-device history removed; `/` is now stateless.                                                                                                                                     |
| C      | Post-MVP enrichers | `S-05` / `S-06` / `S-07` (parallel)          | Optional polish on top of the now-complete MVP. Each builds on a done slice (`S-05`→`S-01`, `S-06`→`S-01`/`S-03`, `S-07`→`S-03`) and is independent of the others, so pick in any order. `S-05`/`S-06` done; `S-07` parked.                     |
| D      | Accounts & paths   | `S-08`                                        | Brownfield expansion (`prd-v2.md`): email/password auth wired to the product + server-persisted checkpointed upgrade paths. Retires Stream B. Follow-on QOL parked in memory `path-builder-qol`.                                               |

## Baseline

What's already in place in the codebase as of `2026-06-09` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19 + Tailwind 4, file-based routing, `src/components/ui` (`button.tsx`, `Layout.astro`). `package.json`, `astro.config.mjs`.
- **Backend / API:** present — `output: "server"` + Cloudflare adapter; existing API routes are auth-only today (`src/pages/api/auth/*`, `src/middleware.ts`). DeckDelta's diff logic stays client-side per the privacy NFR.
- **Data:** partial — Supabase client + `supabase/config.toml` present, but no schema/migrations/seed, and no client-side storage (localStorage/IndexedDB) wired yet.
- **Auth:** present — Supabase Auth fully wired (SSR session, protected `/dashboard`). Unused by DeckDelta (PRD: single-user, no auth, on-device only); noted as present so no Foundation re-builds it.
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), GitHub Actions CI (`.github/workflows/ci.yml`), `npm run deploy` → `astro build && wrangler deploy`.
- **Observability:** partial — `wrangler.jsonc` observability flag enabled; no logging/error-tracking library. No PRD NFR forces more for MVP.

## Foundations

### F-01: Card-data resolution contract

- **Outcome:** (foundation) a card-data source is selected and a name→card-identity resolution path exists — returning the canonical card name and type line, and handling unrecognized names with a clear error rather than silent omission. The same lookup exposes the image and price fields that later slices surface.
- **Change ID:** card-data-resolution
- **PRD refs:** Success Criteria §Guardrails (card-data accuracy; graceful input handling), NFR (card-data API lookups by name), enables FR-004
- **Unlocks:** S-01 (north star — grouping by type needs type resolution); reduces the roadmap's #1 unknown (which external card-data source meets the accuracy Guardrail); establishes the verification path for the "misidentified cards" Guardrail.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Which authoritative card-data source meets the accuracy Guardrail (name-matching quality across MTGO/Arena/Moxfield paste variants)? — Owner: user. Block: no (selected during this foundation's planning).
- **Risk:** This is the `external` top-blocker made concrete. Sequenced first because every display slice consumes it and the accuracy Guardrail is existential — a wrong card identity makes the tool untrustworthy. Kept minimal (resolution + error handling only) so it doesn't drift into building the whole card-data layer ahead of user-facing work; confirming the source is the first action.
- **Status:** done — delivered with S-01 (no separate change/archive); the `src/lib/card-data` resolution module is in the codebase and every display slice consumes it.

## Slices

### S-01: Grouped upgrade plan (types only)

- **Outcome:** user can paste a base list and a target list and automatically see cards to add, cards to remove, and shared cards — each grouped by card type (lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers).
- **Change ID:** grouped-upgrade-plan
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-004, FR-008
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - How robust must paste-parsing be across format variants (MTGO/Arena/Moxfield) for MVP? — Owner: user. Block: no.
- **Risk:** The north star and the largest single slice, but justified — the PRD has one core workflow and grouping-by-function IS the hypothesis, so it can't be split below "paste → group" without losing the user-visible proof. Shared cards render collapsed/expandable (FR-008 UX note) so they don't bury the diff.
- **Status:** done

### S-02: Card images in the plan

- **Outcome:** user can see a card image for each card in the upgrade plan.
- **Change ID:** card-images-in-plan
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Image-heavy rendering (100+ cards) performance approach — load strategy for MVP? — Owner: team. Block: no.
- **Risk:** Thin enrichment over S-01's grouped plan, surfacing the image field already exposed by F-01's lookup. Low risk; the only watch-item is the Cloudflare image-service footgun flagged in `tech-stack.md` (set `imageService` explicitly), which is an implementation concern for `/10x-plan`.
- **Status:** done

### S-03: Prices and total upgrade cost

- **Outcome:** user can see an approximate price for each card and the total approximate upgrade cost.
- **Change ID:** upgrade-cost-and-prices
- **PRD refs:** US-01, FR-006, FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:**
  - Does the selected card-data source expose per-card prices with adequate coverage (the PRD frames prices as approximate/indicative, EU vs US differ)? — Owner: user. Block: no.
- **Risk:** Thin enrichment over S-01 surfacing the price field from F-01's lookup, plus a summed total. Pricing is explicitly approximate per the PRD, so coverage gaps degrade gracefully rather than blocking. Parallel with S-02 — separate fields, no shared state.
- **Status:** done

### S-04: On-device comparison history

- **Outcome:** user can save a comparison and revisit a past upgrade plan without re-pasting the lists.
- **Change ID:** on-device-history
- **PRD refs:** FR-009
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nice-to-have (FR-009) and the Secondary success criterion; sequenced last under the `low-complexity` goal. On-device storage only — the PRD accepts that clearing browser data loses history (no false durability promise). Independent of images/prices, so it can be picked up whenever capacity allows after S-01.
- **Status:** retired — shipped & archived 2026-06-16, then **superseded 2026-06-27 by S-08** (account-backed paths). The on-device history module was removed and `/` is now stateless. localStorage history was **dropped, not migrated** (FR-009 retired). See `context/archive/2026-06-26-user-accounts/`.

### S-05: "Did you mean …?" inline accept

- **Outcome:** when a pasted card name doesn't resolve but the card-data source returns a near-match `suggestion`, the user can accept it in one click to substitute the corrected name in place and re-generate the plan — instead of only seeing the hint and retyping by hand.
- **Change ID:** did-you-mean-accept
- **PRD refs:** Success Criteria §Guardrails (graceful input handling), US-01 AC (unrecognized names show a clear error, not silent omission), builds on FR-001/FR-002
- **Prerequisites:** S-01
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - ~~Should accepting a suggestion edit the source paste text in place, or apply a substitution overlay that leaves the original textarea untouched?~~ **Resolved 2026-06-16 (via `/10x-shape`): edit the source paste text in place** — rides the existing auto-rebuild and leaves history save/restore untouched; the overlay path's second source of truth isn't worth it for a thin enricher. Accept scope: per-card + "accept all". See `context/changes/did-you-mean-accept/shape-notes.md`. — Owner: user. Block: no.
- **Risk:** Thin trust enricher over the existing unresolved-notice. The `UnresolvedCard.suggestion` field already exists (F-01), so the new work is the accept action plus re-running `generateUpgradePlan` with the substituted name without discarding the rest of the input. Improves the existential card-data-accuracy Guardrail, so sequenced first among the enrichers despite being a nice-to-have.
- **Status:** done

### S-06: Sortable card rows

- **Outcome:** user can sort the cards within the upgrade plan by name, type, or price, rather than the fixed category-bucket-then-name order.
- **Change ID:** sortable-card-rows
- **PRD refs:** US-01, FR-004 (grouped display), FR-008 (display); display enhancement beyond the MVP FRs
- **Prerequisites:** S-01 (sort-by-price also needs S-03)
- **Parallel with:** S-05, S-07
- **Blockers:** —
- **Unknowns:**
  - ~~Does sorting reorder cards within each card-type bucket, or flatten the by-type grouping into one sorted list?~~ **Resolved 2026-06-16 (via `/10x-shape`): an opt-in flat-list toggle on top of the preserved grouped default** — the grouped-by-type view (FR-004) stays the default; a single global control flattens Remove/Add/Shared into one list sorted by name (A→Z/Z→A), price (high→low/low→high), or type. Sort is display-only (cost total untouched) and the chosen sort persists across sessions. See `context/changes/sortable-card-rows/shape-notes.md`. — Owner: user. Block: no.
- **Risk:** UI-only enricher over S-01's render layer (`CardGroup` / `CardRow`), no data-layer change; sort-by-price just reads the prices S-03 already attaches. Low risk; the only real decision is the grouping-vs-sorting interaction above, which `/10x-shape` should settle before `/10x-plan`.
- **Status:** done

### S-07: Alternative cost vendors / EUR pricing

- **Outcome:** user can see per-card prices and the total in EUR (or from an alternative vendor such as Cardmarket), instead of / alongside the current approximate Scryfall USD.
- **Change ID:** alt-cost-vendors
- **PRD refs:** US-01, FR-006, FR-007 (FR-007 explicitly flags EU vs US price divergence as its rationale)
- **Prerequisites:** S-03 (pricing, total, `CostSummary`); also F-01 (resolution exposes the price fields)
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Does the selected card-data source already expose EUR (filling the deliberately-unused `Card.priceEur`), or does an alternative-vendor price require a second external integration? — Owner: user. Block: no (decided during shaping; see Open Roadmap Question 2).
- **Risk:** Largest of the three enrichers — it adds a price dimension (currency/vendor) and a display toggle threaded through `planAddCost` / `formatUsd` / `CostSummary`. `Card.priceEur` already exists on the type but is unused, so the field is reserved; EUR-from-the-existing-source is the smaller first step, while a true second vendor (Cardmarket/Allegro) is a new external integration the PRD §Non-Goals spirit keeps minimal. Sequenced last.
- **Status:** parked — deprioritized 2026-06-27 (user call): an "endgame" polish feature, not needed for now. Revisit after higher-value path-builder QOL work.

### S-08: User accounts & checkpointed upgrade paths

- **Outcome:** a user can create an account and sign in, then build a named **upgrade path** — an ordered chain of checkpoints, each diffing against the previous step — that is server-persisted and reopenable from any device. The anonymous `/` comparer stays stateless.
- **Change ID:** user-accounts
- **PRD refs:** brownfield `prd-v2.md` (accounts, saved checkpointed paths); supersedes FR-009 (on-device history)
- **Prerequisites:** S-01 (reuses the diff/cost engine on stored snapshots); existing Supabase Auth scaffold
- **Parallel with:** —
- **Supersedes:** S-04 — on-device history retired; `/` is now stateless.
- **Delivered:** email/password auth wired to the product (header auth state + `/paths` route gate + post-signin redirect); `upgrade_paths` / `path_steps` tables with owner-only RLS; `/api/paths/*` CRUD on the cookie-bound client; `/paths` list + `/paths/[id]` builder reusing the engine on client-produced snapshots (no card-data lookups on view).
- **Deferred (memory `path-builder-qol`):** fuzzy-fix on save, diff-style checkpoint entry, in-hand upgrade UI, deck/path cover art. Sharing / fork-to-account also deferred — a `visibility` column ships but only `private` is exercised.
- **Status:** done — Archived 2026-06-27 → `context/archive/2026-06-26-user-accounts/`.

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                    | Ready for `/10x-plan` | Notes                                                                                                                                                                       |
| ---------- | ----------------------- | -------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01       | card-data-resolution    | Select card-data source and build name→type resolution   | yes                   | Confirm the source meets the accuracy/price-coverage Guardrail during planning.                                                                                             |
| S-01       | grouped-upgrade-plan    | Paste two decks → grouped add/remove/shared by card type | no                    | Needs F-01 done first (north star).                                                                                                                                         |
| S-02       | card-images-in-plan     | Show card images in the upgrade plan                     | no                    | Needs S-01. Parallel with S-03/S-04.                                                                                                                                        |
| S-03       | upgrade-cost-and-prices | Show per-card prices and total upgrade cost              | yes                   | S-01 done; change folder open. Parallel with S-04.                                                                                                                          |
| S-04       | on-device-history       | ~~Save and revisit past comparisons on-device~~          | retired               | Retired 2026-06-27 — superseded by S-08 (account-backed paths); `/` now stateless.                                                                                          |
| S-05       | did-you-mean-accept     | One-click accept for "did you mean …?" card suggestions  | yes                   | Needs S-01 (done). Shaped 2026-06-16 (in-place edit; per-card + accept-all — see change folder). Parallel with S-06/S-07.                                                   |
| S-06       | sortable-card-rows      | Sort plan cards by name, type, or price                  | yes                   | Needs S-01 (done). Shaped 2026-06-16 (opt-in flat-list toggle; grouped default preserved; one global control; sort persisted — see change folder). Parallel with S-05/S-07. |
| S-07       | alt-cost-vendors        | Show prices/total in EUR or from an alternative vendor   | parked                | Parked 2026-06-27 (endgame feature). Confirm EUR source vs second integration when unparked.                                                                                |
| S-08       | user-accounts           | Accounts + server-persisted checkpointed upgrade paths   | done                  | Delivered & archived 2026-06-27 (brownfield prd-v2). Retires S-04. Follow-on QOL parked in memory `path-builder-qol`.                                                        |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. One row per `F-NN` / `S-NN`.

## Open Roadmap Questions

1. **Which authoritative card-data source does DeckDelta use, and does it meet the accuracy + price-coverage Guardrails?** — Owner: user. Block: F-01 (quality), and informs S-02 (image availability) and S-03 (price coverage). This is the `external` top-blocker; the roadmap surfaces it here rather than letting it slip into implementation. It does not hard-gate planning F-01 (the source is chosen during F-01 planning), but a source with poor name-matching or no price data would change S-03's scope.

2. **For S-07, does the card-data source expose EUR pricing directly, or is an alternative-vendor price (Cardmarket, Allegro) a separate integration?** — Owner: user. Block: scopes S-07 (`alt-cost-vendors`) only. FR-007 already frames pricing as approximate and EU/US-divergent, and `Card.priceEur` is reserved on the `Card` type but currently unused. EUR-from-the-existing-source is the low-cost path; a second vendor is a new external integration the PRD §Non-Goals spirit discourages for now. Decided during S-07 shaping; does not gate the other enrichers.

## Parked

- **URL-based deck import (Archidekt, Moxfield, EDHRec links)** — Why parked: PRD §Non-Goals — each platform's API is a separate integration that doesn't prove the core upgrade-planning value. Text-paste only for MVP.
- **Multi-user features (sharing, public links, collaboration)** — Why parked: PRD §Non-Goals — DeckDelta is a single-user local tool.
- **Mobile-optimized responsive design** — Why parked: PRD §Non-Goals — desktop-first; a functional but unoptimized mobile experience is acceptable for MVP.
- **S-07: alt-cost-vendors (EUR / alternative-vendor pricing)** — Why parked: deprioritized 2026-06-27 (user call) as an "endgame" polish feature — not needed now. Still fully shaped (see slice S-07 + Open Roadmap Question 2); unpark when EUR/alt-vendor pricing becomes worthwhile, after higher-value path-builder QOL.

## Done

(Empty on first generation. `/10x-archive` appends here — and flips the matching item's `Status` to `done` — when a change whose `Change ID` matches an item is archived. Do NOT pre-populate.)

- **S-01: user can paste a base list and a target list and automatically see cards to add, cards to remove, and shared cards — each grouped by card type (lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers).** — Archived 2026-06-15 → `context/archive/2026-06-15-grouped-upgrade-plan/`. Lesson: —.
- **S-02: user can see a card image for each card in the upgrade plan.** — Archived 2026-06-16 → `context/archive/2026-06-15-card-images-in-plan/`. Lesson: —.
- **S-03: user can see an approximate price for each card and the total approximate upgrade cost.** — Archived 2026-06-16 → `context/archive/2026-06-16-upgrade-cost-and-prices/`. Lesson: —.
- **S-04: user can save a comparison and revisit a past upgrade plan without re-pasting the lists.** — Archived 2026-06-16 → `context/archive/2026-06-16-on-device-history/`. **Retired 2026-06-27** — superseded by S-08 (account-backed paths); on-device history removed, `/` now stateless. Lesson: —.
- **S-05: when a pasted card name doesn't resolve but the card-data source returns a near-match `suggestion`, the user can accept it in one click to substitute the corrected name in place and re-generate the plan — instead of only seeing the hint and retyping by hand.** — Archived 2026-06-16 → `context/archive/2026-06-16-did-you-mean-accept/`. Lesson: —.
- **S-06: user can sort the cards within the upgrade plan by name, type, or price, rather than the fixed category-bucket-then-name order.** — Archived 2026-06-16 → `context/archive/2026-06-16-sortable-card-rows/`. Lesson: —.
- **S-08: a signed-in user can build server-persisted, checkpointed upgrade paths reopenable from any device; the anonymous `/` comparer stays stateless.** — Archived 2026-06-27 → `context/archive/2026-06-26-user-accounts/`. Lesson: migrations must be pushed to the linked DB (`npm run db:push`) before the feature works against a remote Supabase — a missing push surfaced as a 500 on path create.
