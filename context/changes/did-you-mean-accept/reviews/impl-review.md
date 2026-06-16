<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: "Did you mean …?" Inline Accept

- **Plan**: context/changes/did-you-mean-accept/plan.md
- **Scope**: Full plan (Phase 1 + 2 of 2)
- **Date**: 2026-06-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — acceptAllSuggestions re-splits full text per entry

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (performance)
- **Location**: src/lib/deck/accept.ts:61-81
- **Detail**: `acceptAllSuggestions` calls `applySuggestion` once per entry, and each call re-splits/re-joins the entire deck text — O(entries × lines). For realistic inputs (a few unresolved entries × ~100 lines) this is negligible, runs at click time, and is far cheaper than the Scryfall rebuild it triggers. Explicitly anticipated in the plan's Performance Considerations.
- **Fix**: None recommended — acceptable as designed.
- **Decision**: SKIPPED (accepted as designed)

### F2 — Accept normalizes CRLF → LF across the whole text

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/lib/deck/accept.ts:35-51
- **Detail**: `applySuggestion` splits on `/\r?\n/` and re-joins with `\n`, so accepting a suggestion converts a CRLF-pasted deck to LF across the entire text, not just the rewritten line. Documented in the module JSDoc and harmless in this domain — the text is only ever re-parsed by `parseDeckList` (which also splits on `/\r?\n/`); no CRLF round-trip to any external system.
- **Fix**: None recommended — documented and harmless.
- **Decision**: SKIPPED (accepted as designed)

## Notes

- No injection risk: the suggestion string flows into a controlled `<textarea>` value (plain text) and an auto-escaped `aria-label` — no XSS vector even for a hostile suggestion.
- No double rebuild: `handleAcceptAll`'s two `setState` calls batch (React 19 automatic batching) into a single debounced `runPlan`.
- `useCallback` deps correct on both handlers (`handleAccept` → `[baseText, targetText]`; `handleAcceptAll` → `[view, baseText, targetText]`); accept mirrors the existing `handleRestore` "set text, let the effect rebuild" pattern.
- Match-by-`resolutionKey` is consistent with the resolver's dedup key and the quantity-join layer; case-insensitive duplicate rewrite is covered by tests.
- Two intent-aligned extras (registering `splitCardLine` in contract-surfaces.md; a defensive `suggestion === null` guard in `handleAccept`) — not drift.
- Success criteria: `npm run test` 107 passed / 1 skipped; `npm run build` clean; the change's own files lint clean (pre-existing Supabase/middleware auth-boilerplate lint debt is out of scope).
