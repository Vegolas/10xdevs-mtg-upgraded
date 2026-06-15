# Contract Surfaces

Registry of load-bearing names — types, functions, routes, and schema fields that
multiple changes depend on. When you rename or change the shape of anything here,
update every consumer and this entry. One row per surface.

## Card data (roadmap F-01 · `card-data-resolution`)

| Surface            | Kind     | Location                        | Purpose                                                                                                                                                                                                                                               |
| ------------------ | -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`             | type     | `src/lib/card-data/types.ts`    | A resolved card: `name`, `typeLine`, `category`, `imageUrl`, `priceUsd`, `priceEur`. Consumed by S-01 (grouping), S-02 (images), S-03 (prices).                                                                                                       |
| `CardCategory`     | type     | `src/lib/card-data/types.ts`    | The 7 grouping buckets (`land`/`creature`/`instant`/`sorcery`/`artifact`/`enchantment`/`planeswalker`) plus `other`. S-01 groups by this.                                                                                                             |
| `UnresolvedCard`   | type     | `src/lib/card-data/types.ts`    | An input name that did not resolve: `name`, `reason` (`not-found`/`ambiguous`/`malformed`), `suggestion`.                                                                                                                                             |
| `ResolutionResult` | type     | `src/lib/card-data/types.ts`    | Partial-success return shape: `{ resolved: Card[]; unresolved: UnresolvedCard[] }`.                                                                                                                                                                   |
| `classifyType`     | function | `src/lib/card-data/classify.ts` | `(typeLine: string) => CardCategory`. Deterministic precedence over overlapping types.                                                                                                                                                                |
| `resolveCards`     | function | `src/lib/card-data/resolve.ts`  | `(names: string[]) => Promise<ResolutionResult>`. Public resolver via the card-data source. _(Implemented in F-01 Phase 2.)_                                                                                                                          |
| `resolutionKey`    | function | `src/lib/card-data/resolve.ts`  | `(name: string) => string`. Front-face identity key (lowercased). Shared by the resolver's dedup/cache **and** the deck-layer quantity join so a card's front-only and full `// ` forms collapse to one key. _(Extracted in `deck-diff-quantities`.)_ |

> Module entry point: import these from `@/lib/card-data`.

## Deck diff (roadmap S-01 · `grouped-upgrade-plan`)

| Surface               | Kind     | Location                   | Purpose                                                                                                                                                                                                                                                                                 |
| --------------------- | -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseDeckList`       | function | `src/lib/deck/parse.ts`    | `(text: string) => ParsedDeck`. Tolerant deck-list parser: drops blanks/comments/section headers, extracts `{name, quantity}` entries, collects unreadable lines as `malformed`.                                                                                                        |
| `diffDecks`           | function | `src/lib/deck/diff.ts`     | `(base: DeckCard[], target: DeckCard[]) => UpgradePlan`. Quantity-aware per canonical `Card.name`: `shared = min`, `remove`/`add` = the delta (a partly-changed card appears in both). Each partition grouped by `category` in `CATEGORY_ORDER`; empty / zero-quantity buckets omitted. |
| `UpgradePlan`         | type     | `src/lib/deck/diff.ts`     | The computed plan: `{ remove, add, shared }`, each a `CardGroup[]`. Enriched by S-02 (images) / S-03 (prices) on the same shape.                                                                                                                                                        |
| `CardGroup`           | type     | `src/lib/deck/diff.ts`     | One category's cards: `{ category: CardCategory; cards: DeckCard[] }`. The render unit for a typed subsection.                                                                                                                                                                          |
| `DeckCard`            | type     | `src/lib/deck/diff.ts`     | A card paired with a copy count: `{ card: Card; quantity: number }`. The deck-layer holding / diff-delta unit — keeps quantity off the pure `Card` identity. _(Added in `deck-diff-quantities`.)_                                                                                       |
| `generateUpgradePlan` | function | `src/lib/deck/plan.ts`     | `(baseText, targetText) => Promise<PlanOutcome>`. Orchestrates parse → `resolveCards` → `attachQuantities` → `diffDecks`; returns `ok` / `empty` / `error`, with deck-tagged `unresolved` entries.                                                                                      |
| `attachQuantities`    | function | `src/lib/deck/quantity.ts` | `(resolved: Card[], entries: DeckEntry[]) => DeckCard[]`. Joins resolved cards to their parsed quantities, summing duplicate lines and merging DFC name forms by `resolutionKey` (fallback quantity 1). _(Added in `deck-diff-quantities`.)_                                            |

> Module entry point: import these from `@/lib/deck`.

## Prices & total (roadmap S-03 · `upgrade-cost-and-prices`)

| Surface       | Kind     | Location                        | Purpose                                                                                                                                                                                                  |
| ------------- | -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `planAddCost` | function | `src/lib/deck/cost.ts`          | `(add: CardGroup[]) => PlanCost`. Quantity-aware sum of the additions' `priceUsd × quantity`, excluding null-priced cards from the total and counting them separately (FR-007). Imported from `@/lib/deck`. |
| `PlanCost`    | type     | `src/lib/deck/cost.ts`          | `{ total: number; pricedCount: number; missingCount: number }`. The honest-total breakdown `CostSummary` renders. Imported from `@/lib/deck`.                                                            |
| `formatUsd`   | function | `src/components/deck/labels.ts` | `(value: number \| null) => string`. The single USD display formatter: `null` → `"—"`, a number → `"~$N.NN"`. Shared by the per-card row and the headline total so money reads identically (FR-006/FR-007). |
