# On-Device Comparison History Implementation Plan

## Overview

Add an on-device history of past comparisons to DeckDelta (roadmap S-04 / FR-009, the Secondary success criterion). The user can explicitly **save** the current comparison, open a **slide-over drawer** listing past saves with auto-derived labels, and click an entry to **revisit** it — which refills the two textareas and lets the existing debounce rebuild the plan. History is **inputs-only** (the two deck-list texts plus a tiny label summary), persisted to `localStorage`, deduped by identical lists, capped at the newest ~30, with per-entry delete and a confirmed Clear all.

This is a nice-to-have enricher over the existing comparison engine (S-01, done). It is additive — no change to the diff/resolve/cost pipeline.

## Current State Analysis

The comparison surface is a single `client:load` React island, `src/components/deck/DeckComparer.tsx`, that owns all state:

- `baseText`, `targetText` — controlled textarea values (plain strings).
- `view: View` — a tagged union `idle | loading | ready | error`.
- `sharedOpen` — disclosure toggle for shared cards.
- A `requestToken` ref guarding against stale async runs.

The plan auto-builds ~700ms after both textareas settle, via a debounced `useEffect` → `generateUpgradePlan(base, target)` → Scryfall lookup → `diffDecks`. See `src/components/deck/DeckComparer.tsx:31-74`.

### Key Discoveries:

- **The plan result is fully JSON-serializable** — `PlanOutcome`'s `ok` case (`{ plan, unresolved }`) bottoms out in `Card` objects whose every field is a primitive or `null` (`src/lib/card-data/types.ts:21-34`). `JSON.stringify` works with no custom serializer. (We are not persisting the plan — but this confirms the summary we *do* persist is trivially serializable.)
- **Zero existing storage code** — no `localStorage`/`sessionStorage`/`IndexedDB`/state lib anywhere in `src/`. The closest pattern is the in-memory `Map` session cache in `src/lib/card-data/resolve.ts`. We are greenfield for persistence.
- **Restore is "set the two texts."** Setting `baseText`/`targetText` re-triggers the debounced `useEffect` at `src/components/deck/DeckComparer.tsx:59-74`, which rebuilds the plan. So revisiting a saved comparison needs no new rendering path — just repopulate the inputs and the existing pipeline takes over.
- **House testing boundary:** Vitest runs in the **node** env only (`vitest.config.ts`), with no jsdom/RTL. Pure functions in `src/lib/**` get unit tests (`describe`/`it`/`expect` from `vitest`); React components are verified manually. Plan logic therefore lives in a pure, node-testable `src/lib/history/` module; the React drawer + wiring are manually verified.
- **Style rules** (root `CLAUDE.md`): strict TS, brackets / no one-liners, `cn()` from `@/lib/utils` for Tailwind classes (no manual string concat), no `"use client"`, prefix intentionally-unused vars with `_`. `lucide-react` is the icon library already in use (`RotateCw` in DeckComparer).
- **Deferred-enhancements** (sorting, alt-vendor pricing, did-you-mean accept) are unrelated to this slice and stay untouched.

## Desired End State

A user who has just generated an upgrade plan sees a **Save this comparison** button. Clicking it stores the comparison on-device. A **History (N)** button opens a slide-over drawer listing saved comparisons, newest first, each labeled with its save date/time and a short `+adds / −removes` summary. Clicking an entry closes the drawer, refills both textareas, and the plan rebuilds automatically. Each entry can be deleted; a Clear all (with confirmation) empties the list. Saving identical lists again updates the existing entry rather than duplicating. History survives page reloads and is lost only if the user clears browser data (accepted per PRD).

**Verification:** save a comparison, reload the page, open the drawer, click the entry, confirm both textareas refill and the same plan rebuilds. Confirm dedup, cap, delete, and Clear all behave as specified. `npm run test`, `npm run lint`, and `npm run build` all pass.

## What We're NOT Doing

- **No full-result snapshot.** Prices, images, and the computed plan are not stored; they are re-derived fresh on revisit (inputs-only, by decision).
- **No offline / instant revisit.** Revisit performs a fresh Scryfall lookup (brief "Building plan…"). Prices may differ from when saved — acceptable; prices are explicitly approximate per the PRD.
- **No backend / cross-device sync.** On-device only (privacy NFR).
- **No cross-tab live sync** (no `storage` event listener). Other tabs see saved entries only after their own reload.
- **No user-named or renameable entries.** Labels are auto-derived.
- **No separate `/history` route and no inline always-visible list.** The drawer is the only surface.
- **No export / import of history.**
- **No auto-save.** Saving is explicit.
- **No changes to the diff / resolve / cost pipeline** or the deferred-enhancements backlog.

## Implementation Approach

Two phases. **Phase 1** builds a pure, node-testable history module (`src/lib/history/`): the `SavedComparison` type, the pure transforms (dedup, cap, delete, clear, input-normalization key, label summary), and a versioned, defensively-parsed `localStorage` bridge. **Phase 2** builds the React surface: a `HistoryDrawer` component and a thin `useDeckHistory` hook, wired into `DeckComparer` with a History button, a Save button, and a restore handler that simply sets the two texts.

The split follows the repo's test boundary: everything verifiable by unit test lands in Phase 1; everything verified manually lands in Phase 2.

## Critical Implementation Details

- **Restore must not fight the debounce.** The restore handler sets `baseText` + `targetText` and closes the drawer — nothing more. It must NOT call `runPlan` directly and must NOT inject a `ready` view, or the plan would build twice / clobber. The existing `useEffect` at `src/components/deck/DeckComparer.tsx:59-74` is the single rebuild path.
- **SSR / hydration safety.** `DeckComparer` is `client:load`, but `localStorage` must be touched only inside effects/handlers, never during render or module init. Load history in a mount `useEffect` (guard `typeof window !== "undefined"`); the first render shows an empty history until that effect runs. This avoids a hydration mismatch.
- **Node test env has no `localStorage`.** Keep parse/serialize/dedup/cap/summary as pure functions over plain values; expose `parseHistory(raw: string | null)` and `serializeHistory(items)` so they are testable without touching `localStorage`. The `loadHistory`/`saveHistory` wrappers are the only impure code and are excluded from unit tests (mirrors the repo's lib-tested / component-manual boundary).
- **Label summary is a deliberate small denormalization.** We persist `addCount` / `removeCount` (derived from the plan at save time) so the drawer can label entries without re-running a lookup. This is metadata for the label only — the plan itself is still re-derived on revisit, consistent with the inputs-only decision.

## Phase 1: History store (pure lib + persistence)

### Overview

Create `src/lib/history/` holding the data model, the pure list transforms, the label-summary helper, and a versioned localStorage bridge. Unit-test every pure function.

### Changes Required:

#### 1. History types

**File**: `src/lib/history/types.ts`

**Intent**: Define the persisted entry and the storage envelope. An entry is inputs-only plus identity, timestamp, and a tiny label summary.

**Contract**:
- `SavedComparison`: `{ id: string; baseText: string; targetText: string; savedAt: number; summary: { addCount: number; removeCount: number } }` (`savedAt` is epoch ms).
- `HistoryEnvelope`: `{ version: number; items: SavedComparison[] }` — the shape actually written to localStorage. Export a `HISTORY_VERSION = 1` constant and a `HISTORY_CAP = 30` constant.

#### 2. Pure list transforms

**File**: `src/lib/history/history.ts`

**Intent**: All history mutations as pure functions over a `SavedComparison[]`, plus the input-normalization key used for dedup and the plan→summary helper. No I/O.

**Contract**:
- `historyKey(baseText: string, targetText: string): string` — normalizes both texts (normalize line endings, trim each line's trailing whitespace, drop blank lines, trim overall) and joins them into one comparison key. Deterministic; drives dedup.
- `summarizePlan(plan: UpgradePlan): { addCount: number; removeCount: number }` — sums card quantities across `plan.add` groups and `plan.remove` groups respectively. Imports `UpgradePlan` from `@/lib/deck`.
- `addComparison(items, entry): SavedComparison[]` — if an existing entry has the same `historyKey`, replace it (carry a new `savedAt`, move to front); otherwise prepend. Then truncate to `HISTORY_CAP` (drop oldest). Returns a new array (no mutation).
- `deleteComparison(items, id): SavedComparison[]` — return a new array without the matching id.
- `clearComparisons(): SavedComparison[]` — return `[]`.
- `makeComparison(baseText, targetText, plan, id, savedAt): SavedComparison` — assemble an entry (id + savedAt injected by the caller so this stays pure/testable).

#### 3. Versioned localStorage bridge

**File**: `src/lib/history/storage.ts`

**Intent**: Bridge the pure model to `localStorage` under a versioned envelope, parsing defensively so corrupt or old-schema data degrades to an empty history instead of crashing (PRD graceful-handling guardrail).

**Contract**:
- `STORAGE_KEY = "deckdelta.history.v1"`.
- `parseHistory(raw: string | null): SavedComparison[]` — **pure**, testable: `null`/empty → `[]`; JSON parse failure → `[]`; missing/mismatched `version` → `[]`; otherwise validate each item's shape and keep only well-formed entries (truncated to `HISTORY_CAP`).
- `serializeHistory(items: SavedComparison[]): string` — **pure**: wrap in `{ version: HISTORY_VERSION, items }` and `JSON.stringify`.
- `loadHistory(): SavedComparison[]` — impure wrapper: guard `typeof window === "undefined"` → `[]`; else `parseHistory(localStorage.getItem(STORAGE_KEY))`.
- `saveHistory(items): void` — impure wrapper: guard `typeof window`; `localStorage.setItem(STORAGE_KEY, serializeHistory(items))` inside a `try/catch` (quota/serialization failures are swallowed — non-fatal; the cap makes quota effectively unreachable with inputs-only).

#### 4. Barrel

**File**: `src/lib/history/index.ts`

**Intent**: Public surface for the module.

**Contract**: Re-export the types (`SavedComparison`), constants (`HISTORY_CAP`), pure transforms (`historyKey`, `summarizePlan`, `addComparison`, `deleteComparison`, `clearComparisons`, `makeComparison`), and the bridge (`loadHistory`, `saveHistory`). `parseHistory`/`serializeHistory` may be re-exported for tests.

#### 5. Unit tests

**File**: `src/lib/history/history.test.ts` and `src/lib/history/storage.test.ts`

**Intent**: Cover the pure logic to the repo's standard (`describe`/`it`/`expect` from `vitest`).

**Contract**: Tests for —
- `historyKey`: identical-but-differently-whitespaced lists produce the same key; genuinely different lists differ.
- `summarizePlan`: counts sum quantities, not group/line counts.
- `addComparison`: prepend on new key; replace + move-to-front on existing key; cap truncation drops the oldest.
- `deleteComparison` / `clearComparisons`: remove one / all; non-existent id is a no-op.
- `parseHistory`: `null` → `[]`; malformed JSON → `[]`; wrong `version` → `[]`; mixed valid/invalid items → only valid kept; over-cap input is truncated.
- `serializeHistory` round-trips through `parseHistory`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Linting passes: `npm run lint`
- Type checking / build passes: `npm run build`

#### Manual Verification:

- (none — Phase 1 is pure logic; behavior is fully covered by automated tests)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2 (no manual step required here).

---

## Phase 2: Drawer UI + Save / Restore wiring

### Overview

Build the slide-over `HistoryDrawer`, a thin `useDeckHistory` hook that loads on mount and persists on change, and wire Save / History / restore / delete / clear into `DeckComparer`.

### Changes Required:

#### 1. History hook

**File**: `src/components/deck/useDeckHistory.ts`

**Intent**: Encapsulate the history state lifecycle for the island — load once on mount, persist whenever the list changes, and expose mutation helpers built on the Phase 1 transforms. Keeps `DeckComparer` lean and keeps localStorage access inside effects.

**Contract**: `useDeckHistory()` returns `{ items, save, remove, clear }`.
- `items: SavedComparison[]` — initialized empty; populated from `loadHistory()` in a mount `useEffect`.
- `save(baseText, targetText, plan)` — builds an entry via `makeComparison` (generating `id` + `savedAt` here, e.g. `crypto.randomUUID()` and `Date.now()`), applies `addComparison`, updates state.
- `remove(id)` / `clear()` — apply `deleteComparison` / `clearComparisons`.
- Persist via `saveHistory(items)` in a `useEffect` keyed on `items` (skipping the initial pre-load render so we don't overwrite stored data with the empty seed).

#### 2. History drawer component

**File**: `src/components/deck/HistoryDrawer.tsx`

**Intent**: A right-side slide-over listing saved comparisons with restore, per-entry delete, and Clear all. Matches the app's dark cosmic styling and uses `cn()` + `lucide-react`.

**Contract**: Props `{ open: boolean; items: SavedComparison[]; onClose: () => void; onRestore: (id: string) => void; onDelete: (id: string) => void; onClearAll: () => void }`.
- Renders a backdrop overlay + a fixed right panel; hidden when `!open`.
- Each row: an auto-derived label (formatted `savedAt` via `toLocaleString` + `+addCount / −removeCount`), clicking the row triggers `onRestore(id)`; a delete (×, `Trash2`) button triggers `onDelete(id)` without restoring (stop propagation).
- Header: title, a Close (`X`) button → `onClose`; a Clear all button → `onClearAll` behind a confirm step (e.g. a two-click "Clear all → Confirm" toggle, no `window.confirm`).
- Empty state: a short "No saved comparisons yet" message.
- Accessibility: Escape closes the drawer; clicking the backdrop closes; move focus into the panel on open and restore focus to the opener on close. `role="dialog"` + `aria-label`.

#### 3. Wire into DeckComparer

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Add the History button, the Save button, and the restore/delete/clear handlers, leaving the existing comparison pipeline untouched.

**Contract**:
- Call `useDeckHistory()` near the other state; add `const [historyOpen, setHistoryOpen] = useState(false)`.
- A **History (N)** button (always visible, near the top of the island) toggles `historyOpen`; show the count `items.length`.
- A **Save this comparison** button rendered only when `view.status === "ready"`; on click call `history.save(baseText, targetText, view.plan)`. Give brief saved feedback (e.g. transient "Saved ✓" label) — no new global toast system.
- Render `<HistoryDrawer open={historyOpen} items={history.items} onClose={…} onRestore={…} onDelete={history.remove} onClearAll={history.clear} />`.
- `onRestore(id)`: look up the entry, `setBaseText(entry.baseText)`, `setTargetText(entry.targetText)`, `setHistoryOpen(false)`. **Do not** call `runPlan` or set `view` — the debounce effect rebuilds. (See Critical Implementation Details.)

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking / build passes: `npm run build`
- Existing unit tests still pass: `npm run test`

#### Manual Verification:

- Generate a plan, click **Save this comparison**, confirm the History count increments and brief saved feedback shows.
- Reload the page; open the drawer; the saved entry is present with a sensible date/time + `+adds / −removes` label.
- Click the entry: drawer closes, both textareas refill, and the plan rebuilds automatically (brief "Building plan…" then the grouped plan).
- Save the same two lists again: the existing entry updates/moves to top rather than duplicating.
- Save 31+ distinct comparisons: the list holds at 30, oldest dropped.
- Per-entry delete removes only that row; Clear all (after confirm) empties the list; both persist across reload.
- Escape and backdrop-click close the drawer; focus behaves sensibly; no console errors; no hydration warning on load.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human that the manual testing was successful before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- `historyKey` normalization (whitespace-insensitive dedup), `summarizePlan` (quantity sums), `addComparison` (prepend / replace-move-to-front / cap), `deleteComparison`, `clearComparisons`.
- `parseHistory` defensive parsing (null / malformed / wrong version / mixed validity / over-cap) and `serializeHistory` round-trip.

### Integration Tests:

- None automated (no jsdom/RTL in the repo). The drawer + wiring are covered by the Manual Testing Steps below, matching the repo's established component-verification boundary.

### Manual Testing Steps:

1. Save a fresh plan → History count increments.
2. Reload → entry persists with correct label.
3. Click entry → textareas refill and plan rebuilds (no double-build, no stale view).
4. Re-save identical lists → entry updates in place (no duplicate).
5. Exceed the cap → oldest dropped, list holds at 30.
6. Delete one entry; Clear all (confirm) → empties; both persist across reload.
7. Corrupt the localStorage value manually → app loads with an empty history, no crash.

## Performance Considerations

Negligible. Inputs-only entries are a few KB each; the ~30-entry cap keeps total storage well under the localStorage quota, so quota-exceeded is effectively unreachable (still handled defensively). Revisit reuses the in-session resolver cache, so repeated lookups within a session are fast.

## Migration Notes

No existing data. The versioned envelope (`version: 1`) plus defensive `parseHistory` means a future schema change can bump the version and reset cleanly without crashing on old data.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04), FR-009 in `context/foundation/prd.md`
- Comparison island: `src/components/deck/DeckComparer.tsx:31-74`
- Plan result types (serializable): `src/lib/deck/plan.ts`, `src/lib/card-data/types.ts:21-34`
- Disclosure precedent: `src/components/deck/SharedCardsDisclosure.tsx`
- Test conventions: `src/lib/deck/parse.test.ts`, `vitest.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: History store (pure lib + persistence)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Type checking / build passes: `npm run build`

### Phase 2: Drawer UI + Save / Restore wiring

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Type checking / build passes: `npm run build`
- [ ] 2.3 Existing unit tests still pass: `npm run test`

#### Manual

- [ ] 2.4 Save → History count increments with saved feedback
- [ ] 2.5 Reload → entry persists with correct date/time + `+adds / −removes` label
- [ ] 2.6 Click entry → textareas refill and plan rebuilds (single build, no stale view)
- [ ] 2.7 Re-save identical lists → entry updates/moves to top (no duplicate)
- [ ] 2.8 Exceed cap → list holds at 30, oldest dropped
- [ ] 2.9 Per-entry delete + Clear all (confirm) work and persist across reload
- [ ] 2.10 Escape / backdrop close, focus sane, no console or hydration warnings
