# "Did you mean …?" Inline Accept — Implementation Plan

## Overview

When a pasted card name doesn't resolve but Scryfall's fuzzy lookup returns a
near-match `suggestion`, the user can today only *read* the hint ("did you mean
Sol Ring?") and retype by hand. This change adds a one-click **Accept** that
substitutes the corrected name directly into the source paste text, plus an
**Accept all** for fixing every suggestion at once. Because the deck-list text is
the single source of truth and the plan auto-rebuilds ~700ms after the text
settles, accept needs no new orchestration — it mutates the text and the existing
debounce does the rest.

## Current State Analysis

- **The notice is display-only.** `UnresolvedNotice` ([src/components/deck/UnresolvedNotice.tsx:36-41](src/components/deck/UnresolvedNotice.tsx)) renders the suggestion as static text with no action. Entries with `suggestion: null` (ambiguous / malformed) correctly show nothing actionable.
- **Text is the single source of truth.** `DeckComparer` owns `baseText` / `targetText`; a 700ms debounce effect re-runs `generateUpgradePlan` after edits settle ([DeckComparer.tsx:67-82](src/components/deck/DeckComparer.tsx)), and history save/restore persists *only the texts* ([DeckComparer.tsx:98-125](src/components/deck/DeckComparer.tsx)), rebuilding plans from them. So mutating the text rides every existing data path for free.
- **The resolver dedups unresolved names by `resolutionKey`** ([src/lib/card-data/resolve.ts:82-92,136-145](src/lib/card-data/resolve.ts)), reporting the first-seen spelling. **Consequence:** one `UnresolvedEntry` can correspond to *several* source lines (the same typo listed twice, possibly in different case). Base and target are resolved in separate calls, so cross-deck duplicates stay distinct and correctly `deck`-tagged.
- **The parser strips the count and trims the name** ([src/lib/deck/parse.ts:83-91](src/lib/deck/parse.ts)); set-code / collector suffixes are deliberately left on the name ([parse.ts:8-12](src/lib/deck/parse.ts)). `UnresolvedEntry.name` is exactly that parsed name (it's `entries.map(e => e.name)` fed to `resolveCards`).
- **`UnresolvedEntry`** carries `{ name, reason, suggestion, deck }` only — no line index, no raw line ([src/lib/deck/plan.ts:27-33](src/lib/deck/plan.ts)).
- **Test convention:** vitest, colocated `*.test.ts`. Component-folder tests cover only **pure helpers** ([labels.test.ts](src/components/deck/labels.test.ts), [cardImage.test.ts](src/components/deck/cardImage.test.ts)) — there is no React Testing Library. The established pattern is: put logic in a pure function, unit-test it; verify UI wiring manually.

### Key Discoveries:

- The single source of truth is the textarea text → in-place edit is the whole mechanism (shape-notes D1). [DeckComparer.tsx:67-82](src/components/deck/DeckComparer.tsx)
- The resolver dedups misses by `resolutionKey` → matching the rewrite on `resolutionKey` and rewriting **all** matching lines is both simpler and more correct than threading a single line index. [resolve.ts:82-92,143](src/lib/card-data/resolve.ts)
- `resolutionKey` is already the shared identity key across the resolver and the deck layer ([resolve.ts:34-36](src/lib/card-data/resolve.ts), reused in [quantity.ts:27-33](src/lib/deck/quantity.ts)) → reuse it; don't invent a new match rule.
- The parser already encodes the rules for "what is a card line" and "where the name starts" → reuse that logic in the rewrite rather than duplicating the regex. [parse.ts:35-53,78-91](src/lib/deck/parse.ts)

## Desired End State

A user who pastes a deck containing a recognizable typo (e.g. `1 Sol Rng`) sees the
existing "did you mean **Sol Ring**?" hint with an **Accept** button beside it.
Clicking it rewrites that line in the textarea to `1 Sol Ring` (count prefix
preserved), the plan rebuilds automatically ~700ms later, and the card moves out
of the unresolved notice into the plan. When two or more suggestions are available,
an **Accept all (N)** control fixes them all in one click with a single rebuild.
Saving the comparison persists the corrected text, so a restore reproduces the
corrected plan.

Verified by: the new `accept.ts` unit tests pass, lint/build are clean, and the
manual flow above behaves as described.

## What We're NOT Doing

- **No fuzzy-match *generation* changes** — we consume the existing
  `UnresolvedCard.suggestion` field (populated by F-01); we don't change how
  suggestions are produced.
- **No undo/redo beyond editing the textarea** — in-place text editing already
  lets the user revert by hand (shape-notes non-goal).
- **No accept control for `suggestion: null` entries** (ambiguous / malformed
  with no near match) — they stay inert, exactly as today.
- **No changes to `DeckEntry`, `ParsedDeck`, `UnresolvedEntry`, or
  `UnresolvedCard` shapes** — the chosen approach needs none. (Explicitly diverges
  from the shape-notes' "thread a line index" suggestion; see Implementation
  Approach.)
- **No substitution-overlay / second source of truth** — rejected in shape-notes
  D1.

## Implementation Approach

Add a pure substitution module `src/lib/deck/accept.ts` that rewrites deck-list
text, then wire two thin callbacks into the UI.

**Why a pure helper instead of threading a line index (shape-notes' suggestion):**
the resolver dedups unresolved names by `resolutionKey` and reports the first-seen
spelling, so one `UnresolvedEntry` can map to multiple source lines. A single line
index can't represent that without becoming a list, and threading it mutates two
registered contract surfaces (`DeckEntry`, `UnresolvedEntry`). A pure rewrite that
re-extracts each line's name and matches by `resolutionKey` instead:

- touches **no** contract-surface type shapes;
- naturally rewrites **every** line the resolver collapsed into one entry (correct
  for the duplicate-typo case);
- matches on the parsed name (not raw substring), so `Forest` never mis-hits
  inside `Snow-Covered Forest`;
- is fully unit-testable in isolation, matching the codebase's pure-helper test
  convention.

The accepted `suggestion` is Scryfall's canonical name, so substituting it resolves
cleanly on the next rebuild. If a corrected name still doesn't resolve, it simply
reappears in the notice — no loop, no special handling.

## Critical Implementation Details

**Preserving the exact count prefix.** `parseDeckList` trims the line and splits
count from name with `/^(\d+)\s*x?\s+(.+)$/i`, discarding the literal separator.
To rewrite a line as `<original count prefix><suggestion>` (so `4x Sol Rng` →
`4x Sol Ring`, not `4 Sol Ring`), the rewrite needs the *literal* prefix. Capture
it as a group rather than reconstructing it — e.g. `/^(\d+\s*x?\s+)(.+)$/i`, where
group 1 is the verbatim prefix and group 2 the name; a bare name (no count) has an
empty prefix. Keep this rule in **one place** shared with `parseDeckList` (extract
a small internal line-splitter in `parse.ts` and import it into `accept.ts`) so the
parser and the rewrite can never drift on what counts as a card line or where the
name starts.

**Skip non-card lines.** The rewrite must ignore the same lines the parser ignores
(blank, comment, section header, count-only) — never rewrite a comment that happens
to contain the name. Reusing the parser's per-line classification gets this for
free.

## Phase 1: Substitution helpers (pure logic)

### Overview

Add the pure rewrite functions, their tests, the barrel export, and the
contract-surfaces registry entry. No UI changes in this phase — it is fully
automated-verifiable.

### Changes Required:

#### 1. Shared line-splitter in the parser

**File**: `src/lib/deck/parse.ts`

**Intent**: Expose the existing "is this a card line, and where does the name
start" logic so the rewrite reuses it instead of duplicating the regex. Keep
`parseDeckList`'s public behavior unchanged.

**Contract**: Add a module-internal helper (e.g. `splitCardLine(line: string): { prefix: string; name: string } | null`)
returning `null` for blank/comment/header/count-only lines and `{ prefix, name }`
for card lines, where `prefix` is the verbatim count prefix (possibly `""`) and
`name` is the trimmed card name. Refactor `parseDeckList` to use it so the two
stay in sync. Use a prefix-capturing form of the counted-line regex:
`/^(\d+\s*x?\s+)(.+)$/i`. Export it within the module (not necessarily on the
`@/lib/deck` barrel) so `accept.ts` can import it directly.

#### 2. Substitution module

**File**: `src/lib/deck/accept.ts` (new — mirrors `cost.ts` / `quantity.ts`)

**Intent**: Rewrite deck-list text so an accepted suggestion replaces the typed
name in place, for one card or for many at once. Pure, no React.

**Contract**:
- `applySuggestion(text: string, targetName: string, suggestion: string): string`
  — split `text` on `/\r?\n/`; for each line, use `splitCardLine` and rewrite the
  line to `${prefix}${suggestion}` when `resolutionKey(name) === resolutionKey(targetName)`;
  leave every other line (and all non-card lines) verbatim; rejoin with `\n`.
  Import `resolutionKey` from `@/lib/card-data` (same identity key the resolver and
  quantity-join use).
- `acceptAllSuggestions(baseText: string, targetText: string, entries: UnresolvedEntry[]): { baseText: string; targetText: string }`
  — filter `entries` to those with a non-null `suggestion`; fold `applySuggestion`
  over `baseText` for `deck === "base"` entries and over `targetText` for
  `deck === "target"` entries; return both new texts. Import the `UnresolvedEntry`
  type from `./plan`.

#### 3. Barrel export

**File**: `src/lib/deck/index.ts`

**Intent**: Make the new helpers importable as `@/lib/deck`, consistent with the
other deck exports.

**Contract**: `export { applySuggestion, acceptAllSuggestions } from "./accept";`

#### 4. Unit tests

**File**: `src/lib/deck/accept.test.ts` (new — mirrors `parse.test.ts` style)

**Intent**: Lock the rewrite behavior and its edge cases.

**Contract**: Cover, at minimum — count prefix preserved (`1 `, `4x `); bare name
(no count) replaced; set-code-suffixed name (`Sol Rng (LTC) 280`) matched on the
full name and replaced with the canonical suggestion; **all** duplicate lines of
one typo rewritten, including a differing-case duplicate (resolutionKey match); no
match leaves text unchanged; substring safety (`Forest` does not alter
`Snow-Covered Forest`); comment/header/count-only lines never rewritten;
`acceptAllSuggestions` applies base suggestions to `baseText` and target
suggestions to `targetText` and ignores `suggestion: null` entries.

#### 5. Contract-surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the two new load-bearing functions under the Deck diff
section.

**Contract**: Add rows for `applySuggestion` and `acceptAllSuggestions`
(`src/lib/deck/accept.ts`, imported from `@/lib/deck`), describing the
match-by-`resolutionKey`, prefix-preserving rewrite.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Linting passes: `npm run lint`
- Build / type-check passes: `npm run build`

#### Manual Verification:

- `applySuggestion` / `acceptAllSuggestions` are importable from `@/lib/deck` (used in Phase 2).

**Implementation Note**: After completing this phase and all automated
verification passes, pause for human confirmation before proceeding to Phase 2.

---

## Phase 2: Wire accept into the UI

### Overview

Surface a per-card **Accept** button (for suggestion-bearing entries) and a
conditional **Accept all (N)** control in the notice, and implement the two
handlers in `DeckComparer` that mutate the text and let the existing debounce
rebuild the plan.

### Changes Required:

#### 1. Notice gains accept controls

**File**: `src/components/deck/UnresolvedNotice.tsx`

**Intent**: Add an Accept button beside each entry that has a `suggestion`, and an
"Accept all (N)" button in the header when 2+ suggestions exist. No-suggestion
entries stay inert. Bulk control threshold per the settled decision: show only when
`entries.filter(e => e.suggestion).length >= 2`.

**Contract**: Extend props with `onAccept: (entry: UnresolvedEntry) => void` and
`onAcceptAll: () => void`. Render the per-card button only inside the existing
`entry.suggestion ? …` branch ([UnresolvedNotice.tsx:36-41](src/components/deck/UnresolvedNotice.tsx)).
Reuse the `Button` component (`size="sm"`, an outline/ghost variant tuned to the
red notice palette, matching the Retry button's treatment in
[DeckComparer.tsx:195-206](src/components/deck/DeckComparer.tsx)). Give each button
an accessible label (e.g. `aria-label={`Accept ${entry.suggestion} for ${entry.name}`}`) —
`eslint-plugin-jsx-a11y` is enabled.

#### 2. Accept handlers in DeckComparer

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Implement `handleAccept` and `handleAcceptAll`, mutating the right
text; the debounce effect rebuilds the plan. No call to `runPlan` and no `setView`
— mirror `handleRestore`'s "set text, let the effect rebuild" pattern
([DeckComparer.tsx:114-125](src/components/deck/DeckComparer.tsx)).

**Contract**:
- Import `applySuggestion`, `acceptAllSuggestions` from `@/lib/deck`.
- `handleAccept(entry)`: route by `entry.deck` — `setBaseText(applySuggestion(baseText, entry.name, entry.suggestion))` or the `targetText` equivalent. Wrap in `useCallback` with `[baseText, targetText]` deps, consistent with the file's other handlers.
- `handleAcceptAll()`: `const next = acceptAllSuggestions(baseText, targetText, view.unresolved)` (guard `view.status === "ready"`), then `setBaseText(next.baseText); setTargetText(next.targetText)`. The two setState calls batch (React 19 automatic batching) into a single debounce run → one rebuild.
- Pass `onAccept={handleAccept}` and `onAcceptAll={handleAcceptAll}` to `<UnresolvedNotice>` ([DeckComparer.tsx:228](src/components/deck/DeckComparer.tsx)).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build / type-check passes: `npm run build`
- Existing tests still pass: `npm run test`

#### Manual Verification:

- Pasting a deck with a typo that yields a suggestion (e.g. `1 Sol Rng`) shows the "did you mean …?" hint plus an Accept button; clicking it rewrites the textarea line to `1 Sol Ring` and the plan rebuilds, moving the card out of the notice.
- The count prefix is preserved (`4x Sol Rng` → `4x Sol Ring`).
- With suggestions in both decks, "Accept all (2)" appears and one click fixes both with a single rebuild (no flicker of two separate rebuilds).
- With exactly one suggestion, no "Accept all" button appears (per-card only).
- A no-suggestion entry (ambiguous / malformed) shows no Accept button and stays inert.
- Save → restore reproduces the corrected plan (the corrected text is what's saved).

**Implementation Note**: After automated verification passes, pause for human
confirmation of the manual testing above before marking the change complete.

---

## Testing Strategy

### Unit Tests:

- `src/lib/deck/accept.test.ts` — all `applySuggestion` / `acceptAllSuggestions`
  cases listed in Phase 1 (prefix preservation, duplicate/case rewrite, substring
  safety, suffix matching, non-card-line skipping, deck routing, null-suggestion
  filtering).

### Integration Tests:

- None added — there is no React component test harness in the project (no RTL).
  Component wiring is verified manually per the existing convention.

### Manual Testing Steps:

1. Paste `1 Sol Rng` (base) + a valid target deck; confirm the hint + Accept button, click Accept, confirm the line becomes `1 Sol Ring` and the plan rebuilds.
2. Use `4x Sol Rng`; confirm the prefix survives as `4x Sol Ring`.
3. Put a fixable typo in *both* decks; confirm "Accept all (2)" appears and fixes both in one rebuild.
4. Single typo only; confirm no "Accept all" button.
5. Paste an ambiguous/not-found name with no suggestion; confirm no Accept button.
6. Accept a fix, Save, then Restore from history; confirm the restored plan is the corrected one.

## Performance Considerations

Negligible. `applySuggestion` re-parses one deck's text (tens to ~100 lines) at
click time — far cheaper than the Scryfall round-trip the rebuild already makes.
Accept-all folds over a handful of entries.

## Migration Notes

None. No persisted data shape changes; saved history entries (texts only) remain
fully compatible.

## References

- Shaping note: `context/changes/did-you-mean-accept/shape-notes.md` (D1 in-place edit, D2 per-card + accept-all)
- Roadmap: `context/foundation/roadmap.md` (S-05)
- Resolver dedup / first-seen spelling: [src/lib/card-data/resolve.ts:82-92,136-145](src/lib/card-data/resolve.ts)
- Auto-rebuild debounce: [src/components/deck/DeckComparer.tsx:67-82](src/components/deck/DeckComparer.tsx)
- Pure-helper test convention: [src/components/deck/labels.test.ts](src/components/deck/labels.test.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Substitution helpers (pure logic)

#### Automated

- [ ] 1.1 Unit tests pass: `npm run test`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Build / type-check passes: `npm run build`

#### Manual

- [ ] 1.4 `applySuggestion` / `acceptAllSuggestions` importable from `@/lib/deck`

### Phase 2: Wire accept into the UI

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Build / type-check passes: `npm run build`
- [ ] 2.3 Existing tests still pass: `npm run test`

#### Manual

- [ ] 2.4 Per-card Accept rewrites the line and rebuilds the plan
- [ ] 2.5 Count prefix preserved on accept (`4x Sol Rng` → `4x Sol Ring`)
- [ ] 2.6 "Accept all (N)" appears with 2+ suggestions and fixes all in one rebuild
- [ ] 2.7 No "Accept all" with exactly one suggestion
- [ ] 2.8 No-suggestion entries stay inert (no Accept button)
- [ ] 2.9 Save → restore reproduces the corrected plan
