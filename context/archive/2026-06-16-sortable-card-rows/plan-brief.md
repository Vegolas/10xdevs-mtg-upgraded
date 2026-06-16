# Sortable Card Rows — Plan Brief

> Full plan: `context/changes/sortable-card-rows/plan.md`
> Shape note: `context/changes/sortable-card-rows/shape-notes.md`

## What & Why

Add an opt-in **flat-sorted view** to DeckDelta's upgrade plan so a player can
rank the cards (notably by price) to prioritize purchases. Today the plan is
locked to a fixed group-by-type-then-name order; sorting lets the user re-rank
without losing the grouped view that is the product's core bet.

## Starting Point

The plan is already grouped by card type with cards name-sorted within each
bucket (`src/lib/deck/diff.ts:70-90`), rendered by `CardGroupColumn`
(Remove/Add) and `SharedCardsDisclosure` (Shared). The cost total is computed
separately from the grouped `plan.add`, and a versioned local-storage pattern
already exists for history (`src/lib/history/storage.ts`).

## Desired End State

The plan opens grouped exactly as today. A global control toggles to a flat list
sorted by **name** or **price** (asc/desc) across Remove, Add, and Shared, with
unpriced cards last. The choice persists across reloads. The cost total, card
rows, and history save/restore are unchanged.

## Key Decisions Made

| Decision                        | Choice                                              | Why (1 sentence)                                                        | Source |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Sorting vs grouping             | Opt-in flat toggle; grouped stays default           | Preserves FR-004 (the core hypothesis) while enabling a price ranking   | Shape  |
| Sort keys                       | Name + Price only ("Flat · Type" dropped)           | The grouped default already *is* the by-type order — type would duplicate it | Plan |
| Control form                    | Grouped/Flat toggle + (when flat) key + direction   | Separates layout from ordering as an explicit mental model              | Plan   |
| Persistence                     | Persist `SortMode` to `deckdelta.sort.v1`           | Sticky across sessions, mirroring the history storage pattern           | Shape  |
| Scope                           | One global control for Remove/Add/Shared            | Matches the low-complexity goal; one source of truth for order          | Shape  |
| Null prices                     | Sort to the end in both directions                  | A missing price must not masquerade as cheapest/priciest                 | Plan   |
| Where sorting lives             | Render layer only; `diff.ts` stays pure             | Display-only enricher — no domain or cost change                        | Shape  |

## Scope

**In scope:**
- A pure flatten + sort helper (name/price, asc/desc, nulls-last, name tie-break).
- A versioned, SSR-guarded sort-preference store.
- A `SortControl` and wiring into `DeckComparer`, `CardGroupColumn`, and
  `SharedCardsDisclosure`.

**Out of scope:**
- Domain-layer changes (`diff.ts` / `cost.ts` / `plan.ts`); cost-total math.
- Per-column independent sorting; a "Flat · Type" state.
- EUR / alternative-vendor price sorting (S-07); drag-to-reorder.
- Storing the sort inside saved comparisons.

## Architecture / Approach

A new presentation-tier module `src/components/deck/sort.ts` owns the `SortMode`
contract and the pure flatten+sort; `sortStorage.ts` persists it (mirroring
`history/storage.ts`). `DeckComparer` holds `sortMode` (default grouped; load via
a mount effect; save on change) and threads it into the two render components,
which branch grouped (today) vs flat-sorted. The cost total keeps reading the
grouped `plan.add`, so it is sort-invariant by construction.

## Phases at a Glance

| Phase                              | What it delivers                                   | Key risk                                              |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| 1. Sort core + persistence (pure)  | Tested flatten/sort helper + sort-preference store | Getting nulls-last / tie-break / default-degrade right |
| 2. Wire the global control into UI | Toggle + flat rendering across all three sections  | Hydration safety; not regressing the cost total       |

**Prerequisites:** S-01 (done) and S-03 (done — supplies `priceUsd`). No new deps.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Hydration: the stored preference must apply *after* mount (default grouped on
  first paint) to avoid a React mismatch — handled in Phase 2.
- No component test harness exists, so flat/grouped rendering is verified
  manually; the risky logic is pushed into unit-tested pure helpers in Phase 1.

## Success Criteria (Summary)

- Grouped view is byte-for-byte today's behavior by default; flat is opt-in.
- Flat sort by name/price (both directions) works across Remove/Add/Shared, with
  unpriced cards last, and the cost total never changes.
- The chosen sort survives a page reload; history save/restore is unaffected.
