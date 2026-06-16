---
change_id: did-you-mean-accept
roadmap_ref: S-05
context_type: brownfield
prd_refs:
  - "Success Criteria §Guardrails (graceful input handling)"
  - "US-01 AC (unrecognized names show a clear error, not silent omission)"
  - "builds on FR-001 / FR-002 (deck paste)"
status: shaped
scope: slice-level shaping note (not a full PRD — S-05 is already captured in prd.md + roadmap.md)
created: 2026-06-16
updated: 2026-06-16
---

# Shaping note: S-05 — "Did you mean …?" inline accept

> Lightweight, slice-scoped shaping. This resolves the single open question the
> roadmap flagged for S-05 ("in-place edit vs. substitution overlay") so the
> slice can move to `/10x-new` → `/10x-plan`. It does **not** re-shape the product
> or touch the project-level `context/foundation/shape-notes.md`.

## Outcome (from roadmap)

When a pasted card name doesn't resolve but the card-data source returns a
near-match `suggestion`, the user can accept it in **one click** to substitute the
corrected name and re-generate the plan — instead of only seeing the hint and
retyping by hand.

## Settled decisions

### D1 — Accept model: **edit the paste text in place** ✅

Accepting a suggestion replaces the typed name with `entry.suggestion` **directly
in the source textarea** (`baseText` / `targetText`), preserving the quantity
prefix on that line.

**Why (grounded in the current code):**
- The textarea text is already the *single source of truth*. The plan
  auto-rebuilds 700ms after the text settles (`DeckComparer.tsx:67-82`), and
  history save/restore persists **only the texts**
  (`handleSave`/`handleRestore`), rebuilding the plan from them.
- So in-place edit **rides the existing data flow**: mutate the text → the
  debounce effect re-runs `generateUpgradePlan` for free; save/restore keeps
  working unchanged; the correction is transparent to the user.
- The rejected alternative (substitution overlay) introduces a second source of
  truth (`{original → accepted}` map) that must be reconciled against the
  textarea on every keystroke and against history save/restore — heavy for a thin
  trust enricher. Its one upside (preserving the literal original input) is not a
  product requirement here.

### D2 — Accept scope: **per-card accept + an "accept all" action** ✅

- One accept control per unresolved entry that has a `suggestion`.
- Plus a single "accept all suggestions" action that applies every available
  suggestion in one go (across both decks).
- Entries with `suggestion: null` (not-found with no near match, malformed,
  ambiguous with no pick) show **no** accept control — unchanged from today.

## Settled defaults (no further input needed)

- **Rebuild trigger:** accept mutates the text → the existing 700ms debounce
  rebuilds the plan. No separate orchestration path. (Accept-all changes both
  texts in one update so it triggers a single rebuild, not one per card.)
- **Save/restore:** unaffected — the corrected text is what gets saved, so a
  restored comparison reproduces the corrected plan. No new persistence decision.
- **No-suggestion entries:** remain inert notices (the current
  `entry.suggestion ? …` branch in `UnresolvedNotice.tsx:36-41`).

## Known implementation risk → for `/10x-plan`

**Targeting the right line to correct.** `UnresolvedEntry` carries only the
cleaned `name`, `reason`, `suggestion`, and `deck` (`plan.ts:27-33`). The parser
strips the quantity and keeps **no line index / no raw line** (`parse.ts:83-91`).
So an accept action cannot today address an exact textarea line:

- The same unreadable token could appear on two lines → naive find-replace
  mis-hits.
- Set-code/collector suffixes are deliberately left on the name
  (`parse.ts:9-12`), so `entry.name` may include them — match on the full
  `entry.name`, not a stripped form.

**Recommended fix (small contract extension, F-01/S-01 surfaces):** thread a
source **line index** (or the raw line) through `parseDeckList` → `UnresolvedEntry`
so accept rewrites one exact line, preserving its quantity prefix and whitespace.
Verify against `docs/reference/contract-surfaces.md` before changing
`ParsedDeck` / `UnresolvedEntry`.

## Touchpoints (orientation, not a plan)

- `src/components/deck/UnresolvedNotice.tsx` — add per-entry accept control +
  "accept all"; needs an `onAccept` / `onAcceptAll` callback prop.
- `src/components/deck/DeckComparer.tsx` — owns `baseText`/`targetText`; applies
  the in-place substitution; auto-rebuild already wired.
- `src/lib/deck/parse.ts`, `src/lib/deck/plan.ts`, `src/lib/card-data/types.ts` —
  line-index threading if the recommended fix is taken.

## Non-goals for this slice

- No fuzzy-match *generation* changes — consumes the existing
  `UnresolvedCard.suggestion` field (already populated by F-01).
- No undo/history of accepted corrections beyond what in-place text editing
  already gives (the user can edit the textarea back).

## Handoff

Ready for `/10x-new did-you-mean-accept` → `/10x-plan`. The roadmap's
"in-place vs overlay" open question is resolved (D1: in-place).
