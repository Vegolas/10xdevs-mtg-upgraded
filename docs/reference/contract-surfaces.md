# Contract Surfaces

Registry of load-bearing names — types, functions, routes, and schema fields that
multiple changes depend on. When you rename or change the shape of anything here,
update every consumer and this entry. One row per surface.

## Card data (roadmap F-01 · `card-data-resolution`)

| Surface | Kind | Location | Purpose |
| --- | --- | --- | --- |
| `Card` | type | `src/lib/card-data/types.ts` | A resolved card: `name`, `typeLine`, `category`, `imageUrl`, `priceUsd`, `priceEur`. Consumed by S-01 (grouping), S-02 (images), S-03 (prices). |
| `CardCategory` | type | `src/lib/card-data/types.ts` | The 7 grouping buckets (`land`/`creature`/`instant`/`sorcery`/`artifact`/`enchantment`/`planeswalker`) plus `other`. S-01 groups by this. |
| `UnresolvedCard` | type | `src/lib/card-data/types.ts` | An input name that did not resolve: `name`, `reason` (`not-found`/`ambiguous`/`malformed`), `suggestion`. |
| `ResolutionResult` | type | `src/lib/card-data/types.ts` | Partial-success return shape: `{ resolved: Card[]; unresolved: UnresolvedCard[] }`. |
| `classifyType` | function | `src/lib/card-data/classify.ts` | `(typeLine: string) => CardCategory`. Deterministic precedence over overlapping types. |
| `resolveCards` | function | `src/lib/card-data/resolve.ts` | `(names: string[]) => Promise<ResolutionResult>`. Public resolver via the card-data source. _(Implemented in F-01 Phase 2.)_ |

> Module entry point: import these from `@/lib/card-data`.
