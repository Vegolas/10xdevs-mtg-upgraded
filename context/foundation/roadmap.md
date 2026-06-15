---
project: DeckDelta
version: 1
status: draft
created: 2026-06-09
updated: 2026-06-16
prd_version: 1
main_goal: low-complexity
top_blocker: external
---

# Roadmap: DeckDelta

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

DeckDelta turns the tedious side-by-side comparison of two Commander/EDH deck lists into an actionable upgrade plan. Instead of a flat "add X, remove Y" diff, it groups the swaps by card function — lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers — and attaches card images, approximate prices, and a total upgrade cost, so a player can see the strategic shape of the upgrade and prioritize purchases. The core bet is that grouping-by-function plus pricing, not a raw diff, is the right abstraction for planning a deck upgrade. All user data stays on-device; the only external touchpoint is card-data lookups by name.

## North star

**S-01: User can paste two deck lists and see the swaps grouped by card type** — this is the smallest end-to-end flow that proves DeckDelta's core bet (grouping by card function beats a raw diff), so it ships first; under the `low-complexity` goal it deliberately excludes images and prices, which arrive as thin follow-on slices.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID    | Change ID               | Outcome (user can …)                                          | Prerequisites | PRD refs                          | Status   |
| ----- | ----------------------- | ------------------------------------------------------------- | ------------- | --------------------------------- | -------- |
| F-01  | card-data-resolution    | (foundation) card-data source selected; name→type resolution lands | —             | Guardrails (accuracy), NFR (lookups) | ready    |
| S-01  | grouped-upgrade-plan    | paste base+target and see add/remove/shared grouped by card type | F-01          | US-01, FR-001, FR-002, FR-003, FR-004, FR-008 | done     |
| S-02  | card-images-in-plan     | see a card image for each card in the upgrade plan            | S-01          | US-01, FR-005                     | done     |
| S-03  | upgrade-cost-and-prices | see per-card prices and the total upgrade cost               | S-01          | US-01, FR-006, FR-007             | done     |
| S-04  | on-device-history       | save and revisit past comparisons from on-device storage     | S-01          | FR-009                            | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                                         | Note                                                                 |
| ------ | ------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| A      | Upgrade-plan core   | `F-01` → `S-01` → `S-02` / `S-03` (parallel)  | The critical path. `S-02` and `S-03` enrich the same plan in parallel once `S-01` lands; matches the `low-complexity` goal (smallest core first). |
| B      | On-device history   | `S-04`                                        | Standalone enricher; joins Stream A at `S-01`. Lowest priority (nice-to-have). |

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
- **Status:** ready

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
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                   | Ready for `/10x-plan` | Notes |
| ---------- | ----------------------- | ------------------------------------------------------- | --------------------- | ----- |
| F-01       | card-data-resolution    | Select card-data source and build name→type resolution  | yes                   | Confirm the source meets the accuracy/price-coverage Guardrail during planning. |
| S-01       | grouped-upgrade-plan    | Paste two decks → grouped add/remove/shared by card type | no                    | Needs F-01 done first (north star). |
| S-02       | card-images-in-plan     | Show card images in the upgrade plan                    | no                    | Needs S-01. Parallel with S-03/S-04. |
| S-03       | upgrade-cost-and-prices | Show per-card prices and total upgrade cost             | yes                   | S-01 done; change folder open. Parallel with S-04. |
| S-04       | on-device-history       | Save and revisit past comparisons on-device             | no                    | Needs S-01. Lowest priority (nice-to-have). |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. One row per `F-NN` / `S-NN`.

## Open Roadmap Questions

1. **Which authoritative card-data source does DeckDelta use, and does it meet the accuracy + price-coverage Guardrails?** — Owner: user. Block: F-01 (quality), and informs S-02 (image availability) and S-03 (price coverage). This is the `external` top-blocker; the roadmap surfaces it here rather than letting it slip into implementation. It does not hard-gate planning F-01 (the source is chosen during F-01 planning), but a source with poor name-matching or no price data would change S-03's scope.

## Parked

- **URL-based deck import (Archidekt, Moxfield, EDHRec links)** — Why parked: PRD §Non-Goals — each platform's API is a separate integration that doesn't prove the core upgrade-planning value. Text-paste only for MVP.
- **Multi-user features (sharing, public links, collaboration)** — Why parked: PRD §Non-Goals — DeckDelta is a single-user local tool.
- **Mobile-optimized responsive design** — Why parked: PRD §Non-Goals — desktop-first; a functional but unoptimized mobile experience is acceptable for MVP.

## Done

(Empty on first generation. `/10x-archive` appends here — and flips the matching item's `Status` to `done` — when a change whose `Change ID` matches an item is archived. Do NOT pre-populate.)

- **S-01: user can paste a base list and a target list and automatically see cards to add, cards to remove, and shared cards — each grouped by card type (lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers).** — Archived 2026-06-15 → `context/archive/2026-06-15-grouped-upgrade-plan/`. Lesson: —.
- **S-02: user can see a card image for each card in the upgrade plan.** — Archived 2026-06-16 → `context/archive/2026-06-15-card-images-in-plan/`. Lesson: —.
- **S-03: user can see an approximate price for each card and the total approximate upgrade cost.** — Archived 2026-06-16 → `context/archive/2026-06-16-upgrade-cost-and-prices/`. Lesson: —.
