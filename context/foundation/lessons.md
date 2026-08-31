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
