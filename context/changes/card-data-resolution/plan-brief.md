# Card-Data Resolution Contract (F-01) — Plan Brief

> Full plan: `context/changes/card-data-resolution/plan.md`

## What & Why

DeckDelta needs to know each card's type, image, and price from just its name before it can build any upgrade plan. F-01 selects the card-data source and builds the foundation `name → card identity` resolver — the existential "card data accuracy" Guardrail starts here, and every display slice (S-01 grouping, S-02 images, S-03 prices) consumes this one lookup.

## Starting Point

Greenfield card layer: `src/lib/` has only Supabase/utility helpers, there is no card-data code, and **no test runner exists**. The app is Astro-on-Cloudflare but DeckDelta's logic runs client-side per the privacy NFR (the only allowed external touchpoint is card-data lookups by name).

## Desired End State

A typed `resolveCards(names: string[])` function in `src/lib/card-data/` returns `{ resolved: Card[], unresolved: UnresolvedCard[] }` — classified cards (land/creature/instant/sorcery/artifact/enchantment/planeswalker/other) with image + USD/EUR prices, and a "did you mean" suggestion for each miss. Backed by Vitest fixtures so the Guardrail has a regression net. No UI, no diffing, no deck-list parsing yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Card-data source | Scryfall API | Free, no key, permissive CORS, and one lookup yields type/image/price — covers F-01+S-02+S-03 | Plan |
| Where resolution runs | Client-side, browser → Scryfall direct | Matches the privacy NFR literally; zero backend infra | Plan |
| Contract width | Includes `type_line → category` classifier | The classifier is the testable heart of the accuracy Guardrail; S-01 just reads `card.category` | Plan |
| Miss handling | Partial success + fuzzy suggestions | Plan renders for valid cards; misses get a clear reason + "did you mean" (no silent omission) | Plan |
| Test tooling | Vitest + captured JSON fixtures | Vite-native, deterministic/offline, serves the Guardrail verification path F-01 exists for | Plan |
| Caching | In-session in-memory dedup only | Respects Scryfall etiquette without staleness/storage scope creep (persistence overlaps S-04) | Plan |
| Multi-faced cards | Normalize to front/primary face | Correctly classifies common Commander DFCs without complicating consumers | Plan |

## Scope

**In scope:** Scryfall batch resolution (`/cards/collection`), Scryfall→`Card` normalization (front-face fallback, price/image extraction), `type_line→category` classifier, partial-success result with fuzzy suggestions, in-session dedup cache, Vitest + fixtures, contract-surfaces registry.

**Out of scope:** Deck-list text parsing (S-01), diffing/grouping/upgrade-plan UI (S-01), pricing totals (S-03), persistent cache (S-04), server proxy, full multi-face modeling.

## Architecture / Approach

`src/lib/card-data/` built bottom-up: `types.ts` (the `Card`/`ResolutionResult` contract) and `classify.ts` (pure classifier) first; then `scryfall.ts` (raw fetch) + `normalize.ts` (raw → `Card`) wired by `resolve.ts` (`resolveCards`: dedup → chunk ≤75 → sequential throttled `/cards/collection` → normalize → assemble); finally fuzzy suggestion enrichment for misses. `fetch` is mocked with captured fixtures in tests; a gated `RUN_LIVE=1` test hits real Scryfall.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tooling + contract & classifier | Vitest, the `Card` types, the tested classifier, registry | Vitest/Vite version alignment with pinned `vite ^7.3.2` |
| 2. Batch resolution + normalization | `resolveCards` over `/cards/collection`, front-face normalization, dedup cache | Scryfall response/field assumptions; multi-face edge handling |
| 3. Misses + fuzzy suggestions | `unresolved[]` with reason taxonomy + "did you mean", gated live test | Fuzzy = one request per miss (cost scales with garbage input) |

**Prerequisites:** None (F-01 is the root foundation; npm install access for Vitest).
**Estimated effort:** ~2–3 focused after-hours sessions across 3 phases.

## Open Risks & Assumptions

- Scryfall endpoint paths, the 75-identifier batch limit, and field names are from established knowledge (Scryfall blocks doc-fetching) — reconfirm against live docs in Phase 2.
- Browser `fetch` cannot set `User-Agent`, so Scryfall's UA etiquette is unmet client-side; accepted, and recoverable via a future server proxy without contract changes.
- Classifier precedence (planeswalker → land → creature → …) is a defensible default encoded in tests; may need tuning as edge cards surface.
- Prices are approximate per the PRD; staleness is acceptable and not cached persistently.

## Success Criteria (Summary)

- `resolveCards` returns correctly classified cards with image + price for valid names, and clear reasons + suggestions for misses — never crashing on bad input.
- `npm run test`, `npx astro check`, and `npm run lint` all pass; the Guardrail has a fixture-based regression net.
- A real list (incl. a DFC and a typo) resolves correctly against live Scryfall via the gated test.
