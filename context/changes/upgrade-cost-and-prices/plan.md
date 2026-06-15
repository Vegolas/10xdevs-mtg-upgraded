# Prices and Total Upgrade Cost (S-03) Implementation Plan

## Overview

Surface money in the upgrade plan: an approximate **per-card USD price** on every card row (PRD FR-006) and an **approximate total upgrade cost** for the additions (PRD FR-007, US-01, roadmap **S-03**). Prices are framed as indicative throughout. This is a pure presentation slice over the already-resolved `Card.priceUsd` plus one pure, unit-tested cost helper — no card-data-layer, network, diff, or state-model changes. It is the third enricher over S-01's grouped plan, mirroring S-02 (images) almost 1:1.

## Current State Analysis

The price data is already resolved and flowing untouched to the render layer — exactly as `imageUrl` was for S-02:

- **F-01 resolves `Card.priceUsd: number | null`** ([types.ts:31](src/lib/card-data/types.ts)), parsed from Scryfall `prices.usd`; `priceEur` exists too but this slice uses USD only (broader coverage). The field flows `resolveCards` → `attachQuantities` → `diffDecks` → `CardRow` with no transformation.
- **The diff is quantity-aware** ([quantity.ts](src/lib/deck/quantity.ts), `deck-diff-quantities`): `UpgradePlan.add` is `CardGroup[]` whose `DeckCard`s carry the **delta** quantity (copies to acquire). So the total must multiply `priceUsd × quantity` per add card.
- **`CardRow` is the single per-card extension point** ([CardRow.tsx:21](src/components/deck/CardRow.tsx)) — shared by the Remove/Add columns and the Shared disclosure, so one edit there puts a price on every row in all three sections. The S-02 plan flagged this as "the extension point S-03 (prices) will build on."
- **`labels.ts` holds the tested pure-helper pattern** ([labels.ts:25](src/components/deck/labels.ts)): `groupCopies` sums per-card quantities and is covered in [labels.test.ts](src/components/deck/labels.test.ts). The price formatter belongs here next to it.
- **`DeckComparer`'s `ready` view** ([DeckComparer.tsx:143](src/components/deck/DeckComparer.tsx)) renders, in a `space-y-6` stack: `UnresolvedNotice` → identical-lists note **or** the Remove|Add grid → `SharedCardsDisclosure`. The total summary mounts at the top of this stack.
- **Test boundary is established**: Vitest runs `*.test.ts` in a **node** env (no jsdom). Pure helpers get unit tests; React components are verified manually (the boundary S-01/S-02/`dfc-name-resolution` set).

### Key Discoveries:

- **No data work** — `priceUsd` is resolved and present on every `Card`; S-03 only reads it (same as S-02 read `imageUrl`).
- **Total is additions-only and quantity-weighted** — PRD §Business Logic ([prd.md:95](context/foundation/prd.md)): "a total approximate upgrade cost derived from **the sum of addition prices**." Not net-of-removals. Quantity-weighted because the diff carries copy deltas.
- **Coverage gaps are normal** — `priceUsd` is `number | null`; the total must sum the known prices and report how many add-cards had none, never block or silently zero them (roadmap S-03 risk: "coverage gaps degrade gracefully").
- **Prices must read as approximate** — PRD Guardrail + the FR-006/FR-007 Socratic notes insist prices are indicative (EU vs US, vendor variance). The UI uses a `~` prefix and one disclaimer line.

## Desired End State

Every card in the upgrade plan (Remove, Add, Shared) shows an approximate USD price (`~$1.23`) right-aligned after its name, or `—` when no price resolved. Atop the results sits a cost summary: **Total upgrade cost: ~$X**, summing `priceUsd × quantity` across the Add partition, with a muted note when some additions lacked price data, and a one-line "approximate, varies by vendor/region" disclaimer. When no addition has a price the total reads `—` (not a misleading `$0.00`); when the lists are identical (nothing to add) no summary shows.

Verify by pasting a real base/target pair: per-card prices appear throughout, the headline total matches the sum of the Add column's `price × copies`, a deliberately unpriced/obscure card shows `—` and is counted in the "without price data" note, and `npm run test`, `npx astro check`, `npm run lint`, `npm run build` all pass.

## What We're NOT Doing

- **No EUR display and no currency toggle** — USD only for MVP (best Scryfall coverage). `priceEur` stays resolved but unused.
- **No net-cost math / removal credit / "removal value" subtotal** — the total is additions-only per the PRD. Removed and shared cards show a per-card price (FR-006) but never net against the total.
- **No per-line price (`price × qty`) on the row** — each row shows the card's **unit** price; quantity is reflected only in the headline total, to avoid confusing a row's number with a line cost.
- **No price caching, refresh, staleness indicator, or "as of" timestamp** — prices are whatever F-01's in-session resolution returned; approximate framing covers volatility.
- **No card-data-layer, `normalize.ts`, diff, orchestrator, or state-model change**, and no new network calls.
- **No React component/jsdom test harness** — pure helpers get unit tests; components verified manually (established boundary).
- **No images/grouping/history changes** — S-02/S-01/S-04 scope untouched.

## Implementation Approach

One phase (the slice is small and the two FRs share the same data and helpers). Add the money in dependency order so each piece is independently checkable: first the pure formatter (`formatUsd`) and the pure aggregator (`planAddCost`) with their unit tests — the logic that carries the only real risk — then wire them into the read-only render layer (`CardRow` for per-card prices, a new `CostSummary` for the headline total mounted in `DeckComparer`). `formatUsd` is the single formatter used by both the per-row price and the headline, so they always render identically.

## Critical Implementation Details

- **The total multiplies by quantity; the row shows unit price.** `planAddCost` sums `priceUsd × quantity` over add cards; `CardRow` prints `formatUsd(card.priceUsd)` (the unit price). Do not show `price × qty` on the row — that would read as a line total and double-count against the headline in the user's eyes.
- **Missing-price degradation is explicit.** `planAddCost` sums only cards with a non-null `priceUsd` and separately counts the ones without. When *no* add card has a price (`pricedCount === 0`), `CostSummary` shows `—`, not `~$0.00` — a `$0.00` total on unpriced cards reads as "free" and fights the accuracy Guardrail.
- **The summary only renders when there are additions.** Mount `CostSummary` at the top of the `ready` stack guarded by `view.plan.add.length > 0`; the identical-lists branch already explains "nothing to add," so no zero-dollar summary appears there.

## Phase 1: Per-card prices + total upgrade cost (FR-006, FR-007)

### Overview

Add a tested USD formatter and a tested additions-cost aggregator, render the per-card price on every `CardRow`, and mount a `CostSummary` banner atop the results in `DeckComparer`. Delivers both FR-006 (per-card prices) and FR-007 (total upgrade cost).

### Changes Required:

#### 1. USD price formatter

**File**: `src/components/deck/labels.ts`

**Intent**: One presentation helper that turns a nullable USD price into the approximate display string, used by both the per-card row and the headline total so they read identically.

**Contract**: `export function formatUsd(value: number | null): string`. `null` → `"—"` (em dash, the missing-price marker); a number → `"~$" + value.toFixed(2)` (e.g. `1.5` → `"~$1.50"`). The `~` carries the "approximate" framing inline. Co-located with `groupCopies`/`categoryLabel`.

#### 2. Formatter unit test

**File**: `src/components/deck/labels.test.ts`

**Intent**: Lock the three behaviors (null marker, 2-decimal formatting, the `~$` prefix) so a refactor can't silently change how money reads.

**Contract**: Add a `describe("formatUsd", …)` block: `null` → `"—"`; `12` → `"~$12.00"`; `1.5` → `"~$1.50"`; `0` → `"~$0.00"`. Mirrors the existing `groupCopies` test style.

#### 3. Additions-cost aggregator

**File**: `src/lib/deck/cost.ts` (new)

**Intent**: The pure, quantity-aware math for the total upgrade cost over the Add partition, with graceful handling of cards that have no price — the testable heart of FR-007.

**Contract**: Operates on `CardGroup[]` (the `add` partition) and returns priced/missing breakdown so the UI can render an honest total. The shape is load-bearing for `CostSummary`:

```ts
export interface PlanCost {
  total: number;        // Σ (priceUsd × quantity) over add cards with a non-null priceUsd
  pricedCount: number;  // # of add DeckCards that had a priceUsd
  missingCount: number; // # of add DeckCards with priceUsd === null
}

export function planAddCost(add: CardGroup[]): PlanCost;
```

Iterate every group's `cards`; for each `DeckCard`, when `card.priceUsd !== null` add `priceUsd * quantity` to `total` and increment `pricedCount`, else increment `missingCount`. Empty/absent add → all zeros. Pure, no imports beyond the `CardGroup`/`DeckCard` types.

#### 4. Aggregator unit test

**File**: `src/lib/deck/cost.test.ts` (new)

**Intent**: Cover the quantity weighting and the degradation counts — the only logic in the slice with real failure modes.

**Contract**: Vitest cases (node env, no mocks; build `CardGroup[]` fixtures like `labels.test.ts` does): a mixed add sums `price × quantity` across groups (e.g. `2×@1.50 + 1×@10` → `total 13`, `pricedCount 2`, `missingCount 0`); a card with `priceUsd: null` is excluded from `total` and counted in `missingCount` while the rest still sum; all-null add → `total 0`, `pricedCount 0`; empty `add: []` → all zeros.

#### 5. Export the aggregator

**File**: `src/lib/deck/index.ts`

**Intent**: Make `planAddCost` part of the deck module's public surface so `CostSummary` imports it from `@/lib/deck`.

**Contract**: Add `export { planAddCost } from "./cost";` and `export type { PlanCost } from "./cost";`, mirroring the existing barrel entries.

#### 6. Per-card price in the card row

**File**: `src/components/deck/CardRow.tsx`

**Intent**: Show each card's approximate unit price after its name, in all three sections at once via the shared row. Satisfies FR-006.

**Contract**: Render `formatUsd(card.priceUsd)` in a muted, right-aligned (`ml-auto`), `tabular-nums` span after the existing name `<span>`. Null price shows `—` (from `formatUsd`). No change to the thumbnail/preview/placeholder behavior, the `<li>` flex layout, or the label rule.

#### 7. Cost summary banner

**File**: `src/components/deck/CostSummary.tsx` (new)

**Intent**: The FR-007 headline — a prominent, approximate total for the additions, with honest missing-data reporting and the indicative-price disclaimer. Keeps `DeckComparer` thin (mirrors `UnresolvedNotice`/`CardGroupColumn` as a focused presentational child).

**Contract**: `CostSummary({ add }: { add: CardGroup[] })`. Computes `planAddCost(add)`. Renders a bordered panel: a headline `Total upgrade cost: {formatUsd(total)}` when `pricedCount > 0`, or `Total upgrade cost: —` when `pricedCount === 0`; when `missingCount > 0`, a muted suffix like `· {missingCount} card(s) without price data`; and always a one-line muted disclaimer: `Approximate prices from Scryfall; actual cost varies by vendor and region.` Uses existing theme tokens, consistent with the other deck panels.

#### 8. Mount the summary atop the results

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Place the total as the first thing the user sees in a ready plan (the slice's payoff), without disturbing the existing outcome states.

**Contract**: In the `view.status === "ready"` block, render `<CostSummary add={view.plan.add} />` as the first child of the `space-y-6` stack (above `UnresolvedNotice`), guarded by `view.plan.add.length > 0` so the identical-lists branch shows no zero-dollar summary. Import `CostSummary`. No other view-state or logic changes.

#### 9. Register contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Record the new load-bearing names so a future slice (e.g. S-04 history, or an EUR/toggle follow-up) references the same contract.

**Contract**: Add an S-03 section (`Prices & total (roadmap S-03 · upgrade-cost-and-prices)`) with rows for `planAddCost`/`PlanCost` (`src/lib/deck/cost.ts`, imported from `@/lib/deck`) and `formatUsd` (`src/components/deck/labels.ts`), each with a one-line purpose, consistent with the existing tables.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (`formatUsd` + `planAddCost`): `npm run test`
- Type checking passes: `npx astro check`
- Linting passes (including `jsx-a11y`): `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Every card in Remove, Add, and Shared shows a right-aligned `~$X.XX`; a card with no resolved price shows `—` (no blank, no crash)
- The cost summary appears atop the results; its total equals the sum of the Add column's `price × copies` (verify a multi-copy add like `4× Forest` contributes `price × 4` while its row shows the unit price)
- When some additions lack a price, the summary still sums the rest and notes `N card(s) without price data`; when no addition has a price, the total shows `—`, not `~$0.00`
- The approximate-price disclaimer line is visible near the total
- Identical base/target lists show the existing "identical lists" note and **no** cost summary
- No regressions: thumbnails/hover-preview, grouping, shared disclosure, unresolved notice, and the retry banner all still work

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the manual testing succeeded before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- `formatUsd` (`labels.test.ts`): null → `"—"`; integer and fractional values → `~$N.NN` with two decimals; zero → `~$0.00`.
- `planAddCost` (`cost.test.ts`): quantity-weighted sum across multiple groups; null-price card excluded from total but counted in `missingCount`; all-null add → `total 0`, `pricedCount 0`; empty add → all zeros.

### Integration Tests:

- None automated (no jsdom harness). `CardRow`, `CostSummary`, and the `DeckComparer` wiring are verified via the Manual Testing Steps.

### Manual Testing Steps:

1. Paste two real EDH lists; confirm a `~$` price on every Remove/Add/Shared row and a headline total atop the results.
2. Pick a base/target where an addition has multiple copies (e.g. `4 Forest` in target, absent in base); confirm the row shows the unit price and the total includes `price × 4`.
3. Include an addition known to lack a Scryfall USD price (or an obscure card); confirm its row shows `—` and the summary's "N card(s) without price data" count increments while the rest still sum.
4. Construct a target whose additions are all unpriced; confirm the total reads `—`, not `~$0.00`.
5. Make base and target identical; confirm the "identical lists" note shows and no cost summary appears.
6. Confirm the approximate-price disclaimer is visible and no S-02 behavior (thumbnails, hover/focus enlarge, placeholder) regressed.

## Performance Considerations

Negligible. `planAddCost` is a single linear pass over the Add partition (tens of cards at MVP scale), recomputed in `CostSummary` per ready render — no memoization needed. No new network requests; prices come from F-01's already-completed resolution.

## Migration Notes

None — additive rendering plus one pure helper. No data, schema, stored-state, or contract changes to existing modules; `Card.priceEur` remains resolved and simply unused.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-03 (`upgrade-cost-and-prices`)
- PRD: US-01, FR-006, FR-007, §Business Logic (`context/foundation/prd.md:95`)
- Sibling template (image enricher): `context/archive/2026-06-15-card-images-in-plan/plan.md`
- Resolved price field: [types.ts:31](src/lib/card-data/types.ts); quantity-aware diff: [diff.ts](src/lib/deck/diff.ts), [quantity.ts](src/lib/deck/quantity.ts)
- Per-card extension point: [CardRow.tsx](src/components/deck/CardRow.tsx); helper pattern: [labels.ts](src/components/deck/labels.ts), [labels.test.ts](src/components/deck/labels.test.ts)
- Mount point: [DeckComparer.tsx:143](src/components/deck/DeckComparer.tsx)
- Contract surfaces: `docs/reference/contract-surfaces.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Per-card prices + total upgrade cost (FR-006, FR-007)

#### Automated

- [x] 1.1 Unit tests pass (`formatUsd` + `planAddCost`): `npm run test` — 3feb3f7
- [x] 1.2 Type checking passes: `npx astro check` — 3feb3f7
- [x] 1.3 Linting passes (including `jsx-a11y`): `npm run lint` — 3feb3f7
- [x] 1.4 Production build succeeds: `npm run build` — 3feb3f7

#### Manual

- [x] 1.5 Every Remove/Add/Shared row shows `~$X.XX`; null-price cards show `—` — 3feb3f7
- [x] 1.6 Cost summary atop results; total equals Add `price × copies` (multi-copy add verified) — 3feb3f7
- [x] 1.7 Partial coverage: rest sums with an `N card(s) without price data` note; all-unpriced shows `—`, not `~$0.00` — 3feb3f7
- [x] 1.8 Approximate disclaimer visible; identical lists show no cost summary; no S-02/S-01 regressions — 3feb3f7
