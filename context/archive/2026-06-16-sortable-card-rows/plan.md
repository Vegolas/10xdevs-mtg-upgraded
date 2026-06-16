# Sortable Card Rows Implementation Plan

## Overview

Add an **opt-in flat-sorted view** to the upgrade plan. Today the plan is grouped
by card type with cards name-sorted within each type bucket (FR-004 — the core
"grouping-by-function" hypothesis). This change keeps that grouped view as the
**default** and adds a single global control that flattens Remove / Add / Shared
into one list sorted by **name** or **price** (ascending or descending). The
chosen sort **persists across sessions**. All sorting happens in the render layer
— the domain layer (`src/lib/deck/diff.ts`) and the cost total are untouched.

## Current State Analysis

- The plan is built in the pure domain layer: `generateUpgradePlan`
  (`src/lib/deck/plan.ts`) → `diffDecks` (`src/lib/deck/diff.ts`) returns an
  `UpgradePlan` = `{ remove, add, shared }`, each a `CardGroup[]`.
- `groupByCategory` (`src/lib/deck/diff.ts:70-90`) already buckets cards by
  `CATEGORY_ORDER` (land → … → other) **and name-sorts within each bucket**
  (`bucket.sort((a, b) => a.card.name.localeCompare(b.card.name))`). So
  "sort by name" within a group is the status quo; the genuinely new ordering is
  **price** and the **flat (heading-less) layout**.
- Three components render `CardGroup[]` identically: `CardGroupColumn`
  (`src/components/deck/CardGroupColumn.tsx`, used for Remove and Add) and
  `SharedCardsDisclosure` (`src/components/deck/SharedCardsDisclosure.tsx`). Each
  maps groups → a per-type `<h4>` header + `<ul>` of `CardRow`.
- `CardRow` (`src/components/deck/CardRow.tsx`) renders one `DeckCard`
  (`{ card, quantity }`): thumbnail, quantity-prefixed name, and
  `formatUsd(card.priceUsd)`. `Card.priceUsd` is `number | null`.
- The cost total is computed independently of the columns: `DeckComparer.tsx:226`
  renders `<CostSummary add={view.plan.add} />`, fed the grouped `plan.add`
  directly via `planAddCost` (`src/lib/deck/cost.ts`). It never reads how the
  columns are ordered, so sorting is **naturally cost-invariant**.
- `DeckComparer` (`src/components/deck/DeckComparer.tsx`) is the interactive
  client island. It already owns transient view state (`sharedOpen`, `historyOpen`)
  and a debounced auto-rebuild; history loads via an effect (`useDeckHistory`),
  never during SSR.
- Persistence precedent: `src/lib/history/storage.ts` — a versioned envelope, a
  **pure** `parseHistory` that degrades to a default on any failure, and
  SSR-guarded `loadHistory` / `saveHistory` that swallow quota errors. Pure parse
  is unit-tested without a DOM (`storage.test.ts`).
- Test convention: vitest, co-located `*.test.ts`, pure-function tests with tiny
  builders (e.g. `deckCard()` / `group()` in `labels.test.ts:6-16`). There is
  **no React component test harness** (no `@testing-library`), so component
  behavior is manual verification.
- Verification: CI runs `npm run lint` + `npx astro sync` + `npm run build`
  (`.github/workflows/ci.yml`). Tests run via `npm test` (vitest); type-check via
  `npx astro check`.

## Desired End State

The upgrade plan opens exactly as today (grouped by type, name A→Z within each
section). A new global control lets the user toggle to a **flat list** and pick
**Name** or **Price** with a direction. In flat mode, Remove, Add, and Shared
each render as one list (no per-type headers) reordered by the active key, with
unpriced cards sorted last. The chosen layout/key/direction survives a page
reload. The headline cost total, per-card rows, and history save/restore are
unchanged.

Verify: load the app with two decks → grouped view (unchanged); toggle Flat +
Price high→low → all sections become single lists ordered by descending price
with `—`-priced cards at the bottom; reload → the flat/price/desc choice is
restored; the cost total reads identically before and after toggling.

### Key Discoveries:

- Name-within-bucket sort already exists (`src/lib/deck/diff.ts:85`) — "Flat ·
  Type" was dropped because the grouped default already *is* the by-type order.
- Cost total is fed the grouped `plan.add` directly (`DeckComparer.tsx:226`), so
  it cannot be affected by column ordering — no special handling needed.
- Diff keys each partition by canonical `Card.name` via a `Map`
  (`src/lib/deck/diff.ts:104-130`), so a card name is unique **per partition** —
  `key={entry.card.name}` stays collision-free in a flattened list.
- The history storage module is the exact pattern to mirror for the sort
  preference (`src/lib/history/storage.ts`).

## What We're NOT Doing

- No change to the domain layer (`diff.ts` / `cost.ts` / `plan.ts`) — display-only.
- No change to the cost total or `CostSummary` math.
- No per-column independent sorting — one global control drives all sections.
- No "Flat · Type" sort state — the grouped default covers type ordering.
- No EUR / alternative-vendor price sorting — that is S-07; `Card.priceEur`
  stays reserved/unused here.
- No drag-to-reorder or custom manual ordering.
- The sort preference is **not** stored inside saved comparisons — history keeps
  deck texts only; sort is a separate global view preference.

## Implementation Approach

Two phases. Phase 1 builds the pure ordering logic and the persistence bridge as
standalone, unit-tested modules (no UI), so the load-bearing rules (nulls-last,
name tie-break, default-grouped, corrupt-input degradation) are locked by tests
before any wiring. Phase 2 adds a presentational `SortControl`, gives
`DeckComparer` the `sortMode` state (load on mount, save on change), and teaches
the two render components to switch between grouped and flat. Sorting stays in
the presentation tier (`src/components/deck/`), keeping `src/lib/deck` pure.

## Critical Implementation Details

- **Hydration.** `DeckComparer` is a client island that also server-renders its
  initial HTML. Initialize `sortMode` to the grouped default for SSR / first-paint
  parity, then read the stored preference in a mount-only `useEffect` and
  `setState` — mirroring how history loads. Reading `localStorage` during render
  would risk a hydration mismatch.
- **Cost invariance.** Keep passing the grouped `view.plan.add` to `CostSummary`;
  never feed it flattened/sorted data. Sorting is applied only inside the column /
  disclosure render, so the total stays correct for free.
- **Row keys.** Each partition contains a given card name at most once (diff is a
  name-keyed `Map`), so `key={entry.card.name}` remains unique in a flat list — no
  new key scheme needed.

## Phase 1: Sort core + persistence (pure, no UI)

### Overview

Add the pure flatten-and-sort helper and the versioned local-storage bridge for
the sort preference, each with co-located unit tests. No component changes.

### Changes Required:

#### 1. Sort ordering helper

**File**: `src/components/deck/sort.ts` (new)

**Intent**: Provide the display-only ordering for flat mode and the shared
`SortMode` contract Phase 2 consumes, without touching the domain layer.

**Contract**: Exports the sort-preference types, a default, and a pure flatten +
sort over `CardGroup[]`. Price sorts push `null` prices to the end in **both**
directions; equal sort keys fall back to name A→Z for a deterministic order.

```ts
export type SortLayout = "grouped" | "flat";
export type SortKey = "name" | "price";
export type SortDirection = "asc" | "desc";

export interface SortMode {
  layout: SortLayout;
  key: SortKey;        // retained while grouped, so toggling back to flat
  direction: SortDirection; //   restores the last flat sort
}

export const DEFAULT_SORT_MODE: SortMode = { layout: "grouped", key: "name", direction: "asc" };

// Flatten every group's cards into one list ordered by `key`/`direction`.
// Price: null is treated as "after" every real price regardless of direction;
// ties (and null-vs-null) break by name A→Z so the order is stable.
export function flattenAndSort(groups: CardGroup[], key: SortKey, direction: SortDirection): DeckCard[];
```

#### 2. Sort helper tests

**File**: `src/components/deck/sort.test.ts` (new)

**Intent**: Lock the ordering rules so Phase 2 wiring can't silently break them.

**Contract**: vitest cases covering — flatten across multiple groups; name asc /
desc; price asc / desc; `null` prices last in both directions; name tie-break on
equal price; determinism (stable output). Use a minimal `DeckCard` builder like
`labels.test.ts:6-16`.

#### 3. Sort-preference storage

**File**: `src/components/deck/sortStorage.ts` (new)

**Intent**: Persist the sort preference across sessions, mirroring
`src/lib/history/storage.ts` (versioned envelope, pure parse, SSR-guarded I/O).

**Contract**: `STORAGE_KEY = "deckdelta.sort.v1"`; pure
`parseSortMode(raw: string | null): SortMode` that returns `DEFAULT_SORT_MODE` on
null/empty/corrupt-JSON/version-mismatch/invalid-field input and otherwise
validates `layout`/`key`/`direction` against their allowed values; SSR-guarded
`loadSortMode(): SortMode` and `saveSortMode(mode: SortMode): void` (no-op under
`typeof window === "undefined"`; swallow quota/serialization errors).

#### 4. Storage tests

**File**: `src/components/deck/sortStorage.test.ts` (new)

**Intent**: Verify defensive parsing degrades to the grouped default.

**Contract**: vitest cases — null/empty → default; corrupt JSON → default; wrong
version → default; out-of-range field values → default; a valid envelope
round-trips through `parseSortMode`.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test`
- [ ] Type check passes: `npx astro check`
- [ ] Lint passes: `npm run lint`

---

## Phase 2: Wire the global control into the UI

### Overview

Add a presentational `SortControl`, give `DeckComparer` the `sortMode` state
(load on mount, save on change), and teach `CardGroupColumn` and
`SharedCardsDisclosure` to render grouped (default) or flat-sorted.

### Changes Required:

#### 1. Sort control component

**File**: `src/components/deck/SortControl.tsx` (new)

**Intent**: The single global control — a "Grouped ↔ Flat" toggle, plus a
key (Name / Price) and direction selector shown only when flat.

**Contract**: Props `{ value: SortMode; onChange: (mode: SortMode) => void }`.
Renders the grouped/flat toggle always; renders the key + direction controls only
when `value.layout === "flat"`. Reuses the existing `Button`
(`src/components/ui/button.tsx`) and `lucide-react` icons for direction. Pure
presentational — no storage access; emits a complete `SortMode` on every change.

#### 2. DeckComparer wiring

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Own the sort state, persist it, render the control, and pass it down.

**Contract**: Add `sortMode` state initialized to `DEFAULT_SORT_MODE`; a
mount-only `useEffect` calls `loadSortMode()` and sets it (hydration-safe); the
`onChange` handler sets state and calls `saveSortMode`. Render `<SortControl>` in
the ready view (near the existing Save row, above the Remove/Add grid). Pass
`sortMode` to both `<CardGroupColumn>`s and to `<SharedCardsDisclosure>`. Keep
`<CostSummary add={view.plan.add} />` unchanged (grouped input).

#### 3. CardGroupColumn flat rendering

**File**: `src/components/deck/CardGroupColumn.tsx`

**Intent**: Render today's grouped sections, or one flat sorted list when flat.

**Contract**: Add a `sortMode: SortMode` prop. When `layout === "grouped"`, render
the existing per-type subsections unchanged. When `"flat"`, render the column
title + total (unchanged computation) followed by a single `<ul>` of `CardRow`
over `flattenAndSort(groups, key, direction)` — no per-type `<h4>` headers.

#### 4. SharedCardsDisclosure flat rendering

**File**: `src/components/deck/SharedCardsDisclosure.tsx`

**Intent**: Apply the same grouped/flat rendering inside the shared disclosure.

**Contract**: Add a `sortMode: SortMode` prop; mirror `CardGroupColumn`'s
grouped/flat branch in the expanded body. The collapsed control and total count
are unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] Type check passes: `npx astro check`
- [ ] Lint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Existing tests still pass: `npm test`

#### Manual Verification:

- [ ] Default unchanged: first load (no stored pref) shows grouped-by-type, name
      A→Z within each section — identical to today.
- [ ] Flat toggle: Remove, Add, and Shared each render as one list (no per-type
      headers), all reordered by the active key.
- [ ] Name sort: A→Z and Z→A order correctly across all sections.
- [ ] Price sort: high→low and low→high order by price; `—`-priced cards sort to
      the end in both directions.
- [ ] Cost total unchanged: the headline total is identical in grouped vs flat and
      matches pre-change behavior.
- [ ] Persistence: pick a flat sort, reload — the same layout/key/direction is
      restored.
- [ ] Shared disclosure respects the active sort; collapse/expand still works.
- [ ] History save/restore unaffected: saving then restoring reproduces the plan;
      the chosen sort is not altered by restore.
- [ ] No hydration warning in the console on load.

**Implementation Note**: After Phase 2's automated verification passes, pause for
human manual confirmation before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- `sort.test.ts` — flatten across groups; name asc/desc; price asc/desc; nulls
  last (both directions); name tie-break on equal price; determinism.
- `sortStorage.test.ts` — default on null/corrupt/version-mismatch/invalid;
  valid round-trip.

### Integration Tests:

- None automated (no component test harness in the repo). Covered by manual
  verification.

### Manual Testing Steps:

1. Paste two decks; confirm the grouped view matches today's output.
2. Toggle Flat; switch key to Price, direction high→low; confirm every section is
   a single descending-price list with `—` cards last.
3. Switch to Name Z→A; confirm reverse-alphabetical across sections.
4. Note the headline total; toggle grouped↔flat; confirm the total never changes.
5. Reload the page; confirm the last flat/key/direction is restored.
6. Save the comparison, restore it; confirm the plan rebuilds and the sort
   preference is unchanged.
7. Open devtools; confirm no React hydration warning on load.

## Performance Considerations

Sorting runs over the in-memory plan (tens to low-hundreds of cards) on user
interaction only — negligible. No new network or storage hot path; the preference
write is a single small `localStorage.setItem`.

## Migration Notes

No data migration. The new `deckdelta.sort.v1` key is independent of
`deckdelta.history.v1`; absent/legacy values parse to the grouped default.

## References

- Shape note: `context/changes/sortable-card-rows/shape-notes.md`
- Persistence pattern to mirror: `src/lib/history/storage.ts`
- Grouping + within-bucket name sort: `src/lib/deck/diff.ts:70-90`
- Render components: `src/components/deck/CardGroupColumn.tsx`,
  `src/components/deck/SharedCardsDisclosure.tsx`, `src/components/deck/CardRow.tsx`
- Cost (sort-invariant): `src/lib/deck/cost.ts`, `DeckComparer.tsx:226`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sort core + persistence (pure, no UI)

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — b007a2b
- [x] 1.2 Type check passes: `npx astro check` — b007a2b
- [x] 1.3 Lint passes: `npm run lint` — b007a2b

### Phase 2: Wire the global control into the UI

#### Automated

- [x] 2.1 Type check passes: `npx astro check` — c9cc25a
- [x] 2.2 Lint passes: `npm run lint` — c9cc25a
- [x] 2.3 Build succeeds: `npm run build` — c9cc25a
- [x] 2.4 Existing tests still pass: `npm test` — c9cc25a

#### Manual

- [x] 2.5 Default unchanged: grouped-by-type, name A→Z within each section — c9cc25a
- [x] 2.6 Flat toggle: Remove/Add/Shared each render as one headerless list — c9cc25a
- [x] 2.7 Name sort A→Z and Z→A order correctly across sections — c9cc25a
- [x] 2.8 Price sort high→low / low→high; `—`-priced cards sort last both ways — c9cc25a
- [x] 2.9 Cost total identical in grouped vs flat and vs pre-change — c9cc25a
- [x] 2.10 Persistence: chosen flat layout/key/direction restored after reload — c9cc25a
- [x] 2.11 Shared disclosure respects the active sort; collapse/expand works — c9cc25a
- [x] 2.12 History save/restore unaffected; sort preference not altered by restore — c9cc25a
- [x] 2.13 No hydration warning in the console on load — c9cc25a
