# Quantity-Aware Deck Diff Implementation Plan

## Overview

The upgrade-plan diff is quantity-blind: a base deck with `8 Mountain` and a target with `6 Mountain` both collapse to a single `Mountain` entry, land in "Shared", and the `-2` delta never surfaces. The parser already captures per-line quantities, but they are discarded before resolution. This plan threads quantity from the parser through the plan orchestrator and the diff so quantity deltas produce visible remove/add (e.g. "remove 2 Mountain"), and renders `×N` multipliers plus summed-quantity counts in the UI.

## Current State Analysis

The deck pipeline is `parse → resolve → diff → render`:

- **[parse.ts](src/lib/deck/parse.ts)** already produces `DeckEntry { name, quantity }` — `8 Mountain` → `{ name: "Mountain", quantity: 8 }`. Duplicate lines are intentionally kept separate (`ParsedDeck.entries` is "first-seen order; duplicate lines are kept separate").
- **[plan.ts:67-68](src/lib/deck/plan.ts)** drops quantity: `entries.map((entry) => entry.name)`. Only names flow into `resolveCards`.
- **[resolve.ts](src/lib/card-data/resolve.ts)** dedups by the front-face key (`normalizeKey(frontFace(name))`) and returns canonical `Card[]` with no quantity.
- **[diff.ts](src/lib/deck/diff.ts)** indexes each deck with a `byName` Map keyed on `Card.name` and computes a presence-only set difference; `CardGroup.cards: Card[]`.
- **[CardGroupColumn.tsx](src/components/deck/CardGroupColumn.tsx)** / **[SharedCardsDisclosure.tsx](src/components/deck/SharedCardsDisclosure.tsx)** render `card.name` and count `group.cards.length` (distinct). [DeckComparer.tsx](src/components/deck/DeckComparer.tsx) wires the pipeline (debounced) and passes the `UpgradePlan` groups straight through.

### Key Discoveries:

- `Card` ([types.ts:20-34](src/lib/card-data/types.ts)) is documented as "load-bearing types every later slice consumes" — quantity is per-deck state, not card identity, so it must NOT go on `Card` (would also break the session cache's reuse of a single `Card`).
- After the `dfc-name-resolution` fix, a resolved `Card.name` is canonical (`A // B`) but the pasted entry may be front-only (`Delver of Secrets`). Joining a resolved card back to its parsed quantity therefore needs the **same front-face key the resolver uses internally** — see [resolve.ts:26-28,107](src/lib/card-data/resolve.ts) (`frontFace` + `normalizeKey`). That key logic is currently private to `resolve.ts`.
- The diff is consumed only by the two group components (plus `DeckComparer` passthrough); changing `CardGroup.cards` to a paired type ripples to exactly those two components. On-device history (S-04) is unbuilt; no cost display exists yet (S-03).
- The existing [diff.test.ts](src/lib/deck/diff.test.ts) builds `Card[]` directly via a `card()` helper and calls `diffDecks(base, target)`; its helper must wrap cards once the signature takes the paired type.

## Desired End State

- A base/target pair differing only in basic-land counts (8 vs 6 Mountain) shows `Mountain ×2` under **Remove** and `Mountain ×6` under **Shared** — the same card legitimately appears in both partitions.
- Quantity is respected uniformly for every card (full multiplicity), so decks that legitimately run multiples (Relentless Rats, etc.) diff correctly.
- A card with quantity > 1 renders as `N× Name`; singletons render as a bare name (today's look). Per-group and column count badges sum quantities (copies), consistent with the row multipliers.
- Quantity survives `parse → resolve → diff` including DFC front-face association and summed duplicate lines.

Verify: `diff.test.ts` and the new association test pass; the live 8-vs-6-Mountain decklist pair renders `remove Mountain ×2` + `shared Mountain ×6`; singleton cards look unchanged; counts reflect copies.

## What We're NOT Doing

- Not adding `quantity` to the `Card` type (kept pure identity).
- Not building or changing a total upgrade cost (S-03 is unbuilt). Price × quantity is out of scope.
- Not special-casing basic lands — quantity is threaded uniformly (full multiplicity), which is both simpler and more correct than a basic-only path.
- Not adding component-level test harness; the `×N`/badge rendering is covered by manual verification.
- Not changing the parser (it already yields `quantity`) beyond consuming its existing output.

## Implementation Approach

Introduce a deck-layer pairing type `DeckCard { card: Card; quantity: number }`. Extract the resolver's identity key into an exported `resolutionKey(name)` so one definition serves both the resolver's internal dedup and the deck layer's quantity join. In `plan.ts`, a pure `attachQuantities(resolved, entries)` helper aggregates parsed entries by `resolutionKey` (summing duplicate lines) and joins each resolved `Card` to its quantity. `diffDecks` becomes quantity-aware, computing per-name deltas and emitting `CardGroup.cards: DeckCard[]`. The two group components read `dc.card`/`dc.quantity`, render `×N` when > 1, and sum quantities for counts.

## Critical Implementation Details

- **Single identity key (load-bearing).** The deck-layer quantity join and the resolver's dedup/cache MUST use the *same* key, or a DFC listed front-only on one side and full `//` on the other won't line up. Extract `resolutionKey(name) = name.split("//")[0].trim().toLowerCase()` (today's `normalizeKey(frontFace(...))`) into `card-data`, export it, and have `resolveCards` use it internally so there is exactly one definition.
- **A card can appear in two partitions.** `shared = min(baseQty, targetQty)`, `remove = max(0, baseQty − targetQty)`, `add = max(0, targetQty − baseQty)`. When base 8 / target 6, Mountain emits to both `shared (6)` and `remove (2)`. Partitions with a zero quantity are omitted (preserve the existing "omit empty" behavior). This is intended, not a bug.

## Phase 1: Quantity-aware data layer

### Overview

Thread quantity from parsed entries through resolution into a quantity-aware diff, without touching card identity. Pure, fully unit-testable.

### Changes Required:

#### 1. Export a single resolution key from card-data

**File**: `src/lib/card-data/resolve.ts` (and re-export via `src/lib/card-data/index.ts`)

**Intent**: Make the front-face identity key reusable by the deck layer so the quantity join matches the resolver's dedup exactly. Remove the duplicated inline key construction.

**Contract**: Add exported `resolutionKey(name: string): string` returning `name.split("//")[0].trim().toLowerCase()`. Replace the internal `normalizeKey(frontFace(...))` / `normalizeKey(missName)` uses in `resolveCards` with `resolutionKey`. Behavior is identical (the existing resolver tests must stay green). Re-export `resolutionKey` from `card-data/index.ts`.

#### 2. Deck-layer pairing type + quantity attach

**File**: `src/lib/deck/diff.ts` (type) and `src/lib/deck/quantity.ts` (new helper)

**Intent**: Define the per-deck `{card, quantity}` pairing and a pure function that joins resolved cards to their parsed quantities, aggregating duplicate lines and DFC name forms by the shared key.

**Contract**:
- In `diff.ts`: add `export interface DeckCard { card: Card; quantity: number }`; change `CardGroup.cards` from `Card[]` to `DeckCard[]`.
- New `src/lib/deck/quantity.ts`: `export function attachQuantities(resolved: Card[], entries: DeckEntry[]): DeckCard[]`. Build a `Map<string, number>` of `resolutionKey(entry.name)` → summed quantity over all entries (this aggregates duplicate lines and merges front-only/full `//` forms), then map each resolved `Card` to `{ card, quantity: map.get(resolutionKey(card.name)) ?? 1 }`. Imports `resolutionKey` from `@/lib/card-data`, `DeckEntry` from `./parse`, `DeckCard` from `./diff`.

#### 3. Quantity-aware diff

**File**: `src/lib/deck/diff.ts`

**Intent**: Compute per-name quantity deltas instead of presence-only set difference, emitting `DeckCard`s carrying the delta (remove/add) or the min (shared).

**Contract**: `diffDecks(base: DeckCard[], target: DeckCard[]): UpgradePlan`. Index each side by `card.name` → `DeckCard`. For the union of names: `removeQty = max(0, baseQty − targetQty)`, `addQty = max(0, targetQty − baseQty)`, `sharedQty = min(baseQty, targetQty)`; push a `DeckCard` with the computed quantity to the corresponding partition only when its quantity > 0 (use the base card object for remove/shared, the target card for add). `groupByCategory` now takes `DeckCard[]` and sorts by `dc.card.name`. Zero-quantity entries never produce a group, preserving "omit empty categories".

#### 4. Orchestrator wiring

**File**: `src/lib/deck/plan.ts`

**Intent**: Stop discarding quantity — attach it after resolution and feed `DeckCard[]` into the diff.

**Contract**: After `resolveCards`, call `attachQuantities(baseResolution.resolved, baseParsed.entries)` (and the target equivalent), then `diffDecks(baseDeckCards, targetDeckCards)`. The unique-name list passed to `resolveCards` is unchanged (names only). `PlanOutcome`/`UnresolvedEntry` are unchanged.

#### 5. Barrel export

**File**: `src/lib/deck/index.ts`

**Intent**: Surface the new type/helper to consumers.

**Contract**: Export `DeckCard` (type) from `./diff` and `attachQuantities` from `./quantity`.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm run test`
- [ ] `diff.test.ts` covers the delta cases (8v6 → remove 2; 4v4 → shared 4; 0v3 → add 3) and the card-in-both-partitions case
- [ ] A `quantity.test.ts` covers `attachQuantities`: summed duplicate lines, DFC front-only/full `//` join to one quantity, fallback quantity 1
- [ ] Existing resolver tests stay green after the `resolutionKey` extraction: `npm run test`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

---

## Phase 2: Quantity in the UI

### Overview

Render quantity in the two group components: `×N` multipliers on rows (only when > 1) and summed-quantity count badges.

### Changes Required:

#### 1. CardGroupColumn quantity rendering

**File**: `src/components/deck/CardGroupColumn.tsx`

**Intent**: Show how many copies move and reflect copies in the counts.

**Contract**: Iterate `group.cards` as `DeckCard`s: render `dc.quantity > 1 ? \`${dc.quantity}× ${dc.card.name}\` : dc.card.name`, key on `dc.card.name`. Change both the column `total` and the per-group badge from `group.cards.length` to a sum of `dc.quantity`.

#### 2. SharedCardsDisclosure quantity rendering

**File**: `src/components/deck/SharedCardsDisclosure.tsx`

**Intent**: Mirror the same quantity rendering in the shared section.

**Contract**: Same `DeckCard` row render (`×N` when > 1) and the same summed-quantity change for the disclosure total and per-group badge.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] An 8-vs-6-Mountain base/target pair shows `Mountain ×2` under Remove and `Mountain ×6` under Shared
- [ ] Cards with quantity 1 render as a bare name (no `1×`); only quantity > 1 shows `×N`
- [ ] Per-group and column counts reflect summed copies (e.g. a lands group with `Mountain ×2` reads `2`, not `1`)
- [ ] No regression for singleton-only decks (the common case looks unchanged)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `diff.test.ts` (update the `card()` helper to a `deckCard(name, category, quantity = 1)` wrapper): delta cases 8v6→remove 2, 4v4→shared 4, 0v3→add 3; the card-in-both case (8 base / 6 target → shared 6 + remove 2); existing partition/order/sort/DFC/empty cases still pass with quantity 1.
- `quantity.test.ts` (new, pure — no fetch stubbing): summed duplicate lines (two `4 Mountain` → 8), DFC join (`Delver of Secrets` resolved-canonical joined to a `Delver of Secrets`-entry quantity, and a full `//` entry joining the same), missing-entry fallback to quantity 1.

### Integration Tests:

- Covered by the Phase 2 manual decklist verification (the pipeline join is unit-tested via `attachQuantities`, so no fetch-stubbed `plan.ts` test is required).

### Manual Testing Steps:

1. Paste a base deck with `8 Mountain` and a target with `6 Mountain` (otherwise identical); confirm `Mountain ×2` under Remove and `Mountain ×6` under Shared.
2. Confirm singleton cards render with no `1×` and counts sum copies.
3. Confirm a deck listing the same card on two lines aggregates (e.g. `4 Mountain` + `4 Mountain` behaves as 8).

## Performance Considerations

Negligible — one extra map build per deck (`attachQuantities`) over already-parsed data; no new network calls.

## Migration Notes

None — no persisted data. `CardGroup.cards` changes type, but the only consumers are the two group components updated in Phase 2.

## References

- Change identity: `context/changes/deck-diff-quantities/change.md`
- Parked-follow-up provenance: `context/changes/dfc-name-resolution/plan.md` (What We're NOT Doing)
- Diff + grouping: `src/lib/deck/diff.ts`
- Orchestrator: `src/lib/deck/plan.ts:67-68` (where quantity is dropped today)
- Parser (already yields quantity): `src/lib/deck/parse.ts:15-19,83-91`
- Resolver identity key: `src/lib/card-data/resolve.ts:26-28,107`
- Group components: `src/components/deck/CardGroupColumn.tsx`, `src/components/deck/SharedCardsDisclosure.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Quantity-aware data layer

#### Automated

- [x] 1.1 Unit tests pass: `npm run test`
- [x] 1.2 `diff.test.ts` covers delta cases (8v6→remove 2; 4v4→shared 4; 0v3→add 3) and card-in-both
- [x] 1.3 `quantity.test.ts` covers `attachQuantities` (summed lines, DFC join, fallback 1)
- [x] 1.4 Existing resolver tests stay green after `resolutionKey` extraction
- [x] 1.5 Type checking passes: `npm run build`
- [x] 1.6 Linting passes: `npm run lint`

### Phase 2: Quantity in the UI

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 8-vs-6-Mountain pair shows `Mountain ×2` (Remove) and `Mountain ×6` (Shared)
- [ ] 2.4 Quantity 1 renders bare; only > 1 shows `×N`
- [ ] 2.5 Per-group and column counts reflect summed copies
- [ ] 2.6 No regression for singleton-only decks
