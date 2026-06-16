# "Did you mean …?" Inline Accept — Plan Brief

> Full plan: `context/changes/did-you-mean-accept/plan.md`
> Shape notes: `context/changes/did-you-mean-accept/shape-notes.md`

## What & Why

When a pasted card name doesn't resolve but the resolver returns a near-match
`suggestion`, the user can today only read the hint and retype. This change adds a
one-click **Accept** (and an **Accept all**) that substitutes the corrected name
into the source paste text and lets the plan rebuild — closing the gap on the
card-data-accuracy guardrail, which is existential for the tool's trust.

## Starting Point

The unresolved-cards notice already shows "did you mean **X**?" as static text
([UnresolvedNotice.tsx:36-41](src/components/deck/UnresolvedNotice.tsx)). The deck
texts are the single source of truth; a 700ms debounce auto-rebuilds the plan after
edits settle, and history saves only the texts. The `suggestion` field is already
populated by the resolver (F-01).

## Desired End State

A typo like `1 Sol Rng` shows the hint with an **Accept** button; clicking it
rewrites the line to `1 Sol Ring` (count prefix preserved), and the plan rebuilds
and moves the card into the plan. With 2+ suggestions, **Accept all (N)** fixes
them all in one click and one rebuild. Saving then restoring reproduces the
corrected plan.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Accept model | Edit the paste text in place | Rides the existing debounce + save/restore with no second source of truth. | Shape |
| Accept scope | Per-card + "accept all" | A bulk action for multi-typo pastes, per-card for precision. | Shape |
| Write-back mechanism | Pure `applySuggestion` helper, match by `resolutionKey` | Touches no contract-surface type and fixes all deduped duplicate lines — simpler and more correct than threading a line index. | Plan |
| "Accept all" visibility | Only when 2+ suggestions exist | A lone suggestion is already handled by its per-card button. | Plan |
| Name-extraction rules | Reuse the parser's line-splitter | Keeps "what is a card line / where the name starts" in one place. | Plan |

## Scope

**In scope:** pure `applySuggestion` + `acceptAllSuggestions` helpers with tests;
per-card Accept button; conditional "Accept all (N)"; the two `DeckComparer`
handlers; barrel + contract-surfaces registry updates.

**Out of scope:** changing how suggestions are generated; undo beyond text editing;
accept controls for no-suggestion entries; any `DeckEntry` / `UnresolvedEntry` /
`ParsedDeck` / `UnresolvedCard` shape change; the rejected substitution-overlay.

## Architecture / Approach

New pure module `src/lib/deck/accept.ts` rewrites deck-list text: it re-extracts
each line's name with the parser's own splitter, matches by `resolutionKey` (the
identity key the resolver and quantity-join already share), and rewrites the
matching line(s) keeping the verbatim count prefix. The UI calls these helpers from
two thin `useCallback` handlers that `setBaseText` / `setTargetText`; the existing
700ms debounce effect rebuilds the plan — no new orchestration. Logic is pure and
unit-tested; UI wiring is verified manually, matching the project's convention (no
React Testing Library).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Substitution helpers (pure logic) | `applySuggestion` / `acceptAllSuggestions` + tests + barrel + registry | Preserving the exact count prefix; keeping the line-split rule shared with the parser |
| 2. Wire accept into the UI | Per-card + conditional "Accept all" buttons; `DeckComparer` handlers | Accept-all firing one rebuild, not two; a11y labels on the new buttons |

**Prerequisites:** S-01 (done); the resolver's `suggestion` field (F-01, done).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes the canonical `suggestion` resolves cleanly on rebuild; if not, the card
  simply reappears in the notice (no loop) — acceptable.
- Assumes React 19 batches the two accept-all setStates into one rebuild; the 700ms
  debounce coalesces them regardless, so worst case is still a single rebuild.
- Leading whitespace on a corrected line may be normalized by the rewrite; deck
  lists aren't indented and the parser already trims, so this is invisible.

## Success Criteria (Summary)

- One click on Accept corrects the typed name in place and the plan rebuilds to
  include the card.
- "Accept all" fixes every available suggestion across both decks in a single
  rebuild.
- No regression to save/restore, to no-suggestion entries, or to the existing
  unresolved notice.
