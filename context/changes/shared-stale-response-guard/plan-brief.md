# Shared Stale-Response Guard — Plan Brief

> Full plan: `context/changes/shared-stale-response-guard/plan.md`
> Change brief: `context/changes/shared-stale-response-guard/change.md`
> Upstream findings (immutable): `context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md` — F-5, F-6

## What & Why

The "monotonic token, drop if superseded" guard is duplicated by hand across five flows and
missing from three more. `lessons.md` records four verified ways the copies have already
drifted and calls a shared helper the real fix. This change extracts that helper and routes
every async-then-setState flow through it, retiring findings F-1 through F-5 together. It is
the first change in the risk-#9 chain that **repairs** rather than pins.

## Starting Point

`DeckComparer` carries one counter and one checkpoint; `PathEditor` carries two counters
across three guarded flows and none at all across three more; `NewPathForm` carries a
pre-await boolean nobody has counted. Four `test.fail()` specs already pin F-1 through F-4 —
written before the helper existed, each naming a distinct invalidation site — so the pre-save
half arrives with its specification already on disk. F-5's three mutation flows have nothing.

## Desired End State

No file in `src/` holds a hand-rolled request token. All eight flows run through one
`useLatestRun` lane each, with the discipline that matches what they do. The browser suite
reports **zero** expected failures — the four annotations are gone and the specs are ordinary
regression tests — and two new green specs cover the mutation half. Risk #9 reads *protected*
in the risk map for the first time.

## Key Decisions Made

| Decision                        | Choice                                                          | Why (1 sentence)                                                                                       | Source       |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| Helper API                      | Commit-thunk — the body returns the writes, the hook applies them | Structurally retires "checkpoint count differs per flow": a new `await` cannot open an unguarded window. | Plan         |
| Packaging                       | Pure `latestRun.ts` + unit tests + thin `useLatestRun` hook       | Proves the guard's algebra at the cheapest layer, with no jsdom and no §7 exception needed.              | Plan         |
| Invalidation                    | Preview lane + one lane per mutation                              | No input event may invalidate a persist, or a saved checkpoint never renders and nothing reports it.     | Plan         |
| F-5 discipline                  | Split — at-most-one for deletes, latest-wins for rename           | A latest-wins token on delete-last is verified to make it worse than today.                              | Plan         |
| F-5 coverage                    | Two green specs plus a new app-API parked fixture                 | Neither discipline may ship on the argument that it mirrors the other — that is how F-5 happened.        | Plan         |
| Test-plan authority             | This change edits §2, §6.7 and §8; no `backport.md`               | It is the change that falsifies #9's disposition, so deferring leaves the map wrong where it costs work. | Plan         |
| F-5's risk row                  | New risk #10, protected on arrival                                | #9's wording is pre-save only, and §2 rows are append-only so widening it is not available.              | Plan         |
| F-6 and the pin convention      | Out of scope; F-5 specs written green, not as pins                | Settled when the change was opened and not re-litigated here.                                            | Change brief |

## Scope

**In scope:** the pure guard primitive and its unit tests; the `useLatestRun` hook; all eight
call sites (`DeckComparer.runPlan`, `PathEditor`'s six, `NewPathForm.handleSubmit`); a
Check-owned error atom and a third named banner; removing four `test.fail()` annotations and
pinning `retries: 0`; a parked-route fixture for the app's own API; two new green specs;
`findings.md`, a `lessons.md` entry, and test-plan §2 / §6.7 / §8.

**Out of scope:** F-6's zero-entry validation gap; any component-render layer; a new CI job or
branch-protection change; a new §3 rollout phase; user-visible copy; server-side write
ordering.

## Architecture / Approach

`createLatestRun()` is a pure counter — `begin` / `isCurrent` / `invalidate` — unit-tested in
the `node` env, mirroring `sortStorage.ts`. `useLatestRun()` wraps it with `run(work)`, where
`work` returns a commit thunk the hook applies only if the run is still newest, plus an
`inFlight` state that drives `disabled` for the at-most-one flows. Each flow gets its own
lane; the preview lane is additionally invalidated by the textarea's `onChange`, by
`switchMode`, and by a successful add. Where a persist and an input event conflict, the
trigger is disabled rather than the run invalidated.

## Phases at a Glance

| Phase                              | What it delivers                                                  | Key risk                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. The guard, and its first consumer | Pure core + unit tests + hook + `DeckComparer` wired               | A silent behavior change in `runPlan`; the two green comparer specs are the only net           |
| 2. The repair — pre-save flows      | F-1 to F-4 repaired; four annotations off; `retries: 0`            | The `onChange` bump flips S3 by accident, so F-3's repair needs its own targeted break         |
| 3. The mutation flows and their proof | F-5 + the eighth site repaired; new fixture; two green specs      | The fixture must `continue()` what it does not park, or the seed and navigation break          |
| 4. The record                       | `findings.md`, `lessons.md`, test-plan §2 / §6.7 / §8              | Rewriting a §2 cell §8 reserved for a refresh's authority                                      |

**Prerequisites:** local Supabase running (`npx supabase start`) and `.env.test` carrying
`SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`; the integration suite must not run concurrently
with the browser suite (both mutate `.dev.vars`).
**Estimated effort:** ~4 sessions, one per phase; Phase 3 is the largest because the fixture is
new work rather than a spec against an existing one.

## Open Risks & Assumptions

- **`NewPathForm` is wired but gets no spec.** It has no browser coverage today and adding one
  is outside what F-5 asked for; a regression there would be invisible to the suite, so Phase 3
  carries a manual verification step as the only check.
- **The four pins would flip on a two-line fix.** They are necessary but not sufficient, which
  is why Phase 2's success criteria include a targeted break per defect rather than a green run.
- **F-5's filed symptom is wrong, and its suggested fix is worse than the defect.** Both were
  verified during planning; if a later reader trusts the archived text over this plan, they will
  reintroduce the divergence.
- **Assumed: module home `src/lib/async/`.** The repo has no `src/hooks/` and one existing hook,
  colocated. A cross-component hook has no precedent, so this is a judgment call.
- **Assumed: `work` must not reject.** Call sites keep their own `try`/`catch`; the hook clears
  `inFlight` but does not swallow, so no new silent path is introduced.

## Success Criteria (Summary)

- A pre-save verdict, diff preview or error banner never describes deck text the user has
  edited, cleared, or switched away from — proved by four specs that were red-by-design and are
  now ordinary regression tests.
- A mutation that succeeded never reports an error, and a superseded rename never restores a
  title the user replaced.
- No hand-rolled request token remains in `src/`, so the standing review obligation
  `lessons.md` records is discharged rather than re-stated.
