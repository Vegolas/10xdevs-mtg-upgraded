# Diff-mode Checkpoint Entry Implementation Plan

## Overview

Add an opt-in **diff-mode** to the path-builder's add-checkpoint form. Instead of pasting a full ~80-card list, a signed-in brewer types `+ <card>` / `- <card>` delta lines. DeckDelta derives the new checkpoint's full list from the **prior step's frozen snapshot** with the delta applied, resolves any genuinely new cards, and persists the result as a normal immutable `StepSnapshot` — plus stores the raw delta text for provenance. Full-paste stays the default surface and the resolve/diff/cost engine is untouched.

Source artifacts: [shape-notes.md](context/foundation/shape-notes.md), [prd-diff-checkpoint.md](context/foundation/prd-diff-checkpoint.md).

## Current State Analysis

The add-checkpoint form lives entirely in [PathEditor.tsx](src/components/path/PathEditor.tsx):

- The form (lines 496–585) has two inputs: `name` (text) and `listText` (textarea), plus a `Check` button (`runCheck`, resolves and previews unresolved cards without POSTing) and an `Add checkpoint` button (`handleAddStep`).
- `handleAddStep` (175–229): validates → `resolveDeck(listText)` ([plan.ts:61](src/lib/deck/plan.ts)) → builds `StepSnapshot { cards, unresolved }` → `POST /api/paths/${path.id}/steps` with `{ name, listText, snapshot }` → appends the returned `PathStep` to `steps` and clears the form. A `addToken` ref guards against stale async races.
- The prior step is already in memory: `steps[steps.length - 1].snapshot.cards` is a `DeckCard[]` (`{ card: Card; quantity: number }`) — this is the frozen derive base. Today the add flow doesn't read it.

Engine + types available for reuse:

- `parseDeckList(text): ParsedDeck` and the exported `splitCardLine(line): { prefix, name } | null` ([parse.ts:72,107](src/lib/deck/parse.ts)). `DeckEntry = { name, quantity }`.
- `resolveCards(names): Promise<{ resolved: Card[]; unresolved: UnresolvedCard[] }>` ([resolve.ts:73](src/lib/card-data/resolve.ts)); `resolutionKey(name)` ([resolve.ts:34](src/lib/card-data/resolve.ts)) is the app-wide card identity (front-face, lowercased).
- `StepSnapshot = { cards: DeckCard[]; unresolved: UnresolvedLite[] }` ([types.ts:32](src/lib/path/types.ts)); `UnresolvedLite = { name, reason, suggestion }`; `UnresolvedReason = "not-found" | "ambiguous" | "malformed"`.
- Persistence: `path_steps` table (`snapshot jsonb`, `list_text text`, `name text`, all NOT NULL) in [20260626121519_user_accounts_paths.sql](supabase/migrations/20260626121519_user_accounts_paths.sql). Write path: `parseStepInput` ([request.ts:41](src/lib/path/request.ts)) → insert ([steps.ts:56](src/pages/api/paths/[id]/steps.ts)) → `toPathStep` mapper ([paths.ts:83](src/lib/api/paths.ts)). DB row types in [database.types.ts:45](src/lib/database.types.ts).
- `UnresolvedNotice` ([UnresolvedNotice.tsx](src/components/deck/UnresolvedNotice.tsx)) is shared between the comparer and path builder; renders entries with reason labels and accept buttons (accept shown only when `suggestion !== null`).

## Desired End State

On a path with ≥1 existing step, the add-checkpoint form shows a **"Full list / Changes"** toggle. In Changes mode the brewer types `+ Black Lotus` / `- Sol Ring` (optionally with counts: `+2 Island`, `-1 Forest`), clicks `Check` to preview a summary line + the full derived list + any unapplicable-line warnings, then `Add checkpoint`. The saved step is a normal immutable snapshot **byte-equivalent to one entered via full paste**, and (after Phase 2) carries the raw delta text + a "diff-entered" badge. Full-paste mode and the engine behave exactly as before.

### Key Discoveries:

- The frozen derive base is already in component memory — `steps[steps.length - 1].snapshot.cards` ([PathEditor.tsx:474](src/components/path/PathEditor.tsx)).
- `splitCardLine` is exported and shared with `accept.ts` precisely so count-parsing never drifts — the delta parser reuses it after stripping the leading sign.
- The snapshot is built client-side and POSTed; the server re-validates via `parseSnapshot`. Diff-mode produces the *same* snapshot shape through the *same* POST, so the server contract needs no change in Phase 1.
- `list_text` is stored but not re-parsed on read (render uses `snapshot.cards` via `stepPlan` → `diffDecks`). For a diff-entered step it will hold the **derived** full-list text, keeping the column meaningful.

## What We're NOT Doing

- Not editing already-saved checkpoints via diff (new checkpoints only — snapshots stay immutable).
- Not making diff-mode the default; full-paste remains the default surface.
- Not supporting mid-path insert / re-base cascade, or diffing against an arbitrary earlier step (base is locked to the immediate predecessor).
- Not changing the resolve/diff/cost engine, the anonymous `/` comparer, `DeckComparer`, or any access-control rule.
- Not mobile-optimizing the diff-mode UI (desktop-first carries over).

## Implementation Approach

Phase 1 builds a pure, well-tested **delta engine** (`parseDeltaList` + an async `deriveSnapshot`) and wires a **mode toggle + preview** into `PathEditor`, with `handleAddStep` branching on mode. The derived snapshot flows through the existing POST unchanged; `list_text` carries the derived list text. The whole user-visible feature ships here, with the delta not yet persisted.

Phase 2 adds the **additive, nullable `delta_text`** column and threads it through the persistence contract (migration → DB types → domain type → request type → insert → mapper), then sends it from diff-mode and renders a small provenance badge on diff-entered steps. Existing rows (delta_text = null) and full-paste checkpoints render unchanged; no backfill.

## Critical Implementation Details

- **Async derive, race-guarded.** `deriveSnapshot` calls `resolveCards` for genuinely new `+` cards, so it is async like `resolveDeck`. Reuse the existing `addToken` / `checkToken` guard pattern — a derive preview/add must drop its result if a newer run started.
- **Identity is `resolutionKey` everywhere.** Match `-`/`+` lines against the prior list by `resolutionKey`, not raw name, so DFC spellings and casing collapse consistently with the rest of the app.
- **Persisted `unresolved` stays clean.** A `+ <card>` that fails to resolve is a real missing card → goes into `snapshot.unresolved` (not-found/ambiguous), exactly like full-paste. A `- <card>` not in the prior list, or a malformed line, is a **no-op warning** → returned as a separate `warnings` list for preview only; never written into the snapshot.

## Phase 1: Delta engine + diff-mode UI & preview

### Overview

Build the delta parser and derive function with unit tests, then add the mode toggle, preview, and Add-path branch to `PathEditor`. Delivers the complete user-visible feature; delta persistence is deferred to Phase 2.

### Changes Required:

#### 1. Delta parser

**File**: `src/lib/path/delta.ts` (new)

**Intent**: Parse diff-mode text into signed, quantity-tagged entries, reusing the existing count-parsing so it never drifts from `parseDeckList`.

**Contract**: `parseDeltaList(text: string): { entries: DeltaEntry[]; malformed: string[] }` where `DeltaEntry = { op: "+" | "-"; name: string; quantity: number }`. Each non-blank, non-comment line must start with `+` or `-`; strip the sign, then pass the remainder to `splitCardLine` (imported from `../deck/parse`) to get `{ prefix, name }` and derive quantity (bare → 1, `2`/`2x` → 2). A line with no sign, or a sign with no card name, goes to `malformed`. Reuse the comment/section/blank skipping convention from `parse.ts`.

#### 2. Derive function

**File**: `src/lib/path/derive.ts` (new)

**Intent**: Apply a parsed delta to the prior frozen snapshot's resolved cards, resolving only genuinely new `+` cards, and produce the new snapshot plus preview metadata.

**Contract**: `async function deriveSnapshot(prior: StepSnapshot, deltaText: string): Promise<DeriveResult>` where
`DeriveResult = { snapshot: StepSnapshot; warnings: DeltaWarning[]; summary: DeriveSummary }`,
`DeltaWarning = { line: string; reason: "not-in-prior" | "malformed" }`,
`DeriveSummary = { added: number; removed: number; unchanged: number; total: number }`.

Algorithm: build a working map of `prior.cards` keyed by `resolutionKey(card.name)`. For each `-` entry: if key present, subtract quantity and drop at ≤0; else emit a `not-in-prior` warning. For each `+` entry whose key is already present: add quantity (card already resolved). Collect `+` entries whose key is absent, `resolveCards` their names once; bump quantity for resolved cards, and route their `unresolved` into `snapshot.unresolved`. Carry `prior.unresolved` forward verbatim into `snapshot.unresolved`. `parseDeltaList` malformed lines become `malformed` warnings. Compute `summary` from net adds/removes vs the prior count. Quantities and card identity must make the result exactly equal `prior ± delta`.

#### 3. Deck-cards → text helper

**File**: `src/lib/deck/serialize.ts` (new) — or co-locate in `derive.ts` if preferred

**Intent**: Render a `DeckCard[]` back to canonical deck-list text so a diff-entered step's `list_text` stays meaningful.

**Contract**: `deckCardsToText(cards: DeckCard[]): string` → one `"<qty> <name>"` line per card, stable order (match the existing category/name ordering used for display). Round-trips through `parseDeckList` to the same entries.

#### 4. Mode toggle + preview + Add branch

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Add a "Full list / Changes" segmented toggle (shown only when `steps.length >= 1`), reinterpret the shared textarea per mode, run the derive-based preview from the `Check` button, and branch `handleAddStep` to derive in diff-mode.

**Contract**:
- New `mode: "full" | "diff"` state; toggle hidden/forced to `"full"` for the first checkpoint. Switching mode clears the textarea + check/preview state.
- In diff-mode, `Check` calls `deriveSnapshot(steps.at(-1)!.snapshot, listText)` and renders: the `summary` line ("+N added, −M removed, K unchanged → T cards"), the full derived list, and `warnings` + `snapshot.unresolved` via `UnresolvedNotice`. Reuse the `checkToken` race guard.
- In diff-mode, `handleAddStep` calls `deriveSnapshot`, sets `snapshot = result.snapshot` and `listText`-for-POST = `deckCardsToText(result.snapshot.cards)`, then POSTs through the existing path. Reuse `addToken`. Full-mode path is unchanged.
- Warnings never block save (surface + allow); `+`-card resolve failures persist in `snapshot.unresolved` exactly like full-paste.

#### 5. UnresolvedNotice delta-warning labels

**File**: `src/components/deck/UnresolvedNotice.tsx`

**Intent**: Let the shared notice render diff-mode warnings (a `-` line that matched nothing, a malformed line) with a clear label and no accept button.

**Contract**: Accept the existing entries plus an optional list of delta warnings (or a pre-mapped entry shape) and render a labeled "changes that couldn't be applied" group. Display-only; no change to the persisted `UnresolvedLite`/`UnresolvedReason` types in Phase 1.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test` — covering `parseDeltaList` (bare = ±1, `2`/`2x` counts, missing sign → malformed, comments/blanks skipped) and `deriveSnapshot` (exact `prior ± delta`; `-` clamps/removes at 0; `-` miss → `not-in-prior` warning, not persisted; new `+` resolves and is added; existing `+` bumps quantity; prior-unresolved carried forward; `+` resolve-failure lands in `snapshot.unresolved`; summary counts correct).
- `deckCardsToText` round-trips through `parseDeckList` (unit test).
- Type checking passes: `npm run astro check` (or `astro check`).
- Linting passes: `eslint .`

#### Manual Verification:

- On a path with one step, the "Full list / Changes" toggle appears; on an empty path it does not.
- Entering `+ Black Lotus` / `- Sol Ring` and clicking Check shows the summary line, the full derived list, and (for a bogus `- Nonsuch`) a clear "couldn't apply" warning.
- Add checkpoint saves a step whose rendered diff vs the prior step matches the intended swap; the snapshot is indistinguishable from the equivalent full paste.
- Full-paste mode is visually default and behaves exactly as before; switching modes clears the field.

**Implementation Note**: After Phase 1 automated verification passes, pause for manual confirmation before starting Phase 2.

---

## Phase 2: Delta persistence + provenance display

### Overview

Persist the entered delta as an additive, nullable `delta_text` column and surface a provenance badge on diff-entered steps. Existing rows and full-paste checkpoints are unaffected; no backfill.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<new-timestamp>_path_step_delta_text.sql` (via `npm run db:new path_step_delta_text`)

**Intent**: Add a nullable column to `path_steps` for the raw entered delta.

**Contract**: `alter table path_steps add column delta_text text;` (nullable, no default, no backfill).

#### 2. DB row types

**File**: `src/lib/database.types.ts`

**Intent**: Reflect the new column in the generated `path_steps` types.

**Contract**: Add `delta_text: string | null` to `Row`, and `delta_text?: string | null` to `Insert` and `Update` for `path_steps`.

#### 3. Domain + request types

**File**: `src/lib/path/types.ts`, `src/lib/path/request.ts`

**Intent**: Carry the delta through the domain model and the create-step request.

**Contract**: Add `deltaText: string | null` to `PathStep`. Add optional `deltaText?: string | null` to `StepInput`, and accept/validate it in `parseStepInput` (optional; absent/empty → null). Full-paste requests omit it → null.

#### 4. Insert + mapper

**File**: `src/pages/api/paths/[id]/steps.ts`, `src/lib/api/paths.ts`

**Intent**: Write and read the new column.

**Contract**: Include `delta_text: input.deltaText ?? null` in the insert. In `toPathStep`, map `row.delta_text` → `deltaText`.

#### 5. Send delta from diff-mode + provenance badge

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Include the entered delta on diff-mode saves and show that a step was diff-authored.

**Contract**: In diff-mode `handleAddStep`, add `deltaText: listText` to the POST body (full-mode omits it). On a step whose `deltaText` is non-null, render a small "diff" badge near the step name; optionally show the raw delta on expand. Steps with `deltaText === null` render exactly as today.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npm run db:reset` (or `db:push` against the linked project).
- Type checking passes after types update: `npm run astro check`.
- Unit/contract test: `parseStepInput` accepts a body with `deltaText` and one without (→ null); `toPathStep` maps `delta_text` → `deltaText`. `npm test`.
- Linting passes: `eslint .`

#### Manual Verification:

- Saving a diff-mode checkpoint persists the raw `+/-` text; reopening the path shows the "diff" badge on that step.
- A full-paste checkpoint saves with `deltaText` null and shows no badge.
- Pre-existing steps (created before the migration) render unchanged.

**Implementation Note**: After Phase 2 automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `parseDeltaList`: sign handling, bare = ±1, `N`/`Nx` counts, missing-sign/empty-name → malformed, comment/blank skipping.
- `deriveSnapshot`: exact `prior ± delta`; clamp-to-remove at 0; `-` miss warning (unpersisted); new `+` resolves; existing `+` bumps; prior-unresolved carried forward; `+` resolve-failure persisted; summary math. Mock `resolveCards` per the existing `plan.test.ts` pattern (`vi.mock("@/lib/card-data", …)`).
- `deckCardsToText` ↔ `parseDeckList` round-trip.
- Phase 2: `parseStepInput` with/without `deltaText`; `toPathStep` mapping.

### Integration Tests:

- End-to-end via the unit-tested derive → POST shape (no new server-side branch in Phase 1; Phase 2 adds the column to the same POST).

### Manual Testing Steps:

1. Path with one step → toggle present; empty path → absent.
2. `+ Black Lotus` / `- Sol Ring` → Check shows summary + derived list; Add → correct diff vs prior; snapshot matches equivalent full paste.
3. `+2 Island` / `-1 Forest` on a basics-heavy deck → counts apply correctly.
4. `- Nonsuch` (not in prior) and a malformed line → surfaced as warnings, save still allowed, not persisted into the snapshot.
5. (Phase 2) Reopen path → diff badge on the diff-entered step; full-paste step has none; pre-migration steps unchanged.

## Migration Notes

`delta_text` is nullable and additive; existing `path_steps` rows are valid with `delta_text = null`. No backfill — step-to-step diffs are still derived from adjacent snapshots. The migration must be pushed to the linked Supabase project (`npm run db:push`) before diff-mode saves carry provenance in the remote DB (cf. the S-08 lesson where a missing push surfaced as a 500 on create).

## References

- Shape: `context/foundation/shape-notes.md`
- PRD: `context/foundation/prd-diff-checkpoint.md`
- Add-checkpoint flow: `src/components/path/PathEditor.tsx:175` (`handleAddStep`)
- Engine reuse: `src/lib/deck/parse.ts:72` (`splitCardLine`), `src/lib/card-data/resolve.ts:34,73` (`resolutionKey`, `resolveCards`)
- Persistence contract: `src/pages/api/paths/[id]/steps.ts:13`, `src/lib/path/types.ts:32`, `supabase/migrations/20260626121519_user_accounts_paths.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Delta engine + diff-mode UI & preview

#### Automated

- [x] 1.1 Unit tests pass: `npm test` (parseDeltaList + deriveSnapshot cases) — 75db53e
- [x] 1.2 `deckCardsToText` round-trips through `parseDeckList` — 75db53e
- [x] 1.3 Type checking passes: `astro check` — 75db53e
- [x] 1.4 Linting passes: `eslint .` — 75db53e

#### Manual

- [x] 1.5 Toggle appears with a predecessor step, absent on an empty path — 75db53e
- [x] 1.6 Check shows summary line + full derived list + warning for a bogus `-` line — 75db53e
- [x] 1.7 Add saves a snapshot indistinguishable from the equivalent full paste — 75db53e
- [x] 1.8 Full-paste mode is default and unchanged; switching modes clears the field — 75db53e

### Phase 2: Delta persistence + provenance display

#### Automated

- [x] 2.1 Migration applies cleanly: `npm run db:reset`
- [x] 2.2 Type checking passes after types update: `astro check`
- [x] 2.3 Contract tests: `parseStepInput` with/without `deltaText`; `toPathStep` maps `delta_text`
- [x] 2.4 Linting passes: `eslint .`

#### Manual

- [x] 2.5 Diff-mode save persists the raw delta; badge shows on reopen
- [x] 2.6 Full-paste save has `deltaText` null and no badge
- [x] 2.7 Pre-migration steps render unchanged
