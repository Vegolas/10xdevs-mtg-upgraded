# Fuzzy-Fix on Save (Path Builder) — Plan Brief

> Full plan: `context/changes/fuzzy-fix-on-save/plan.md`
> Shape notes: `context/foundation/shape-notes.md`

## What & Why

The path builder's add-checkpoint flow shows unresolved ("did you mean…?") cards only
**read-only, after the snapshot is saved** — unlike the `/` comparer (S-05), which offers
one-click Accept. This brings the builder to parity: a pre-save **Check** action surfaces
unresolved cards with Accept / Accept-all, applied to the paste text **before** the immutable
snapshot is written. The driver is consistency across surfaces; immutability (FR-006) is the
technical constraint the fix respects by acting only on the editable pre-save input.

## Starting Point

`PathEditor.handleAddStep` resolves the pasted list and POSTs an immutable `StepSnapshot` in
one shot; unresolved cards are stored and shown read-only on the saved step (suggestions
stripped). S-05's `applySuggestion` (pure, single-text) and the `UnresolvedNotice` component
already exist; the `/` comparer wires them. The path builder simply never did.

## Desired End State

In the add-checkpoint form, the user clicks **Check** → sees unresolved cards with suggestions
and one-click **Accept** / **Accept all** → the corrected name replaces the typo in the paste
box and the notice auto-refreshes (showing "✓ all cards resolved" when clear) → **Add** saves a
checkpoint that includes the corrected card. Saved steps, the `/` comparer, and the engine are
unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Accept target | Rewrite the paste textarea in place | Reuse S-05 `applySuggestion`; one source of truth | Shape |
| Trigger | Explicit **Check** button (no debounce) | Fits PathEditor's button-driven model | Shape |
| Accept scope | Per-card + Accept all | Full S-05 parity | Shape |
| Single-list accept-all | New pure `applyAllSuggestions(text, entries)` | `acceptAllSuggestions` is base/target-shaped, unusable for one list | Plan |
| Add ↔ Check | Add stays independent (Check optional) | Smallest change; preserves today's Add behavior | Plan |
| After accept | Auto re-check, refresh notice | Mirrors `/` accept loop; tight feedback | Plan |

## Scope

**In scope:** pre-save Check in `PathEditor`; editable unresolved notice with per-card Accept +
Accept all; `listText` rewrite + auto re-check; "✓ all resolved" state; one pure helper + test.

**Out of scope:** editing saved/immutable steps; auto-accept; blocking/nudging Add; stale-price
refresh; any change to the `/` comparer, engine, `UnresolvedNotice`, API, or snapshot schema.

## Architecture / Approach

One new pure function (`applyAllSuggestions`) beside the existing S-05 accept helpers, then all
UI wiring confined to `PathEditor.tsx`: a token-guarded `runCheck` calls `resolveDeck` (no POST),
feeds the existing `UnresolvedNotice`, and Accept handlers rewrite `listText` then re-run
`runCheck` — the explicit analog of `DeckComparer`'s debounced "set text, rebuild" loop.
`handleAddStep` is untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Accept-all helper | Pure `applyAllSuggestions` + unit tests | Low — mirrors an existing tested helper |
| 2. PathEditor wiring | Check button, editable notice, accept + re-check | Stale re-check if reading text from state instead of the rewritten local |

**Prerequisites:** none (S-05 logic already shipped).
**Estimated effort:** ~1 session across 2 phases (≤1 week, after-hours).

## Open Risks & Assumptions

- The re-check after accept reads the rewritten text from a local variable, not React state, to
  avoid a stale resolve (no debounce safety net here).
- The nominal `deck: "target"` label on the notice is acceptable in the single-list path-builder
  context — it already appears on saved steps today.

## Success Criteria (Summary)

- A mistyped card in a checkpoint list can be corrected via Check → Accept before saving, and the
  saved snapshot includes the correction.
- Accept all fixes multiple typos in one click; a clean list shows "✓ all cards resolved".
- The `/` comparer, the engine, and saved-step immutability are unchanged.
