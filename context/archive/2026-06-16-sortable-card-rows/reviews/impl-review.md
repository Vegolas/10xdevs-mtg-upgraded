<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sortable Card Rows

- **Plan**: context/changes/sortable-card-rows/plan.md
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-06-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All 8 planned files MATCH. The one deviation (`useSortMode.ts`) is the user-approved
hydration-safe external store (mirrors `useDeckHistory.ts`) and faithfully preserves the
plan's intent. Every "What We're NOT Doing" guardrail held: `git diff` on `src/lib/deck`
is empty, `CostSummary` math untouched (still fed grouped `view.plan.add`), one global
`sortMode` drives all sections, no `priceEur` usage, history stays deck-texts-only under
its own `deckdelta.sort.v1` key.

## Success Criteria (re-run at review time)

- Automated: `npm test` → 111 passed; `npx astro check` → 0 errors; `npm run lint` → exit 0; `npm run build` → success.
- Manual (2.5–2.13): verified via live browser session against `npm run dev`, with per-item
  evidence (grouped default in CATEGORY_ORDER; flat headerless lists; name A→Z/Z→A; price both
  directions with real null-priced cards last; cost steady at ~$102.32; flat/price/asc surviving
  reload; shared disclosure flat + collapse/expand; history restore preserving sort; zero console
  warnings/errors). Provenance: verified by the implementing agent (Stop hook precluded a separate
  human pause), substantiated by the rendering branches present in the diff.

## Findings

### F1 — flattenAndSort runs un-memoized on every render

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/components/deck/CardGroupColumn.tsx:33, src/components/deck/SharedCardsDisclosure.tsx:39
- **Detail**: The flat-mode sort is computed inline on each render with no `useMemo`. At tens-to-low-hundreds of cards this is immaterial and re-runs only on sort change / deck rebuild / disclosure toggle — not a hot path. The plan's Performance Considerations explicitly call this negligible; memoization would be premature.
- **Fix**: None recommended — conscious skip, matches plan intent.
- **Decision**: SKIPPED (accepted as-is)

### F2 — SORT_VERSION declared inline vs history's separate types.ts

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/deck/sortStorage.ts:18
- **Detail**: `history` keeps `HISTORY_VERSION`/`HISTORY_CAP` in a dedicated `types.ts`; sort co-locates `SORT_VERSION` in the storage module. For one small single-file module this is reasonable and arguably cleaner; flagged only for symmetry.
- **Fix**: Leave as-is.
- **Decision**: SKIPPED (accepted as-is)

### F3 — serializeSortMode does not strip extra fields on write

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/deck/sortStorage.ts:80
- **Detail**: The serializer embeds the `mode` object as-is, unlike `parseHistory` which filters. In practice no extras leak: the read path (`parseSortMode`) rebuilds field-by-field and the writer always passes a whitelisted mode — the read side is the real boundary and strips correctly.
- **Fix**: None needed — read-path validation is sufficient.
- **Decision**: SKIPPED (accepted as-is)

### F4 — Two unrelated tooling files bundled into the Phase 2 commit

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/launch.json (new), .husky/pre-commit (shebang line)
- **Detail**: Both rode into commit c9cc25a at the user's explicit approval during the dirty-path prompt. `.husky/pre-commit` is husky's own auto-migration (added `#!/usr/bin/env sh`); `.claude/launch.json` is the preview dev-server config added to run manual verification. Neither touches the feature or its guardrails.
- **Fix**: Accept as-is (already approved).
- **Decision**: ACCEPTED (user-approved at commit time)
