---
project: "DeckDelta"
context_type: brownfield
created: 2026-06-28
updated: 2026-06-28
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 1   # trivial parity fix; reuses shipped S-05 accept logic
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "change category"
      decision: "Parity enhancement — bring the path builder's add-checkpoint flow to parity with the `/` comparer's shipped did-you-mean accept (S-05); reuse existing logic"
    - topic: "primary persona"
      decision: "Returning EDH Brewer — the signed-in player building/iterating multi-step upgrade paths"
    - topic: "load-bearing insight"
      decision: "Inconsistent UX across surfaces — two paste surfaces (`/` comparer vs path builder) behave differently for the same did-you-mean case; immutability of saved snapshots (FR-006) is the technical constraint, not the driver"
    - topic: "access control"
      decision: "No change — feature lives inside the existing signed-in, owner-RLS-scoped add-checkpoint flow"
    - topic: "accept target"
      decision: "Rewrite the paste textarea text in place (reuse S-05 applySuggestion/acceptAllSuggestions on listText); textarea stays the single source of truth, re-resolve from corrected text before save"
    - topic: "accept trigger / flow"
      decision: "Explicit 'Check' button in the add-checkpoint form: resolves the pasted list and reveals the unresolved notice with Accept; Add/Save remains available after review (button-driven, consistent with PathEditor's existing non-debounced model)"
    - topic: "accept scope"
      decision: "Per-card Accept + Accept all (N) — full parity with S-05"
  frs_drafted: 5
  quality_check_status: accepted
---

> Brownfield change `fuzzy-fix-on-save` (path-builder QOL). Deferred from the
> `user-accounts` cycle; captured in memory `path-builder-qol`.
> Body ordered to match the 11 brownfield PRD sections
> (`skills/10x-shape/references/prd-schema.md`).

## Current System Overview

- **System purpose (one sentence):** DeckDelta turns the manual side-by-side comparison of two Commander/EDH deck lists into an actionable, grouped upgrade plan; signed-in users persist multi-step **upgrade paths** (ordered named checkpoints).
- **Key architecture:** Client-heavy Astro + React. Card resolution (`resolveDeck`) and the diff/cost engine run in the browser; `src/lib/deck` already ships `applySuggestion` / `acceptAllSuggestions` (S-05) for "did you mean…?" correction. Paths persist via `/api/paths/*` on a cookie-bound, RLS-scoped Supabase client.
- **Two paste surfaces today:**
  - `/` **comparer** (`DeckComparer`) — debounced resolve; unresolved cards with a `suggestion` get a one-click **Accept** (per-card) + **Accept all** that rewrites the paste text in place and re-resolves (S-05).
  - **Path builder** (`PathEditor` add-checkpoint/add-base form) — on "Add", it calls `resolveDeck`, builds an immutable `StepSnapshot`, and POSTs immediately. Unresolved cards are surfaced **only after save**, read-only (`toReadOnlyEntries` strips suggestions; no Accept).
- **Current user base:** Signed-in EDH brewers building paths; small scale, low QPS.

## Problem Statement & Motivation

- **The gap:** In the path builder, a pasted checkpoint list with a mistyped/unresolved card that *has* a near-match suggestion gives the user **no way to accept the fix**. The card is silently dropped from the snapshot or the user must hand-edit and re-paste — even though the `/` comparer solved exactly this with one click (S-05).
- **Why now (insight):** **Inconsistent UX across surfaces** — the same "did you mean…?" moment behaves differently depending on where the user pastes. The accept logic already exists and ships on `/`; the path builder just never wired it. Saved-snapshot immutability (FR-006) is the *technical constraint* that shaped the original omission, not a reason to keep it.
- **Current workaround & its cost:** The user manually retypes the corrected card name in the paste box before saving (no hint-to-fix shortcut), or saves a checkpoint that quietly omits the unrecognized card — eroding the card-data-accuracy guardrail the rest of the app upholds.

## User & Persona

**Primary persona — the Returning EDH Brewer.** A signed-in Commander player building and iterating a multi-step upgrade path. They paste each checkpoint's deck list (often copied from a deckbuilder where a name may be slightly off), and expect the same frictionless "did you mean…? → Accept" correction they already get in the anonymous `/` comparer. The fix matters most at checkpoint-creation time, before a step is saved (and frozen).

## Success Criteria

### Primary
A signed-in user adding a checkpoint can **resolve the pasted list before saving via an explicit "Check" action, see each unresolved card that has a near-match suggestion with a one-click Accept (and Accept all), and accept it** — the corrected name replaces the bad one **in the paste box**, and saving the checkpoint produces a snapshot that includes the corrected card. This is the same did-you-mean correction the `/` comparer already offers (S-05), now available in the path builder *before* the immutable snapshot is written.

### Secondary
**Accept all (N)** corrects every suggestion-bearing card in one click when a pasted list has multiple typos — nice-to-have batch convenience on top of per-card accept; not sufficient on its own.

### Guardrails
- **Saved-snapshot immutability preserved (FR-006).** Accept acts only on the *pre-save* paste input; already-saved steps stay immutable and keep their read-only unresolved notice (no Accept on a stored step).
- **`/` comparer and engine output unchanged.** The fix reuses `applySuggestion` / `acceptAllSuggestions` and `resolveDeck` without altering them; `DeckComparer` behaves exactly as today.
- **No silent drops at save.** A checkpoint never silently omits an unresolved card that had an accept-able suggestion the user wasn't shown — the Check step surfaces it first.

## Access Control Changes

**No change.** Fuzzy-fix lives entirely inside the existing signed-in, owner-scoped add-checkpoint flow (`/paths/[id]`, RLS-enforced). No new auth method, no role changes, no new gated routes. The anonymous `/` comparer is untouched. Current model preserved.

## User Stories

### US-01: Brewer fixes a mistyped card before saving a checkpoint

- **Given** a signed-in brewer adding a checkpoint, who has pasted a deck list containing a mistyped card name that the card-data source can near-match (e.g. `Sol Rng` → `Sol Ring`)
- **When** they click **Check**, see the unresolved card with a "did you mean **Sol Ring**?" hint and an **Accept** button, and click Accept
- **Then** `Sol Ring` replaces `Sol Rng` in the paste box, the list re-resolves clean, and saving the checkpoint stores a snapshot that includes Sol Ring — no manual retyping, no silent drop
- **Before (delta):** the path builder showed unresolved cards only *after* saving, read-only, with no Accept — the brewer had to hand-edit and re-paste, or unknowingly save a checkpoint missing the card.

#### Acceptance Criteria
- Check resolves the current paste text without creating a checkpoint; unresolved cards with a `suggestion` render an Accept control (and Accept all when ≥2 carry suggestions).
- Accept rewrites the paste textarea in place (via the existing `applySuggestion`), preserving all other pasted lines; the list is re-resolved from the corrected text.
- Saving after accepting persists a snapshot containing the corrected card; the saved step is then immutable and shows the read-only notice for anything still unresolved.
- The `/` comparer and the resolve/diff/cost engine are unchanged.

## Scope of Change

> FR-NNN lines with a change category (`new` / `preserved`) and priority; `/10x-prd` maps these into the brownfield **Scope of Change** section. Socratic challenge inline.

### New
- FR-001: A user can trigger a **Check** action on the add-checkpoint/add-base form to resolve the pasted list before saving, surfacing unresolved cards (with suggestions where available) without creating a checkpoint. Priority: must-have. Change: new
  > Socratic: Counter considered — "auto-resolve on Add (or live debounce) avoids an extra button." Resolution: kept the explicit Check button — it fits PathEditor's existing button-driven, non-debounced model and gives a clear pre-save review moment without restructuring the add flow into a debounced island.
- FR-002: A user can **Accept** a single "did you mean…?" suggestion for an unresolved card; the corrected name replaces the bad one in the paste box and the list re-resolves. Priority: must-have. Change: new
  > Socratic: Counter considered — "rewriting the textarea could clobber other edits / cursor position." Resolution: stands — reuses S-05's `applySuggestion`, which rewrites only the matched line(s) of the full text (the same mechanism the `/` comparer already ships); implementation note carried to Open Questions.
- FR-003: A user can **Accept all (N)** suggestions at once when ≥2 unresolved cards carry a suggestion. Priority: nice-to-have. Change: new
  > Socratic: Counter considered — "per-card is enough; Accept-all adds surface area." Resolution: kept as nice-to-have — `acceptAllSuggestions` already exists (S-05), so batch parity is near-zero cost; remains optional so a minimal build can ship per-card first.

### Preserved
- FR-004: Saved checkpoint snapshots remain immutable; already-saved steps keep their read-only unresolved notice with no Accept. Priority: must-have. Change: preserved
  > Rationale: defensive FR for FR-006 (saved-step immutability). Accept is a pre-save-only affordance; this FR makes "no accept on a stored step" explicit so the fix can't accidentally make saved snapshots mutable.
- FR-005: The `/` comparer's did-you-mean accept and the resolve/diff/cost engine output are unchanged. Priority: must-have. Change: preserved
  > Rationale: the fix reuses `applySuggestion` / `acceptAllSuggestions` / `resolveDeck` as-is; `DeckComparer` and engine behavior must be byte-identical to today.

## Business Logic Changes

**No domain-rule change.** The product's domain rule (grouped, quantity-aware base→target diff with approximate prices, chained across path checkpoints) is untouched. This is a **UX/flow change** that brings an existing capability — the S-05 "did you mean…?" name correction (`applySuggestion` / `acceptAllSuggestions`) — to a surface that lacked it (the path-builder add-checkpoint flow), applied *before* the immutable snapshot is written.

Supporting detail:
- **Reused logic (unchanged):** `resolveDeck` (client-side resolution), `applySuggestion` / `acceptAllSuggestions` (S-05 text rewriting), and the diff/cost engine.
- **New flow only:** a pre-save **Check** step in the add-checkpoint form that resolves the paste text, renders the unresolved notice with Accept/Accept-all, rewrites the textarea on accept, and re-resolves — then the existing resolve→snapshot→POST path runs as today on the corrected text.
- **Snapshot semantics unchanged:** once saved, a step's snapshot is immutable; correction happens only on the editable pre-save input.

## Constraints & Compatibility

- **Backward compatibility:** the saved `StepSnapshot` shape, the `/api/paths/*` contract, and the `/` comparer are all unchanged. Corrected text simply flows through the existing resolve→POST path; an old saved step renders exactly as before.
- **Data migration:** none — no schema or stored-data change. No DB work.
- **Existing integrations:** Scryfall resolution stays client-side and unchanged; the S-05 correction lib is reused as-is (no new dependency).
- **Preserved behavior (must not change):** saved-step immutability (FR-006/FR-004), the diff/resolve/cost engine output, and the `/` comparer's existing accept (FR-005).
- **Surface boundary:** all changes are confined to the path-builder add-checkpoint UI (`PathEditor.tsx` and any small helper it needs); no server, API, or engine code changes are required.

## Non-Functional Requirements

_(Supplementary shape block — `/10x-prd` may fold these into Success Criteria guardrails / Constraints.)_

- The **Check** action gives continuous visible feedback while resolving (reusing `resolveDeck`'s existing pending state) and renders a typical checkpoint list without a jarring wait.
- The correction affordance is **consistent with the `/` comparer** — same Accept / Accept-all wording and behavior, so a user who knows one surface knows the other.
- **No new external calls** beyond the resolution the add flow already performs at save time; Check resolves the same way Add does, just earlier and without persisting.
- Accepting a suggestion **preserves all other pasted content** (only the matched line is rewritten), matching S-05.

## Non-Goals

Functional non-goals:
- **Editing / correcting already-saved checkpoint steps** — fuzzy-fix is **pre-save only**. A stored snapshot stays immutable; mid-path step editing (and its downstream re-base cascade) remains deferred (FR-006).
- **Auto-accepting suggestions** — corrections are never applied automatically; the user always confirms each (or Accept-all) explicitly.
- **Stale-price / image refresh on saved steps** — re-resolving prices/images on persisted steps is a separate concern and out of scope here.
- **Fuzzy-fix in the `/` comparer** — already shipped (S-05); this change only brings the path builder to parity, it does not touch the comparer.

Non-functional non-goals:
- **Mobile-optimized layout for the Check/accept UI** — desktop-first carried from the baseline; functional-but-unoptimized mobile is acceptable.

## Open Questions

1. **Paste-box rewrite mechanics** — Accept rewrites the checkpoint textarea via the existing `applySuggestion` (matched-line only). Confirm cursor/scroll behavior is acceptable in the path-builder context (the `/` comparer already does this on a debounced field; the builder's field is button-driven). — Owner: `/10x-plan`. Block: no.
2. **Check ↔ Add interaction** — exact UX of the Check button relative to Add: does Add implicitly run a resolve when the user hasn't clicked Check, and what happens if suggestions remain unaccepted at save (save anyway with the read-only notice, as today, vs nudge)? — Owner: `/10x-plan`. Block: no.
