# Fuzzy-Fix on Save (Path Builder) Implementation Plan

## Overview

Bring the path builder's add-checkpoint flow to parity with the `/` comparer's S-05
"did you mean…?" accept. Today `PathEditor` resolves a pasted checkpoint list only at
save time and surfaces unresolved cards **read-only after the snapshot is frozen**. This
change adds a pre-save **Check** action that resolves the pasted list, shows each
unresolved card that has a near-match `suggestion` with a one-click **Accept** (and
**Accept all**), rewrites the paste text in place, and re-checks — so corrections happen
before the immutable snapshot is written. The fix is confined to `PathEditor.tsx` plus
one small pure helper; the engine, the `/` comparer, the API, and the snapshot schema are
untouched.

## Current State Analysis

- **`PathEditor` add flow** (`src/components/path/PathEditor.tsx`): `handleAddStep` (`:153`)
  validates name + `listText`, calls `resolveDeck(listText)`, builds an immutable
  `StepSnapshot`, and POSTs to `/api/paths/[id]/steps` — all in one shot. Unresolved inputs
  are stored on the snapshot and only ever shown **read-only** on a saved step via
  `StepCard` → `toReadOnlyEntries` (`:50`), which strips `suggestion` and tags `deck:
  "target"` nominally. There is no Accept affordance in the add form.
- **S-05 accept logic** (`src/lib/deck/accept.ts`): `applySuggestion(text, name, suggestion)`
  is pure and operates on a **single** text — it rewrites every line matching the card by
  `resolutionKey`, preserving the verbatim count prefix. `acceptAllSuggestions(baseText,
  targetText, entries)` is **base/target-shaped** (two texts keyed by `entry.deck`), so it
  is *not* directly reusable for the path builder's single `listText`.
- **`resolveDeck(listText)`** (`src/lib/deck/plan.ts:61`) returns `{ deck: DeckCard[];
  unresolved: UnresolvedCard[] }`; `UnresolvedCard` = `{ name, reason, suggestion }` (no
  `deck` tag). This is exactly what a pre-save Check needs — resolve without the POST.
- **`UnresolvedNotice`** (`src/components/deck/UnresolvedNotice.tsx`) already renders
  per-card Accept + "Accept all (N)" given `UnresolvedEntry[]` (`{name, reason, suggestion,
  deck}`) and `onAccept` / `onAcceptAll`. `DeckComparer` (`:114-137`) wires it via
  `applySuggestion` / `acceptAllSuggestions` and lets the debounce rebuild.
- **`DeckComparer`** is the reference implementation of the accept loop (set text → rebuild).
  The path builder has no debounce, so the re-check must be triggered explicitly after accept.

(Full grounding: `context/foundation/shape-notes.md`.)

## Desired End State

A signed-in user adding a checkpoint can click **Check** to resolve the pasted list before
saving, see unresolved cards with suggestions and a one-click **Accept** / **Accept all**,
accept them (the corrected name replaces the bad one in the paste box and the notice
auto-refreshes), and then **Add** the checkpoint with the corrected card included. When no
unresolved cards remain, Check shows a "✓ all cards resolved" confirmation. Saved steps are
unchanged (still immutable, still read-only notice). The `/` comparer and the engine behave
exactly as before.

**Verify**: `npm run build` (astro check + lint clean), `npm test` green (incl. the new
`applyAllSuggestions` cases), and a manual pass of Check → Accept → Add in the path builder.

### Key Discoveries:

- `applySuggestion` (`src/lib/deck/accept.ts:35`) is single-text and pure — reuse verbatim per card.
- `acceptAllSuggestions` (`:61`) is base/target-only — the single-list case needs a new sibling
  `applyAllSuggestions(text, entries)` (Phase 1), the honest analog for one list.
- `resolveDeck` (`src/lib/deck/plan.ts:61`) is the no-POST resolve the Check action calls.
- `PathEditor` already imports `resolveDeck` and uses a monotonic `addToken` ref (`:136`) to
  guard stale runs — the Check action mirrors that with its own `checkToken`.
- The nominal `deck: "target"` label is already what saved steps show, so the Check notice
  reusing it needs no change to `UnresolvedNotice`.

## What We're NOT Doing

- **No edits to saved (immutable) steps** — Accept is pre-save only; mid-path step editing
  stays deferred (FR-006).
- **No auto-accept** — Add never silently applies suggestions; correction is always an
  explicit user action.
- **No blocking/nudging Add** — Add resolves + saves exactly as today; an unaccepted
  suggestion still saves into the snapshot (then shown read-only, current behavior).
- **No stale-price/image refresh** on saved steps (separate concern).
- **No change to the `/` comparer, the engine, `UnresolvedNotice`, the API, or the snapshot schema.**
- **No debounced live resolve in the builder** — the trigger is the explicit Check button.

## Implementation Approach

Two phases, smallest-blast-radius first. Phase 1 adds the only new pure logic — a single-list
`applyAllSuggestions` helper beside the existing accept functions — and unit-tests it, keeping
the project's pure-logic-vitest convention intact. Phase 2 wires the Check flow into
`PathEditor`: a Check button drives a token-guarded `resolveDeck`, the result feeds the
existing `UnresolvedNotice` (with suggestions kept), and the Accept / Accept-all handlers
rewrite `listText` then re-run Check so the notice stays live — mirroring `DeckComparer`'s
"set text, rebuild" loop, but explicit rather than debounced. `handleAddStep` is left intact.

## Critical Implementation Details

- **Re-check after accept, not debounce.** `DeckComparer` relies on its 700ms debounce to
  rebuild after `applySuggestion`; `PathEditor` has none. The Accept / Accept-all handlers must
  therefore call the Check routine again themselves after setting `listText`, so the notice
  reflects the rewritten text. React 19 batching means setting `listText` then invoking the
  re-check in the same handler is fine — read the rewritten text from a local, not from state.
- **Token-guard the Check.** A slow resolve must not overwrite a newer one (the user may edit
  and re-Check). Mirror the existing `addToken` pattern with a separate `checkToken` ref; only
  the latest Check may write the check state.

---

## Phase 1: Single-list accept-all helper (pure + tested)

### Overview

Add the one-list sibling of `acceptAllSuggestions` so the path builder can accept every
suggestion over a single `listText`, and unit-test it. Pure logic, no UI.

### Changes Required:

#### 1. `applyAllSuggestions` helper

**File**: `src/lib/deck/accept.ts`

**Intent**: Provide a single-text "accept all" that folds `applySuggestion` over every
suggestion-bearing entry, for surfaces that have one deck list (the path builder) rather than
a base/target pair. Leaves `acceptAllSuggestions` untouched.

**Contract**: `applyAllSuggestions(text: string, entries: { name: string; suggestion: string | null }[]): string`
— fold `applySuggestion` over each entry whose `suggestion` is non-null (skip nulls), threading
the rewritten text; return the final text. Accepts the loosened entry shape (only `name` +
`suggestion` are read) so both `UnresolvedCard` and `UnresolvedEntry` satisfy it. Pure; reuses
the existing line-matching/prefix-preserving semantics of `applySuggestion`.

#### 2. Barrel export

**File**: `src/lib/deck/index.ts`

**Intent**: Expose the new helper to consumers (`PathEditor`).

**Contract**: Add `applyAllSuggestions` to the existing `export { applySuggestion, acceptAllSuggestions } from "./accept";` line.

#### 3. Unit tests

**File**: `src/lib/deck/accept.test.ts`

**Intent**: Cover the new helper alongside the existing `applySuggestion` / `acceptAllSuggestions` tests.

**Contract**: Add an `applyAllSuggestions` describe block: (a) rewrites multiple suggestion-bearing
entries in one list; (b) skips `suggestion: null` entries; (c) preserves count prefixes and
non-card lines; (d) empty entries / empty text → text returned unchanged.

### Success Criteria:

#### Automated Verification:

- Tests pass incl. new helper: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npm run astro -- check`

#### Manual Verification:

- (none — pure logic; covered by unit tests)

**Implementation Note**: After automated verification passes, pause for manual confirmation
before Phase 2.

---

## Phase 2: Wire the Check flow into PathEditor

### Overview

Add the pre-save **Check** action and the editable unresolved notice to the add-checkpoint
form, wiring Accept / Accept-all to rewrite `listText` and auto-re-check. Keep `handleAddStep`
unchanged.

### Changes Required:

#### 1. Check state + routine

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Add a token-guarded pre-save resolve that surfaces unresolved cards without
creating a checkpoint, so the user can review/correct before saving.

**Contract**: Add a `checkToken` ref (mirroring `addToken`, `:136`) and a `checkState` —
`{ status: "idle" } | { status: "checking" } | { status: "checked"; unresolved: UnresolvedCard[] }`.
Add `runCheck(text: string)`: token-guarded `resolveDeck(text)` (try/catch → reuse the existing
add error surface or a check error line); on success set `checked` with `resolved.unresolved`.
Resolution failures reuse the existing transient-error treatment (a retryable message), not a thrown error.

#### 2. Check button + editable notice + "all resolved" state

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Give the add form a Check button and render the unresolved cards with one-click
accept (parity with `/`), or a positive confirmation when clean.

**Contract**: Add a **Check** button beside the existing Add button (reuse `btnDClass`;
disabled while `listText` is empty or `checkState.status === "checking"`). When
`checkState.status === "checked"`: if it has unresolved entries, render `UnresolvedNotice`
with entries mapped from `UnresolvedCard` → `UnresolvedEntry` (keep `suggestion`, tag
`deck: "target"` nominal — a new `toEditableEntries` mapper beside `toReadOnlyEntries`, `:50`)
and wire `onAccept` / `onAcceptAll` (below); if it has none, render a muted "✓ all cards
resolved" line. The Add button and `handleAddStep` are unchanged.

#### 3. Accept / Accept-all handlers (rewrite + re-check)

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Apply a suggestion to the paste text and refresh the notice, mirroring the `/`
accept loop but explicit (no debounce).

**Contract**: `handleAccept(entry)`: guard `entry.suggestion !== null`; compute `next =
applySuggestion(listText, entry.name, entry.suggestion)`; `setListText(next)`; `void
runCheck(next)`. `handleAcceptAll()`: compute `next = applyAllSuggestions(listText,
checkState.unresolved)`; `setListText(next)`; `void runCheck(next)`. Both read the rewritten
text from the local `next` (not state) to avoid a stale re-check. Clear `checkState` on a
successful `handleAddStep` (so the next checkpoint starts fresh) and when the user edits the
checkpoint name (optional — leave list edits to explicit re-Check, consistent with the
button-driven model).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type check passes: `npm run astro -- check`
- Lint passes: `npm run lint`
- Existing tests still pass: `npm test`

#### Manual Verification:

- Pasting a list with a mistyped card (e.g. `Sol Rng`) and clicking **Check** shows the card with a "did you mean Sol Ring?" Accept.
- Clicking **Accept** replaces the name in the paste box and the notice refreshes (the row clears); **Accept all** fixes multiple at once.
- After accepting, **Add** saves a checkpoint whose snapshot includes the corrected card.
- A clean list shows "✓ all cards resolved" on Check; saved steps still show the read-only notice (no Accept).
- The `/` comparer's accept still works unchanged.

**Implementation Note**: Final phase — confirm the full Check → Accept → Add flow against the shape-notes.

---

## Testing Strategy

### Unit Tests (pure logic — vitest, the project convention):

- `applyAllSuggestions` — multi-entry rewrite, null-suggestion skip, prefix/non-card-line preservation, empty cases (`accept.test.ts`).
- Existing `accept` / engine suites stay green (no changes to `applySuggestion` / `acceptAllSuggestions`).

### Integration / Build:

- `npm run build` + `npm run lint` after each phase. No component-test tooling (jsdom/RTL) by design.

### Manual Testing Steps:

1. Open a path, add-checkpoint form: paste a list with one typo'd card that has a near match → **Check** → Accept → confirm paste text rewritten and notice cleared → **Add** → open the saved step and confirm the corrected card is present.
2. Paste a list with ≥2 typos → **Check** → **Accept all** → all corrected in one click.
3. Paste a clean list → **Check** → "✓ all cards resolved".
4. Regression: `/` comparer paste → accept still works; saved step still shows read-only notice with no Accept.

## Performance Considerations

Check reuses the same client-side `resolveDeck` the add flow already runs at save time; the
resolver's in-session cache means a subsequent Add (or re-Check after accept) is near-free. No
new external calls beyond resolution the flow already performed.

## Migration Notes

None. No schema, API, or stored-data change; saved snapshots and the `/api/paths/*` contract
are untouched.

## References

- Shape notes: `context/foundation/shape-notes.md`
- Reuse: `src/lib/deck/accept.ts` (`applySuggestion`), `src/components/deck/DeckComparer.tsx:114-137` (accept loop), `src/components/deck/UnresolvedNotice.tsx`
- Target: `src/components/path/PathEditor.tsx` (`handleAddStep:153`, `toReadOnlyEntries:50`, `addToken:136`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Single-list accept-all helper (pure + tested)

#### Automated

- [x] 1.1 Tests pass incl. new helper: `npm test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type check passes: `npm run astro -- check`

### Phase 2: Wire the Check flow into PathEditor

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Type check passes: `npm run astro -- check`
- [ ] 2.3 Lint passes: `npm run lint`
- [ ] 2.4 Existing tests still pass: `npm test`

#### Manual

- [ ] 2.5 Check shows mistyped card with did-you-mean Accept
- [ ] 2.6 Accept rewrites paste text + notice refreshes; Accept all fixes multiple
- [ ] 2.7 Add after accept saves a snapshot with the corrected card
- [ ] 2.8 Clean list shows "✓ all cards resolved"; saved steps stay read-only (no Accept)
- [ ] 2.9 `/` comparer accept still works unchanged
