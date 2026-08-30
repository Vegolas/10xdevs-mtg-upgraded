# Comparer Failure-Surfacing E2E — Plan Brief

> Full plan: `context/changes/testing-comparer-failure-surfacing/plan.md`
> Research: `context/changes/testing-comparer-failure-surfacing/research.md`

## What & Why

Rollout Phase 4 of the test plan. Two risks in the deck comparer are covered at no
layer today, because both exist only once rendered: a partial resolution or a
card-data transport failure reaching the user as a plan that **looks complete**
(risk #7, High × Medium), and a slow earlier comparison resolving *after* a newer
one and clobbering it (risk #8, Medium × Low). This change builds the browser-E2E
harness the repo has never had, pins both risks, and makes the resulting suite an
enforced gate on `main`.

## Starting Point

Playwright is absent — no dependency, no config, no test directory. The comparer
itself is fully built and needs neither auth nor a database: it mounts at `/`,
middleware protects only `/dashboard` and `/paths`, and card resolution is a
browser-side `fetch` to Scryfall. Both failure surfaces already exist in the
component but are unnamed `<div>`s with a byte-identical class string, so a locator
for one matches the other. `main`'s required checks are `["ci","integration"]`,
re-read 2026-08-27 — the `e2e` context is genuinely absent.

## Desired End State

Four tests across three spec files run in Chromium against a Playwright-managed `astro dev` with zero
external network traffic. An `e2e` job reports on every PR and sits in `main`'s
required-check list, so a comparer failure that renders as a complete plan, or a
superseded comparison overwriting a newer one, blocks the merge. A closed break PR
records each spec going red *alone* against a real regression.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Accessibility scope | `role="alert"` + a named notice container only | Minimal production change against §7's UI exclusion, and avoids the repo's first `data-testid`. | Research |
| Live defects found | Filed to `findings.md`, not fixed | A spec for either fails red today, making this a bug-fix phase rather than a coverage phase. | Research |
| Retry policy | `1` in CI globally, `0` on the ordering spec | Absorbs infrastructure flake without letting a genuine out-of-order bug retry its way to green. | Research |
| Finding E (quantity) | Recorded as not-promoted in §2 | The map is already at eight rows against a 5–7 budget, and the failure is not browser-only. | Research |
| Phase shape | 5 phases; all production change in Phase 1 | Leaves Phases 2–3 as pure test authoring, one risk each, matching `/10x-e2e`'s loop. | Plan |
| File layout | `tests/e2e/` + `*.spec.ts` + `seed.spec.ts` | `/10x-e2e` hard-codes `seed.spec.ts` in five places; research's `.e2e.ts` naming would leave the phase's primary quality lever dead outside `testMatch`. | Plan |
| Seed test | Mocked happy-path compare | The seed teaches the interception contract both risk specs need, with no external dependency on a required check. | Plan |
| Local/CI DOM split | Scope every locator to `getByRole("main")` | Setting dummy Supabase keys instead would make `middleware.ts:13` run an auth round-trip against an unreachable host on every `goto`. | Plan |
| Risk #7 assertions | Message text asserted; Retry recovery exercised | §2's row asks what the retry affordance does, and a malformed fixture lands in the same catch — a banner-only assertion can't tell them apart. | Plan |
| Deliberate break | One PR, two runs, one per risk | Proves each spec is independently load-bearing; the two seams are genuinely unrelated, so this isn't a manufactured break. | Plan |

## Scope

**In scope:** Playwright install + config + `.gitignore` + `test:e2e` script; a shared
Scryfall interception fixture; `seed.spec.ts`; two risk specs; two one-line a11y edits;
an `e2e` CI job and the branch-protection change; `findings.md`; test-plan §2/§3/§4/§5/§6.6/§6.7/§8;
a new `context/foundation/lessons.md`.

**Out of scope:** fixing the three findings; `data-testid` anywhere; the path-builder /
diff-mode UI, component render, and pixel tests (all §7 exclusions); refactoring the
five-site guard copy; a cross-browser matrix; CI browser caching; the stale `AGENTS.md`
and `roadmap.md` lines noticed in passing.

## Architecture / Approach

Playwright's `webServer` block owns the dev server on a dedicated port 4323, replacing
the entire spawn / readiness-poll / process-tree-kill machinery
`tests/integration/global-setup.ts` hand-rolls — the single biggest simplification
available. `testDir` is pinned to `tests/e2e` so Playwright's default `testMatch` can't
sweep the 100+ vitest files. Every spec routes all `api.scryfall.com` traffic through one
fixture and scopes every locator inside the `<main>` landmark. Risk #7 induces failure
with `route.fulfill({status: 500})`; risk #8 parks a request on a deferred promise and
drives two runs through the Calculate CTA.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness, seed, a11y names | Runnable Playwright + the fixture + the seed + two production edits | Committing a spec before the devDependency lands reddens the *existing* `typecheck` gate |
| 2. Risk #7 spec (`/10x-e2e`) | Transport failure + Retry recovery; partial resolution | A malformed fixture is indistinguishable from a real failure unless the message is asserted |
| 3. Risk #8 spec (`/10x-e2e`) | Genuine two-run overlap via the CTA | The 700 ms debounce silently collapses keystroke-driven overlap into one run |
| 4. CI job, gate, docs | `e2e` in the required-check list; findings, §6.7, lessons | PATCHing branch protection before the workflow is on `main` blocks every PR forever |
| 5. Deliberate-break PR | Two runs proving each spec blocks alone | A break that isn't lint-clean kills the job at the wrong gate |

**Prerequisites:** Phases 1–4 merged to `main` before Phase 5 opens — Phase 2's closing
note records this being assumed rather than done, at the cost of a CI round.
**Estimated effort:** ~3–4 sessions across 5 phases.

## Open Risks & Assumptions

- The session cache (`resolve.ts:15`, no exported reset) can silently delete the request a
  test is built around. Both specs are shaped to avoid it — Phase 2 fails the first POST so
  nothing is cached, Phase 3 uses decks that don't share names across their own halves — but
  a fixture change that ignores this produces a test that passes without exercising anything.
- Phase 3's spec only proves the guard if run A's *target* POST is fulfilled and awaited;
  `plan.ts:95-96` resolves base then target, and the token check runs only after both.
  This was caught in plan review and is written into the phase, but it is the spec's
  sharpest failure mode.
- `route.fulfill({status: 500})` may not populate `statusText`, so the assertion matches
  on `/cards\/collection failed: 500/` and leaves that portion unasserted.
- The `e2e` job is estimated at 1.5–2.5 min from research; if the Chromium install
  dominates, the browser-cache decision is worth revisiting.
- The branch-protection PATCH is carried by no PR and verified by no CI step — the only
  guard against over-claiming §5's row is re-reading the contexts list by hand.

## Success Criteria (Summary)

- A user who hits a card-data failure always sees either the error banner with a working
  Retry, or the unresolved notice — never a plan that silently reads as complete.
- A user who recalculates before the first comparison returns always reads the plan built
  from the deck text currently on screen.
- Both guarantees are enforced, not just documented: `e2e` sits in `main`'s required-check
  list, and a break PR has been observed reporting `BLOCKED` for each spec independently.
