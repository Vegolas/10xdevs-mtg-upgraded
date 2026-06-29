# Diff-mode Checkpoint Entry — Plan Brief

> Full plan: `context/changes/diff-style-checkpoint-entry/plan.md`
> PRD: `context/foundation/prd-diff-checkpoint.md`
> Shape: `context/foundation/shape-notes.md`

## What & Why

Let a signed-in brewer add an upgrade-path checkpoint by typing only `+ <card>` / `- <card>` change lines instead of re-pasting an entire ~80-card list. Real upgrade paths are mostly small deltas ("− Sol Ring", "+ Black Lotus"); the full-paste model forces ~78 lines of unchanged noise around a 2-line intent, and hand-editing 80 entries is error-prone.

## Starting Point

The add-checkpoint form in [PathEditor.tsx](src/components/path/PathEditor.tsx) takes a name + a full-list textarea; `handleAddStep` resolves the list, builds an immutable `StepSnapshot {cards, unresolved}`, and POSTs it to `/api/paths/[id]/steps`. The prior step's frozen snapshot is already in component memory, and the resolve engine (`resolveCards`, `resolutionKey`, `splitCardLine`) is fully reusable — only the input mode is missing.

## Desired End State

On a path with ≥1 step, a "Full list / Changes" toggle appears. In Changes mode the brewer types `+`/`-` lines (counts optional: `+2 Island`), previews a summary + the full derived list, and saves a checkpoint that is byte-equivalent to a full paste — with the raw delta stored for provenance and a small "diff-entered" badge. Full-paste stays the default and the engine is untouched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Quantity semantics | Quantity-aware, bare = ±1 | Matches the user's literal `+1/-1` example and basic-land counts; reuses `splitCardLine` | Plan |
| Mode affordance | Segmented toggle over a shared textarea | One control, full-paste stays default & primary, opt-in per checkpoint | Plan |
| Delta persistence | Nullable `delta_text` column; `list_text` = derived list | Additive, no backfill, snapshot shape unchanged | Plan |
| Prior-unresolved cards | Carry forward verbatim into the new snapshot | Deterministic, honors the no-silent-drop guardrail | Plan |
| Preview | Summary line + full derived list (reuse Check) | Strongest defense against a wrong immutable snapshot | Plan |
| Bad delta lines | Reuse `UnresolvedNotice`; surface + allow save | Consistent with how full-paste permits saving with unresolved cards | Plan |
| Persisted `unresolved` | Only `+` resolve-failures; `-`-miss/malformed are preview-only | Keeps the stored snapshot semantically clean | Plan |

## Scope

**In scope:** delta parser + async derive function (unit-tested); mode toggle + preview in `PathEditor`; derived snapshot through the existing POST; additive nullable `delta_text` column + provenance badge.

**Out of scope:** editing saved checkpoints via diff; making diff-mode the default; mid-path insert / re-base; diffing against an arbitrary earlier step; engine / comparer / auth changes; mobile-optimized diff UI.

## Architecture / Approach

New pure-ish logic in `src/lib/path/`: `parseDeltaList(text)` → signed entries (reusing `splitCardLine`), and `async deriveSnapshot(prior, deltaText)` → `{ snapshot, warnings, summary }`. Derive applies the delta to the prior snapshot's resolved cards keyed by `resolutionKey`, calling `resolveCards` only for genuinely new `+` cards. `PathEditor` gains a `mode` state and branches `Check`/`Add`; the derived snapshot rides the existing POST. Phase 2 threads a nullable `delta_text` through migration → DB types → `PathStep` → `StepInput` → insert → `toPathStep`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Delta engine + diff-mode UI & preview | Full user-visible feature (delta not yet persisted) | Derive correctness — must equal `prior ± delta` exactly; covered by unit tests |
| 2. Delta persistence + provenance | Nullable `delta_text` column + badge | Migration must be pushed to the linked DB before remote saves carry it (S-08 lesson) |

**Prerequisites:** none beyond the existing accounts/paths feature (S-08, shipped).
**Estimated effort:** ~2 sessions — Phase 1 is the bulk (engine + tests + UI), Phase 2 is a thin additive schema change.

## Open Risks & Assumptions

- Derive correctness is the #1 blast radius (immutable snapshot); mitigated by the pure-function unit suite and the must-have preview.
- `list_text` is assumed display/reference-only on read (render uses `snapshot.cards`); storing the derived list there keeps it meaningful. If anything re-parses `list_text`, revisit.
- Adding delta-warning rendering to the shared `UnresolvedNotice` must not alter its behavior in the comparer.

## Success Criteria (Summary)

- A brewer records a swap as `+ X` / `- Y` and saves a checkpoint identical to the full-paste equivalent — no 80-line re-paste.
- Unapplicable `-` lines and unresolved `+` cards are always surfaced, never silently dropped.
- Full-paste flow, the resolve/diff/cost engine, and the anonymous `/` comparer are unchanged.
