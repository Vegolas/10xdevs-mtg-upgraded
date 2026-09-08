# Zero-Card List Validation Implementation Plan

## Overview

Four guards across two components test **raw text** with `trim()` while everything downstream
works on **parsed entries**. Deck-list text that is non-empty but parses to zero cards —
comments (`# …`, `// …`), section headers (`Commander`, `Deck (99)`), blank lines — slips
through all four. The path builder answers it with `✓ All cards resolved.`, or persists a
checkpoint holding no cards; in diff mode it persists a silent duplicate of the previous
checkpoint. The comparer answers it by resetting to its initial prompt.

This change replaces the four raw-text guards with parse-based zero-entry predicates and gives
each surface an explicit message.

## Current State Analysis

`parseDeckList` (`src/lib/deck/parse.ts:107-128`) deliberately drops blank lines, comments and
section headers via `splitCardLine` (`:72-94`), so `// my commander deck` is non-empty by
`trim()` and yields `{entries: [], malformed: []}`. `parseDeltaList`
(`src/lib/path/delta.ts:49-76`) does the same for diff text, skipping blank and comment lines
before requiring a `+`/`-` sign.

`resolveCards([])` short-circuits before any fetch (`src/lib/card-data/resolve.ts:136-145`) and
returns empty. So the zero-entry path completes successfully everywhere, and each consumer draws
the wrong conclusion from a clean result:

| Site | Guard today | What the user sees |
| --- | --- | --- |
| `PathEditor.tsx:376` `runCheck` | `text.trim() === ""` | `✓ All cards resolved.` (`:844-853`) for a list with no cards |
| `PathEditor.tsx:411` `runDiffCheck` | `text.trim() === ""` | `+0 added, −0 removed, N unchanged → N cards` (`:856-869`) |
| `PathEditor.tsx:266` `handleAddStep` | `listText.trim() === ""` | full: a checkpoint whose snapshot is `{cards: [], unresolved: []}`; diff: a checkpoint identical to its predecessor |
| `DeckComparer.tsx:92-94` `runPlan` | — (maps `empty` → `idle`) | the initial "Paste a deck list into each box" prompt (`:218-222`), with both boxes visibly full |

The severities differ and that shapes the fix. The path builder's full-paste verdict is
**actively wrong** — `✓` is the one signal on that surface meaning "safe to save". The diff-mode
case is worse still because it *persists*: `deriveSnapshot` seeds its working set from the prior
snapshot (`src/lib/path/derive.ts:113-118`) and, with no entries to apply, returns it unchanged,
so the saved checkpoint duplicates its predecessor and the path's summary reads 0 in / 0 out. The
comparer is merely **silent** — `generateUpgradePlan` already short-circuits on
`parseDeckList(...).entries.length === 0` (`src/lib/deck/plan.ts:87-91`), it just has no way to
say so.

### Key Discoveries:

- **The correct predicate already exists in this repo.** `generateUpgradePlan`
  (`plan.ts:87-91`) gates on `entries.length === 0` for exactly this reason. The path builder is
  the outlier, not the pioneer — this change generalizes an established pattern rather than
  inventing one.
- **F-6's suggested fix is wrong at two of its three sites**, and this was verified against the
  code the fix would touch, per `lessons.md`'s "A finding's suggested FIX needs the same
  verification against the code as its symptom". F-6 names
  `parseDeckList(text).entries.length === 0` for `:266`, `:376` and `:411`. But `:411`
  (`runDiffCheck`) feeds `deriveSnapshot` → `parseDeltaList`, a **different parser** —
  `parseDeckList` would read `+ Sol Ring` as a card literally named "+ Sol Ring" and the guard
  would never fire. And `:266` (`handleAddStep`) serves **both** modes, branching on `activeMode`
  (`:295-316`), so no single predicate is correct there. Two predicates across three sites.
- **F-6 never saw the diff-mode symptom.** It describes the empty case only. The diff case
  persists a duplicate, not an empty deck — a different observable requiring a different message.
- **The exact repro is narrower than F-6 implies**: it needs `entries === 0` **and**
  `malformed === 0`. Count-only text like `4x` is malformed, flows into `unresolved` through
  `resolveDeck` (`plan.ts:69`), and renders `UnresolvedNotice` rather than the `✓`. So the repro
  is comments, section headers and blank lines only — this is what the specs must paste.
- **Both message surfaces already exist** in `PathEditor`: `checkError`
  (`role="alert" aria-label="Check error"`, `:882-893`) owned by the Check flows, and `addState`
  error (`role="alert" aria-label="Checkpoint error"`, `:895-910`) owned by the add flow. No new
  atom, banner or lane is needed, and `invalidatePreview` (`:235-241`) already clears `checkError`
  on the next keystroke.
- **The comparer's error banner cannot be reused.** `DeckComparer.tsx:231-237` is hardcoded to
  "Couldn't reach the card database." with a Retry CTA — correct for a transport failure,
  actively misleading for a validation message. This needs a new `View` variant.
- **`generateUpgradePlan` does not report which box was empty.** `PlanOutcome`'s
  `{status: "empty"}` (`plan.ts:48`) is bare, and with two boxes an actionable message needs the
  side. `DeckSide` (`plan.ts:24`) is already the established tag for exactly this.
- **There is no component-render test layer** (test-plan §4), so a unit test can prove the
  predicate but never that the component calls it — which is precisely where this defect lives.
  Browser specs are the only layer that can see it, and `tests/e2e/` is already run by the
  required `e2e` CI job, so no new job name is introduced.

## Desired End State

Text that parses to zero card lines produces an explicit, mode-appropriate message on every
surface that consumes it, and never a success verdict, a persisted checkpoint, or a silent reset.

Verify by pasting `// my commander deck` (with a blank line and `Deck (99)`) into each surface:
the path builder's Check answers "No card lines found…" instead of `✓ All cards resolved.`, Add
refuses with the same sentence instead of saving, diff mode answers with the `+ / −` wording
instead of a `+0 / −0` preview, and the comparer names the offending box instead of reprinting
its initial prompt.

## What We're NOT Doing

- **No server-side gate.** `parseSnapshot` (`src/lib/path/snapshot.ts:97-109`) validates the
  snapshot's *shape*, not its emptiness, so `POST /api/paths/[id]/steps` still accepts
  `cards: []` from a non-UI client. Held out deliberately: F-6 scopes this as a unit-layer
  change, and whether an empty snapshot is ever legitimate (a diff that removes everything is
  structurally valid) is a product decision this change has not made. Recorded here so the next
  reader does not mistake the omission for an oversight.
- **No component-render test layer.** Introducing Testing Library would close the §4 gap
  permanently, but that is its own change with its own CI wiring; test-plan §7 holds this
  boundary deliberately.
- **No change to the `trim()` guards' existing messages.** The new zero-entry checks are
  *additional* branches; `handleAddStep`'s "Give the checkpoint a name and paste a deck list."
  keeps its exact current wording and behavior for the genuinely-empty case.
- **No change to the Check button's `disabled` expression** (`:918-923`). It stays `trim()`-based
  on purpose: a button that silently deadens on comment-only text explains nothing, whereas a
  click that answers with a sentence does. It also keeps the four-way clause off the parse path.
- **No malformed-line rework.** Count-only lines (`4x`) already surface through
  `UnresolvedNotice`; that path is correct and untouched.

## Implementation Approach

Extract the rule once per parser as a pure predicate, then call it from every consumer. Two
predicates, because there are genuinely two parsers with two notions of "an entry" — and
`splitCardLine` is already the shared seam that keeps them from drifting on count parsing.

Each phase is independently verifiable. Phase 1 is pure and green on `npm test` alone with no
app behavior change. Phases 2 and 3 each carry their own browser specs and their own targeted
breaks, matching the precedent set by `shared-stale-response-guard`'s Progress rows.

## Critical Implementation Details

**Zero entries is reachable but zero-plus-malformed is not.** A spec that pastes `4x` or a bare
`Sol Ring` into diff mode does **not** reproduce this — those are `malformed`, which renders
`UnresolvedNotice` (full paste) or a `DeltaWarning` (diff). Every spec must paste text that is
comments, section headers and blank lines **only**, or it passes vacuously while touching
nothing. This is the same vacuity trap `lessons.md` records twice for risk #9.

**No Scryfall request fires on the zero-entry path**, since `resolveCards([])` returns before
queueing. Specs still need `mockScryfallSuccess` installed to keep an unmocked call from escaping
on the surrounding steps, but must not wait on a card-data request that will never arrive.

## Phase 1: The zero-entry predicates

### Overview

Add one pure predicate per parser, export both on their module barrels, and unit-test them at the
node layer. No consumer changes; the app behaves identically after this phase.

### Changes Required:

#### 1. Full-paste predicate

**File**: `src/lib/deck/parse.ts`

**Intent**: Name the rule "this text contains no card lines" once, next to the parser that
defines what a card line is, so the three consumers cannot each state it differently.

**Contract**: `export function hasNoCardLines(text: string): boolean` — true when
`parseDeckList(text).entries` is empty. Pure, no I/O. Deliberately indifferent to `malformed`:
a count-only line is a *bad* card line, not an absent one, and already surfaces through
`UnresolvedNotice`.

#### 2. Diff-mode predicate

**File**: `src/lib/path/delta.ts`

**Intent**: The diff-mode twin. Separate from the full-paste predicate because `parseDeltaList`
requires a leading `+`/`-` sign that `parseDeckList` knows nothing about.

**Contract**: `export function hasNoDeltaLines(text: string): boolean` — true when
`parseDeltaList(text).entries` is empty. Same `malformed` indifference, same purity.

#### 3. Barrel exports

**File**: `src/lib/deck/index.ts`, `src/lib/path/index.ts`

**Intent**: Consumers import from `@/lib/deck` and `@/lib/path`, never from the modules directly.

**Contract**: `hasNoCardLines` joins the `./parse` export line; `hasNoDeltaLines` joins the
`./delta` line.

#### 4. Predicate unit tests

**File**: `src/lib/deck/parse.test.ts`, `src/lib/path/delta.test.ts`

**Intent**: Pin the classification rule that makes this defect possible — that comments, headers
and blank lines are non-empty text yielding no entries — in the files that already own each
parser's classification rules.

**Contract**: For `hasNoCardLines`: true for `""`, whitespace, `// note`, `# note`, `Commander`,
`Deck (99)`, and a multi-line combination of them; false for `Sol Ring`, `3 Llanowar Elves`, and
**false for `4x`** (malformed is not absent — this is the assertion that stops a future
"simplification" from folding `malformed` into the predicate). For `hasNoDeltaLines`: true for
`""`, `// note`, blank lines; false for `+ Sol Ring`, `-2 Forest`, and **false for a bare
`Sol Ring`** (unsigned → malformed, not absent).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Both predicates are reachable from the barrels: `grep -n "hasNoCardLines" src/lib/deck/index.ts` and `grep -n "hasNoDeltaLines" src/lib/path/index.ts` both return a line

#### Manual Verification:

- App behavior is unchanged after this phase — Check, Add and the comparer still do exactly what they did before

---

## Phase 2: PathEditor's three guards

### Overview

Wire both predicates into the three path-builder sites, routing each message to the banner whose
atom the flow already owns. Then prove all three with browser specs, each with its own targeted
break.

### Changes Required:

#### 1. Full-paste Check

**File**: `src/components/path/PathEditor.tsx` (`runCheck`, `:374-379`)

**Intent**: Answer zero-entry text with a sentence instead of returning silently and letting the
verdict render. This is F-6 as filed.

**Contract**: Replace the `text.trim() === ""` early return with `hasNoCardLines(text)`. The
branch sets `checkState` to `idle` (so no verdict renders) **and** writes `checkError` with
`"No card lines found — comments, headers and blank lines aren't cards."`, then returns before
the lane runs. The predicate subsumes the old empty-text case, which stays unreachable through
the UI (the button is `disabled` on `trim()`) and is non-empty from `handleAccept`.

#### 2. Diff-mode Check

**File**: `src/components/path/PathEditor.tsx` (`runDiffCheck`, `:409-414`)

**Intent**: The diff twin. Keep the `!prior` guard separate — "no previous checkpoint" is a
different condition with a different remedy.

**Contract**: After the existing `!prior` check, a second branch on `hasNoDeltaLines(text)` sets
`diffPreview` to `idle` and writes `checkError` with
`"No + / − changes found — comments, headers and blank lines aren't changes."` Same lane, same
atom, same clearing behavior through `invalidatePreview`.

#### 3. The add path, both modes

**File**: `src/components/path/PathEditor.tsx` (`handleAddStep`, `:264-272`)

**Intent**: Stop the persist. This is the only site where the defect writes to the database, and
in diff mode it is the one that saves a silent duplicate of the previous checkpoint.

**Contract**: Leave the existing `trimmedName === "" || listText.trim() === ""` guard and its
message exactly as they are. Add a **second** guard immediately after it, selecting the predicate
by `activeMode` — `hasNoDeltaLines` for `"diff"`, `hasNoCardLines` for `"full"` — that sets
`addState` to `error` with the same two sentences used by the Check flows above, and returns
before `setAddState({status: "resolving"})`. Ordering matters: it must sit ahead of the resolving
commit so no spinner appears for a click that is about to be refused.

#### 4. Browser specs

**File**: `tests/e2e/path-builder-zero-cards.spec.ts` (new)

**Intent**: Cover the three surfaces at the only layer that can see them. A new file rather than
an addition to the two existing path-builder specs, because those two own risk #9's ordering
story and this is a validation story.

**Contract**: Three specs, each seeded through `createSignedInOwner` + `seedPathWithStep` and
navigated with `gotoPathBuilder`, with `mockScryfallSuccess` installed. Every spec pastes
comment/header/blank text **only**. (1) Full mode: Check → the `"Check error"` banner carries the
card-lines sentence and **no** `✓ All cards resolved.` renders. (2) Diff mode: switch mode, paste,
Check → the same banner carries the `+ / −` sentence and no summary line renders. (3) Add: paste,
name the checkpoint, Add → the `"Checkpoint error"` banner renders and the step count is
unchanged after a reload. Locate the two banners by `aria-label` — they share a byte-identical
class string — and per `lessons.md` pass `exact: true` on any short accessible name.

Setup goes in `beforeEach`, not the test body — the repo's standing rule from
`lessons.md`'s "Pin a live defect with `test.fail()`", which holds for green specs too.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- The new specs pass: `npx playwright test tests/e2e/path-builder-zero-cards.spec.ts`
- The existing path-builder specs still pass: `npx playwright test tests/e2e/path-builder-stale-ordering.spec.ts tests/e2e/path-builder-mutation-ordering.spec.ts`
- No raw-text guard is left on a parse path: `grep -n 'trim() === ""' src/components/path/PathEditor.tsx` returns only the name guard, the title guard and the Check button's `disabled`

#### Manual Verification:

- Targeted break, full Check: revert only `runCheck`'s predicate to `text.trim() === ""` and confirm spec (1) reddens — and that it reddens on the missing banner, not on a locator or a timeout
- Targeted break, diff Check: revert only `runDiffCheck`'s predicate and confirm spec (2) reddens and specs (1) and (3) stay green
- Targeted break, add: revert only `handleAddStep`'s second guard and confirm spec (3) reddens, and that the reload assertion is what fails — a spec that only checks the banner would pass vacuously against a step that saved anyway
- Pasting `4x` (count-only) still renders `UnresolvedNotice`, not the new message — the malformed path is untouched
- Typing a real card line after the message clears the banner on the first keystroke

**Implementation Note**: After completing this phase and all automated verification passes, pause
for manual confirmation that the three targeted breaks behaved as described before proceeding.
Per `lessons.md`, a green suite proves only that no pinned path is red; only a per-site break
proves each guard is individually load-bearing.

---

## Phase 3: DeckComparer's no-cards verdict

### Overview

Give the comparer a way to say what `generateUpgradePlan` already knows, and name which box is at
fault.

### Changes Required:

#### 1. Carry the offending side

**File**: `src/lib/deck/plan.ts`

**Intent**: `{status: "empty"}` is bare, so the component cannot name the box. With two boxes an
unattributed message is barely better than the silence it replaces.

**Contract**: `PlanOutcome`'s `empty` variant gains `sides: DeckSide[]` — `["base"]`,
`["target"]`, or both, in that order. `generateUpgradePlan` (`:87-91`) builds it from the two
existing `entries.length === 0` tests it already performs, and keeps short-circuiting before any
resolve. `DeckSide` is already exported from this module and its barrel.

#### 2. Update the existing outcome assertion

**File**: `src/lib/deck/plan.test.ts` (`:88-91`)

**Intent**: The existing test asserts `toEqual({status: "empty"})` and will fail on the new field.
That is the correct signal, not collateral damage.

**Contract**: Assert the `sides` payload, and extend to cover all three combinations —
base-only, target-only, both — since only "either side" was pinned before.

#### 3. The no-cards view

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Render the outcome instead of discarding it. The existing `error` branch cannot be
reused: it is hardcoded to "Couldn't reach the card database." with a Retry CTA, which is wrong
advice for text that parsed cleanly to nothing.

**Contract**: `View` gains `{status: "no-cards"; sides: DeckSide[]}`. `runPlan` (`:92-94`) maps
the `empty` outcome to it rather than to `idle`. A new render branch, guarded by
`bothFilled && view.status === "no-cards"`, sits between the loading and error branches and
carries `role="alert"` plus `aria-label="No card lines"` — the transport banner at `:231-237` is
also `role="alert"`, and per test-plan §6.7 items 1 and 27 the accessible name is what tells a
query which banner it found. Style it as informational (the `border-border bg-card` treatment),
not destructive: nothing failed. Copy names the box by its visible label (`:180`, `:195`) —
"Base deck", "Target deck", or "Neither deck" — followed by the same
"comments, headers and blank lines aren't cards" clause the path builder uses.

The idle branch at `:218` is `!bothFilled || view.status === "idle"` and needs no edit: the new
status is neither, so the initial prompt correctly yields to the new banner.

#### 4. Browser spec

**File**: `tests/e2e/comparer-zero-cards.spec.ts` (new)

**Intent**: Prove the wiring at the layer that can see it, alongside the existing comparer specs.

**Contract**: Using `gotoComparer` + `compare` and `mockScryfallSuccess`, fill both boxes with
comment/header text only and assert the `"No card lines"` banner renders naming both decks; then
fix one box with a real card line and assert the banner names only the remaining one. Note that
`compare()` drives the Calculate CTA, which bypasses the 700 ms debounce — per `lessons.md`,
never drive this component by typing and waiting.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the updated outcome assertion: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- The new spec passes: `npx playwright test tests/e2e/comparer-zero-cards.spec.ts`
- The existing comparer specs still pass: `npx playwright test tests/e2e/comparer-failure-surfacing.spec.ts tests/e2e/comparer-stale-response.spec.ts`
- Full suite green: `npm test && npm run test:integration && npx playwright test`

#### Manual Verification:

- Targeted break: revert only `runPlan`'s mapping to `setView({status: "idle"})` and confirm the comparer spec reddens on the missing banner — this is the one assertion distinguishing "the verdict renders" from "the outcome carries sides"
- The transport-failure banner and its Retry CTA are unaffected — trigger a card-data failure and confirm the old banner still renders with its own wording
- A comment-only box paired with a real deck names only the offending side

**Implementation Note**: Pause for manual confirmation after the targeted break before closing
the change.

---

## Testing Strategy

### Unit Tests:

- `hasNoCardLines` / `hasNoDeltaLines`: comments, `#` comments, section headers with and without a
  `(N)` suffix, blank and whitespace-only lines, and combinations — all true
- Both predicates: **malformed input is false**, not true. `4x` for the deck parser, an unsigned
  `Sol Ring` for the delta parser. This is the assertion that keeps a future refactor from
  folding `malformed` into "no entries" and swallowing the `UnresolvedNotice` path
- `generateUpgradePlan`: `sides` for base-only, target-only and both

### Integration Tests:

None. No route, payload or persistence contract changes — deliberately, see "What We're NOT
Doing". The existing `contract-steps.int.test.ts` should remain untouched, and if it needs an edit
that is a signal the change has drifted into server scope.

### Manual Testing Steps:

1. Path builder, full mode: paste `// my commander deck`, a blank line, and `Deck (99)`. Click Check → the Check-error banner carries the card-lines sentence; no `✓` renders
2. Same text, name the checkpoint, click Add → the Checkpoint-error banner renders; reload and confirm no step was added
3. Switch to diff mode (needs one existing step), paste the same text, Check → the `+ / −` sentence; Add → refused
4. Paste `4x` in full mode and Check → `UnresolvedNotice` still renders, not the new message
5. After any message, type a real card line → the banner clears on the first keystroke
6. Comparer: paste comment-only text into both boxes and Calculate → the banner names both decks; fix the base box → it names only the target

## Performance Considerations

Each predicate parses the text once, on a click or a debounce-fired run — never on a keystroke or
a render. Keeping the Check button's `disabled` clause on `trim()` (see "What We're NOT Doing") is
what preserves that property; moving it to the predicate would parse on every render of a
four-way boolean.

## Migration Notes

None. No schema, payload or persisted-shape change. Checkpoints already saved with zero cards —
or duplicating their predecessor — remain valid and render as they do today; this change only
stops new ones from being created through the UI.

## References

- Finding: `context/archive/2026-09-06-shared-stale-response-guard/findings.md` — F-6, carried
  forward with its citations re-verified 2026-09-07
- Corrections to F-6's suggested fix are recorded in "Key Discoveries" above, per `lessons.md`'s
  "A finding's suggested FIX needs the same verification against the code as its symptom"
- Established precedent for the predicate: `src/lib/deck/plan.ts:87-91`
- Rules governing the specs: `context/foundation/lessons.md` — "A repair covering N findings needs
  a targeted break per finding", "Pin a live defect with `test.fail()`" (traps 1 and 2), "Drive
  overlap through the affordance that bypasses the debounce"
- Test-plan context: `context/foundation/test-plan.md` §2 (risk #9 chain), §6.7 items 1, 27-29

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The zero-entry predicates

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — ea400ef
- [x] 1.2 Type checking passes: `npm run typecheck` — ea400ef
- [x] 1.3 Linting passes: `npm run lint` — ea400ef
- [x] 1.4 Both predicates are reachable from the barrels — ea400ef

#### Manual

- [x] 1.5 App behavior is unchanged after this phase — ea400ef

### Phase 2: PathEditor's three guards

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 4d00b08
- [x] 2.2 Type checking passes: `npm run typecheck` — 4d00b08
- [x] 2.3 Linting passes: `npm run lint` — 4d00b08
- [x] 2.4 The new specs pass: `npx playwright test tests/e2e/path-builder-zero-cards.spec.ts` — 4d00b08
- [x] 2.5 The existing path-builder specs still pass — 4d00b08
- [x] 2.6 No raw-text guard is left on a parse path — 4d00b08

#### Manual

- [x] 2.7 Targeted break, full Check — spec (1) reddens on the missing banner — 4d00b08
- [x] 2.8 Targeted break, diff Check — spec (2) reddens, (1) and (3) stay green — 4d00b08
- [x] 2.9 Targeted break, add — spec (3) reddens on the reload assertion — 4d00b08
- [x] 2.10 Count-only `4x` still renders `UnresolvedNotice` — 4d00b08
- [x] 2.11 Typing a real card line clears the banner on the first keystroke — 4d00b08

### Phase 3: DeckComparer's no-cards verdict

#### Automated

- [x] 3.1 Unit tests pass, including the updated outcome assertion: `npm test`
- [x] 3.2 Type checking passes: `npm run typecheck`
- [x] 3.3 Linting passes: `npm run lint`
- [x] 3.4 The new spec passes: `npx playwright test tests/e2e/comparer-zero-cards.spec.ts`
- [x] 3.5 The existing comparer specs still pass
- [x] 3.6 Full suite green: `npm test && npm run test:integration && npx playwright test`

#### Manual

- [x] 3.7 Targeted break — the comparer spec reddens on the missing banner
- [x] 3.8 The transport-failure banner and its Retry CTA are unaffected
- [x] 3.9 A comment-only box paired with a real deck names only the offending side
