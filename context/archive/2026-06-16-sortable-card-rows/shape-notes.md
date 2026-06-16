---
change_id: sortable-card-rows
roadmap_ref: S-06
context_type: brownfield
prd_refs:
  - "US-01 (the upgrade-plan view)"
  - "FR-004 (grouped-by-type display) — preserved as the default"
  - "FR-008 (plan display)"
  - "display enhancement beyond the MVP FRs"
status: shaped
scope: slice-level shaping note (not a full PRD — S-06 is already captured in prd.md + roadmap.md)
created: 2026-06-16
updated: 2026-06-16
---

# Shaping note: S-06 — Sortable card rows

> Lightweight, slice-scoped shaping. This resolves the single open question the
> roadmap flagged for S-06 ("sort *within* each type bucket vs. flatten the
> grouping into one sorted list") so the slice can move to `/10x-new` →
> `/10x-plan`. It does **not** re-shape the product or touch the project-level
> `context/foundation/shape-notes.md`.

## Outcome (from roadmap)

The user can sort the cards in the upgrade plan by name, type, or price, rather
than being locked to the fixed category-bucket-then-name order.

## The tension this note resolves

Grounded in the current render/data layer:

- The plan is **already grouped by card type** in a fixed `CATEGORY_ORDER`
  (land → creature → … → other) and, **within each bucket, already sorted by
  name A→Z** — `groupByCategory` in `src/lib/deck/diff.ts:70-90`
  (`bucket.sort((a, b) => a.card.name.localeCompare(b.card.name))`).
- So "sort by name" is largely the status quo. The genuinely **new** keys are
  **price** and **type** — and **"by type" only has meaning if the grouping is
  flattened** (inside a single bucket every card is already the same type).
- `price` is most useful as a **flat** "what's the priciest card to acquire"
  ranking (the persona's "prioritize purchases" job), but flattening discards
  the grouping that is DeckDelta's core bet (FR-004 / grouping-by-function).

The decision below keeps the grouped view as the default (FR-004 intact) and
adds the flat sorted list as an **opt-in** mode.

## Settled decisions

### D1 — Sort model: **opt-in flat-list toggle (grouped stays the default)** ✅

- The plan **opens grouped by type** exactly as today — FR-004's
  grouping-by-function is preserved and remains the default view.
- A control lets the user switch to a **flat sorted list**: the per-type
  sections dissolve into one list (per partition) ordered by the chosen key.
- Rationale: the rejected "sort only within buckets" option can't honor a
  real price ranking across the whole Add list (the persona's actual job), and
  the rejected "reorder the type sections" option gives no card-level price
  order. The flat toggle gives both, while keeping the core hypothesis as the
  default so the product's bet is never hidden.

### D2 — Sort keys offered: **name, price, type** ✅

- **Name** — A→Z and Z→A (`localeCompare` on `card.name`, matching today's
  within-bucket comparator).
- **Price** — high→low and low→high, on `card.priceUsd` (the S-03 field already
  shown by `CardRow`).
- **Type** — orders a **flat** list by `CATEGORY_ORDER` (a single list still
  clustered by type, without per-section headings). Meaningful only in flat
  mode — see the implementation note on its near-overlap with the grouped view.

### D3 — Persistence: **remember the last sort across sessions** ✅

- The chosen view+key+direction is **persisted to local storage** and restored
  on next load (same on-device, no-server posture as the history feature).
- This is a **global view preference**, distinct from a saved comparison — it is
  NOT written into history entries (history persists deck texts only).

### D4 — Scope: **one global control for Remove, Add, and Shared** ✅

- A single sort selector applies the same ordering to all visible partitions —
  the Remove column, the Add column, and the Shared-cards disclosure.
- No per-column independent sorting. Matches the project's `low-complexity`
  goal and keeps one source of truth for the current order.

## The control, concretely

A single global selector with these states (default first):

| State                | Layout            | Order                                  |
| -------------------- | ----------------- | -------------------------------------- |
| **Grouped by type**  | type sections     | `CATEGORY_ORDER`, name A→Z within (today's view, default) |
| Flat · Name A→Z      | one flat list     | name ascending                         |
| Flat · Name Z→A      | one flat list     | name descending                        |
| Flat · Price high→low| one flat list     | `priceUsd` descending (nulls last)     |
| Flat · Price low→high| one flat list     | `priceUsd` ascending (nulls last)      |
| Flat · Type          | one flat list     | `CATEGORY_ORDER`, then name A→Z        |

## Settled defaults (no further input needed)

- **Default view:** "Grouped by type" — identical to today's render. The flat
  modes are purely additive; nothing about the default changes.
- **Missing prices:** cards with `priceUsd: null` sort to the **end** in both
  price directions, so a missing price never masquerades as cheapest/priciest.
- **Price basis:** sort uses the **unit `priceUsd`** that `CardRow` already
  displays (`formatUsd(card.priceUsd)`), so the order matches the visible
  number. (Extended cost = qty × price is a possible later refinement — see
  implementation notes; not chosen here.)
- **Tie-break:** equal sort key falls back to **name A→Z** so ordering is
  deterministic (stable, no jitter on rebuild).
- **Quantity prefix:** name sort keys on `card.name`, not the displayed
  `"2× Sol Ring"` label — the quantity prefix does not affect order.
- **Display-only:** sorting **never** changes the cost total (`CostSummary`) or
  any per-card value — it only reorders rows.
- **Empty/identical plans:** when there is nothing to add or remove, the control
  is hidden or inert (no rows to order).

## Preserved behavior (brownfield guardrail)

What must NOT regress:

- **Grouped-by-type view (FR-004)** stays available and remains the default —
  flat mode is opt-in only.
- **Cost total** (`CostSummary`, `src/lib/deck/cost.ts`) is unaffected by sort.
- **`CardRow` rendering** (thumbnail, hover preview, quantity label, price) is
  unchanged — only the order and the presence/absence of section headings differ.
- **History save/restore** is untouched — sort is a separate global view
  preference, not part of a saved comparison.

## Known implementation considerations → for `/10x-plan`

- **Render-layer only; keep `diff.ts` pure.** The roadmap calls this a UI-only
  enricher with no data-layer change. `generateUpgradePlan` / `diffDecks` keep
  returning the grouped `UpgradePlan`; flat mode is produced in the render layer
  by flattening `groups.flatMap((g) => g.cards)` and re-sorting. Do **not** move
  sorting into `diff.ts`.
- **"Flat · Type" overlaps the grouped view.** A flat list ordered by
  `CATEGORY_ORDER` is the grouped order minus the section headings/subtotals.
  Decide during planning whether it is worth a distinct option or whether
  "type" simply *is* the grouped view (i.e. the grouped default already covers
  the user's "by type" intent). Low-stakes; either reading honors D1/D2.
- **Persistence:** use a small **dedicated** storage key for the sort preference
  (mirror the pattern in `src/lib/history/storage.ts`), NOT the history store.
  This is an Astro island, so guard hydration: render the default (grouped) on
  first paint and apply the stored preference on mount to avoid a
  server/client mismatch.
- **Stable comparators:** centralize the comparators + the flatten in one small,
  unit-tested helper (the project co-locates `*.test.ts`).

## Touchpoints (orientation, not a plan)

- `src/components/deck/DeckComparer.tsx` — owns the new sort/view state (like the
  existing `sharedOpen`), renders the single global control, threads the choice
  into the columns, and persists/restores the preference.
- `src/components/deck/CardGroupColumn.tsx` and
  `src/components/deck/SharedCardsDisclosure.tsx` — take a sort/view prop and
  render either the grouped sections (today) or the flat sorted list.
- `src/lib/deck/diff.ts` — **unchanged** (stays pure; still emits grouped
  `UpgradePlan`). `src/components/deck/CardRow.tsx` — unchanged.
- New small helper (e.g. `src/components/deck/sort.ts`) for the comparators +
  flatten, with co-located tests.

## Non-goals for this slice

- No change to the data layer (`diff.ts` / `generateUpgradePlan`) — display-only.
- No change to the cost total or `CostSummary` math.
- No per-column independent sorting (global control only — D4).
- No EUR / alternative-vendor price sorting — that's S-07; `Card.priceEur`
  stays reserved/unused here.
- No drag-to-reorder or custom manual ordering.
- Sort preference is not stored inside saved comparisons (history keeps texts
  only; sort is a separate global view preference).

## Handoff

Ready for `/10x-new sortable-card-rows` → `/10x-plan`. The roadmap's
grouping-vs-sorting open question is resolved (D1: opt-in flat toggle, grouped
default preserved).
