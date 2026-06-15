# DFC Name Resolution + Per-Group Counts Implementation Plan

## Overview

Double-faced / split / adventure / MDFC cards never resolve in the upgrade plan because the resolver sends the full `Front // Back` name to Scryfall's `/cards/collection` endpoint, which matches a `name` identifier only against the **front face**. The full name returns `not_found`, falls through to the fuzzy fallback, and surfaces an unhelpful "did you mean `Spiked Corridor // Torture Pit`?" — a suggestion identical to the input. Because most exporters (MTGGoldfish, etc.) emit the full `//` name, every DFC currently misses, and when two decks list the same DFC in different forms (front-only vs full `//`), one side resolves and the other lands in "unresolved" — inflating remove/add counts and pushing genuinely-shared cards out of "Shared".

This plan reduces any `Front // Back` input to its front face **before** the collection request, keying dedup and the session cache on that front-face form so the canonical `Card.name` (the diff key) stays correct and the two forms of a card collapse to one lookup. The original input spelling is preserved for `unresolved` / "did you mean" reporting. It then adds distinct-card count badges to each card-type group in the two upgrade-plan components.

## Current State Analysis

The resolver lives in `src/lib/card-data/` and is split into a transport layer and an orchestrator:

- **`scryfall.ts:85-101`** — `fetchCardCollection(names)` maps each name to `{ name }` and POSTs `{ identifiers }` to `/cards/collection`. It performs exactly one request; chunking/throttling live in the orchestrator. This is the only file that knows Scryfall's wire shapes.
- **`resolve.ts:47-114`** — `resolveCards(names)` dedups input by `normalizeKey(name)` into `uniqueByKey: Map<key, originalName>` (preserving first-seen original spelling), serves session-cache hits, batches the rest through `fetchCardCollection`, normalizes `response.data` into `Card[]`, caches each by `normalizeKey(card.name)`, collects `response.not_found[].name` into `missedNames`, then runs a sequential fuzzy lookup per miss to produce `UnresolvedCard`s.
- **`types.ts:20-56`** — `Card.name` is the canonical Scryfall name (for DFCs the full `A // B`); it is the diff key in `src/lib/deck/diff.ts`. `UnresolvedCard.name` is documented as "the input name that failed to resolve".

The upgrade-plan UI:

- **`src/components/deck/CardGroupColumn.tsx`** and **`src/components/deck/SharedCardsDisclosure.tsx`** each render one `<h4>` per group via `categoryLabel(group.category)` (e.g. "Lands"). `CardGroup` (`src/lib/deck/diff.ts:17-21`) is `{ category, cards: Card[] }` — no quantity field. `CardGroupColumn` already renders a column-level total as a muted span (`text-xs font-normal text-blue-100/50`), establishing the count-badge style precedent. The category label render is shared between both components.

### Key Discoveries:

- The orchestrator already keeps an original-name map (`uniqueByKey`, `resolve.ts:53`), so "preserve original spelling on a miss" fits the existing structure with no new bookkeeping type.
- `not_found` echoes back **exactly the identifier we sent** (`resolve.ts:96-98`). After truncation the echo is the front-face name, so reporting the original requires mapping the echo's key back through the dedup map.
- The session cache **stores** by `normalizeKey(card.name)` (`resolve.ts:91`) — the canonical *full* name. If lookups key on the front-face form, the store **must also** key on the front-face form, or a later front-only lookup of an already-cached DFC misses the cache and re-fetches. This is the one load-bearing spot.
- For a non-DFC name (no `//`), `frontFace(name)` returns the trimmed name unchanged, so all existing behavior is preserved.
- The test harness (`resolve.test.ts`) records `requestedBatches` (identifiers actually sent) and keys `KNOWN_CARDS` by lowercased name, with `"delver of secrets"` already mapped via `collection-dfc.json` whose canonical `data[0].name` is `"Delver of Secrets // Insectile Aberration"`. This lets a new test assert front-only was *sent* and the canonical `//` name came *back*, reusing the existing fixture.
- `CardGroup` carries no quantity, so a count badge can only be distinct-card count (`group.cards.length`); a quantity sum would require a data-model change (out of scope).

## Desired End State

- A deck list exported with full `//` DFC names resolves every DFC: `Card.name` is the canonical `A // B` name regardless of whether the exporter wrote the front-only or full form.
- Two decks listing the same DFC in different forms (front-only vs full) both resolve to the same canonical name and land in "Shared" — remove/add counts reflect only genuine differences.
- A genuine miss of a `//` input reports the **original** pasted spelling in `unresolved`, with the "did you mean" suggestion (when any) derived from a fuzzy lookup on the front-face.
- Each card-type group in the Remove, Add, and Shared sections shows a distinct-card count next to its label, styled like the existing column total.

Verify: resolver unit tests pass (front-only sent for a `//` input; original echoed on a genuine `//` miss); a real base/target decklist pair with mixed-form DFCs produces sane remove/add counts and correct grouping; badges render and the numbers match the cards listed.

## What We're NOT Doing

- Not changing the parser or how set-code / collector-number suffixes are handled (S-01 deliberately leaves them on the name). If remove/add still looks off after this fix, that secondary cause becomes a **separate** follow-up change — not this one.
- Not adding card images or prices (S-02 / S-03).
- Not threading deck-list quantities through parser → diff → group; the count badge is distinct cards only.
- Not adding component-level tests or a jsdom/render harness; the badges are covered by manual verification.
- Not changing the fuzzy transport (`fetchFuzzyName`) or the `/cards/collection` transport signature.

## Implementation Approach

Introduce a single `frontFace(name)` helper in `resolve.ts` and route every name-keyed operation in the orchestrator through it: dedup key, cache lookup key, cache store key, and the identifier list sent to Scryfall. Keep the dedup map's *value* as the original input so misses report the pasted spelling. Map each `not_found` echo (a front-face name) back to its original via the dedup map; run the fuzzy lookup on the front-face echo but build the `UnresolvedCard` with the original name. The transport layer (`scryfall.ts`) is untouched — it keeps receiving a clean list of names to send.

For the UI, append a muted count span to each per-group `<h4>` in both components, reusing the existing column-total span styling.

## Critical Implementation Details

- **Cache-key consistency (load-bearing):** the cache *store* at `resolve.ts:91` currently uses `normalizeKey(card.name)`. It must change to key on the front-face of the canonical name (`normalizeKey(frontFace(card.name))`) so that a subsequent lookup — whether the caller passes the front-only or the full `//` form — hits the cache. Lookup and store must use the *same* derivation. This is the single spot where a mistake silently degrades to a cache miss + re-fetch rather than a visible failure.
- **Empty front face:** an input like `// Back` (or `//`) reduces to an empty front. Treat it the same as a blank name — push `{ name: <original>, reason: "malformed", suggestion: null }` and make no API call.

## Phase 1: Resolver — front-face DFC resolution

### Overview

Reduce `Front // Back` inputs to the front face before the collection request, keyed consistently through dedup and the session cache, while preserving the original spelling for miss reporting. Add unit tests proving the fix.

### Changes Required:

#### 1. Front-face helper

**File**: `src/lib/card-data/resolve.ts`

**Intent**: Add a small pure helper that reduces any name to its front face, so every name-keyed operation in the orchestrator can route through one definition.

**Contract**: `function frontFace(name: string): string` — returns the substring before the first `//`, trimmed; for a name with no `//` returns the trimmed name unchanged. Splitting on `//` and taking index 0 then trimming is sufficient.

#### 2. Orchestrator: front-face keying + original-name preservation

**File**: `src/lib/card-data/resolve.ts`

**Intent**: Route dedup, cache lookup, cache store, and the fetch identifier list through the front face, while keeping the dedup map's value as the original input so misses can report the pasted spelling. Map the `not_found` echo back to the original and run fuzzy on the front-face.

**Contract**: Touches `resolveCards` (`resolve.ts:47-114`):
- Dedup loop: key on `normalizeKey(frontFace(name))`; store the original `name` as the value (unchanged shape: `Map<string, string>`). Blank **or empty-front-face** names short-circuit to `{ name, reason: "malformed", suggestion: null }`.
- Cache lookup: the existing `for (const [key, name] of uniqueByKey)` already iterates by the (now front-face) key — `sessionCache.get(key)` is correct once the store key matches.
- `toFetch`: push `frontFace(name)` (not the original) so front-only identifiers are sent.
- Cache store (`resolve.ts:91`): change to key on `normalizeKey(frontFace(card.name))`.
- Miss handling (`resolve.ts:96-110`): for each `not_found` echo, look up the original input via the dedup map keyed on `normalizeKey(miss.name)`; run `fetchFuzzyName` on the front-face echo; build the `UnresolvedCard` with `name = <original input>` (falling back to the echo if no map entry).

The original-name lookup needs the dedup map (or a parallel `Map<frontKey, originalName>`) in scope at miss-handling time — keep `uniqueByKey` available there rather than discarding it after the cache pass.

#### 3. Resolver unit tests

**File**: `src/lib/card-data/resolve.test.ts`

**Intent**: Add two tests mirroring the existing harness style (no new mocking machinery) that pin the fix.

**Contract**: Within the `describe("resolveCards", ...)` block:
- Test A — full `//` input resolves via front face: call `resolveCards(["Delver of Secrets // Insectile Aberration"])` with `collection: scryfallResponder`; assert `requestedBatches[0]` equals `["Delver of Secrets"]` (front-only sent), `result.resolved[0].name` equals `"Delver of Secrets // Insectile Aberration"` (canonical returned), and `result.unresolved` is empty.
- Test B — genuine `//` miss echoes the original: call `resolveCards(["Madeup Card // Fake Back"])` with `collection: scryfallResponder` and a `fuzzy` handler returning 404 not-found; assert `result.unresolved[0].name` equals the full original `"Madeup Card // Fake Back"` (not the truncated front), `reason` is `"not-found"`, and `fuzzyQueries` contains the front-face `"Madeup Card"`.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm run test`
- [ ] New resolver tests (front-only-sent, original-echoed-on-miss) are present and green
- [ ] Type checking passes: `npm run build` (or the project's `tsc`/astro check step)
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Paste a real base/target decklist pair where DFCs appear in mixed forms (front-only on one side, full `//` on the other); confirm every DFC resolves, none appears in "unresolved", and shared DFCs land in "Shared"
- [ ] Confirm remove/add counts are plausible (no DFC-driven inflation like the reported "remove 18 / add 20")
- [ ] Confirm a genuinely misspelled card still shows a "did you mean" suggestion using the spelling the user typed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: UI — per-group count badges

### Overview

Show a distinct-card count next to each card-type label in the Remove, Add, and Shared sections, styled like the existing column total.

### Changes Required:

#### 1. CardGroupColumn count badge

**File**: `src/components/deck/CardGroupColumn.tsx`

**Intent**: Append a muted count after each per-group label so the user sees how many cards are in each card-type group.

**Contract**: In the per-group `<h4>` that renders `categoryLabel(group.category)`, append a count span using the same muted style as the existing column total (`text-xs font-normal text-blue-100/50`); the value is `group.cards.length`. No props or data-shape changes.

#### 2. SharedCardsDisclosure count badge

**File**: `src/components/deck/SharedCardsDisclosure.tsx`

**Intent**: Same per-group count next to each label inside the expanded shared section.

**Contract**: Mirror the CardGroupColumn change on this component's per-group `<h4>` (same `categoryLabel` render, same muted count span, `group.cards.length`). No props or data-shape changes.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Each card-type group in Remove, Add, and the expanded Shared section shows a count matching the number of cards listed under it
- [ ] Badge styling matches the existing column-total style and reads cleanly next to the label
- [ ] Empty groups are still omitted (no `(0)` badges appear)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Front-only identifier is sent for a full `//` input; canonical `//` name is returned and used as `Card.name`.
- A genuine `//` miss reports the original full input in `unresolved.name`, with the fuzzy query run on the front-face.
- Existing tests (dedup, cache, batching, malformed, fuzzy taxonomy) remain green — the front-face helper is a no-op for non-DFC names.

### Integration Tests:

- Covered by the manual real-decklist verification in Phase 1 (no automated network/integration test is added; the resolver tests mock fetch).

### Manual Testing Steps:

1. Paste a base and target decklist that each contain DFCs, with at least one DFC written front-only on one side and full `//` on the other.
2. Confirm all DFCs resolve, none lands in "unresolved", and shared DFCs appear in "Shared".
3. Confirm remove/add counts are plausible.
4. Misspell a card name and confirm the "did you mean" uses the typed spelling.
5. Confirm the per-group count badges match the cards listed in each group across Remove / Add / Shared.

## Performance Considerations

Keying dedup and cache on the front face can only reduce request volume (the two forms of a DFC now collapse to one identifier and one cache entry). No new requests are introduced.

## Migration Notes

None — no persisted data or schema. The session cache is in-memory; its key derivation changes but it is rebuilt per session.

## References

- Change identity: `context/changes/dfc-name-resolution/change.md`
- Resolver orchestrator: `src/lib/card-data/resolve.ts:47-114`
- Collection transport: `src/lib/card-data/scryfall.ts:85-101`
- Card / UnresolvedCard types: `src/lib/card-data/types.ts:20-56`
- Existing test harness: `src/lib/card-data/resolve.test.ts`
- DFC fixture (reused): `src/lib/card-data/__fixtures__/collection-dfc.json`
- Group components: `src/components/deck/CardGroupColumn.tsx`, `src/components/deck/SharedCardsDisclosure.tsx`
- Group type + label helper: `src/lib/deck/diff.ts:17-21`, `src/components/deck/labels.ts`
- Predecessors: `grouped-upgrade-plan` (S-01), `card-data-resolution` (F-01)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Resolver — front-face DFC resolution

#### Automated

- [x] 1.1 Unit tests pass: `npm run test`
- [x] 1.2 New resolver tests (front-only-sent, original-echoed-on-miss) present and green
- [x] 1.3 Type checking passes: `npm run build`
- [x] 1.4 Linting passes: `npm run lint`

#### Manual

- [x] 1.5 Real mixed-form DFC decklist pair: all DFCs resolve, none unresolved, shared DFCs in "Shared"
- [x] 1.6 Remove/add counts plausible (no DFC-driven inflation)
- [x] 1.7 Misspelled card still suggests "did you mean" using the typed spelling

### Phase 2: UI — per-group count badges

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 Each group in Remove/Add/Shared shows a count matching its listed cards
- [ ] 2.4 Badge styling matches the existing column-total style
- [ ] 2.5 Empty groups still omitted (no `(0)` badges)
