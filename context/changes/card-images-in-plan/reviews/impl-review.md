<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Card Images in the Upgrade Plan

- **Plan**: context/changes/card-images-in-plan/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-06-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (eslint.config — sanctioned, user-approved adaptation) |
| Safety & Quality | WARNING (2 a11y/UX findings, both LOW impact) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (tests 69 passed, lint clean, astro check 0 errors, build OK) |

All 7 planned items MATCH intent; no DRIFT/MISSING; `Card` contract and `astro.config.mjs` untouched. A `git diff` of `src/lib` + `astro.config.mjs` over the change range is empty.

## Findings

### F1 — Hover/focus preview adds nothing for assistive-tech users

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (accessibility)
- **Location**: src/components/deck/CardRow.tsx:48-55
- **Detail**: The enlarge popover img was alt="" (decorative) and the button name = card.name (same as the visible text). Marginal in practice — a screen reader can't use an enlarged image, and verbose labels on 100+ cards would be noisier.
- **Fix**: Add aria-hidden="true" to the decorative preview img.
- **Decision**: FIXED

### F2 — cursor-default on an interactive control misleads

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UX/affordance)
- **Location**: src/components/deck/CardRow.tsx:45
- **Detail**: The thumbnail button was cursor-default, under-advertising the hover/focus enlarge.
- **Fix**: Change cursor-default → cursor-zoom-in.
- **Decision**: FIXED

### F3 — Preview can overflow column/viewport edges (no flip logic)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — accepted MVP limitation, already manually verified
- **Dimension**: Safety & Quality (UX)
- **Location**: src/components/deck/CardRow.tsx:49-54
- **Detail**: Popover is fixed `bottom-full left-0 w-80` with z-50 and no collision repositioning; top rows / right column could clip. Manual check 2.7 passed, so fine today.
- **Fix**: (deferred) Add position clamping/flip if a responsive/mobile pass lands (currently a non-goal).
- **Decision**: SKIPPED (accepted)

### F4 — Thumbnail sets loading="lazy" but not decoding="async"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — negligible; nice-to-have
- **Dimension**: Safety & Quality (performance)
- **Location**: src/components/deck/CardRow.tsx:47
- **Detail**: With 100+ thumbnails, decoding="async" avoids minor main-thread decode jank.
- **Fix**: Add decoding="async" to the thumbnail img.
- **Decision**: FIXED

### F5 — eslint ignore `.claude/**` broader than its stated reason

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — intentional, low risk
- **Dimension**: Pattern Consistency (tooling)
- **Location**: eslint.config.js:73
- **Detail**: Rationale was "don't lint nested worktrees," but `.claude/**` also excludes any future skill source under `.claude/skills/`. A narrower `.claude/worktrees/**` would be more surgical.
- **Fix**: (not applied) Narrowing risks re-exposing unlinted files elsewhere under `.claude`; the broad glob is the safer choice for lint stability.
- **Decision**: SKIPPED (broad glob kept intentionally)
