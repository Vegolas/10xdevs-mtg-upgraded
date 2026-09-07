# Shared Stale-Response Guard Implementation Plan

## Overview

Extract one guarded-async primitive and route every async-then-setState flow in the app
through it, retiring findings **F-1 through F-5** together. This is the first change in the
risk-#9 chain that **repairs** rather than pins: its regression net for the pre-save half
already exists as four `test.fail()` specs in `tests/e2e/path-builder-stale-ordering.spec.ts`,
written before the helper, each naming a distinct invalidation site. The change succeeds when
all four report `Expected to fail, but passed.` and their annotations come off in one commit.

The mutation half (F-5) has no such net, so it gets one built: a parked-route fixture for the
app's **own** API and two green specs written against the repaired behavior.

The plan also corrects three claims in the upstream record that do not survive contact with
the code. All three are load-bearing — each one changes what gets built:

- **F-5's stated symptom is wrong.** Two rapid deletes produce **two** server deletes, not one.
- **A latest-wins token makes `handleDeleteLast` strictly worse.** F-5's three flows do not
  want one discipline.
- **The four pins are not sufficient as a specification.** A two-line fix flips all four while
  leaving F-3's actual defect reachable.

## Current State Analysis

The "monotonic token, drop if superseded" guard is duplicated by hand across five flows and
absent from three more. `context/foundation/lessons.md`, "Treat the stale-response guard as
five hand copies, not one pattern", records four verified ways the copies have drifted and
names a shared helper as the real fix; until now the duplication has been a standing review
obligation rather than a change.

What exists:

- `src/components/deck/DeckComparer.tsx` — `runPlan` (`:68-84`) with one counter (`:61`), one
  checkpoint (`:73`), and an effect that bumps the counter when a box empties (`:88-91`). No
  `catch`: `generateUpgradePlan` converts a throw into `{status: "error"}` (`plan.ts:106-108`),
  so the single guard covers the error path by construction.
- `src/components/path/PathEditor.tsx` — two counters (`:189`, `:191`) across three guarded
  flows and three unguarded ones. `handleAddStep` (`:214`) has four checkpoints; `runCheck`
  (`:321`) and `runDiffCheck` (`:347`) share one counter and have two each; `handleDeleteLast`
  (`:433`), `handleRename` (`:447`) and `handleDeletePath` (`:469`) have none.
- `src/components/path/NewPathForm.tsx` — `handleSubmit` (`:21`) awaits `requestJson` (`:29`)
  then writes `setError` (`:35`) / `setPending` (`:42`). Its only protection is a pre-await
  `pending` read (`:23`).
- Four inverted specs pinning F-1 through F-4, plus two green comparer specs (risks #7 and #8)
  that are the regression net for any change to `runPlan`.
- No component-render layer anywhere: `vitest.config.ts:13` is `environment: "node"` and
  `:14` globs `src/**/*.test.ts` — which does not even match `.tsx`. There is no jsdom, no
  Testing Library, and §7 keeps it that way. Pure logic colocated with components **is**
  tested (`src/components/deck/sortStorage.test.ts`), which is the seam this plan uses.

### Key Discoveries

Verified against the code on 2026-09-06 during this planning session. The first three
contradict the upstream record and change what gets built.

- **F-5's symptom does not survive the route.** `findings.md` says "two rapid deletes can pop
  two steps for one server delete". `DELETE /api/paths/[id]/steps` removes the
  highest-position step per call (`src/pages/api/paths/[id]/steps.ts:214-236`), so two
  overlapping deletes produce two server deletes and the client agrees. The reachable
  divergence on a one-step path is a **false error banner**: the first DELETE answers 204 and
  pops, the second answers 404 `"No steps to delete"` (`steps.ts:225-227`) and writes
  `setMutationError` (`PathEditor.tsx:443`) over a delete that succeeded.
- **A latest-wins token would make `handleDeleteLast` worse than it is today.** Under
  "newest run wins", the first DELETE's successful 204 is dropped as superseded (no pop) and
  the second's 404 sets the error — leaving a step rendered against a server holding zero.
  That is the rendered-list-disagrees-with-the-server failure F-5 says it wants to prevent,
  manufactured by the guard meant to prevent it. `handleDeleteLast` and `handleDeletePath`
  want **at-most-one-in-flight**; `handleRename` wants **latest-wins**.
- **The four pins are necessary but not sufficient.** S2 (`:262`) and S3 (`:343`) both
  `deckBox.fill(DECK_B)` before clicking Add, which fires the textarea's `onChange`. So a
  two-line repair — bump the preview counter in `onChange` (`:720-722`) and in `switchMode`
  (`:376-382`) — flips **all four** specs, including S3, whose subject is atom ownership. The
  Check-versus-add overlap F-3 actually describes stays reachable without an intervening
  textarea edit (Check text T, fill the name, add the same text T). The refactor's
  justification is F-5 and the standing obligation, not the pins' difficulty.
- **An eighth site nobody has counted.** `NewPathForm.handleSubmit` reads `pending` **before**
  the await (`:23`) and is listed in its own deps (`:46`), so a second click after React
  commits is blocked but two clicks inside one tick are not. Same class as `handleDeleteLast`;
  absent from `findings.md` F-5 and from `change.md`.
- **`inFlight` has to be React state, not a ref.** The at-most-one discipline is enforced by a
  committed `disabled` attribute — which is how `handleAddStep` is already safe in practice
  (`setAddState({status:"resolving"})` at `:226` runs before any await, and `:811` reads it).
  A `useRef` cannot drive a re-render, so the hook owns a `useState` alongside the counter.
- **The mode toggle is the only uncontrolled trigger during an add.** The Check button is
  already gated on `addState.status === "resolving"` (`:796`), so Check-during-add is
  undrivable; the Add button is gated on the same (`:811`). The mode toggle (`:661-696`) is
  not, so it is the one control that can clear `addState` under an add in flight.
- **`retries` inverts back the moment the annotations come off.** §6.7 item 23 leaves retries
  at the config default _because_ the specs are inverted; item 12 requires `retries: 0` on
  ordering-sensitive specs, which is what they become once repaired.
- **A third error banner is unavoidable, and both twins are already named.** F-3's repair
  routes the Check catches to a Check-owned atom, which puts a third `<p>` with the same class
  string on this surface. `testing-path-builder-error-and-mode` gave `role="alert"` plus an
  `aria-label` to both existing banners (`:602-608` "Path error", `:777-783` "Checkpoint
  error") in anticipation. §6.7 item 27 requires the new one to be named in the same breath.

## Desired End State

One primitive owns staleness for the whole app. Concretely:

- `src/lib/async/latestRun.ts` exists, is pure, and is covered by `latestRun.test.ts` at the
  `node`-env unit layer — so the guard's _algebra_ is proved at the cheapest layer and the
  browser specs only have to prove the _wiring_.
- Every one of the eight async-then-setState flows runs through `useLatestRun`. No file in
  `src/` contains a hand-rolled request-token counter. `grep -rn "useRef(0)" src/` returns
  nothing.
- `tests/e2e/path-builder-stale-ordering.spec.ts` carries **zero** `test.fail()` annotations
  and passes, with `retries: 0`.
- `tests/e2e/path-builder-mutation-ordering.spec.ts` exists and passes green, covering the
  delete-last and rename disciplines.
- The two green comparer specs still pass unchanged — `runPlan`'s observable behavior is
  identical.
- Test-plan §2 risk #9 reads **protected**, and a new risk #10 covers F-5's failure class.

Verified by: `npm test`, `npm run test:integration`, `npm run test:e2e` all green, with the
e2e run reporting **zero** expected failures — the number §6.7 item 22 says to read.

## What We're NOT Doing

- **Not fixing F-6.** Non-empty text parsing to zero cards rendering "✓ All cards resolved."
  (`PathEditor.tsx:322`, `:216`, verdict at `:741`) is a validation gap, not an ordering one.
  It routes to `src/lib/deck/parse.test.ts` and needs no browser and no shared guard.
  `change.md` holds it out by name.
- **Not adding a component-render layer.** No jsdom, no Testing Library, no `.test.tsx`. §7
  keeps component rendering out and this change does not reopen it; the primitive is
  unit-tested precisely _because_ it is pure and needs no renderer.
- **Not adding a CI job or changing branch protection.** Both new spec files live under
  `tests/e2e/`, which the required `e2e` job already runs, and the unit tests ride `npm test`
  in the required `ci` job. No job name is added, so no required-check list edit.
- **Not opening a §3 rollout phase.** §3 rows are coverage rollout, and the rollout has had no
  open phase since Phase 5 closed. This is repair; it is recorded in §8 and in §2's rows.
- **Not touching `handleAccept` / `handleAcceptAll` / the diff variants** (`:388-431`) beyond
  what routing `runCheck`/`runDiffCheck` requires. They are synchronous and already read the
  rewritten text from `next` rather than from state.
- **Not changing any user-visible copy.** The new Check-error banner reuses the message text
  the Check catches already produce; the existing banners keep their wording, position and
  appearance.
- **Not making the server's own last-write-wins ordering a concern.** The guard's contract is
  that the newest _user intent_ wins on screen. Reconciling a divergent server row is a
  different problem and is not in scope.
- **Not writing a `backport.md`.** Decided during planning: this change takes §2, §6.7 and §8
  itself. §2's edit restriction exists so a frozen cell is not rewritten casually; this change
  is the one that falsifies #9's disposition, so deferring it would leave the map wrong in the
  actionable direction.

## Implementation Approach

Split the guard into a **pure core** and a **thin hook**, mirroring
`sortStorage.ts` + `useSortMode.ts` — the repo's one existing precedent for component-adjacent
logic that deserves tests.

The hook's `run` takes a **commit thunk**: the async body returns the writes it wants applied
(or `null` for "write nothing"), and the hook invokes that thunk only if the run is still the
newest. This is the shape that structurally retires the first divergence `lessons.md` names —
"checkpoint count differs per flow" — because there is no longer a per-flow decision to make
about how many times to re-check. Adding an `await` to a flow cannot open an unguarded window,
because the flow does not write state at all; the hook does.

Invalidation is partitioned into **lanes**, one `useLatestRun()` per lane:

| Lane                      | Flows                      | Discipline                     | Invalidated by                                                       |
| ------------------------- | -------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `preview` (PathEditor)    | `runCheck`, `runDiffCheck` | latest-wins                    | a new Check, the textarea `onChange`, `switchMode`, a successful add |
| `add` (PathEditor)        | `handleAddStep`            | latest-wins + trigger disabled | a newer add                                                          |
| `deleteLast` (PathEditor) | `handleDeleteLast`         | at-most-one (trigger disabled) | —                                                                    |
| `rename` (PathEditor)     | `handleRename`             | latest-wins                    | a newer rename                                                       |
| `deletePath` (PathEditor) | `handleDeletePath`         | at-most-one (trigger disabled) | —                                                                    |
| `plan` (DeckComparer)     | `runPlan`                  | latest-wins                    | a newer run, either box emptying                                     |
| `create` (NewPathForm)    | `handleSubmit`             | at-most-one (trigger disabled) | —                                                                    |

The load-bearing property of this table is what is **absent**: no input event invalidates a
persist. A keystroke or a mode switch must never drop a POST already in flight, because that
saves a checkpoint the UI never renders and reports no error — a worse failure than the one
being repaired. Where a persist and an input event genuinely conflict, the trigger is disabled
rather than the run invalidated, which is the pattern the Check button already uses.

Phase order: the primitive and its safest consumer first, so a regression is attributable to
the extraction rather than to the repair; then the pre-save repair, whose entire success
condition is four annotations coming off; then the mutation flows with the harness they need;
then the record.

## Critical Implementation Details

**The four annotations must come off in one commit, and the reason is mechanical, not
stylistic.** Adding the `onChange` invalidation alone drops `runCheck`'s catch before it can
reach `setAddState`, so S3 flips to `Expected to fail, but passed.` without F-3 having been
repaired. Land the `onChange` bump and the `checkError` atom in the same commit or the build
goes red mid-phase on a spec whose subject was never touched. This is also why F-3's repair
must be verified by its own targeted break rather than by S3 alone.

**S3 will pass for two independent reasons after Phase 2, and only one of them is F-3's
repair.** The preview lane's invalidation drops the superseded Check; the `checkError` atom
means even a _current_ Check failure no longer writes the checkpoint banner. Verifying the
repair therefore requires the second overlap S3 does not drive: Check text T, fill the
checkpoint name, add the same text T with no textarea edit between. That path exercises atom
ownership with the lane guard passing.

**The mode toggle's new `disabled` must not extend to a Check in flight.** S4 clicks the
toggle while a Check is parked; gating the toggle on anything other than
`addState.status === "resolving"` makes S4 undrivable and it would fail on the click rather
than on the guard — §6.7 item 26's failure mode in a new costume.

**A parked app-API route must `continue()` what it does not park.**
`mockScryfallWithParkedCollection` fulfills every non-parked request synthetically because
Scryfall is fully mocked. The app's own API is not: the page's own navigation, the seed, and
the second half of every overlap have to reach the real server. The new fixture's default
branch is `route.continue()`, and only the parked request is held.

**Park the rename PATCH without letting it reach the server.** Releasing it with a synthetic
`UpgradePath` body keeps the server holding exactly one title (the newer one), so the spec's
claim — "the newer title stands on screen" — is about the client guard and nothing else. The
alternative, `route.fetch()`-then-hold, makes the assertion depend on which write the server
applied last and buys nothing.

**`work` must not reject.** `resolveDeck` (`plan.ts:61`) and `deriveSnapshot`
(`derive.ts:110`) both propagate a transport throw; `generateUpgradePlan` and `requestJson` do
not. Call sites keep their own `try`/`catch` and return an error commit from it. The hook
clears `inFlight` in a `finally` but does not swallow — an unexpected rejection propagates
exactly as it does today, so the refactor introduces no new silent path. Document this on the
`run` signature; it is the one contract a future caller can get wrong invisibly.

---

## Phase 1: The guard, and its first consumer

### Overview

Extract the primitive, prove its algebra at the unit layer, and wire the one call site whose
correct behavior is already pinned by two green specs. Nothing user-visible changes. A
regression here is unambiguously the extraction's fault, because no guard semantics have been
altered yet.

### Changes Required:

#### 1. The pure core

**File**: `src/lib/async/latestRun.ts`

**Intent**: Hold the monotonic counter and the staleness question in one tested place, with no
React and no DOM, so the semantics `lessons.md` says have drifted five ways have exactly one
definition.

**Contract**: Exports `createLatestRun(): LatestRun` where `LatestRun` is
`{ begin(): RunToken; isCurrent(token: RunToken): boolean; invalidate(): void }`. `begin`
mints a fresh token and returns it; `isCurrent` compares by identity against the latest;
`invalidate` mints one nobody holds, so nothing outstanding is current. Pure and total — no
throw path, no globals, one instance per lane.

`RunToken` is an exported but never-externally-constructed `symbol`, **not** a number.
_Corrected 2026-09-06 during Phase 1: the number form contradicted this phase's own
cross-lane test case below, because two lanes with independent counters both issue `1` first,
so one lane's token reads as current in the other. Identity-compared tokens make lane
isolation structural — passing the wrong lane's token cannot accidentally pass — which is
what Phase 2's five lanes and Phase 3's two more depend on._

#### 2. Unit coverage for the core

**File**: `src/lib/async/latestRun.test.ts`

**Intent**: Prove the algebra at the cheapest layer so the browser specs only have to prove
wiring. This is what keeps the extraction from needing a renderer.

**Contract**: `describe("createLatestRun")` covering: a lone run is current; a second `begin`
supersedes the first; `invalidate` supersedes an outstanding run with none started; two
instances are independent; a token from one instance is never current in another; repeated
`isCurrent` calls are stable. Node env, no mocks — rides `npm test` via `vitest.config.ts:14`'s
`src/**/*.test.ts` glob.

_Shipped 2026-09-06 with two cases beyond this list: an `invalidate` before any run must not
poison the next one (the textarea's `onChange` fires long before the first Check is clicked),
and a token no run on this lane ever issued reads as not-current._

#### 3. The hook

**File**: `src/lib/async/useLatestRun.ts`

**Intent**: Give components the commit-thunk API plus the `inFlight` flag that drives
`disabled` for the at-most-one flows, without any component holding a counter of its own.

**Contract**: The signature every later phase depends on:

```ts
/** The writes a run wants applied, or `null` for "write nothing". */
export type Commit = (() => void) | null;

export interface RunControls {
  /** Run `work`; apply its commit only if this run is still the newest. Must not reject. */
  run(work: () => Promise<Commit>): Promise<void>;
  /** Supersede whatever is outstanding — call from the event that made it stale. */
  invalidate(): void;
}

/** `inFlight` is true while a run started here has not settled. */
export type GuardedRun = readonly [inFlight: boolean, controls: RunControls];

export function useLatestRun(): GuardedRun;
```

`inFlight` is `useState` (a ref cannot drive the re-render that commits `disabled`). `run`
calls `begin`, sets `inFlight`, awaits `work`, and applies the commit only when
`isCurrent(token)` — clearing `inFlight` in a `finally`, and only for the newest run, so a
superseded run cannot re-enable a disabled trigger. `invalidate` also clears `inFlight`, since
nothing outstanding may write. `run` and `invalidate` are `useCallback`-stable, and `controls`
is `useMemo`-stable over them, so call sites keep clean dep arrays.

_Two corrections landed 2026-09-06 during Phase 1._ **The return is a tuple, not one object.**
An object carrying `inFlight` is a fresh reference every render, and the comparer's debounce
effect depends on its runner — so bundling the two re-registered a 700 ms timer on every
render, including the renders `inFlight` itself causes: plan resolves → render → new timer →
plan runs again, indefinitely. Handing the volatile flag back separately from the stable
controls makes that unrepresentable rather than leaving it to a convention at eight call
sites. **The lane is held in `useState(createLatestRun)`, not a lazily-initialised
`useRef<LatestRun | null>`** — verified by probe, `react-hooks/refs` rejects the ref form at
error level ("Cannot access refs during render"). Same lifetime, same stability, no ref read
in render.

#### 4. DeckComparer routed through the hook

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Replace the hand-rolled counter with the shared lane, keeping observable behavior
byte-identical so the two green comparer specs stay the regression net.

**Contract**: `requestToken` (`:61`) is deleted. `runPlan` (`:68-84`) becomes a `run` call
whose body awaits `generateUpgradePlan` and returns a commit selecting one of the three
`setView` writes. The debounce effect's bare `requestToken.current++` (`:90`) becomes
`plan.invalidate()`, which is the same semantics and keeps its comment. `handleCalculate`
(`:106-109`) and the Retry button (`:229`) keep their exact behavior. No render output changes
and no `disabled` is added — this lane is latest-wins only.

### Success Criteria:

#### Automated Verification:

- Unit suite passes with the new file collected: `npm test`
- Linting passes, including `react-hooks` and `react-compiler` at error: `npm run lint`
- Type checking passes: `npm run typecheck`
- Both comparer specs still pass unchanged: `npx playwright test comparer-`
- The four inverted specs still report exactly four expected failures and zero unexpected
  passes: `npm run test:e2e`
- No hand-rolled counter remains in the comparer: `grep -rn "useRef(0)" src/components/deck/`
  returns nothing

#### Manual Verification:

- The comparer behaves identically: typing both decks builds a plan after the debounce, the
  Calculate CTA builds immediately, emptying a box returns to the idle prompt, and Retry
  rebuilds after an induced failure
- Deliberately breaking `isCurrent` to always return `true` makes
  `comparer-stale-response.spec.ts` red — proving the extracted guard is the one being
  exercised, not a residual behavior — then reverted

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human that the manual testing was successful
before proceeding to the next phase.

---

## Phase 2: The repair — PathEditor's pre-save flows

### Overview

Retire F-1 through F-4 in one commit, and take the four `test.fail()` annotations off in the
same one. This is the phase the four inverted specs were written for: they are the
specification, authored before the helper existed, and each names a distinct invalidation site
the repair has to satisfy.

### Changes Required:

#### 1. Lanes replace the two counters

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Give each pre-save flow the lane that matches the atoms it owns, so F-2's and
F-3's shared failure — a write guarded by a counter that does not own its target — becomes
unrepresentable rather than merely fixed.

**Contract**: `addToken` (`:189`) and `checkToken` (`:191`) are deleted and replaced by
`const [, preview] = useLatestRun()` and `const [addInFlight, add] = useLatestRun()` — the
tuple shape Phase 1 shipped, where the second element carries `run` and `invalidate`.
`runCheck` (`:321-342`) and
`runDiffCheck` (`:347-372`) both run on `preview`; `handleAddStep` (`:214-316`) runs on `add`.
Each body's inline token comparisons (`:245`, `:267`, `:275`, `:291`, `:330`, `:335`, `:358`,
`:363`) are removed — the hook owns the decision — and each `return` path yields a commit
instead: `null` for "drop silently", a thunk for every state write. `handleAddStep`'s success
commit additionally calls `preview.invalidate()` alongside its `setCheckState` /
`setDiffPreview` resets (`:314-315`), which is F-2's repair: the add now supersedes a Check in
flight instead of clearing atoms a different counter guards.

#### 2. The textarea invalidates on every edit

**File**: `src/components/path/PathEditor.tsx`

**Intent**: F-1. Invalidate from the handler that _observes_ the change, not from a branch
downstream of it — `lessons.md`, "Clearing an input is not an invalidation event", is explicit
that a bump inside `runCheck`'s empty-text branch (`:322-324`) fixes nothing because that
branch is unreachable.

**Contract**: The textarea's `onChange` (`:720-722`) calls `preview.invalidate()` after
`setListText`. This covers every edit, not only an emptying one, which is why it is the handler
rather than the empty branch. The `id`, `value`, `placeholder`, classes and `spellCheck` are
untouched.

#### 3. `switchMode` invalidates, and cannot fire under an add

**File**: `src/components/path/PathEditor.tsx`

**Intent**: F-4. The one control whose own comment (`:374-375`) says it exists so the two
surfaces never bleed into each other is the one control that invalidates nothing.

**Contract**: `switchMode` (`:376-382`) calls `preview.invalidate()` alongside its existing
three resets. It does **not** invalidate the `add` lane; instead both mode buttons (`:667-680`,
`:681-694`) gain `disabled={addInFlight}`, mirroring the Check button's existing
`addState.status === "resolving"` gate (`:796`). The toggle stays enabled during a Check — S4
drives it in exactly that state, and gating it on a Check would make S4 fail on the click.

#### 4. A Check-owned error atom and a third named banner

**File**: `src/components/path/PathEditor.tsx`

**Intent**: F-3. Both Check catches write `setAddState` (`:339`, `:367`) — the add flow's atom
— so a message about a failed Check can land over a checkpoint that saved cleanly. Routing
them to their own atom is the repair the finding recommends and the one S3 was written to
retire.

**Contract**: A `checkError: string | null` atom is added next to `mutationError` (`:184`),
shared by both Check flows because they share the `preview` lane. Each catch's commit sets
`checkError` and resets its own preview atom; neither touches `addState`. `switchMode` and the
textarea's `onChange` clear it, as does the start of a new Check. It renders as a third `<p>`
with `role="alert"` and `aria-label="Check error"`, placed directly under the two preview
surfaces and above the checkpoint-error banner, carrying the same class string as the other
two — §6.7 item 27 requires the name because the class string is no longer even a two-way
ambiguity. The message text is unchanged from what the catches produce today.

#### 5. Annotations off, retries pinned

**File**: `tests/e2e/path-builder-stale-ordering.spec.ts`

**Intent**: Convert four inverted specs into four ordinary regression tests in the same commit
as the repair, and restore the retry setting that ordering specs require once their failure is
no longer the expected state.

**Contract**: All four `test.fail();` lines (`:171`, `:240`, `:321`, `:413`) and their adjacent
"Expected to fail until F-N is fixed" comments are removed. The file gains
`test.describe.configure({ retries: 0 })`, matching `comparer-stale-response.spec.ts` — §6.7
item 12 applies again the moment item 23's inversion stops. The file header's "READ THIS BEFORE
ACTING ON A RED BUILD" block is rewritten to say the specs now protect a repair, naming this
change; each spec's own header keeps its mechanism explanation, with the "NOT the mechanism
`lessons.md` records" / "NOT the mechanism `findings.md` records" corrections intact because
they are still the reason each spec has the shape it has. No assertion, locator, deck constant
or observation window changes — a spec whose body moves has stopped being the specification it
claimed to be.

### Success Criteria:

#### Automated Verification:

- The browser suite reports **zero** expected failures and zero unexpected passes:
  `npm run test:e2e`
- All four repaired specs pass by name: `npx playwright test path-builder-stale-ordering`
- Both comparer specs still pass: `npx playwright test comparer-`
- Linting, typecheck and the unit suite pass: `npm run lint && npm run typecheck && npm test`
- No hand-rolled counter remains anywhere in `src/`: `grep -rn "useRef(0)" src/` returns nothing

#### Manual Verification:

- **The staged run**, in this order, before the annotations come off: with the production edit
  reverted the suite reports four expected failures; with the edit applied and the annotations
  still in place it reports four **unexpected passes**; with the annotations removed it reports
  four passes. Any other sequence means a spec is passing for a reason other than the repair
- **F-3's own targeted break**: with `checkError` reverted so both catches write `addState`
  again, the reachable overlap S3 does not drive — Check text T, fill the checkpoint name, add
  the same text T with no textarea edit between — still lands the checkpoint-error banner over
  a saved checkpoint; with the atom restored it does not. This is the only verification that
  separates F-3's repair from F-1's, since the `onChange` bump alone flips S3
- **F-4's targeted break**: reverting only `switchMode`'s `invalidate()` makes S4 red alone,
  and no other spec
- The three error banners are visually and positionally as before, each announced by a screen
  reader under its own name — "Path error", "Checkpoint error", "Check error"
- The mode toggle is disabled while a checkpoint resolves and enabled during a Check; a
  checkpoint added while a Check is in flight still renders, and no verdict appears over it

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human that the manual testing was successful
before proceeding to the next phase.

---

## Phase 3: The mutation flows and their proof

### Overview

Retire F-5 and the eighth site, with the split discipline the code actually requires, and build
the harness that proves it. Unlike F-1 through F-4 these flows have no guard to specify, so
their specs are written **green**, against the repaired behavior — the decision `change.md`
took when the change was opened.

### Changes Required:

#### 1. The mutation lanes

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Give each mutation the discipline that matches its route's semantics. A single rule
across all three would make `handleDeleteLast` worse than it is today, which is the finding
this plan corrects.

**Contract**: Three lanes — `deleteLast`, `rename`, `deletePath`. `handleDeleteLast`
(`:433-445`) and `handleDeletePath` (`:469-480`) run at-most-one: their buttons (`:641-652`,
`:561-572`) gain `disabled` driven by their lane's own `inFlight` element — each lane is
destructured as `const [<name>InFlight, <name>] = useLatestRun()` — so no second request is
ever issued and no
superseded response can exist. `handleRename` (`:447-467`) runs latest-wins: a newer rename
supersedes an older one, and the older PATCH's `setTitle` / `setRenaming` commit is dropped.
Every body returns a commit rather than writing inline; the Save button (`:506-517`) does
**not** gain a disabled state, because latest-wins is the point. `handleDeletePath`'s
`window.confirm` (`:470`) stays where it is — it precedes the run.

#### 2. The eighth site

**File**: `src/components/path/NewPathForm.tsx`

**Intent**: Close the register entry rather than amend it. Leaving one hand-rolled guard behind
means the next reader still has to re-read all of them, which is the obligation this change
exists to retire.

**Contract**: `handleSubmit` (`:21-46`) runs on a `create` lane at-most-one. The pre-await
`pending` read (`:23`) and the `pending` state are replaced by the lane's `inFlight`, which is
committed before the await rather than read from a stale closure — closing the same
two-clicks-in-one-tick gap `handleDeleteLast` had. The submit control keeps its existing
disabled behavior, now driven by `inFlight`. The success path still navigates (`:45`); the
failure commit still writes the same three `setError` messages.

#### 3. A parked-route fixture for the app's own API

**File**: `tests/e2e/fixtures/appApi.ts`

**Intent**: The overlap these specs need cannot be produced any other way. Every existing
fixture routes `https://api.scryfall.com/**`; `fixtures/auth.ts` only _calls_ the app API for
seeding and never intercepts it, so there is no way today to hold one `/api/paths/*` request
while a second completes.

**Contract**: Exports `parkAppApi(page, predicate): Promise<ParkedAppRequest>`, shaped on
`mockScryfallWithParkedCollection` (`tests/e2e/fixtures/scryfall.ts:211`) and sharing its
`arrived` promise and single-shot release contract. Two differences are structural and must not
be copied away: the default branch is **`route.continue()`**, not a synthetic fulfil, because
the page's navigation, the seed and the second half of every overlap have to reach the real
server; and release takes the body to answer with, so a held PATCH can be answered with a stale
`UpgradePath` the server never saw. A `releaseWithStatus(status)` variant covers the 404 case.
The predicate receives method plus URL.

#### 4. The two green specs

**File**: `tests/e2e/path-builder-mutation-ordering.spec.ts`

**Intent**: Prove both disciplines. Neither may ship on the argument that it mirrors the other
— that argument is precisely what produced F-5.

**Contract**: New file, named per §6.7's `<surface>-<risk>.spec.ts` convention. Reuses
`path-builder-stale-ordering.spec.ts`'s auth shape verbatim: a per-test owner via
`createSignedInOwner`, `adoptSession` to move the browser's jar, `seedPathWithStep`, one
`deleteOwner` in `afterEach`, all setup in `beforeEach`. Carries
`test.describe.configure({ retries: 0 })` — these are ordering specs and item 12 applies. Two
tests. **"a delete that succeeded never reports an error"**: park the DELETE, assert the button
is `disabled` so a second request cannot be issued, release, assert exactly one step was removed
and that no banner named "Path error" ever renders, through an observation window opened before
the release (§6.7 item 13). **"a superseded rename never restores the old title"**: park the
first PATCH without letting it reach the server, issue a second rename that completes, prove it
completed by the rendered heading, then release the first with a synthetic `UpgradePath` body
carrying the old title and assert through an observation window that the old title never
appears.

**Intent (header comment)**: Record why the specs have this shape and not F-5's — that two rapid
deletes produce two server deletes, so the delete spec's subject is the false banner and the
disabled trigger; and that the rename PATCH is deliberately never delivered to the server, so
the assertion is about the client guard alone.

### Success Criteria:

#### Automated Verification:

- Both new specs pass: `npx playwright test path-builder-mutation-ordering`
- The whole browser suite passes with zero expected failures: `npm run test:e2e`
- Linting, typecheck and the unit suite pass: `npm run lint && npm run typecheck && npm test`
- The integration suite is unaffected: `npm run test:integration`
- No hand-rolled guard remains: `grep -rn "useRef(0)\|Token.current" src/` returns nothing

#### Manual Verification:

- Each new spec, run once with its guard reverted, fails on the assertion it names — the false
  banner, the restored title — not on a locator, a timeout, or a seed (`lessons.md`, "Pin a live
  defect with `test.fail()`", trap 2, which applies to a green spec for the same reason)
- Both delete buttons visibly disable during their request and re-enable on failure; the rename
  Save button does not disable, and a second rename wins
- Creating a path from `/paths` still works, double-clicking the create control issues exactly
  one POST, and a failed create still shows its message — `NewPathForm` has no browser spec, so
  this is the only check on it
- The path builder is otherwise unchanged: adding, checking, diff mode, accept, delete last and
  delete path all behave as before

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human that the manual testing was successful before
proceeding to the next phase.

---

## Phase 4: The record

### Overview

Carry forward what this change proved, retire the register entry it was opened to discharge,
and correct the risk map. The two archived `findings.md` files are immutable, so the three
upstream corrections land where the skills will read them.

### Changes Required:

#### 1. This change's findings

**File**: `context/changes/shared-stale-response-guard/findings.md`

**Intent**: Record what was found and not fixed, so nothing evaporates with the change folder.
The list is short by design — this change repairs rather than defers.

**Contract**: House shape from
`context/archive/2026-08-11-testing-api-contract-pinning/findings.md` — F-numbered, each with
Where (file:line, verified), Observed, Impact, Why deferred, Suggested owner. Numbering
continues from the chain: F-6 is carried forward verbatim with re-verified line numbers (every
line below `PathEditor.tsx:184` moved in Phase 2), and F-7 records `NewPathForm`'s previously
uncounted site as **closed here**. The three upstream corrections — F-5's symptom, the
latest-wins hazard on delete, and the pins' insufficiency — are stated with their evidence,
since the archived list cannot carry them.

#### 2. The register entry this change discharges

**File**: `context/foundation/lessons.md`

**Intent**: The file is append-only, so "Treat the stale-response guard as five hand copies"
cannot be edited. A new entry supersedes it and states the rule that replaces it.

**Contract**: One entry recording that the duplication is gone, where the single definition
lives, and the rule that replaces the standing review obligation: a flow that awaits and then
writes state goes through `useLatestRun`, and a review rejects a new hand-rolled counter. It
also records the two general lessons this change paid for — that a finding's _suggested fix_
needs the same render-tree verification its _symptom_ does (F-5's latest-wins prescription
would have made delete worse), and that a pin can flip for a reason other than the defect it
names, so a repair needs a targeted break per defect and not just a green suite.

#### 3. The cookbook

**File**: `context/foundation/test-plan.md` §6.7

**Intent**: Two facts this change paid for that the next browser phase should not.

**Contract**: New items continuing from 27. One on parking the app's **own** API — that the
default branch is `route.continue()` rather than a synthetic fulfil, and that a held mutation
answered with a synthetic body keeps the server out of the assertion. One on retiring a
`test.fail()` pin — the staged three-run sequence (reverted / applied-but-annotated /
annotations-off), that item 23's retry setting inverts back to item 12's `retries: 0` at that
moment, and that a repair needs a targeted break **per defect** because one repair can flip a
pin belonging to another.

#### 4. The risk map

**File**: `context/foundation/test-plan.md` §2

**Intent**: Risk #9's row is now false in the direction that costs a reader work, and F-5's
failure class has never had a row at all.

**Contract**: Row #9 moves from the open table to the protected table, its "Answered by" cell
replaced by a "Protected by" cell naming this change — which supersedes both corrections §8
records as owed (the dead `context/changes/testing-path-builder-ordering/` path and the stale
"F-1 and F-2" count). The paragraph explaining why a completed phase left a risk documented
rather than protected is rewritten to record that the disposition has now changed and why. New
row **#10** is appended — a path-builder mutation's superseded response leaving the rendered
path disagreeing with the server — Medium × Low, with its Risk Response Guidance row, entering
the map already protected by this change. No other row's cells are touched; numbering stays
append-only.

#### 5. The ledger and the change's status

**File**: `context/foundation/test-plan.md` §8, and
`context/changes/shared-stale-response-guard/change.md`

**Intent**: Date the entry and close the change.

**Contract**: A §8 entry naming this change, what it repaired, that it opened no §3 rollout
phase and no CI job, which §2 edits it took and why it took them rather than deferring to a
refresh, and that the §7 admissibility argument for risk #10's browser specs is in this plan.
`change.md` moves to `status: complete` with `updated` stamped.

### Success Criteria:

#### Automated Verification:

- Every referenced path resolves and every cited line number is current after Phase 2's edits
- Formatting is clean on this change's files: `npx prettier --check` on the touched files
- The full gate stack passes:
  `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run test:e2e`

#### Manual Verification:

- §2's protected table reads coherently with #9's explanatory paragraph — no cell disagreeing
  with the prose beneath it, which is the exact defect §8 recorded against the old row
- Risk #10's row survives §7's admissibility test on its own terms: the failure exists nowhere
  but the rendered result, and no cheaper layer can see it — there is no component-render layer
  and the divergence is client-side ordering
- `lessons.md`'s new entry reads correctly standing alone, to someone who has not read this plan

**Implementation Note**: This is the final phase. After it, `change.md` moves to
`status: complete` and the change is ready for `/10x-archive`.

---

## Testing Strategy

### Unit Tests

- `src/lib/async/latestRun.test.ts` — the guard algebra: supersession, invalidation with nothing
  outstanding, instance independence, token stability. Node env, no renderer, no mocks.
- Nothing else moves at this layer. The engine goldens and the existing suites are untouched;
  `npm test` staying green through all four phases is itself the check that this refactor did
  not reach into `src/lib/{deck,path,card-data}`.

### Browser Tests

- `tests/e2e/path-builder-stale-ordering.spec.ts` — four existing specs, annotations removed in
  Phase 2, bodies unchanged. They are the specification for F-1 through F-4 and must pass
  without edits; a spec whose assertion had to move to go green was not the specification it
  claimed to be.
- `tests/e2e/path-builder-mutation-ordering.spec.ts` — two new green specs for risk #10.
- `tests/e2e/comparer-*.spec.ts` — unchanged, and the regression net for Phase 1.

### Edge Cases Covered by Construction

- **A persist dropped by an input event** — impossible, because no input event invalidates a
  persist lane; the mode toggle is disabled instead.
- **A superseded run re-enabling a disabled trigger** — impossible, because `inFlight` is
  cleared only for the newest run.
- **An added `await` opening an unguarded window** — impossible, because flows do not write
  state; they return a commit the hook applies.

### Manual Testing Steps

1. Sign in, open a saved path, paste a deck list and click Check; while it resolves, clear the
   box. No verdict may appear.
2. Repeat, but instead of clearing, name a checkpoint, paste a different list and add it. The
   checkpoint renders; no verdict about the first list appears over it.
3. Repeat, and instead switch entry mode out and back. The box is empty and no verdict appears.
4. Induce a Check failure with the network offline. The message appears under "Check error",
   never under "Checkpoint error", and never over a checkpoint that saved.
5. Delete the last checkpoint and click again immediately. The button is disabled; exactly one
   step disappears and no error banner appears.
6. Rename the path twice in quick succession. The second title stands.
7. From `/paths`, create a path and double-click the control. Exactly one path is created.
8. On the comparer, paste both decks, click Calculate, then edit a deck and click Calculate
   again before the first finishes. The rendered plan matches the second pair.

## Performance Considerations

None. The primitive is one symbol reference and a boolean; two `useState` slots per lane — the
lane itself, then its `inFlight` flag — replace one `useRef` per counter, adding at most one
re-render per run transition on components that already re-render on every state write in the
same flow. No new network traffic and no new allocation in render: `createLatestRun` is passed
as `useState`'s lazy initialiser, so it runs once per lane for the component's lifetime, and a
run mints exactly one symbol.

## Migration Notes

Nothing persists and nothing is versioned, so there is no data migration. The rollback unit is
the phase commit: Phase 1 reverts to a hand-rolled counter in `DeckComparer` with the comparer
specs still green; Phase 2 must be reverted **with** its annotation removal, or the suite reports
four unexpected passes against unrepaired code. That coupling is the reason the annotations and
the repair share a commit, and it is the one ordering constraint a revert has to respect.

## References

- Change brief: `context/changes/shared-stale-response-guard/change.md`
- Upstream findings (immutable):
  `context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md` — F-5, F-6;
  `context/archive/2026-09-05-testing-path-builder-ordering/findings.md` — F-1 through F-4
- The specification this plan is written against:
  `tests/e2e/path-builder-stale-ordering.spec.ts` — S1 through S4
- Conventions: `context/foundation/lessons.md` — "Treat the stale-response guard as five hand
  copies", "Clearing an input is not an invalidation event", "Pin a live defect with
  `test.fail()`", "When a finding names a symptom surface"
- Recipe: `context/foundation/test-plan.md` §6.7 items 1, 8, 11, 12, 13, 16–24, 25–27; §7's
  admissibility boundary; §2 risk #9
- Extraction precedent: `src/components/deck/sortStorage.ts` + `sortStorage.test.ts` +
  `useSortMode.ts`
- Fixture precedent: `tests/e2e/fixtures/scryfall.ts:211` (`mockScryfallWithParkedCollection`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The guard, and its first consumer

#### Automated

- [x] 1.1 Unit suite passes with `latestRun.test.ts` collected: `npm test` — 643719a
- [x] 1.2 Linting passes: `npm run lint` — 643719a
- [x] 1.3 Type checking passes: `npm run typecheck` — 643719a
- [x] 1.4 Both comparer specs still pass unchanged: `npx playwright test comparer-` — 643719a
- [x] 1.5 The four inverted specs still report exactly four expected failures: `npm run test:e2e` — 643719a
- [x] 1.6 No hand-rolled counter left in `src/components/deck/` — 643719a

#### Manual

- [x] 1.7 The comparer behaves identically — debounce, Calculate, empty-box idle, Retry — 643719a
- [x] 1.8 Breaking `isCurrent` reddens `comparer-stale-response.spec.ts`, then reverted — 643719a

### Phase 2: The repair — PathEditor's pre-save flows

#### Automated

- [x] 2.1 The browser suite reports zero expected failures and zero unexpected passes: `npm run test:e2e` — 1291750
- [x] 2.2 All four repaired specs pass by name: `npx playwright test path-builder-stale-ordering` — 1291750
- [x] 2.3 Both comparer specs still pass: `npx playwright test comparer-` — 1291750
- [x] 2.4 Lint, typecheck and unit suite pass — 1291750
- [x] 2.5 No hand-rolled counter left anywhere in `src/` — 1291750

#### Manual

- [x] 2.6 The staged three-run sequence: four expected failures → four unexpected passes → four passes — 1291750
- [x] 2.7 F-3's targeted break — the Check-versus-add overlap S3 does not drive still lands the checkpoint banner with `checkError` reverted, and does not with it restored — 1291750
- [x] 2.8 F-4's targeted break — reverting only `switchMode`'s `invalidate()` reddens S4 alone — 1291750
- [x] 2.9 Three error banners unchanged visually, each announced under its own name — 1291750
- [x] 2.10 The mode toggle is disabled during an add and enabled during a Check — 1291750

### Phase 3: The mutation flows and their proof

#### Automated

- [x] 3.1 Both new specs pass: `npx playwright test path-builder-mutation-ordering` — cb79859
- [x] 3.2 The whole browser suite passes with zero expected failures: `npm run test:e2e` — cb79859
- [x] 3.3 Lint, typecheck and unit suite pass — cb79859
- [x] 3.4 The integration suite is unaffected: `npm run test:integration` — cb79859
- [x] 3.5 No hand-rolled guard remains: `grep -rn "useRef(0)\|Token.current" src/` — cb79859

#### Manual

- [x] 3.6 Each new spec, run with its guard reverted, fails on the assertion it names — cb79859
- [x] 3.7 Both delete buttons disable during their request; the rename Save button does not — cb79859
- [x] 3.8 Path creation from `/paths` works and double-clicking issues exactly one POST — cb79859
- [x] 3.9 Add, Check, diff mode, accept, delete last and delete path all behave as before — cb79859

### Phase 4: The record

#### Automated

- [x] 4.1 Every referenced path resolves and every cited line number is current — c36e1c6
- [x] 4.2 Formatting clean on this change's files: `npx prettier --check` — c36e1c6
- [x] 4.3 The full gate stack passes: lint, typecheck, unit, integration, e2e — c36e1c6

#### Manual

- [x] 4.4 §2's protected table reads coherently with #9's explanatory paragraph — c36e1c6
- [x] 4.5 Risk #10 survives §7's admissibility test on its own terms — c36e1c6
- [x] 4.6 `lessons.md`'s new entry reads correctly standing alone — c36e1c6
