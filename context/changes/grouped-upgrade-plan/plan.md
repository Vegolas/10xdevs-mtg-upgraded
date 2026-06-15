# Grouped Upgrade Plan (types only) — Implementation Plan

## Overview

DeckDelta's north star (roadmap **S-01**): the user pastes a base deck list and a target deck list as plain MTG text and automatically sees an **upgrade plan** — cards to **remove** (in base only), cards to **add** (in target only), and **shared** cards (in both) — each **grouped by card type** (land, creature, instant, sorcery, artifact, enchantment, planeswalker, other). This is **types only**: no images (S-02), prices/totals (S-03), or history (S-04).

The work is a client-side pipeline with three pieces: a tolerant **deck-list parser**, a pure **diff + grouping engine** that runs over the cards F-01 resolves, and a **React island** on the home page that orchestrates the two with debounced resolution and the loading / unresolved / error UX.

## Current State Analysis

- **F-01 (`card-data-resolution`) is implemented and is the only dependency.** It exposes, from `@/lib/card-data` ([index.ts](../../../src/lib/card-data/index.ts)):
  - `resolveCards(names: string[]) => Promise<ResolutionResult>` — takes **already-clean** names, returns `{ resolved: Card[]; unresolved: UnresolvedCard[] }`. It dedups input, caches in-session, and **never throws on an unknown name** (misses land in `unresolved` with a `reason` + `suggestion`).
  - `Card` ([types.ts:21](../../../src/lib/card-data/types.ts)) = `{ name, typeLine, category, imageUrl, priceUsd, priceEur }`. `category` is one of 8 buckets ([classify.ts](../../../src/lib/card-data/classify.ts)). **S-01 only reads `name` and `category`.**
  - `UnresolvedCard` = `{ name, reason: "not-found"|"ambiguous"|"malformed", suggestion: string|null }`.
- **F-01 deliberately left to S-01:** deck-list text parsing, diffing, grouping, and the entire UI (per `card-data-resolution/plan-brief.md` "Out of scope").
- **React-island pattern is established:** an `.astro` page mounts a `.tsx` default-export via `client:load` (e.g. [signin.astro:16](../../../src/pages/auth/signin.astro) → [SignInForm.tsx](../../../src/components/auth/SignInForm.tsx) with local `useState`). The home page is still the starter [Welcome.astro](../../../src/components/Welcome.astro).
- **Tooling is ready:** Vitest runs `src/**/*.test.ts` in a **node** env with the `@/` alias ([vitest.config.ts](../../../vitest.config.ts)); F-01's [resolve.test.ts](../../../src/lib/card-data/resolve.test.ts) (`vi.stubGlobal`/`vi.mock`) is the template. `npm run test`, `astro check`, `npm run lint`, `npm run build` are the gates. Styling = Tailwind 4 + `cn()` ([utils.ts](../../../src/lib/utils.ts)) + lucide-react + [button.tsx](../../../src/components/ui/button.tsx) + theme tokens (`--card`, `--muted-foreground`, `--destructive`, `bg-cosmic`) in [global.css](../../../src/styles/global.css).

## Desired End State

Visiting `/` shows the DeckDelta tool: two text areas (base / target). After the user stops editing, the plan builds automatically and renders a two-column **Remove | Add** view with per-type subsections, a collapsed **Shared cards** disclosure, an inline **building plan…** indicator while resolving, a **notice** listing any unrecognized cards with "did you mean" suggestions (the plan still renders for the cards that resolved), and a **retry-able error banner** if the card database can't be reached. `npm run test`, `astro check`, `npm run lint`, and `npm run build` all pass.

### Key Discoveries:

- **Diff on canonical names, not raw input.** `resolveCards` returns canonical `Card.name` (e.g. `"Delver of Secrets"` → `"Delver of Secrets // Insectile Aberration"`, [resolve.test.ts:223](../../../src/lib/card-data/resolve.test.ts)), and dedups input. So the diff must run over **resolved `Card` objects keyed by `card.name`** — never over the raw pasted strings — or DFCs/normalized names will mis-diff. This also means **quantities cannot be reliably joined back** to resolved cards, which is *why* the set-difference-by-identity rule (below) is the correct MVP shape.
- **The resolver throws only on transport failure.** `fetchCardCollection`/`fetchFuzzyName` throw on a network error or non-2xx ([scryfall.ts:96](../../../src/lib/card-data/scryfall.ts)). Unknown *names* never throw — they return in `unresolved`. So the only `try/catch` the UI needs is around the transient-failure path.
- **`category` ordering/precedence already exists** ([classify.ts:12](../../../src/lib/card-data/classify.ts)); S-01 reuses the resolved `category` verbatim and only decides *display* order of the buckets.
- **Vitest is node-only** — no jsdom — confirming UI is verified manually, and only the pure parser/diff/orchestrator get automated tests.

## What We're NOT Doing

- No card images (S-02), no prices or total upgrade cost (S-03), no saved/on-device history (S-04).
- No Arena/MTGO `(SET) collector` suffix stripping — "common core" parser scope only (see Critical Implementation Details).
- No quantity-aware diff (1→4 copies is "shared", not "add 3"); no copy counts shown.
- No URL/deck-site import, no auth, no mobile-optimized responsive layout (PRD Non-Goals; desktop-first).
- No React component/jsdom test harness (repo has none; would be setup-only cost).
- No changes to F-01's `card-data` module or its contract.

## Implementation Approach

Build bottom-up so each phase is independently verifiable. **Phase 1** is the pure parser (`text → {name, quantity}[]`). **Phase 2** is the pure diff/grouping (`Card[] × Card[] → grouped plan`) plus a thin async **orchestrator** (`generateUpgradePlan(baseText, targetText)`) that composes parse → `resolveCards` → diff and turns the resolver's throw into a typed outcome — all unit-tested with a mocked card-data module. **Phase 3** is presentation only: a React island wired into the home page, holding debounce + stale-guard + view state, calling the Phase 2 orchestrator. Logic and tests carry the risk; the island stays thin.

## Critical Implementation Details

- **Canonical-name join (load-bearing).** Compute the diff *after* resolution, keyed on `Card.name`. Build a `Map<string, Card>` per deck from each `resolveCards` result; `remove` = base-keys ∖ target-keys, `add` = target-keys ∖ base-keys, `shared` = base-keys ∩ target-keys. Do not key on the pasted strings.
- **Transient-failure path.** `generateUpgradePlan` wraps the `resolveCards` calls in `try/catch` and returns an `error` outcome; the island renders a retry banner that re-runs the same inputs. Unknown names are *not* errors — they flow through `unresolved`.
- **Stale-response ordering.** Debounced async runs can finish out of order. Guard each run with a monotonically increasing request token (a `useRef` counter); when a run resolves, apply its result only if its token is still the latest. Otherwise a slow earlier resolution can clobber a newer plan.
- **No lookup until both decks have content.** The orchestrator parses first and short-circuits to an `empty` outcome when either parsed deck has zero entries — so no Scryfall request fires until both sides have real cards (Scryfall etiquette + FR-003's "valid content" trigger).

---

## Phase 1: Deck-list parser

### Overview

A pure, tolerant parser that turns pasted deck-list text into structured entries, ignoring the noise common to Moxfield/Archidekt/plain-text exports.

### Changes Required:

#### 1. Parser module

**File**: `src/lib/deck/parse.ts`

**Intent**: Convert raw textarea content into a clean list of card entries the resolver can consume, dropping blank lines, comments, and section headers so they never become bogus "unrecognized card" errors.

**Contract**:
- `interface DeckEntry { name: string; quantity: number }`
- `interface ParsedDeck { entries: DeckEntry[]; malformed: string[] }`
- `parseDeckList(text: string): ParsedDeck`
- Per non-empty line, in order: trim; skip if blank; skip if a comment (`#…` or `//…`); skip if a section header (case-insensitive standalone keyword, optionally followed by a parenthesized count — `Commander`, `Deck`, `Sideboard`, `Maybeboard`, `Companion`, optionally `(\d+)`); otherwise extract `quantity` + `name` from a leading-count form `^(\d+)\s*[xX]?\s+(.+)$` (e.g. `1 Sol Ring`, `4x Forest`), defaulting `quantity` to `1` for a bare `Name` line. `name` is the remainder, trimmed. A non-skipped line that yields no name (e.g. a lone `4` or `4x`) goes to `malformed`. Set-code/collector suffixes are **not** stripped (common-core scope) — they remain part of `name` and surface later as unresolved.

#### 2. Parser tests

**File**: `src/lib/deck/parse.test.ts`

**Intent**: Lock the format-tolerance contract (the roadmap's flagged unknown) so edge bugs can't regress silently.

**Contract**: Vitest cases (mirroring F-01's style) covering: `N Name`, `Nx Name`, bare `Name`; blank lines and `#`/`//` comments skipped; section headers (`Commander`, `Deck (99)`, `Sideboard`) skipped; duplicate lines preserved as separate entries with their quantities; a count-only line → `malformed`; mixed real-world paste → correct `entries`. No network, no mocks.

### Success Criteria:

#### Automated Verification:

- [ ] Parser unit tests pass: `npm run test`
- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Pasting a representative Moxfield/Archidekt export (with a `Deck (99)` header and a `// comment`) yields only real card names, no header/comment entries.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Diff, grouping & plan orchestration

### Overview

The pure diff/grouping engine over resolved cards, plus the async orchestrator that composes parse → resolve → diff into one typed outcome.

### Changes Required:

#### 1. Diff + grouping (pure)

**File**: `src/lib/deck/diff.ts`

**Intent**: Compute the add/remove/shared sets by canonical card identity and group each set by card type in a fixed display order, omitting empty types.

**Contract**:
- `interface CardGroup { category: CardCategory; cards: Card[] }`
- `interface UpgradePlan { remove: CardGroup[]; add: CardGroup[]; shared: CardGroup[] }`
- `const CATEGORY_ORDER: readonly CardCategory[]` = `["land","creature","instant","sorcery","artifact","enchantment","planeswalker","other"]`
- `diffDecks(base: Card[], target: Card[]): UpgradePlan` — diff keyed on `card.name` (see Critical Implementation Details); within each bucket, group by `card.category`, emit `CardGroup[]` ordered by `CATEGORY_ORDER` with empty categories (incl. `other` when empty) omitted; cards within a group sorted by `name`.

#### 2. Async orchestrator

**File**: `src/lib/deck/plan.ts`

**Intent**: Single entry point the UI calls — parse both texts, resolve both decks, diff, and merge both decks' unresolved cards; surface the resolver's transient throw as a typed error rather than letting it bubble.

**Contract**:
- `interface UnresolvedEntry { name: string; reason: UnresolvedReason; suggestion: string | null; deck: "base" | "target" }`
- `type PlanOutcome = { status: "ok"; plan: UpgradePlan; unresolved: UnresolvedEntry[] } | { status: "empty" } | { status: "error"; message: string }`
- `generateUpgradePlan(baseText: string, targetText: string): Promise<PlanOutcome>` — parse both; if either `entries` is empty → `{ status: "empty" }` (no network). Else `resolveCards(baseNames)` then `resolveCards(targetNames)` **sequentially** (warms F-01's cache, Scryfall-polite); on any throw → `{ status: "error", message }`. Otherwise `diffDecks(baseResolved, targetResolved)` and concatenate both `unresolved[]` tagged by `deck`. Parser-level `malformed` lines are folded in as `reason: "malformed"` entries tagged by deck.

#### 3. Module barrel

**File**: `src/lib/deck/index.ts`

**Intent**: Public import surface for the deck module, mirroring `card-data/index.ts`.

**Contract**: Re-export `parseDeckList` + parse types, `diffDecks` + `UpgradePlan`/`CardGroup`/`CATEGORY_ORDER`, and `generateUpgradePlan` + `PlanOutcome`/`UnresolvedEntry`. Consumers import from `@/lib/deck`.

#### 4. Diff tests

**File**: `src/lib/deck/diff.test.ts`

**Intent**: Cover the diff/grouping semantics — the logic-dense, bug-prone core. (Limited-testing decision: the async orchestrator `generateUpgradePlan` gets **no unit test**; its `ok`/`empty`/`error` paths are exercised by Phase 3's manual criteria to keep this heavy phase manageable.)

**Contract**: `diff.test.ts` (pure, no mocks): add/remove/shared partition correctness; grouping order follows `CATEGORY_ORDER`; empty categories omitted; identical inputs → empty add/remove, all shared; same canonical name in both → shared (incl. a DFC-style `// `-joined name).

#### 5. Contract-surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the new load-bearing names S-02/S-03 will build on (they enrich the same `CardGroup`/`UpgradePlan`).

**Contract**: Add a "Deck diff (roadmap S-01 · `grouped-upgrade-plan`)" section with rows for `parseDeckList`, `diffDecks`, `UpgradePlan`, `CardGroup`, and `generateUpgradePlan`, noting the module entry point `@/lib/deck`.

### Success Criteria:

#### Automated Verification:

- [ ] Diff unit tests pass: `npm run test`
- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] `contract-surfaces.md` lists the new S-01 surfaces and reads consistently with the F-01 section.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: UI — home page + React island

### Overview

Replace the starter home page with the DeckDelta tool: a React island that holds input/debounce/view state and renders the grouped plan, loading, unresolved, and error states.

### Changes Required:

#### 1. Main island

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: The interactive surface — two text areas plus the results view — auto-building the plan ~700ms after edits settle, guarding against stale async results, and rendering each outcome state.

**Contract**: Default-export React component (no props). Local state for `baseText`, `targetText`, and a view state derived from `PlanOutcome` (`idle` | `loading` | `ready` | `error`), plus `sharedOpen`. A debounced effect (~700ms) fires only when **both** text areas are non-blank; it stamps a request token (`useRef` counter), sets `loading`, calls `generateUpgradePlan`, and applies the result only if the token is still current (stale-guard). Text areas stay editable during `loading`. Renders: idle hint; inline "Building plan…" indicator; on `error`, an `ErrorBanner` with a Retry that re-invokes the last inputs; on `ok`, the `UnresolvedNotice` (when non-empty) above a two-column **Remove | Add** layout of `CardGroupColumn`s and the `SharedCardsDisclosure`. When add and remove are both empty, show an "identical lists" note above the shared section.

#### 2. Presentational children

**File**: `src/components/deck/CardGroupColumn.tsx`, `src/components/deck/UnresolvedNotice.tsx`, `src/components/deck/SharedCardsDisclosure.tsx`

**Intent**: Keep `DeckComparer` thin by splitting the three render concerns into focused, prop-driven components.

**Contract**:
- `CardGroupColumn({ title, groups }: { title: string; groups: CardGroup[] })` — renders a labeled column; one subsection per `CardGroup` with a human label (plural: Lands/Creatures/Instants/Sorceries/Artifacts/Enchantments/Planeswalkers/Other) and its card names; empty `groups` → a muted "No changes" line.
- `UnresolvedNotice({ entries }: { entries: UnresolvedEntry[] })` — a `--destructive`-toned panel: count headline, then each name with its deck, reason, and `suggestion` rendered as "did you mean **X**?" when present.
- `SharedCardsDisclosure({ groups, open, onToggle }: { groups: CardGroup[]; open: boolean; onToggle: () => void })` — collapsed control "Shared cards (N) — show/hide" (N = total cards across groups) using a lucide chevron; expands to the grouped list. Reuses the category-label map.

A small shared `categoryLabel(category)` helper (e.g. co-located in `CardGroupColumn.tsx` or a `labels.ts`) maps `CardCategory` → display string for both the columns and the disclosure.

#### 3. Home page wiring

**File**: `src/pages/index.astro`

**Intent**: Make the tool the front door; mount the island inside the existing `Layout` with a minimal page heading (not a marketing hero).

**Contract**: Replace the `Welcome` import/usage with `<Layout title="DeckDelta">` wrapping a simple heading/subtitle and `<DeckComparer client:load />`. Use existing theme tokens for layout; no new global CSS.

#### 4. Starter cleanup

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Remove now-dead starter content so the home page has a single source of truth.

**Contract**: Delete `Welcome.astro` (no longer imported) and `Topbar.astro` (only used by `Welcome`). Leave `Banner.astro` (still used by `Layout`) and the auth pages untouched.

### Success Criteria:

#### Automated Verification:

- [ ] Full test suite passes: `npm run test`
- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] Pasting a base list and a target list auto-builds the plan ~0.7s after typing stops, with no compare button.
- [ ] Remove and Add render in two columns, grouped by type in fixed order; empty types are hidden.
- [ ] Shared cards are collapsed by default and expand on click with a correct count.
- [ ] A deliberate typo (e.g. `Sol Rng`) appears in the unresolved notice with a "did you mean Sol Ring?" suggestion while the rest of the plan still renders.
- [ ] Simulating an offline/failed lookup shows the retry banner, and Retry rebuilds the plan once connectivity returns.
- [ ] Rapid edits never leave a stale plan on screen (newer result always wins).
- [ ] Identical base/target lists show the "identical lists" note and all cards under Shared.

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- **Parser** (`parse.test.ts`): format variants, comment/header/blank skipping, quantity extraction, malformed lines.
- **Diff** (`diff.test.ts`): add/remove/shared partitioning by canonical name, grouping order, empty-bucket omission, identical-list and DFC-name cases.

> Limited-testing decision: the async orchestrator (`generateUpgradePlan`) gets **no unit test** — its `ok`/`empty`/`error` paths are exercised by Phase 3's manual criteria (typo notice, offline retry, identical lists, empty side) to keep heavy Phase 2 manageable.

### Integration Tests:

- None automated (no jsdom harness). Parse + resolve + diff compose only in `generateUpgradePlan`, verified manually in Phase 3.

### Manual Testing Steps:

1. Paste two real EDH lists; confirm the plan builds automatically and grouping looks right.
2. Introduce a typo and a stray comment line; confirm the notice + suggestion and that the comment isn't treated as a card.
3. Toggle the shared disclosure; confirm count and contents.
4. Go offline (or block `api.scryfall.com` in devtools); confirm the retry banner and recovery.
5. Edit rapidly; confirm no stale plan and inputs stay editable during loading.

## Performance Considerations

Resolution is throttled (~100ms/batch + a fuzzy lookup per miss), so a fresh 100-card deck can take a few seconds; the inline indicator covers it and F-01's in-session cache makes re-paste/overlap cheap. The ~700ms debounce prevents per-keystroke requests. Rendering is plain text rows (no images yet), so list size is not a render concern at MVP scale.

## Migration Notes

No data or schema migration. The only removals are starter-only `Welcome.astro`/`Topbar.astro`; `Layout`, `Banner`, auth, and the card-data module are untouched.

## References

- Roadmap S-01: `context/foundation/roadmap.md` (At a glance → `grouped-upgrade-plan`)
- PRD: US-01, FR-001–FR-004, FR-008; Guardrails (accuracy, graceful input) — `context/foundation/prd.md`
- Prerequisite F-01 contract: `context/changes/card-data-resolution/plan-brief.md`, `docs/reference/contract-surfaces.md`
- Resolver + types consumed: `src/lib/card-data/index.ts`, `src/lib/card-data/types.ts`, `src/lib/card-data/resolve.ts`
- Island pattern: `src/pages/auth/signin.astro` + `src/components/auth/SignInForm.tsx`
- Test pattern: `src/lib/card-data/resolve.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Deck-list parser

#### Automated

- [x] 1.1 Parser unit tests pass: `npm run test`
- [x] 1.2 Type checking passes: `npx astro check`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 Real Moxfield/Archidekt paste yields only real card names (no header/comment entries)

### Phase 2: Diff, grouping & plan orchestration

#### Automated

- [ ] 2.1 Diff unit tests pass: `npm run test`
- [ ] 2.2 Type checking passes: `npx astro check`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 `contract-surfaces.md` lists the new S-01 surfaces consistently with F-01

### Phase 3: UI — home page + React island

#### Automated

- [ ] 3.1 Full test suite passes: `npm run test`
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`
- [ ] 3.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.5 Plan auto-builds ~0.7s after edits settle, no compare button
- [ ] 3.6 Two-column Remove|Add grouped by type in fixed order; empty types hidden
- [ ] 3.7 Shared cards collapsed by default, expand with correct count
- [ ] 3.8 Typo shows in unresolved notice with "did you mean" while plan still renders
- [ ] 3.9 Failed lookup shows retry banner; Retry rebuilds on recovery
- [ ] 3.10 Rapid edits never leave a stale plan (newer result wins)
- [ ] 3.11 Identical lists show the "identical lists" note with all cards under Shared
