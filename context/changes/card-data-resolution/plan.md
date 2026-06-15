# Card-Data Resolution Contract (F-01) Implementation Plan

## Overview

Stand up the foundation card-data layer for DeckDelta: a typed, client-side module under `src/lib/card-data/` that resolves a list of MTG card names against the **Scryfall** API and returns classified `Card` objects (canonical name, card-type category, image URL, USD/EUR prices). Resolution returns **partial success** — a `resolved[]` array plus an `unresolved[]` array carrying a reason and a fuzzy "did you mean" suggestion for each miss — and never throws on an unknown name. The module ships with Vitest + captured JSON fixtures, which establishes the verification path for the PRD's "misidentified cards" Guardrail.

This is roadmap item **F-01** (`card-data-resolution`), the foundation that unblocks the north star S-01 (`grouped-upgrade-plan`) and the enrichers S-02 (images) and S-03 (prices). It is deliberately scoped to **resolution + error handling only** — no UI, no deck-list text parsing, no diffing.

## Current State Analysis

- **No card-data code exists.** `src/lib/` contains only `supabase.ts`, `utils.ts` (the `cn` helper), and `config-status.ts`. There is no `src/lib/card-data/`.
- **No test runner is configured.** `package.json` scripts are `dev`, `build`, `preview`, `deploy`, `astro`, `lint`, `lint:fix`, `format`. F-01 must introduce one because it *is* the Guardrail verification path.
- **Conventions to follow** ([tsconfig.json](tsconfig.json), [src/lib/supabase.ts](src/lib/supabase.ts)): TypeScript `strict`, path alias `@/*` → `./src/*`, ESLint flat config + Prettier, ESM modules, brackets-and-blocks style (per user global rules — no terse one-liners).
- **Runtime/architecture** ([astro.config.mjs](astro.config.mjs), [wrangler.jsonc](wrangler.jsonc)): Astro 6 `output: "server"` on Cloudflare Workers, but DeckDelta's logic is client-side per the privacy NFR. The card-data module runs in the **browser** and calls Scryfall directly.
- **Privacy NFR** ([prd.md:89](context/foundation/prd.md:89)): the only permitted external touchpoint is card-data lookups by name. Browser → Scryfall directly satisfies this literally — no DeckDelta backend receives card names.
- **`docs/reference/contract-surfaces.md` does not exist yet.** F-01 defines the project's first load-bearing contract surfaces (the `Card` type, the `CardCategory` enum, `resolveCards`), so this plan creates the registry.

### Key Discoveries:

- **Scryfall is the de-facto MTG data source** and the answer to the roadmap's #1 unknown ([roadmap.md:142](context/foundation/roadmap.md:142)): free, no API key, permissive CORS (`Access-Control-Allow-Origin: *`), and a single card object exposes `type_line` (F-01), `image_uris` (S-02), and `prices.usd`/`prices.eur` (S-03).
- **Batch endpoint**: `POST https://api.scryfall.com/cards/collection`, max **75** identifiers per request, body `{"identifiers":[{"name":"Sol Ring"}, …]}`, response `{"data":[Card…],"not_found":[{"name":…}]}`. Two ~100-card decks ≈ ≤3 chunks.
- **Fuzzy endpoint**: `GET https://api.scryfall.com/cards/named?fuzzy=<name>` returns the single best match, or `404` with `details` when not found / too ambiguous — the basis for per-miss suggestions.
- **Multi-faced cards** (layouts `transform`, `modal_dfc`, `double_faced_token`) have **no top-level `type_line`/`image_uris`** — only a `card_faces[]` array. Normalization falls back to `card_faces[0]`.
- **Browser `fetch` cannot set `User-Agent`** (forbidden header), so Scryfall's UA etiquette can't be honored client-side — acceptable for this architecture, documented below.

> Note: Scryfall blocks automated doc fetches, so the endpoint/field details above are from established knowledge. The implementer must reconfirm exact paths, the 75-identifier limit, and field names against live `https://scryfall.com/docs/api` before/while coding Phase 2.

## Desired End State

A consumer (later S-01) can call a single function and get back a fully typed, classified result:

```ts
import { resolveCards } from "@/lib/card-data";

const result = await resolveCards(["Sol Ring", "Llanowar Elves", "Notacard"]);
// result.resolved   → Card[]  (name, typeLine, category, imageUrl, priceUsd, priceEur)
// result.unresolved → UnresolvedCard[]  ({ name, reason, suggestion })
```

**Verification of the end state:**
- `npm run test` passes — classifier unit tests, fixture-based resolution tests, and miss/fuzzy tests all green.
- `npx astro check` (typecheck) and `npm run lint` pass.
- A gated live test (opt-in) resolves a known real card list against Scryfall and reports correct categories, an image URL, and a price.
- Manually pasting a list with a typo into the verification harness yields a `suggestion` for the typo and a `resolved` entry for the rest.

## What We're NOT Doing

- **No deck-list text parsing.** Turning `"1 Sol Ring"` (with quantities, set codes, MTGO/Arena/Moxfield variants) into clean names is S-01's job ([roadmap.md:86](context/foundation/roadmap.md:86)). F-01's `resolveCards` takes an already-clean `string[]` of card names.
- **No diffing / grouping / upgrade-plan logic.** Set-difference and the grouped view are S-01.
- **No UI components.** No React/Astro views; the only user-facing-adjacent artifact is a gated verification test.
- **No persistent cache.** Only in-session in-memory dedup. localStorage/KV persistence is deferred (overlaps S-04).
- **No server proxy / API route.** Resolution is client-side direct to Scryfall.
- **No full multi-face modeling.** Multi-faced cards normalize to their front face; back-face data is not surfaced.
- **No pricing math.** Summing a total upgrade cost is S-03; F-01 only exposes per-card `priceUsd`/`priceEur`.

## Implementation Approach

Build the module bottom-up so each phase is independently verifiable and commits cleanly:

1. **Pure core first** — the type contract and the `type_line → category` classifier are pure functions with zero network, so they can be exhaustively unit-tested. This also stands up the test runner that the rest of the plan (and project) depends on.
2. **Network layer next** — a thin Scryfall client (batch fetch) plus a normalizer (Scryfall card → our `Card`), wired into `resolveCards` with in-session dedup. Tested against captured JSON fixtures with `fetch` mocked, so tests stay deterministic and offline.
3. **Miss handling last** — assemble the `unresolved[]` list with a reason taxonomy and enrich each miss with a fuzzy suggestion, finalizing the partial-success contract; add a gated live test for end-to-end confidence.

Module layout:

```
src/lib/card-data/
  types.ts          # Card, CardCategory, ResolutionResult, UnresolvedCard, UnresolvedReason
  classify.ts       # classifyType(typeLine) -> CardCategory
  scryfall.ts       # raw Scryfall fetch (batch + fuzzy) + raw response types
  normalize.ts      # ScryfallCard -> Card (front-face fallback, price/image extraction)
  resolve.ts        # resolveCards(names) orchestrator: dedup cache, chunk, fetch, normalize, assemble
  index.ts          # barrel: resolveCards, classifyType, types
  __fixtures__/     # captured Scryfall JSON responses for tests
  *.test.ts
```

## Critical Implementation Details

- **Rate-limit etiquette & batching:** chunk input names into groups of ≤75 and issue `/cards/collection` requests **sequentially** with a ~75–100 ms delay between them (Scryfall asks for ≤~10 req/s). Phase 3's fuzzy lookups are one `GET` per miss — also throttled/sequential. Many misses ⇒ many calls; this is the accepted tradeoff of the fuzzy-suggestions decision.
- **Browser forbidden headers:** set only `Accept: application/json` on requests. Do **not** attempt to set `User-Agent` — browsers silently drop it. Note this in `scryfall.ts` so a future server-proxy migration knows to add it back.
- **Multi-faced normalization rule:** prefer top-level `type_line`/`image_uris`/`name`; when absent (DFC layouts), fall back to `card_faces[0]`. Split/adventure/flip cards keep a top-level `type_line`, so they need no special-casing.
- **Price parsing:** `prices.usd`/`prices.eur` arrive as strings or `null`. Parse with `parseFloat` to `number | null`; never assume present (many cards lack one currency).
- **Collection matching is exact, not fuzzy:** the batch endpoint matches names exactly (Scryfall normalizes case/punctuation but won't correct typos). That is precisely why misses route to the fuzzy endpoint in Phase 3.
- **In-session cache & dedup:** memoize resolved cards by normalized name in a module-level `Map`, and dedup names within a single call so repeated entries (e.g. multiple basic lands) cost one lookup.

---

## Phase 1: Test tooling + card contract & classifier

### Overview

Introduce Vitest, define the card-data type contract, implement the pure `type_line → category` classifier, and register the new contract surfaces. No network code in this phase — everything here is unit-testable in isolation.

### Changes Required:

#### 1. Vitest tooling

**File**: `package.json`, `vitest.config.ts` (new)

**Intent**: Add Vitest as the test runner so F-01 (and the project) has an automated verification path. Wire `@/*` alias resolution so tests import the same way as app code.

**Contract**: Add dev dependency `vitest` and scripts `"test": "vitest run"` and `"test:watch": "vitest"`. `vitest.config.ts` resolves `@` → `./src` (mirror tsconfig `paths`) and uses a `node` test environment (the module is environment-agnostic; `fetch` is mocked in tests). Confirm the installed Vitest version is compatible with the repo's pinned Vite (`overrides.vite ^7.3.2`).

#### 2. Card-data type contract

**File**: `src/lib/card-data/types.ts` (new)

**Intent**: Define the load-bearing types every later slice consumes. This is the contract surface S-01/S-02/S-03 build on, so it is specified explicitly.

**Contract**:

```ts
export type CardCategory =
  | "land" | "creature" | "instant" | "sorcery"
  | "artifact" | "enchantment" | "planeswalker" | "other";

export interface Card {
  name: string;            // canonical Scryfall name (front face for multi-faced)
  typeLine: string;        // raw Scryfall type_line (front face for multi-faced)
  category: CardCategory;  // derived via classifyType
  imageUrl: string | null; // image_uris.normal (front face); null if unavailable
  priceUsd: number | null; // parsed from prices.usd
  priceEur: number | null; // parsed from prices.eur
}

export type UnresolvedReason = "not-found" | "ambiguous" | "malformed";

export interface UnresolvedCard {
  name: string;               // the input name that failed
  reason: UnresolvedReason;
  suggestion: string | null;  // nearest fuzzy match, if any (filled in Phase 3)
}

export interface ResolutionResult {
  resolved: Card[];
  unresolved: UnresolvedCard[];
}
```

#### 3. Type-line classifier

**File**: `src/lib/card-data/classify.ts` (new)

**Intent**: Map a Scryfall `type_line` to exactly one of the 7 PRD grouping buckets (or `other`), with deterministic precedence for overlapping types. This pure function is the testable heart of "name → type resolution" and the Guardrail.

**Contract**: `export function classifyType(typeLine: string): CardCategory`. Match against the portion before the `—` (em dash) separator, case-insensitively. **Precedence (first match wins):** `planeswalker` → `land` → `creature` → `instant` → `sorcery` → `artifact` → `enchantment` → else `other`. Rationale for the order: it makes overlap cases deterministic — "Artifact Creature" → `creature`, "Artifact Land" → `land`, "Land Creature" (Dryad Arbor) → `land`, "Battle"/"Kindred"-only → `other`. The precedence is encoded in tests so it can be tuned without ambiguity.

#### 4. Barrel export

**File**: `src/lib/card-data/index.ts` (new)

**Intent**: Single public entry point for the module so consumers import from `@/lib/card-data`.

**Contract**: Re-export all types from `types.ts` and `classifyType` from `classify.ts`. `resolveCards` is added to this barrel in Phase 2 (forward-referenced here as a comment).

#### 5. Classifier unit tests

**File**: `src/lib/card-data/classify.test.ts` (new)

**Intent**: Lock the classifier's behavior across all 7 buckets and the tricky overlaps, establishing the Guardrail regression net.

**Contract**: Cases covering each category (e.g. "Basic Land — Forest" → `land`, "Legendary Creature — Elf Druid" → `creature`, "Instant" → `instant`, "Sorcery" → `sorcery`, "Artifact" → `artifact`, "Enchantment — Aura" → `enchantment`, "Legendary Planeswalker — Teferi" → `planeswalker`), the precedence overlaps ("Artifact Creature — Golem" → `creature`, "Artifact Land" → `land`, "Land Creature — Dryad" → `land`), and fallbacks ("Battle — Siege" → `other`, empty string → `other`).

#### 6. Contract-surfaces registry

**File**: `docs/reference/contract-surfaces.md` (new)

**Intent**: F-01 defines the project's first load-bearing names; register them so later slices reference the same contract.

**Contract**: Create the registry with entries for `Card`, `CardCategory`, `UnresolvedCard`, `ResolutionResult`, `resolveCards`, and `classifyType`, each noting its file and one-line purpose. (`resolveCards` is implemented in Phase 2 — listing it here is intentional forward-reference.)

### Success Criteria:

#### Automated Verification:

- Vitest installs and runs: `npm run test`
- Classifier tests pass (all 7 buckets + overlaps + fallbacks): `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `src/lib/card-data/` exists with `types.ts`, `classify.ts`, `index.ts`, and `classify.test.ts`
- `docs/reference/contract-surfaces.md` lists the F-01 contract surfaces

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Scryfall batch resolution + normalization

### Overview

Implement the network layer: a thin Scryfall batch client, a normalizer that maps raw Scryfall cards to our `Card` (with front-face fallback and price/image extraction), and the `resolveCards` orchestrator with in-session dedup. Misses are collected but not yet enriched with suggestions (Phase 3). Tested against captured JSON fixtures with `fetch` mocked.

### Changes Required:

#### 1. Scryfall client (batch)

**File**: `src/lib/card-data/scryfall.ts` (new)

**Intent**: Encapsulate the raw `/cards/collection` call and the raw Scryfall response shape, isolated so it can be mocked in tests and swapped for a proxy later.

**Contract**: Export a function that takes `string[]` names (already ≤75 per call OR chunks internally — chunking lives in `resolve.ts`; this file does one request) and returns the parsed `{ data, not_found }` payload, plus raw Scryfall types covering `name`, `type_line`, `layout`, `image_uris`, `prices`, `card_faces`. Sets `Accept: application/json` only (no `User-Agent` — see Critical Implementation Details). Throws/propagates on network or non-2xx HTTP so the orchestrator can decide handling.

#### 2. Normalizer

**File**: `src/lib/card-data/normalize.ts` (new)

**Intent**: Convert a raw Scryfall card into our flat `Card`, applying the multi-face front-face fallback and price parsing.

**Contract**: `export function normalizeCard(raw: ScryfallCard): Card`. Prefer top-level `name`/`type_line`/`image_uris.normal`; fall back to `card_faces[0]` when top-level is absent. `category` via `classifyType(typeLine)`. `priceUsd`/`priceEur` parsed from `prices.usd`/`prices.eur` (string|null → number|null).

#### 3. Resolve orchestrator (batch path)

**File**: `src/lib/card-data/resolve.ts` (new)

**Intent**: The public `resolveCards` — dedup input, serve from the in-session cache, chunk uncached names into ≤75 batches, call Scryfall sequentially with rate-limit delay, normalize hits into `resolved[]`, and collect `not_found` into `unresolved[]` (reason `not-found`, `suggestion: null` for now).

**Contract**: `export async function resolveCards(names: string[]): Promise<ResolutionResult>`. Blank/whitespace names short-circuit to `unresolved` with reason `malformed` (no API call). A module-level `Map<string, Card>` memoizes by normalized name across calls in the session. Add `resolveCards` to `index.ts`.

#### 4. Resolution tests (fixtures)

**File**: `src/lib/card-data/resolve.test.ts`, `src/lib/card-data/normalize.test.ts`, `src/lib/card-data/__fixtures__/*.json` (new)

**Intent**: Verify resolution end-to-end with `fetch` stubbed by captured Scryfall payloads — deterministic and offline.

**Contract**: Fixtures for a normal multi-card `collection` response, a multi-faced card (DFC with `card_faces`, no top-level `image_uris`), and a response with `not_found` entries. Tests assert: known names resolve with correct `category`/`imageUrl`/prices; DFC normalizes to its front face; duplicate input names dedup to one fetch identifier; `not_found` names land in `unresolved` with reason `not-found`; blank names are `malformed` without a fetch; chunking splits >75 names into multiple requests.

### Success Criteria:

#### Automated Verification:

- Resolution + normalization tests pass (mocked fetch): `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Calling `resolveCards(["Sol Ring","Llanowar Elves"])` against live Scryfall (via a throwaway snippet or the dev console) returns two `resolved` cards with correct categories, an `imageUrl`, and a `priceUsd`
- A known DFC (e.g. "Delver of Secrets") resolves to its front face with a non-null `imageUrl`

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Unrecognized-name handling + fuzzy suggestions

### Overview

Finalize the partial-success contract: enrich each unresolved name with a fuzzy "did you mean" suggestion from Scryfall and assign a precise reason. Add a gated live-Scryfall test for end-to-end confidence without making the default test run hit the network.

### Changes Required:

#### 1. Scryfall fuzzy lookup

**File**: `src/lib/card-data/scryfall.ts` (extend)

**Intent**: Add the single-card fuzzy lookup used to suggest a correction for a missed name.

**Contract**: Export a function taking one name and returning the best-match canonical name or `null`. Calls `GET /cards/named?fuzzy=<encoded name>`; on `200` returns the card's `name`; on `404` inspects `details` to distinguish "not found" from "too ambiguous" and returns `null`. Same `Accept` header / throttling rules.

#### 2. Miss enrichment in orchestrator

**File**: `src/lib/card-data/resolve.ts` (extend)

**Intent**: For each `not_found` name, attempt a fuzzy lookup and attach the result, mapping the outcome to the reason taxonomy.

**Contract**: After the batch pass, iterate misses **sequentially with throttling**; set `suggestion` to the fuzzy match (or `null`), and refine `reason`: a returned match keeps `not-found` with a `suggestion`; an ambiguous `404` becomes `ambiguous`; a clean not-found stays `not-found` with `suggestion: null`. `malformed` entries from Phase 2 are not re-queried.

#### 3. Miss/fuzzy tests + gated live test

**File**: `src/lib/card-data/resolve.test.ts` (extend), `src/lib/card-data/scryfall.live.test.ts` (new)

**Intent**: Cover the suggestion paths with fixtures, and provide an opt-in real-network smoke test.

**Contract**: Fixture-based cases: a typo ("Sol Rng") yields `suggestion: "Sol Ring"` with reason `not-found`; an ambiguous fragment yields reason `ambiguous`, `suggestion: null`; pure gibberish yields `not-found`, `suggestion: null`. The live test is skipped unless an env flag (e.g. `RUN_LIVE=1`) is set; when run, it resolves a small real list and asserts a real category, image, and price come back.

### Success Criteria:

#### Automated Verification:

- Miss/fuzzy fixture tests pass: `npm run test`
- The live test is skipped by default (does not hit the network in `npm run test`)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Running the gated live test (`RUN_LIVE=1`) succeeds against real Scryfall
- Resolving a list containing a deliberate typo returns the correct `suggestion` for the typo and `resolved` entries for the valid names

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation. F-01 is then complete and S-01 is unblocked.

---

## Testing Strategy

### Unit Tests:

- `classifyType`: every category, precedence overlaps (Artifact Creature, Land Creature, Artifact Land), and fallbacks (Battle, empty).
- `normalizeCard`: single-faced card, multi-faced front-face fallback, missing price (one or both currencies null), missing image.
- `resolveCards`: dedup, chunking >75, `malformed` short-circuit, `not_found` collection.

### Integration Tests:

- Fixture-driven `resolveCards` over a mixed input (valid + typo + gibberish + DFC + duplicate) asserting the full `{ resolved, unresolved }` shape.
- Gated live test (`RUN_LIVE=1`) hitting real Scryfall for a small known list.

### Manual Testing Steps:

1. From the dev console / a throwaway snippet, call `resolveCards(["Sol Ring","Llanowar Elves","Notacard","Sol Rng"])`.
2. Confirm `resolved` has Sol Ring (artifact) and Llanowar Elves (creature) with image + price.
3. Confirm `unresolved` has "Notacard" (`not-found`, no suggestion) and "Sol Rng" (`not-found`, suggestion "Sol Ring").
4. Resolve a DFC ("Delver of Secrets") and confirm front-face image/type.

## Performance Considerations

- Batching keeps a ~200-card two-deck resolution to ≤3 collection requests; dedup + in-session cache eliminate repeat lookups (basic lands, re-pastes within a session).
- Fuzzy suggestions cost one request per miss — fine for a few typos, linear in miss count. If a paste is largely garbage this could be many calls; an optional cap can be added later if it bites, but it is out of scope for F-01.
- Throttling (~75–100 ms between sequential requests) trades a little latency for Scryfall good-citizenship; well within acceptable UX for a paste-then-view flow.

## Migration Notes

None — this is net-new code with no existing data or consumers. The architecture is intentionally swappable: `scryfall.ts` isolates the transport, so a future server-proxy (to add a `User-Agent` and a shared cache) can replace it without changing `resolveCards`'s signature or any consumer.

## References

- Roadmap item: [context/foundation/roadmap.md](context/foundation/roadmap.md) §F-01 (lines 61–73), Open Question #1 (line 142)
- PRD: [context/foundation/prd.md](context/foundation/prd.md) §Success Criteria/Guardrails (37–38), §NFR (89), §Business Logic (93–97)
- Tech stack: [context/foundation/tech-stack.md](context/foundation/tech-stack.md)
- Conventions: [src/lib/supabase.ts](src/lib/supabase.ts), [tsconfig.json](tsconfig.json), [astro.config.mjs](astro.config.mjs)
- Scryfall API (reconfirm at implementation): `https://scryfall.com/docs/api` — `cards/collection`, `cards/named`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test tooling + card contract & classifier

#### Automated

- [x] 1.1 Vitest installs and runs: `npm run test` — 9fcbae6
- [x] 1.2 Classifier tests pass (all 7 buckets + overlaps + fallbacks): `npm run test` — 9fcbae6
- [x] 1.3 Type checking passes: `npx astro check` — 9fcbae6
- [x] 1.4 Linting passes: `npm run lint` — 9fcbae6

#### Manual

- [x] 1.5 `src/lib/card-data/` exists with `types.ts`, `classify.ts`, `index.ts`, `classify.test.ts` — 9fcbae6
- [x] 1.6 `docs/reference/contract-surfaces.md` lists the F-01 contract surfaces — 9fcbae6

### Phase 2: Scryfall batch resolution + normalization

#### Automated

- [x] 2.1 Resolution + normalization tests pass (mocked fetch): `npm run test`
- [x] 2.2 Type checking passes: `npx astro check`
- [x] 2.3 Linting passes: `npm run lint`

#### Manual

- [x] 2.4 `resolveCards(["Sol Ring","Llanowar Elves"])` against live Scryfall returns two resolved cards with category/image/price
- [x] 2.5 A known DFC resolves to its front face with a non-null `imageUrl`

### Phase 3: Unrecognized-name handling + fuzzy suggestions

#### Automated

- [ ] 3.1 Miss/fuzzy fixture tests pass: `npm run test`
- [ ] 3.2 The live test is skipped by default (no network in `npm run test`)
- [ ] 3.3 Type checking passes: `npx astro check`
- [ ] 3.4 Linting passes: `npm run lint`

#### Manual

- [ ] 3.5 Gated live test (`RUN_LIVE=1`) succeeds against real Scryfall
- [ ] 3.6 Resolving a list with a deliberate typo returns the correct `suggestion` plus resolved valid names
