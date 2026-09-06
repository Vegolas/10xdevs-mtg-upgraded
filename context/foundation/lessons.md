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
