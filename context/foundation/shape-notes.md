---
project: "DeckDelta"
context_type: brownfield
created: 2026-06-29
updated: 2026-06-29
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 2   # PathEditor input + derive fn; +additive delta-persistence (schema/API field) for provenance
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 8
  gray_areas_resolved:
    - topic: "diff base reference"
      decision: "Delta applies to the immediately-preceding step's resolved (frozen) list; deltas compound down a linear path"
    - topic: "coexistence with full-paste"
      decision: "Coexist — full-paste input stays; diff-entry is an alternate input mode chosen per checkpoint"
    - topic: "first step / base"
      decision: "Base / first checkpoint is still a full paste; diff-entry unlocks from step 1 onward (requires a predecessor)"
    - topic: "domain-rule impact"
      decision: "No domain-rule change — the diff/cost engine is untouched; only a new 'prior frozen list ± delta → full list' derive compute is added, feeding the existing resolve→snapshot path"
    - topic: "delta persistence"
      decision: "Persist the entered delta for provenance (additive, nullable field on the step + optional /api/paths/* field); accepted the schema/API change over the tighter no-persist slice"
  quality_check_status: accepted
---

> Brownfield change `diff-style-checkpoint-entry` (path-builder QOL). Deferred
> idea from memory `path-builder-qol`. Body ordered to match the 11 brownfield
> PRD sections (`skills/10x-shape/references/prd-schema.md`).

## Current System Overview

- **System purpose (one sentence):** DeckDelta turns the manual side-by-side comparison of two Commander/EDH deck lists into an actionable, grouped upgrade plan; signed-in users persist multi-step **upgrade paths** (ordered named checkpoints).
- **Key architecture:** Client-heavy Astro + React. Card resolution (`resolveDeck`) and the diff/cost engine run in the browser. Paths persist via `/api/paths/*` on a cookie-bound, RLS-scoped Supabase client.
- **Path-builder input today:** In `PathEditor`, adding a checkpoint means pasting a **full ~80-card deck list**. On "Add" → `resolveDeck` → an immutable `StepSnapshot` → POST. Every checkpoint is a standalone complete list, regardless of how little changed from the prior step.
- **Current user base:** Signed-in EDH brewers building paths; small scale, low QPS.

## Problem Statement & Motivation

- **The gap:** To express a small change between steps — e.g. swap out one card for another — the brewer must re-paste the entire ~80-card list, deleting the line they're removing and adding the line they're adding. ~78 lines of unchanged text are pure noise around a 2-line intent.
- **Why now (insight):** Real upgrade paths are mostly **small deltas** ("- Sol Ring", "+ Black Lotus"). The full-paste model never matched how brewers actually think about a step; it forces them to reconstruct the whole list to record a couple of swaps.
- **Current workaround & its cost:** Find/copy the prior full list, hand-edit two lines, re-paste. Tedious and error-prone — easy to drop or duplicate an unrelated line while editing 80 entries.

## User & Persona

**Primary persona — the Returning EDH Brewer.** A signed-in Commander player building and iterating a multi-step upgrade path. Each checkpoint is usually a *small* change from the one before it (a few swaps, an added staple). They want to record that change as the change itself — "+ X, - Y" — not by re-pasting an entire deck list each time.

## Success Criteria

### Primary
A signed-in brewer adding a checkpoint after at least one existing step can **switch to diff-mode, type only `+ <card>` / `- <card>` lines, and Add** — DeckDelta derives the new checkpoint's full list from the **prior step's frozen snapshot** with the delta applied, resolves it, and persists it as a normal immutable `StepSnapshot`. The resulting checkpoint is indistinguishable from one entered via full paste.

### Secondary
**Pre-save preview of the derived list** — before saving, the brewer can see the resulting full list (or a +/- summary with card count) so they can sanity-check what the snapshot will contain. Nice-to-have that mitigates the wrong-derived-snapshot risk; not sufficient on its own.

### Guardrails
- **Derived-snapshot correctness.** The persisted full list must equal `prior frozen list ± delta` exactly — a derive bug must never silently corrupt a saved step. (Blast-radius #1.)
- **Defined behavior for a delta that references a missing card.** A `- <card>` whose target isn't in the prior list (typo, or never present) is surfaced visibly, never silently dropped or mis-applied. (Blast-radius #2.)
- **No silent drops on `+` lines.** An added card that doesn't resolve is surfaced to the user, not quietly omitted from the snapshot. (Blast-radius #3.)
- **Full-paste flow + engine unchanged.** The existing full-paste add path and the resolve/diff/cost engine behave byte-identically to today; diff-mode is purely additive input.
- **Saved-snapshot immutability preserved (FR-006).** Deltas derive from the *frozen* prior snapshot; already-saved steps are never mutated.

## User Stories

### US-01: Brewer records a small swap as a diff

- **Given** a signed-in brewer on `/paths/[id]` adding a checkpoint after at least one existing step
- **When** they switch the input to diff-mode, type `+ Black Lotus` and `- Sol Ring`, and click Add
- **Then** DeckDelta derives the new full list from the prior step's frozen snapshot (with Black Lotus added and Sol Ring removed), resolves it, and persists a normal immutable `StepSnapshot` — no full re-paste of the ~80-card list
- **Before (delta):** the brewer had to copy the prior full list, hand-edit the two lines, and re-paste the entire deck.

#### Acceptance Criteria
- Diff-mode is only offered when a predecessor step exists; the base/first checkpoint still uses full paste.
- The derived persisted list equals `prior frozen list ± delta` exactly.
- After save the step is immutable and renders identically to a full-pasted checkpoint.
- The full-paste path and the resolve/diff/cost engine are unchanged.

### US-02: Brewer's delta references a card that can't be applied

- **Given** a brewer entering a diff-mode checkpoint
- **When** a `- <card>` line names a card absent from the prior list, or a `+ <card>` line doesn't resolve
- **Then** the unapplicable line is surfaced before/at save — never silently dropped — so the brewer can correct it rather than persist a wrong snapshot

#### Acceptance Criteria
- A `- <card>` with no match in the prior list is shown as unapplicable (not a silent no-op).
- A `+ <card>` that doesn't resolve is surfaced (not silently omitted).
- The brewer can see the resulting derived list (FR-004) before committing the snapshot.

## Scope of Change

> FR-NNN lines with a change category (`new` / `preserved`) and priority; `/10x-prd` maps these into the brownfield **Scope of Change** section. Socratic challenge inline on new FRs; rationale inline on preserved FRs.

### New
- FR-001: A user can switch the add-checkpoint/add-base input to **diff-mode** and enter `+ <card>` / `- <card>` lines instead of a full deck list, available only when a predecessor step exists. Priority: must-have. Change: new
  > Socratic: Counter considered — "two input modes confuse users." Resolution: kept; full-paste stays the **default** and diff-mode is a clearly-labelled opt-in toggle per checkpoint, so the existing flow is never displaced. Labelling/affordance detail carried to Open Questions.
- FR-002: On Add in diff-mode, the system **derives** the new checkpoint's full list from the **prior step's frozen snapshot** with the delta applied, then resolves and persists it as a normal immutable `StepSnapshot`. Priority: must-have. Change: new
  > Socratic: Counter considered — "the prior step could itself be unresolved/dirty, so the derived base inherits its problems." Resolution: stands — derive from the prior snapshot's stored (frozen) list and surface anything still unresolved (ties to FR-003); deterministic base, immutability preserved. Behavior when the prior snapshot carries its own unresolved cards carried to Open Questions.
- FR-003: A user is shown any delta line that **cannot be applied** — a `- <card>` not present in the prior list, or a `+ <card>` that does not resolve — rather than having it silently dropped. Priority: must-have. Change: new
  > Socratic: Counter considered — "the error UI is most of the work." Resolution: stands — silent drops would violate the card-data-accuracy guardrail the rest of the app upholds; v1 surfacing can be minimal but must never be silent.
- FR-004: A user can **preview** the derived full list (or a +/- summary with card count) before saving the diff-mode checkpoint. Priority: must-have. Change: new
  > Socratic: Counter considered — "preview is a nice-to-have; ship the derive+save core first." Resolution: **promoted to must-have** — because the snapshot is immutable once written, a pre-save look at what will be persisted is the primary defense against the wrong-derived-snapshot risk (blast-radius #1).
- FR-008: A user's entered delta is **persisted with the checkpoint** (provenance), so a step records that it was diff-authored and preserves the literal `+`/`-` intent. Priority: must-have. Change: new
  > Socratic: Counter considered — "the engine already derives a step's +/- from adjacent snapshots, so storing the entered delta is redundant and costs a schema + API change." Resolution: **persist anyway** — the user chose provenance (authoring intent + a 'diff-entered' record) over the tighter no-schema-change slice; the field is additive/nullable so existing steps and full-paste checkpoints are unaffected. Storage shape and display carried to Open Questions.

### Preserved
- FR-005: The full-paste checkpoint input remains available and unchanged; diff-mode is an alternate input the user opts into per checkpoint. Priority: must-have. Change: preserved
  > Rationale: defensive FR for the "everything works the same" promise — full-paste is the default surface and must behave byte-identically; diff-mode is purely additive.
- FR-006: Saved checkpoint snapshots remain immutable; diff-mode derives from the prior **frozen** snapshot and never mutates already-saved steps. Priority: must-have. Change: preserved
  > Rationale: makes saved-step immutability explicit so the new derive path can't accidentally make stored snapshots mutable; the delta only ever reads the prior snapshot, never writes it.
- FR-007: The resolve/diff/cost engine and the `/` comparer are unchanged. Priority: must-have. Change: preserved
  > Rationale: diff-mode reuses `resolveDeck` and the engine as-is; `DeckComparer` and engine output must be identical to today.

## Business Logic Changes

**No domain-rule change.** The product's domain rule (grouped, quantity-aware base→target diff with approximate prices, chained across path checkpoints) is untouched. The only new computation is **`prior frozen list ± delta → full list`** at checkpoint-creation time; that derived list then flows through the *existing* resolve → snapshot → POST path. This is an **input + flow change**, not a rule change.

Supporting detail:
- **Reused logic (unchanged):** `resolveDeck` (client-side resolution) and the diff/cost engine.
- **New compute:** a delta-application step — take the prior step's frozen snapshot list, apply `+ <card>` / `- <card>` lines, produce a candidate full list. Unapplicable lines (a `-` not present, a `+` that won't resolve) are surfaced (FR-003), not silently absorbed.
- **Snapshot semantics unchanged:** the derived list is resolved and persisted as a normal immutable `StepSnapshot`; once saved, the step is frozen.

## Constraints & Compatibility

- **Backward compatibility:** the `StepSnapshot` shape and the `/` comparer are unchanged. Diff-mode produces the same snapshot via the same resolve→POST path; an old saved step renders exactly as before. **The `/api/paths/*` contract gains one optional, additive field** to carry the persisted delta (FR-008) — existing clients/payloads without it remain valid.
- **Data migration:** a new **nullable** column/field stores the entered delta; existing steps have `null` (they were full-pasted) and render unchanged. No backfill required — the engine still derives their step-to-step diff from adjacent snapshots.
- **Existing integrations:** Scryfall resolution stays client-side and unchanged; no new dependency.
- **Preserved behavior (must not change):** saved-step immutability (FR-006), the diff/resolve/cost engine output (FR-007), the `/` comparer (FR-007), and the full-paste add flow as the default input surface (FR-005).
- **Surface boundary:** UI changes are confined to the path-builder add-checkpoint form (`PathEditor.tsx` + helpers); plus an additive field on the step persistence path (`/api/paths/*` and its store) for the delta. No engine or comparer code changes.

## Access Control Changes

**No change.** Diff-style entry lives entirely inside the existing signed-in, owner-scoped add-checkpoint flow (`/paths/[id]`, RLS-enforced). No new auth method, no role changes, no new gated routes. The anonymous `/` comparer is untouched. Current model preserved.

## Non-Functional Requirements

_(Supplementary shape block — `/10x-prd` may fold these into Success Criteria guardrails / Constraints.)_

- **Continuous visible feedback** while a diff-mode entry resolves (reuse `resolveDeck`'s existing pending state); a typical checkpoint resolves without a jarring wait.
- **Consistency with the full-paste surface** — diff-mode shares the look and resolution behavior of the existing add-checkpoint form so a user who knows one knows the other.
- **No new external calls** beyond the resolution the add flow already performs; diff-mode resolves the same way full-paste does, just on a derived list.
- **Unchanged cards are preserved verbatim** — applying a delta changes only the cards named in `+`/`-` lines; every other card from the prior frozen snapshot carries over identically.
- **Additive persistence** — the stored delta field is optional; its presence/absence never changes how existing steps or full-pasted checkpoints render.

## Non-Goals

Functional non-goals:
- **Editing already-saved checkpoint steps via diff** — diff-mode is for entering **new** checkpoints only. A stored snapshot stays immutable; correcting or re-deriving a saved step is out of scope (FR-006).
- **Making diff-mode the default input** — full-paste remains the default surface; diff-mode is an opt-in alternate. v1 will not flip the default.
- **Mid-path insert / reorder + re-base cascade** — diff appends against the latest predecessor. Inserting a checkpoint between existing steps and re-deriving downstream snapshots stays deferred.
- **Diff against an arbitrary chosen step** — the base is locked to the immediately-preceding step; choosing any earlier checkpoint as the reference is out of scope (per the Phase-1 decision).

Non-functional non-goals:
- **Mobile-optimized layout for the diff-mode UI** — desktop-first carried from the baseline; functional-but-unoptimized mobile is acceptable.

## Open Questions

1. **Diff-mode affordance** — exact UI for switching into diff-mode (toggle / tab / separate field) and how it's labelled so it doesn't confuse users while keeping full-paste the default. — Owner: `/10x-plan`. Block: no.
2. **Prior snapshot carrying its own unresolved cards** — behavior when the predecessor step's frozen snapshot already contains unresolved cards: does the derived base include them, and how are they surfaced alongside the new delta's issues? — Owner: `/10x-plan`. Block: no.
3. **Persisted-delta storage shape & display** — store the raw entered text vs a structured `+`/`-` entry list; and how a "diff-authored" step is displayed (badge, +/- summary). — Owner: `/10x-plan`. Block: no.
4. **Delta quantity semantics** — EDH is largely singleton, but basics can have N copies; does the delta support quantities (`+2 Island`, `-1 Forest`) and how does `-` interact with a card present in a different quantity? — Owner: `/10x-plan`. Block: no.

## Quality cross-check

Ran at finalize (Phase 7). All 7 brownfield elements present — **no gaps**. `quality_check_status: accepted`.
