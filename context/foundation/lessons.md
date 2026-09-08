# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

Seeded 2026-08-31 by `testing-comparer-failure-surfacing` (test-plan §3 Phase 4). The file
did not exist before then, so every prior run of the skills above silently skipped this
lever — `/10x-e2e:109` and `/10x-implement` both read it "if present".

## Drive overlap through the affordance that bypasses the debounce, never through typing

- **Context**: any browser test of `src/components/deck/DeckComparer.tsx` — or of any
  component whose work is triggered by a debounced `useEffect` — that needs two runs
  genuinely in flight at once.
- **Problem**: the comparer debounces at 700 ms and the effect's cleanup clears the pending
  timer on every keystroke (`DeckComparer.tsx:99-101`). Typing deck A, then deck B, starts
  **one** run: the token never advances past 1 and the drop at `:73` is never reached. A test
  written that way passes, exercises nothing, and is exactly the anti-pattern test-plan §2
  names for risk #8 — "a test that passes because it never actually overlaps two runs."
  Nothing about the passing test says so; only reading the effect does.
- **Rule**: before writing a test that depends on two concurrent runs, find the entry point
  that bypasses the debounce and drive through it — here the Calculate CTA
  (`DeckComparer.tsx:106-109`), wrapped as `compare()` in `tests/e2e/fixtures/app.ts`. Then
  prove the first run is actually in flight (`await parked.arrived` / `waitForRequest`) before
  starting the second, and prove the first ran to **completion** before asserting it was
  dropped — a guard that is never reached cannot be shown to work.
- **Applies to**: research, plan, implement, impl-review

## Scope browser assertions to a landmark; do not neutralize the config difference

- **Context**: any Playwright spec in this repo, and any future test that renders a full page
  through `Layout.astro`.
- **Problem**: `.dev.vars` is gitignored, so a contributor has Supabase keys locally and CI
  has none. `config-status.ts:14` + `Layout.astro:28-43` then render a config-error banner
  **above** the `<slot/>`, and the same spec sees two different DOMs in the two places. The
  obvious fix — set dummy keys in CI — is worse: a non-falsy key makes `supabase.ts:7-9`
  return a real client, so `middleware.ts:12-15` runs `await supabase.auth.getUser()` on every
  request, including the anonymous `/` these specs use.
- **Rule**: scope every locator to a landmark inside the page's own content
  (`page.getByRole("main")`, the `<main>` in `AppLayout.astro:17`) and let the banner differ.
  `gotoComparer()` in `tests/e2e/fixtures/app.ts` returns that scope; chain off it rather than
  querying `page` directly. Never make the two environments identical by giving CI credentials
  it does not need.
- **Correction this phase recorded**: `tests/integration/global-setup.ts:47-48` and test-plan
  §6.2 rule 4 both attribute `.dev.vars`' precedence to `getPlatformProxy`. **The precedence
  claim is right; the mechanism attribution is not.** The adapter parses `.dev.vars` and calls
  `Object.assign(process.env, parsed)` at `@astrojs/cloudflare/dist/index.js:292-303` — the
  file wins because it overwrites `process.env`, not because a proxy resolves it. Load-bearing
  because it says _where to look_ when the override stops working.
- **Correction landed — the bullet above is now history, not a live defect.** All three
  sites it names (test-plan §6.2 rule 4, test-plan §6.6's Phase 1 note, and
  `global-setup.ts`'s `overrideDevVars` comment) now state the adapter's actual mechanism,
  corrected through `context/changes/test-plan-refresh-2026-09-01/` — see test-plan §8 for
  the dated entry. Note that the `global-setup.ts:47-48` reference above now lands on the
  **corrected** text; this register is append-only, so the original wording stays put.
- **Applies to**: research, plan, implement, impl-review

## Treat the stale-response guard as five hand copies, not one pattern

- **Context**: any change to `src/components/deck/DeckComparer.tsx` or
  `src/components/path/PathEditor.tsx` that touches an async run which writes state.
- **Problem**: the "monotonic token, drop if superseded" guard is duplicated by hand across
  five flows — `DeckComparer.runPlan` (`:69`, `:73`) and four in `PathEditor`: `handleAdd`
  (`:225`, `:245`, `:267`, `:275`, `:291`), `runCheck` (`:326`, `:330`, `:335`) and
  `runDiffCheck` (`:354`, `:358`, `:363`). Comments at `PathEditor.tsx:188` and `:191` assert
  the copies "mirror the add flow" / "mirror DeckComparer", and **nothing enforces that**.
  Verified 2026-08-31, they have already drifted four ways:
  1. **Checkpoint count differs per flow** — one in `runPlan`, four in `handleAdd`, two each
     in the Check flows. Adding an `await` to a flow silently adds an unguarded window.
  2. **Two counters, unevenly shared** — `addToken` and `checkToken` (`:189`, `:191`), with
     `runCheck` and `runDiffCheck` sharing the second. So a Check invalidates a diff-Check but
     an add invalidates neither.
  3. **The error path is guarded by different means** — `PathEditor` re-checks the token inside
     each `catch` (`:267`, `:335`, `:363`); `DeckComparer` has no `catch`, because
     `generateUpgradePlan` converts a throw into `{status: "error"}` and the single guard
     covers it by construction. Same intent, non-transferable code.
  4. **The Check flows write an atom their token does not guard** — `:339` and `:367` call
     `setAddState` from inside a `checkToken`-guarded catch, so the add-error banner is written
     by whichever run throws, superseded or not. A fifth divergence sits next to it:
     `DeckComparer` bumps its token when a box empties (`:88`) so an in-flight run is
     invalidated, while `runCheck`'s empty-text branch (`:322-325`) returns without bumping —
     a resolve in flight when the box is cleared can still land `checked`.
- **Rule**: never reason about one of these five sites from another, and never let a review
  accept "mirrors X" as evidence. When touching any of them, re-read all five and state which
  ones the change applies to. The drop path is **silent** — a bare `return`, no state change,
  no logging, and the token is a `useRef` that never reaches the DOM — so a broken copy has no
  symptom until rendered content contradicts the input. A shared helper would be the real fix;
  until then the duplication is a standing review obligation.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review

## Clearing an input is not an invalidation event — check the handler, not the empty branch

- **Context**: any flow where a "the input went empty" case is believed to cancel work already
  in flight. Recorded from `src/components/path/PathEditor.tsx`, but the shape is general.
- **Correction to the fifth divergence above (`:78-81`).** That bullet is right that a resolve
  in flight when the deck box is cleared can still land `checked`. Its **mechanism attribution
  is wrong**, and the register is append-only, so this entry supersedes it rather than editing
  it. It blames `runCheck`'s empty-text branch (`:322-324`) for "returning without bumping".
  That branch is effectively unreachable: `runCheck` has **three** call sites — `:395` and
  `:406`, both accept-driven and both passing rewritten non-empty text, and `:778`, the Check
  button, which is `disabled` while `listText.trim() === ""` (`:771-776`). `runCheck("")` does
  not happen in practice. The real gap is one level up: the textarea's `onChange` (`:708-710`)
  calls `setListText` and **nothing else** — no token moves, no state resets, and the empty
  branch is never entered at all. (While verifying this, note the earlier bullet's own
  five-call-site figure is `runCheck` and `runDiffCheck` counted together.)
- **Why it is load-bearing**: the two readings prescribe different fixes. Adding a bump to
  `:323` — the fix the original wording points at — changes nothing observable, and would be
  committed believing the bug was closed. The correct fix invalidates from the handler, which
  also covers every _edit_, not just an emptying one. Verified 2026-09-06: with the bump moved
  into `onChange`, the S1 spec below flips from expected-failure to `Expected to fail, but
passed.`
- **Rule**: when a guard is said to fire on an input transition, find the code that _observes_
  the transition before trusting the branch named after it. A `if (empty) return` branch inside
  the async worker is downstream of the event; the handler that wrote the empty value is where
  the invalidation has to live. `DeckComparer` gets this right by bumping in the effect that
  watches the text (`:88`), which is why the two look equivalent and are not.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review

## Pin a live defect with `test.fail()`, and keep setup out of the inverted body

- **Context**: a coverage phase (§6.7 item 15 — "write the finding down, do not smuggle the fix
  in") whose risk turns out to be a **live defect** rather than a forecast, so a spec asserting
  the correct behavior is red today. First hit in `testing-path-builder-ordering` (risk #9).
- **Problem**: the two obvious options are both bad. Not writing the spec leaves the defect as
  prose that nobody re-reads; writing it un-annotated turns a coverage phase into a red build
  that pressures the next person into a fix the phase never scoped.
- **Rule**: write the spec against the **correct** behavior and annotate it `test.fail()`. The
  suite stays green on today's code, and Playwright reports `Expected to fail, but passed.` —
  a failing run — the moment someone fixes the guard, at which point the annotation comes off
  and the spec becomes an ordinary regression test. File the defect in `findings.md` and name
  the finding id in the spec so the two are reachable from each other.
- **Two traps that make an inverted spec worthless**, both verified by deliberate break on
  2026-09-06:
  1. **`test.fail()` inverts the entire body, harness included.** A broken sign-in or a rejected
     seed inside the test body reports as an "expected failure" and the file goes green covering
     nothing. Put setup in `beforeEach` — a hook failure happens before the body registers the
     annotation, so it stays a real failure.
  2. **A `test.fail()` spec that fails on a typo'd locator is indistinguishable in the report
     from one that fails on the defect.** Before believing it, run once with the annotation
     commented out and read the actual error. Do this again whenever the spec is edited.
- **Corollary on retries**: the `retries: 0` rule for ordering specs (§6.7 item 12) **inverts**
  here. There the failure is the signal, so a retry could turn a genuine bug green. On a
  `test.fail()` spec the failure is the expected state, so a retry can only absorb a flake that
  would otherwise report a spurious unexpected pass — leave retries at the config default.
- **Applies to**: plan, plan-review, implement, impl-review

## When a finding names a symptom surface, verify the render reaches it before writing the spec

- **Context**: writing a test from a filed finding — `findings.md`, a bug report, an
  impl-review note — where the finding describes not just a broken mechanism but the
  **visible symptom** it produces. Recorded from `testing-path-builder-error-and-mode` (S3 and
  S4, risk #9's F-3 and F-4), but the shape is general and applies to any layer.
- **Problem**: a finding's symptom sentence is written while reading the *state* code and is
  rarely re-checked against the *render* tree. Two of the six risk-#9 findings named symptoms
  the render forbids, and both survived a research pass, a plan and a plan review before the
  spec caught them.
  1. **`findings.md` F-4 predicted "a full-list verdict under the diff-mode textarea."**
     Impossible: both previews are mode-gated —
     `PathEditor.tsx:733` (`activeMode === "full" && checkState.status === "checked"`) and
     `:745` (the diff twin) — so neither can ever render under the other mode's surface. The
     stale write F-4 describes is completely real; the render it predicts cannot happen. The
     only atom on that surface which is **not** mode-gated is `addState` (`:771-784`).
  2. **F-3 said the add-error banner is written "by whichever Check throws, superseded or
     not."** Both catches *do* re-check `checkToken` before writing (`:335`, `:363`), and the
     Check button is `disabled` while a Check is in flight (`:792-797`), so the
     Check-versus-Check overlap the wording implies is both correctly dropped **and**
     undrivable through the UI. The defect is not an unguarded write — it is a write
     **guarded by the wrong counter**: the target is `addState`, and only `addToken` (`:189`)
     guards that. The reachable overlap is Check-versus-**add**.
- **Why this is load-bearing rather than pedantic**: in both cases the mis-stated symptom
  changes what the spec does. Written to F-4's prediction, S4 would have switched mode once
  and watched the diff surface for a full-list verdict — an element that can never appear, so
  the observation window resolves false and the spec passes **vacuously**, reporting coverage
  of a live defect it never touched. Written to F-3's mechanism, S3 would have tried to
  supersede a Check with another Check through a disabled button and failed on the click, not
  the guard. Both readings also prescribe the wrong fix: F-4's says "the modes bleed into each
  other" when the actual crossing is one ungated atom, and F-3's says "add a token check" when
  the checks are already there and the atom ownership is what is wrong.
- **The trap compounds under `test.fail()`.** An inverted spec whose target is unreachable
  fails, and a failure is its expected state — so the report is identical to a spec that
  genuinely pins the defect. The deliberate-break run (see "Pin a live defect with
  `test.fail()`" above) is what separates them, and it is the *only* thing that does. Run it,
  read the actual error, and confirm the error names the defect rather than a locator, a
  timeout, or an element that was never going to render.
- **Rule**: before writing a spec from a finding, trace the finding's named symptom to the
  line that renders it and check that line's conditions hold in the state the spec leaves the
  app in. If they do not, the finding's *mechanism* may still be sound — re-derive the symptom
  from the render tree and say so in the spec header, because the next reader will otherwise
  re-derive it from the finding. Two corollaries that both cost a day here: a mode gate,
  `steps.length` gate or any conditional render can make a real defect **unobservable**
  without making it absent, which usually means the spec needs a round trip or a different
  observable, not a different defect; and where a symptom is reached through a control, check
  that control's `disabled` expression before assuming the overlap is drivable — a four-way
  `||` (`:792-797`) forbade one of the two overlaps here outright.
- **Corrects, and supersedes for spec-writing purposes**: F-3's "superseded or not" and F-4's
  "a full-list verdict under the diff-mode textarea" in
  `context/archive/2026-09-05-testing-path-builder-ordering/findings.md`. That file is
  archived and immutable, so this entry is the correction's only home; both findings' *impact*
  and *suggested fix* still stand. F-4's deferral reason is stale too — it claims a faithful
  spec "needs a second seeded shape" because the mode toggle requires `steps.length >= 1`,
  but `seedPathWithStep` already seeds exactly one step, so `canDiff` (`:196`) is true on the
  shape S1 and S2 were already using. Verified 2026-09-06; see
  `context/changes/testing-path-builder-error-and-mode/findings.md`.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review

## The stale-response guard has one definition now — reject a new hand-rolled counter

- **Context**: any flow anywhere in `src/` that awaits and then writes React state. Recorded
  2026-09-07 by `shared-stale-response-guard`; supersedes "Treat the stale-response guard as
  five hand copies, not one pattern" above, which this file being append-only cannot edit.
- **What changed**: the duplication is gone. `src/lib/async/latestRun.ts` is the one
  definition — pure, DOM-free, React-free, unit-tested at the `node` layer in
  `latestRun.test.ts` — and `src/lib/async/useLatestRun.ts` is the only intended consumer.
  All **eight** async-then-setState flows run through it: `DeckComparer.runPlan`,
  `PathEditor`'s `handleAddStep` / `runCheck` / `runDiffCheck` / `handleDeleteLast` /
  `handleRename` / `handleDeletePath`, and `NewPathForm.handleSubmit` — the eighth site, which
  no upstream record had counted (this change's `findings.md` F-7).
- **Rule**: a flow that awaits and then writes state goes through `useLatestRun`, one lane per
  set of atoms. A review **rejects** a new hand-rolled request-token counter;
  `grep -rn "useRef(0)\|Token.current" src/` returning nothing is the invariant, and it is
  cheap enough to be an actual check rather than an intention. Two properties are what make
  the rule worth enforcing rather than merely tidy, and both are structural:
  1. **A flow has no checkpoint count to get wrong**, because it does not write state at all —
     it returns a commit thunk and the hook decides whether to apply it. That retires the first
     divergence the superseded entry recorded: adding an `await` to a flow can no longer open
     an unguarded window.
  2. **A token is a fresh `symbol`, not a counter value**, so a lane's token can never read as
     current in another lane. Handing the wrong lane's token to `isCurrent` cannot silently
     guard nothing, which is what "two counters, unevenly shared" was.
- **The part that is still a judgement call, and the one thing not to copy blindly.** One
  primitive does not mean one discipline. `useLatestRun` returns `[inFlight, controls]` and the
  choice of what to do with `inFlight` is per flow: drive a trigger's `disabled` from it for
  **at-most-one-in-flight**, or ignore it for **latest-wins**. Both ship here, and the split is
  not stylistic — a latest-wins token on `handleDeleteLast` is verified to make it _worse_ than
  no guard at all (see the next entry). The load-bearing invariant across all eight lanes is
  what is **absent**: no input event invalidates a persist. A keystroke or a mode switch must
  never drop a POST already in flight, because that saves a checkpoint the UI never renders and
  reports no error. Where an input event and a persist genuinely conflict, disable the trigger;
  do not invalidate the run.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review

## A finding's suggested FIX needs the same verification against the code as its symptom

- **Context**: acting on any filed finding — `findings.md`, a bug report, an impl-review note —
  that carries a recommended fix. Recorded 2026-09-07 from risk #9's F-5, but the shape is
  general and applies at any layer.
- **The companion to "When a finding names a symptom surface" above**, and the gap that entry
  left. That one says: trace the named _symptom_ to the line that renders it before writing a
  spec. It says nothing about the _suggested fix_, which is written in the same sitting, from
  the same partial reading, and is then inherited by whoever implements it — usually as the
  plan's starting point rather than as a claim to check.
- **What it cost here.** F-5 filed three unguarded mutation flows and named "one guarded-async
  helper" as the fix, read naturally as one discipline for all three. Applied to
  `handleDeleteLast` that is strictly worse than the defect. `DELETE /api/paths/[id]/steps`
  removes the highest-position step **per call**, so under latest-wins the first call's
  successful 204 is dropped as superseded — no pop — while the second call's 404
  `"No steps to delete"` sets the error. The result is a step rendered against a server holding
  zero: the exact rendered-list-disagrees-with-the-server failure F-5 names as its own impact,
  manufactured by the guard meant to prevent it. F-5's _symptom_ was wrong in the same pass
  ("two rapid deletes can pop two steps for one server delete" — they produce two server
  deletes and the client agrees; the reachable divergence is a false error banner), and the two
  errors have one cause: the route's per-call semantics were never read.
- **Rule**: before implementing a finding's recommended fix, re-derive it from the code the fix
  would touch — for an ordering fix, that means the **route's or function's own semantics**,
  not just the client flow the finding describes. Ask specifically: does this fix's failure
  mode differ from the defect's, and is it worse? A fix that turns a cosmetic wrong message
  into a rendered or persisted disagreement has moved the failure up a severity class. And
  state the answer in the plan: a plan that silently narrows a finding's fix looks identical to
  one that missed it.
- **Corrects, and supersedes for implementation purposes**: F-5's symptom sentence and its
  single-discipline fix in
  `context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md`. That file is
  archived and immutable, so this entry plus
  `context/changes/shared-stale-response-guard/findings.md` (C-1, C-2) are the correction's
  only home. F-5's _impact_ still stands, and so does its identification of the three flows.
- **Applies to**: frame, research, plan, plan-review, implement, impl-review

## A repair covering N findings needs a targeted break per finding, not one green suite

- **Context**: landing a change that retires more than one filed defect at once — a refactor
  over a set of findings, or any repair whose regression net is several pre-existing specs.
  Recorded 2026-09-07 from `shared-stale-response-guard`, which retired five.
- **Problem**: a green suite proves that no pinned path is red. It does **not** prove that each
  defect was individually addressed, because one repair can flip a pin belonging to another.
  Verified here: S2 and S3 both edit the deck textarea before clicking Add, so invalidating in
  the textarea's `onChange` flips **all four** risk-#9 pins — including S3, whose actual
  subject is atom ownership. A two-line fix would have produced four
  `Expected to fail, but passed.` reports, come off annotation, and left F-3's real defect
  reachable by the one overlap S3 does not drive (Check text T, fill the checkpoint name, add
  the same text T with no edit between).
- **Rule**: for each finding the change claims to retire, revert **only that finding's** repair
  and confirm the suite reddens — and confirm it reddens on the spec that owns that finding and
  not on others. Where a pin flips for two independent reasons, the targeted break is the only
  thing that separates them, and it usually needs a path the pinned spec does not drive; write
  that path down in the plan's manual verification rather than discovering it at review.
- **The same rule holds for a spec written GREEN** inside the change that repairs the defect,
  and this is where it is easiest to skip: there is no `test.fail()` to lift, so nothing forces
  the question. Trap 2 of "Pin a live defect with `test.fail()`" above applies unchanged — a
  green spec that never actually reproduced the overlap is indistinguishable from one that did.
  It bit twice here, both times silently:
  1. **A parked request that never reaches the server can make the spec vacuous.** Holding the
     first `DELETE` without delivering it left the server holding its last step, so the second
     `DELETE` also answered 204, the 404 never happened, and the spec passed with its guard
     reverted. Caught only by reverting the guard. The same shape has a second form: resolving
     the fixture's `arrived` signal on the request's **arrival** rather than on the server's
     **answer** leaves the delivered request racing the spec's next action, and the race
     resolves the harmless way often enough to look green.
  2. **`getByRole`'s `name` is a case-insensitive SUBSTRING match by default.**
     `{ name: "base" }` also matched the "Add base deck" heading — which renders _precisely
     when_ the checkpoint is gone, so the assertion that the step disappeared read as if it had
     not. Pass `exact: true` whenever a short accessible name could be contained in another one
     on the same surface.
- **Applies to**: plan, plan-review, implement, impl-review
