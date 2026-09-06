# Path-Builder Stale-Response Ordering Implementation Plan

## Overview

Rollout Phase 5 of `context/foundation/test-plan.md` §3 — the last open phase — answers risk **#9**: in the path builder, a pre-save Check verdict can describe deck text the user has already cleared or replaced.

This is a **coverage phase with no production-logic change**, but it is not the same shape as Phase 4. Phase 4's two specs passed green on existing code; risk #9 **is** a set of live defects, so a spec asserting the correct behavior is **red today**. The specs are therefore written against the risk and annotated `test.fail()`: the suite stays green, and Playwright reports an "unexpected pass" — a red build — the moment either guard is fixed.

The phase's larger deliverable is the harness. Phase 4's browser harness is deliberately Supabase-free and auth-free; the path builder sits behind the session gate, so most of the work here is making an authenticated browser test possible at all.

## Current State Analysis

**The guards.** `PathEditor.tsx` carries four async flows that write state after an `await`, governed by two `useRef` counters declared at `:188-191` — `addToken` (`:189`, exclusive to the add run) and `checkToken` (`:191`, shared by `runCheck` and `runDiffCheck`). The add run bumps at `:225` and re-checks at `:245`, `:267`, `:275`, `:291`. `runCheck` bumps at `:326` and re-checks at `:330`/`:335`. `runDiffCheck` bumps at `:354` and re-checks at `:358`/`:363`. `handleDeleteLast`, `handleRename` and `handleDeletePath` have no guard at all.

**Why the guards do not cover risk #9.** Three writes cross the counter boundary:

- `:314`/`:315` reset `checkState` and `diffPreview` from inside the **add** flow, guarded by `addToken`. A Check parked at `:329` is not invalidated by an add, so it re-populates both atoms after the add cleared them.
- `:339`/`:367` write `addState` from inside a **`checkToken`**-guarded `catch`, so the add-error banner is written by whichever Check throws, superseded or not.
- `switchMode` (`:376-382`) clears `listText` and all three atoms and bumps **neither** token.

**Clearing the box invalidates nothing** — and this plan corrects the record on why. `lessons.md:78-81` attributes it to `runCheck`'s empty-text branch "returning without bumping" (`:322-324`). That branch is effectively **dead code**: `runCheck` is reached from five call sites only (`:395`, `:406`, `:419`, `:430`, `:778`), and the Check button is `disabled` when `listText.trim() === ""` (`:771-776`), so `runCheck("")` is unreachable in practice. The actual mechanism is that the textarea's `onChange` (`:708-710`) calls `setListText` and nothing else — no token moves, no state resets, the branch never runs. The distinction is load-bearing: a fix that only adds a bump to the empty branch would not fix the bug.

**No debounce.** Unlike `DeckComparer` (`DEBOUNCE_MS = 700`, `:17`), the path builder is button-driven and says so at `PathEditor.tsx:386`. §2's anti-pattern row for risk #9 — "driving the overlap by typing, because the debounce coalesces keystrokes" — was inherited verbatim from risk #8 and does not apply here.

**The harness gap.** `src/lib/supabase.ts:7-9` returns `null` without `SUPABASE_URL` / `SUPABASE_KEY`, so `middleware.ts:20-24` redirects every `/paths*` request regardless of cookies. `playwright.config.ts:45-56` passes no `env` to `webServer`, has one `chromium` project (`:38-43`) and no `globalSetup`. The `e2e` CI job (`.github/workflows/ci.yml:78-101`) runs without Supabase by explicit design (`:65-76`).

**Injecting env is the hard part.** `@astrojs/cloudflare/dist/index.js:292-303` does `Object.assign(process.env, parsed)` from `.dev.vars` after config resolution, so `.dev.vars` outranks anything Playwright injects. `tests/integration/global-setup.ts:45-74` solves this by rewriting the file with a `.dev.vars.intbak` sidecar and crash recovery — the only mechanism that actually wins.

## Desired End State

`npm run test:e2e` boots a local Supabase stack, signs one owner in through the app's own `/api/auth/signin`, saves `storageState`, and runs four specs: Phase 4's two comparer specs (unchanged, still green with keys now present) and two new path-builder specs that reach an authenticated `/paths/[id]`, park a card-data resolve, supersede it, and assert the verdict never describes text the user has moved on from. Both new specs are `test.fail()`-annotated and the suite is green. Fixing either guard turns the build red.

### Key Discoveries:

- Two counters, unevenly shared — `PathEditor.tsx:188-191`; `runCheck` and `runDiffCheck` share `checkToken`, the add run has its own.
- The add run clears `checkState`/`diffPreview` under the wrong counter — `:314-315`.
- Both Check flows write `addState` under `checkToken` — `:339`, `:367`.
- Clearing the textarea invalidates nothing — `:708-710`; the empty branch at `:322-324` is unreachable because the Check button is disabled on empty text (`:771-776`).
- `switchMode` resets three atoms and bumps neither token — `:376-382`.
- The Add button is **not** disabled during a Check (`:790` gates only on `addState === "resolving"`), which is what makes the overlap drivable through real UI.
- Real session cookies are obtainable through the app itself — `owners.ts:51-70` harvests `sb-*` from `POST /api/auth/signin`; cookies are `httpOnly: false`, so `storageState` round-trips them.
- A path + step can be seeded through the app's API — `paths.ts:24-45`; teardown is one `admin.auth.admin.deleteUser`, which cascades (`cleanup.ts:1-22`).
- `mockScryfallWithParkedCollection` (`fixtures/scryfall.ts:195`) already parks one matching request and resolves the rest — exactly the shape both new specs need.

## What We're NOT Doing

- **Not fixing the guards.** S1 and S2 are live defects; repairing them would make this a bug-fix phase. They are filed to `findings.md` and annotated in the suite instead.
- **Not specing S3 (check error clobbers add) or S4 (mode switch).** Both are real and both are filed; S3 additionally needs a production a11y edit before its banner is locatable.
- **Not touching the path builder's render** — §7 holds it out, and this phase covers only the ordering half that §7 explicitly carves in.
- **Not refactoring the five-site guard copy.** `lessons.md:57-88` records the standing obligation; a shared helper is a separate change.
- **Not adding production `role`/`aria-label` attributes.** Both specced surfaces are reachable by text, so Phase 4's addressability edits are not needed here.
- **Not marking risk #9 protected.** Phase 5 completes; §2 row #9 stays in the open table.

## Implementation Approach

Four phases, mirroring Phase 4's shape: all infrastructure lands in Phase 1 so Phases 2 and 3 are pure test authoring drivable by `/10x-e2e`, one scenario each, and Phase 4 is the record.

## Critical Implementation Details

**`.dev.vars` is shared mutable state between two suites.** Both `global-setup.ts` and the new Playwright `globalSetup` rewrite the same gitignored file. They must use **distinct** backup suffixes (`.intbak` vs `.e2ebak`), and running `npm run test:integration` and `npm run test:e2e` concurrently must be documented as unsupported. `reuseExistingServer: !process.env.CI` (`playwright.config.ts:50`) compounds this locally — a dev server someone else started is reused with whatever env it has.

**A negative assertion needs an observation window.** "The verdict never rendered" cannot be shown by a `toBeHidden()` sampled after the response arrives — test-plan §6.7 item 13 records that this stayed green while the superseded content rendered a frame later. Start a `waitFor({ state: "visible" })` race resolving to a boolean **before** releasing the parked run, then assert the resolved value.

**Prove the superseded run completed.** `await parked.arrived` before clearing or adding, and `waitForResponse` on the released request before asserting — a guard that is never reached cannot be shown to have failed (`lessons.md:24-25`, and finding F1 in the Phase 4 archive's `reviews/plan-review.md`, where this exact mistake made an assertion vacuous).

**The session cache has no test seam.** `resolve.ts:15` is a module-level `Map` reset only by a fresh page load, so any two resolves in one spec need disjoint card names.

## Phase 1: Authenticated E2E harness

### Overview

Make an authenticated browser test possible: Supabase env reaching the dev server, a signed-in `storageState`, seeding and cleanup helpers, and the CI steps — without disturbing Phase 4's two specs.

### Changes Required:

#### 1. Playwright global setup

**File**: `tests/e2e/global-setup.ts`

**Intent**: Point the E2E dev server at local Supabase by overriding `.dev.vars`, because the Cloudflare adapter's `Object.assign(process.env, parsed)` beats any env Playwright injects.

**Contract**: Default-exports a Playwright `globalSetup` and registers teardown. Mirrors `tests/integration/global-setup.ts:45-74` including crash recovery, but with backup sidecar `.dev.vars.e2ebak` so the two suites cannot corrupt each other's snapshot.

#### 2. Auth + seeding fixture

**File**: `tests/e2e/fixtures/auth.ts`

**Intent**: Port the minimum the browser suite needs — create an owner service-role-side, sign in through the app to get real `sb-*` cookies, seed a path with one saved step, and clean up.

**Contract**: Exports `createSignedInOwner()`, `seedPathWithStep(request, title)` and `deleteOwner(owner)`. Seeding goes through `POST /api/paths` and `POST /api/paths/:id/steps` (shape per `helpers/paths.ts:24-45`), which require both the session cookie and an `Origin` header — Astro answers a plain-text 403 without it (`contract-signin.int.test.ts:67-89`). Titles carry a timestamp suffix so parallel runs and re-runs cannot collide.

#### 3. Setup project and config

**File**: `playwright.config.ts`

**Intent**: Add a `setup` project that signs in once and writes `storageState`, and have the chromium project depend on it; wire in the global setup.

**Contract**: `globalSetup` points at the new file. A `setup` project matches `tests/e2e/*.setup.ts` and writes `tests/e2e/.auth/owner.json` (gitignored). The chromium project gains `dependencies: ["setup"]`. Auth-dependent specs serialize — `supabase/config.toml:191` caps sign-ins at 30 per 5 min per IP and Playwright parallelizes by default. Note `config.toml:158` sets `jwt_expiry = 3600` and the server client forces `autoRefreshToken: false`, so the stored state is good for one run and must never be cached across jobs.

#### 4. Path-builder navigation helper

**File**: `tests/e2e/fixtures/app.ts`

**Intent**: Generalize the hydration barrier so a spec can reach a hydrated `PathEditor`.

**Contract**: Adds `gotoPathBuilder(page, pathId)` returning the `main` scope, using the same `astro-island[ssr]` wait `gotoComparer` uses (`:24-28`) — `PathEditor` mounts `client:load` (`paths/[id].astro:43`), so the same orphaned-fill trap applies. `gotoComparer` is unchanged.

#### 5. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Give the `e2e` job a local Supabase stack, copying the `integration` job verbatim.

**Contract**: Insert the three steps from `:46-63` — `npx supabase start`, the `supabase status -o env` export, and `supabase stop` with `if: always()` — around `npm run test:e2e`. Keys come from the running stack, never from Actions secrets. The job's existing comment block (`:65-76`) asserts the opposite premise and must be rewritten, not left contradicting the steps below it. No new job name, so no branch-protection change.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Typecheck passes: `npm run typecheck`
- Unit suite unaffected: `npm test`
- Integration suite unaffected: `npm run test:integration`
- Playwright collects the setup project and the existing specs, and no vitest files: `npx playwright test --list`
- Phase 4's two comparer specs still pass with Supabase keys now present: `npm run test:e2e`
- `.dev.vars` is byte-identical before and after a full run

#### Manual Verification:

- A run killed mid-flight leaves `.dev.vars` recoverable — kill, re-run, confirm the original is restored from `.e2ebak`
- The service-role key never reaches the dev server's env, only the seeding client
- The rewritten `e2e` job comment states the current premise; no sentence still claims the job is Supabase-free
- Running both suites concurrently is documented as unsupported, and the reason names the shared file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: S1 — a verdict never describes a cleared box

### Overview

The first `test.fail()` spec: a Check parked mid-resolve, the textarea cleared, and the verdict asserted never to render.

### Changes Required:

#### 1. The S1 spec

**File**: `tests/e2e/path-builder-stale-ordering.spec.ts`

**Intent**: Assert that clearing the deck text while a Check is in flight leaves no verdict behind — the behavior risk #9 names, which fails on today's code.

**Contract**: Signed in via `storageState`, seeds its own path, opens `/paths/[id]`, fills `Deck list`, clicks `Check`, waits for `parked.arrived`, clears the textarea, starts the visibility race, releases the parked response, awaits it, then asserts the race resolved false. Annotated `test.fail()` with a comment naming the finding id. Cleans up its owner in `afterEach`.

### Success Criteria:

#### Automated Verification:

- The spec reports as expected-to-fail, not as a failure: `npx playwright test tests/e2e/path-builder-stale-ordering.spec.ts`
- Full browser suite green: `npm run test:e2e`
- Lint and typecheck pass: `npm run lint && npm run typecheck`

#### Manual Verification:

- Reviewed against the five anti-patterns in `.claude/skills/10x-e2e/references/e2e-anti-patterns.md`
- With the guard fixed locally, the spec reports "expected to fail but passed" and the run goes red — then reverted
- The parked resolve is proven in flight before the box is cleared, and proven complete before the assertion
- No `waitForTimeout` and no `networkidle`; the spec runs standalone in either order

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: S2 — a verdict never survives a successful add

### Overview

The second `test.fail()` spec, exercising the `:314`/`:315` cross-counter reset through real affordances: Add is clickable while a Check is parked.

### Changes Required:

#### 1. The S2 spec

**File**: `tests/e2e/path-builder-stale-ordering.spec.ts`

**Intent**: Assert that a checkpoint added while a Check is in flight is not followed by the superseded Check re-populating the verdict over a now-empty box.

**Contract**: Same setup as S1. Fills and Checks with deck A, waits for `parked.arrived`, then clicks `Add checkpoint` with deck B and waits for the new step to render, then releases A. Asserts no verdict becomes visible. Deck A and deck B use disjoint card names — `resolve.ts:15` is a module-level cache with no test seam. Annotated `test.fail()`.

### Success Criteria:

#### Automated Verification:

- The spec reports as expected-to-fail: `npx playwright test tests/e2e/path-builder-stale-ordering.spec.ts`
- Full browser suite green: `npm run test:e2e`
- Lint and typecheck pass: `npm run lint && npm run typecheck`

#### Manual Verification:

- Reviewed against the five anti-patterns
- With `:314-315` moved under a `checkToken` bump locally, the spec reports "expected to fail but passed" — then reverted
- The add is proven to have completed (the new step is visible) before the parked run is released
- Both specs run standalone and in either order

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: The record

### Overview

File what was found but not fixed, teach the next contributor how to write an authenticated browser spec, and hand `/10x-test-plan` the corrections this phase produced.

### Changes Required:

#### 1. Findings

**File**: `context/changes/testing-path-builder-ordering/findings.md`

**Intent**: Keep the live defects from evaporating with the change folder.

**Contract**: House shape from `context/archive/2026-08-11-testing-api-contract-pinning/findings.md` — F-numbered, each with Where (file:line, verified), Observed, Impact, Why deferred, Suggested owner. Covers S1 (`:708-710` invalidates nothing; the `:322-324` branch is unreachable), S2 (`:314-315`), S3 (`:339`/`:367`), S4 (`switchMode` `:376-382`), the unguarded delete/rename/delete-path flows, and the `text.trim()`-vs-parsed-entries gap where comment-only text renders "✓ All cards resolved."

#### 2. Cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Extend §6.7 with what an authenticated browser spec needs, so the next one is cheap.

**Contract**: A new subsection covering the `.dev.vars` override and its cross-suite hazard, the setup project and `storageState`, seeding through the app's API with the `Origin` requirement, the sign-in rate limit, and the `test.fail()` convention. §3's Phase 5 row moves to `complete`; §2 row #9 **stays in the open table**, pointed at `findings.md`.

#### 3. Lessons

**File**: `context/foundation/lessons.md`

**Intent**: Correct the stated cause of the fifth divergence and record the `test.fail()` pattern.

**Contract**: Append-only, per the file's own convention — a new entry that corrects `:78-81`'s mechanism attribution without editing it, naming `onChange` (`:708-710`) as the real gap and the empty branch as unreachable.

#### 4. Backport list

**File**: `context/changes/testing-path-builder-ordering/backport.md`

**Intent**: Hand `/10x-test-plan` the §2/§3 corrections in one place.

**Contract**: Four items — §2's anti-pattern row for #9 cites a debounce the path builder does not have; impl-review finding F10's mis-count ("four divergences, two live", where one live one is the fifth) is still in the guide; §3's order rationale claims a cheapness this phase disproves; and risk #9 is documented, not protected.

### Success Criteria:

#### Automated Verification:

- Every file:line in `findings.md` still resolves
- Formatting clean: `npx prettier --check .`
- Full suite green: `npm test && npm run test:integration && npm run test:e2e`

#### Manual Verification:

- §3 Phase 5 reads `complete` while §2 row #9 remains in the open table — the two are not contradictory and the plan says why
- The lessons entry corrects the mechanism without rewriting the original bullet
- `findings.md` records why each finding was deferred, individually, not as a blanket statement
- The backport list names evidence for each correction, not just the claim

**Implementation Note**: This is the final phase. After it, `change.md` moves to `status: complete` and the change is ready for `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- None. This phase adds no logic.

### Integration Tests:

- None added. The existing suite must stay green as a regression check on the `.dev.vars` handling.

### Manual Testing Steps:

1. Run `npm run test:e2e` twice in a row; confirm `.dev.vars` is unchanged after each.
2. Kill a run mid-flight; re-run; confirm the original `.dev.vars` is restored.
3. Fix `runCheck`'s invalidation locally; confirm S1 reports an unexpected pass and the run is red; revert.
4. Move `:314-315` under a `checkToken` bump locally; confirm S2 reports an unexpected pass; revert.
5. Confirm Phase 4's two comparer specs still pass with keys present.

## Performance Considerations

The `e2e` job gains ~90s for `supabase start` — the figure the workflow itself states at `ci.yml:69-70`. Sign-in happens once per run in the setup project, not per test.

## Migration Notes

None. No schema change, no data migration. `tests/e2e/.auth/` must be gitignored.

## References

- Change identity: `context/changes/testing-path-builder-ordering/change.md`
- Risk map and response guidance: `context/foundation/test-plan.md` §2 row #9, §3 Phase 5, §6.7, §7
- Guard divergences: `context/foundation/lessons.md:57-88`
- Prior browser phase: `context/archive/2026-08-27-testing-comparer-failure-surfacing/`
- Integration harness this phase ports from: `tests/integration/global-setup.ts:45-74`, `tests/integration/helpers/owners.ts:51-70`, `tests/integration/helpers/paths.ts:24-45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Authenticated E2E harness

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 0580745
- [x] 1.2 Typecheck passes: `npm run typecheck` — 0580745
- [x] 1.3 Unit suite unaffected: `npm test` — 0580745
- [x] 1.4 Integration suite unaffected: `npm run test:integration` — 0580745
- [x] 1.5 Playwright collects the setup project and existing specs, no vitest files: `npx playwright test --list` — 0580745
- [x] 1.6 Phase 4's two comparer specs still pass with Supabase keys present: `npm run test:e2e` — 0580745
- [x] 1.7 `.dev.vars` is byte-identical before and after a full run — 0580745

#### Manual

- [x] 1.8 A killed run leaves `.dev.vars` recoverable from `.e2ebak` — 0580745
- [x] 1.9 The service-role key never reaches the dev server's env — 0580745
- [x] 1.10 The rewritten `e2e` job comment states the current premise — 0580745
- [x] 1.11 Concurrent-suite hazard documented, naming the shared file — 0580745

### Phase 2: S1 — a verdict never describes a cleared box

#### Automated

- [x] 2.1 The S1 spec reports as expected-to-fail, not as a failure
- [x] 2.2 Full browser suite green: `npm run test:e2e`
- [x] 2.3 Lint and typecheck pass

#### Manual

- [x] 2.4 Reviewed against the five agent E2E anti-patterns
- [x] 2.5 With the guard fixed locally, S1 reports an unexpected pass and the run goes red — then reverted
- [x] 2.6 The parked resolve is proven in flight before the clear, and complete before the assertion
- [x] 2.7 No `waitForTimeout`, no `networkidle`; runs standalone in either order

### Phase 3: S2 — a verdict never survives a successful add

#### Automated

- [ ] 3.1 The S2 spec reports as expected-to-fail
- [ ] 3.2 Full browser suite green: `npm run test:e2e`
- [ ] 3.3 Lint and typecheck pass

#### Manual

- [ ] 3.4 Reviewed against the five agent E2E anti-patterns
- [ ] 3.5 With `:314-315` moved under a `checkToken` bump locally, S2 reports an unexpected pass — then reverted
- [ ] 3.6 The add is proven complete before the parked run is released
- [ ] 3.7 Both specs run standalone and in either order

### Phase 4: The record

#### Automated

- [ ] 4.1 Every file:line in `findings.md` resolves
- [ ] 4.2 Formatting clean: `npx prettier --check .`
- [ ] 4.3 Full suite green: `npm test && npm run test:integration && npm run test:e2e`

#### Manual

- [ ] 4.4 §3 Phase 5 `complete` while §2 row #9 stays open, with the reason stated
- [ ] 4.5 The lessons entry corrects the mechanism without rewriting the original bullet
- [ ] 4.6 `findings.md` gives a per-finding deferral reason
- [ ] 4.7 The backport list names evidence for each correction
