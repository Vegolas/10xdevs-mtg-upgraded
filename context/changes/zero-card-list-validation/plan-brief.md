# Zero-Card List Validation — Plan Brief

> Full plan: `context/changes/zero-card-list-validation/plan.md`
> Finding (acts as the frame): `context/archive/2026-09-06-shared-stale-response-guard/findings.md` — F-6

## What & Why

Four guards across two components test raw text with `trim()` while everything downstream works on
parsed entries. Deck text that is non-empty but parses to zero cards — comments, section headers,
blank lines — slips through all four. The path builder answers it with **"✓ All cards resolved."**,
which is the one signal on that surface meaning "safe to save", and will persist a checkpoint
holding no cards at all.

## Starting Point

`parseDeckList` deliberately drops blank lines, comments and section headers, and `resolveCards([])`
short-circuits before any fetch — so the zero-entry path completes *successfully* and each consumer
draws the wrong conclusion from a clean result. F-6 filed this on 2026-09-07 with its citations
re-verified, naming three sites. Verifying it against the code found a fourth site and a second,
worse symptom.

## Desired End State

Text that parses to zero card lines produces an explicit, mode-appropriate message on every surface
that consumes it — never a success verdict, never a persisted checkpoint, never a silent reset.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Predicate shape | Two predicates, not one | `runDiffCheck` feeds `parseDeltaList`, a different parser — F-6's single `parseDeckList` predicate would never fire there | Plan (corrects F-6) |
| Predicate placement | Exported helper per parser | Gives a pure node-layer seam to unit-test, and keeps each rule beside the parser that defines it | Plan |
| Diff-mode zero entries | Block, with its own message | It persists a silent duplicate of the prior checkpoint — a worse symptom than the empty case F-6 describes | Plan (extends F-6) |
| Feedback surface | Reuse the two existing banners | `checkError` and `addState` already exist with distinct `aria-label`s; no new atom, banner or lane | Plan |
| Test layer | Predicate unit tests **+** browser specs | The repo has no component-render layer, so unit tests can prove the rule but never that the component calls it | Plan |
| Server-side gate | Out of scope | Whether an empty snapshot is *ever* legitimate is a product decision this change hasn't made | Plan |
| DeckComparer | In scope | Same input, and its silent reset with both boxes visibly full is its own confusion | Plan |

## Scope

**In scope:** two pure predicates + unit tests; the three `PathEditor` guards (`runCheck`,
`runDiffCheck`, `handleAddStep`) wired to the existing banners; `DeckComparer`'s new no-cards
verdict carrying which box was empty; four browser specs with a targeted break each.

**Out of scope:** server-side rejection of empty snapshots; a component-render test layer; the
existing `trim()` guards' current messages; the Check button's `disabled` expression; malformed-line
handling (`4x` already routes to `UnresolvedNotice` correctly).

## Architecture / Approach

Extract the rule once per parser, then call it from every consumer:

```
parse.ts   → hasNoCardLines  ─┬─→ PathEditor.runCheck        → checkError banner
                              ├─→ PathEditor.handleAddStep   → addState banner   (full mode)
                              └─→ plan.ts generateUpgradePlan → DeckComparer no-cards view
delta.ts   → hasNoDeltaLines ─┬─→ PathEditor.runDiffCheck    → checkError banner
                              └─→ PathEditor.handleAddStep   → addState banner   (diff mode)
```

`generateUpgradePlan` already gates on `entries.length === 0` — the correct pattern exists in the
repo, and this change generalizes it rather than inventing one.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. The predicates | Two pure, unit-tested helpers on their barrels; no behavior change | A future refactor folding `malformed` into "no entries" would swallow the `UnresolvedNotice` path — pinned by an explicit false-for-`4x` assertion |
| 2. PathEditor's three guards | The false ✓, the no-op diff preview and both bad persists all refused | The three specs must paste comment/header text **only** — anything malformed renders a different surface and the spec passes vacuously |
| 3. Comparer's no-cards verdict | A message naming the offending box | `PlanOutcome` gains a field, so the existing `plan.test.ts:88` assertion fails by design |

**Prerequisites:** none — all four sites and both parsers exist today.
**Estimated effort:** ~2-3 sessions; Phase 2 is roughly half the work.

## Open Risks & Assumptions

- The browser specs are the only layer that can see this defect, so their quality *is* the
  regression net. `lessons.md` records two separate occasions where a green path-builder spec
  covered nothing; each phase therefore carries a per-site targeted break as manual verification.
- Assumes a checkpoint with zero cards is never intentional. Plausible for the base deck, less
  certain for a diff that removes everything — which is exactly why the server gate is held out
  rather than added silently.
- Existing checkpoints already saved empty (or duplicating their predecessor) are left in place;
  this change only stops new ones.

## Success Criteria (Summary)

- Pasting comment-only text and clicking Check answers with a sentence naming the problem, on both
  entry modes and on the comparer — never `✓ All cards resolved.`
- Add refuses the same text and no step appears after a reload
- Count-only text (`4x`) still routes to `UnresolvedNotice`, unchanged
