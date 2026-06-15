# Quantity-Aware Deck Diff — Plan Brief

> Full plan: `context/changes/deck-diff-quantities/plan.md`

## What & Why

The upgrade-plan diff is quantity-blind: a base deck with `8 Mountain` and a target with `6 Mountain` both collapse to a single `Mountain` entry, land in "Shared", and the `−2` delta never surfaces. This threads per-card quantity (already parsed, then discarded) through the pipeline so quantity deltas show as visible remove/add, with `×N` multipliers and copy-counting badges in the UI. Surfaced during `dfc-name-resolution` manual testing, which parked it.

## Starting Point

`parseDeckList` already yields `DeckEntry { name, quantity }`, but `plan.ts` drops quantity (`entries.map(e => e.name)`) before resolution. `Card`, the `diffDecks` `byName` set-difference, and the two group components are all quantity-free; counts use `group.cards.length` (distinct).

## Desired End State

An 8-vs-6-Mountain pair renders `Mountain ×2` under Remove and `Mountain ×6` under Shared — the same card legitimately in both partitions. Quantity is respected for every card; rows show `N×` only when > 1; per-group/column counts sum copies. Quantity survives parse → resolve → diff, including DFC front-face association and summed duplicate lines.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Full multiplicity (all cards) | Simpler than basic-only (no card classification) and correct for legit multiples | Plan |
| Where quantity lives | Deck-layer `DeckCard { card, quantity }` | Keeps `Card` pure identity (F-01 contract; cache reuse) | Plan |
| Identity key | One exported `resolutionKey` (front-face) shared by resolver + join | DFC front-only/full `//` forms must line up across the join | Plan |
| Partition semantics | `shared = min`, `remove/add = delta`; card may appear in both | Honest "6 stay, 2 go"; keeps Shared meaningful | Plan |
| Within-deck duplicates | Sum lines (4+4 = 8) | Matches reality; robust to split exports | Plan |
| Count badges | Sum quantity (copies) | Consistent with the `×N` rows | Plan |
| Row display | `N×` only when > 1 | Multiplier appears only when it carries info; singletons unchanged | Plan |
| Tests | `diff` delta cases + pure `attachQuantities` test | Covers diff math AND the association wrinkle without fetch stubs | Plan |

## Scope

**In scope:** `resolutionKey` extraction/export; `DeckCard` type; pure `attachQuantities` join; quantity-aware `diffDecks`; `plan.ts` wiring; `×N` + summed-count rendering in the two components; diff + quantity unit tests.

**Out of scope:** quantity on `Card`; total cost / price×qty (S-03 unbuilt); basic-land special-casing; component-test harness; parser changes.

## Architecture / Approach

`parse` (already yields quantity) → `plan.ts` calls pure `attachQuantities(resolved, entries)` which aggregates entries by `resolutionKey` (summing duplicate lines, merging DFC name forms) and joins each resolved `Card` to its quantity → `diffDecks(DeckCard[], DeckCard[])` computes per-name `remove/add/shared` deltas, emitting `CardGroup.cards: DeckCard[]` → the two components render `×N` and sum copies. One `resolutionKey` definition serves both the resolver's dedup and the join.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Quantity-aware data layer | `DeckCard`, `attachQuantities`, quantity-aware `diffDecks`, `plan.ts` wiring, `resolutionKey` export + unit tests | Join key must match the resolver's dedup key exactly, or DFC forms misalign |
| 2. Quantity in the UI | `×N` rows + summed-quantity badges in both components | Cosmetic; `CardGroup.cards` type change ripples to exactly these two components |

**Prerequisites:** `dfc-name-resolution` merged (front-face key is the join basis). 
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Assumes the parser's per-line quantities are reliable across paste formats (existing `parse.test.ts` covers this).
- A card appearing in both Shared and Remove/Add is intended; verify it reads clearly with the `×N` multiplier in manual testing.
- `CardGroup.cards` changes type (`Card[]` → `DeckCard[]`); only the two group components consume it today.

## Success Criteria (Summary)

- 8-vs-6-Mountain pair → `remove Mountain ×2` + `shared Mountain ×6`.
- Singleton decks look unchanged; counts reflect copies.
- Quantity survives the full pipeline incl. DFC front-face association and summed duplicate lines (unit-tested).
