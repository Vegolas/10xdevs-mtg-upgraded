# Path-Builder Stale-Response Ordering — Plan Brief

> Full plan: `context/changes/testing-path-builder-ordering/plan.md`

## What & Why

Rollout Phase 5 of the test plan answers risk #9: in the path builder, a pre-save Check verdict can describe deck text the user has already cleared or replaced, so they decide whether to save on a verdict about text that no longer exists. Unlike every phase before it, the risk here is not forecast — it was found, by Phase 4's own lessons register, and the defects behind it are live in `PathEditor.tsx` today.

## Starting Point

`PathEditor.tsx` guards four async flows with two hand-copied `useRef` counters (`:188-191`). They do not compose: the add flow clears `checkState`/`diffPreview` under `addToken` (`:314-315`), both Check flows write `addState` under `checkToken` (`:339`, `:367`), `switchMode` resets three atoms and bumps neither (`:376-382`), and clearing the textarea invalidates nothing at all (`:708-710`). On the harness side, Phase 4's browser suite is deliberately Supabase-free and auth-free, while the path builder sits behind the session gate — so no existing spec can even reach the page.

## Desired End State

`npm run test:e2e` boots a local Supabase stack, signs one owner in through the app's own endpoint, and runs four specs: Phase 4's two comparer specs unchanged, plus two new ones that reach an authenticated `/paths/[id]`, park a card-data resolve, supersede it, and assert the verdict never describes text the user moved on from. Both new specs are `test.fail()`-annotated, so the suite is green today and turns red the moment either guard is fixed.

## Key Decisions Made

| Decision                            | Choice                                           | Why (1 sentence)                                                                    | Source |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| Coverage vs repair                  | Coverage only; defects filed, not fixed          | Keeps Phase 4's rule that a bug-fix phase is a different phase.                     | Plan   |
| How red specs live in a green suite | `test.fail()` + `findings.md`                    | Puts the defect in CI where it cannot evaporate, without changing production logic. | Plan   |
| Scenarios specced                   | S1 (cleared box), S2 (add supersedes check)      | The two cheapest true reproductions; S3 and S4 are filed instead.                   | Plan   |
| Dev-server env                      | `globalSetup` rewrites `.dev.vars`               | The Cloudflare adapter's `Object.assign` beats anything Playwright injects.         | Plan   |
| Auth                                | Setup project + `storageState`, per-test path    | Satisfies both hard rules — auth never through the UI, data unique per test.        | Plan   |
| Seeding                             | Through the app's own API                        | House pattern; exercises RLS rather than bypassing it.                              | Plan   |
| Helpers                             | Ported into `tests/e2e/fixtures/`                | The integration helpers depend on a vitest config Playwright never runs.            | Plan   |
| CI                                  | Supabase steps added to the existing `e2e` job   | No new job name, so no branch-protection change.                                    | Plan   |
| Break check                         | Fix the guard locally, expect an unexpected pass | With `test.fail()` there is no red for a break PR to demonstrate.                   | Plan   |

## Scope

**In scope:** an authenticated browser harness (global setup, setup project, auth + seeding fixture, CI steps); two `test.fail()` specs; `findings.md`; a §6.7 cookbook entry; a `lessons.md` correction; a backport list.

**Out of scope:** fixing any guard; S3 and S4 specs; the path builder's render; refactoring the five-site guard copy; production `role`/`aria-label` edits.

## Architecture / Approach

A Playwright `globalSetup` rewrites `.dev.vars` (own `.e2ebak` sidecar) so the dev server sees local Supabase; a `setup` project signs one owner in through `POST /api/auth/signin` and saves `storageState`; each spec seeds its own timestamped path through the app's API, drives `/paths/[id]` behind a hydration wait, parks one Scryfall `/cards/collection` request, supersedes it, releases it, and asserts on an observation window rather than a sample.

## Phases at a Glance

| Phase                        | What it delivers                      | Key risk                                                         |
| ---------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| 1. Authenticated E2E harness | Env, auth, seeding, CI steps          | `.dev.vars` is now mutated by two suites that can collide        |
| 2. S1 — cleared box          | First `test.fail()` spec              | A negative assertion that samples an instant instead of a window |
| 3. S2 — add supersedes check | Second `test.fail()` spec             | Asserting the drop before the superseded run has completed       |
| 4. The record                | findings, cookbook, lessons, backport | Phase reads `complete` while the risk is still open              |

**Prerequisites:** local Supabase CLI; `.env.test` present; Chromium installed.
**Estimated effort:** ~3 sessions, front-loaded — Phase 1 is most of the work.

## Open Risks & Assumptions

- `test.fail()` documents risk #9; it does not protect it. A regression in the other direction stays invisible, so §2 row #9 must remain open even though §3 Phase 5 completes.
- Giving the `e2e` job Supabase keys removes the config-error banner Phase 4's specs were written against; the plan re-verifies rather than assumes.
- Two suites now rewrite `.dev.vars`. Distinct sidecars prevent corruption but not a concurrent-run collision, which is documented rather than locked.
- `lessons.md` misattributes the cleared-box mechanism to an unreachable branch; a fix aimed at that branch would not work. Phase 4 corrects the record.

## Success Criteria (Summary)

- A browser spec can reach and drive an authenticated `/paths/[id]`, and Phase 4's specs still pass alongside it.
- Both new specs are bound to the real defect — proven by fixing the guard locally and watching each report an unexpected pass.
- Every divergence found is on record with a file:line that resolves, and the test plan's four inherited inaccuracies have a backport list.
