# Comparer Failure-Surfacing E2E Implementation Plan

## Overview

Rollout Phase 4 of `context/foundation/test-plan.md` §3. Stand up the browser-E2E
harness this repo has never had, use it to pin the comparer's two failure surfaces
(risk #7) and its stale-response guard (risk #8), wire an `e2e` job into `main`'s
required-check list, and prove with a deliberate-break PR that each spec is
independently load-bearing.

This is a **coverage phase, not a bug-fix phase**. Both specs pass green on the
current code. Three live defects research surfaced are filed to `findings.md`
rather than fixed here — a spec for any of them would fail red today and change
what this phase is.

## Current State Analysis

**No browser layer exists.** `@playwright/test` is absent from `package.json`,
there is no `playwright.config.*`, and no `e2e/` or `tests/e2e/` directory. §4's
`e2e` row reads "Playwright (planned)" and §5's `e2e on critical flows` row reads
`planned (§3 Phase 4)`.

**Two test configs already partition the tree, and neither reaches `tests/e2e/`.**
`vitest.config.ts:14` globs `src/**/*.test.ts`; `vitest.integration.config.ts:69`
requires both `tests/integration/**` and the `.int.` infix. The real collision
hazard runs the other way — Playwright's default `testMatch` would sweep all 100+
vitest files if `testDir` were left at the repo root.

**Lint and typecheck already reach outside `src/`** — verified empirically:
`npx eslint .` lints 125 files including root-level `.ts`, and `astro check`
typechecks 126 because `tsconfig.json:3` includes `**/*`. This makes the
Playwright install ordering load-bearing rather than cosmetic (see Critical
Implementation Details).

**The comparer needs no auth and no database.** It mounts at `/`
(`src/pages/index.astro:17`), `src/middleware.ts:7` protects only `/dashboard`
and `/paths`, and card resolution is a browser-side `fetch` to Scryfall
(`src/lib/card-data/scryfall.ts:87,123`). So this phase needs no Supabase, no
service-role key, and no `.env.test` — none of the machinery
`tests/integration/global-setup.ts` carries.

**The two failure surfaces exist but are not addressable.** The error banner
(`DeckComparer.tsx:216-233`) and the unresolved notice (`UnresolvedNotice.tsx:62`)
are both unnamed `<div>`s carrying an **identical** class string
(`rounded-md border border-[#6e3a33] bg-[#2a1714] p-4 text-sm text-[#b5847e]`).
Neither has a role or an accessible name, so a locator for one can match the other.

**Branch protection on `main`, re-read 2026-08-27:**
`{"contexts":["ci","integration"],"enforce_admins":true,"strict":false}`. The `e2e`
context is genuinely absent, so §5's row is correctly marked aspirational today.

## Desired End State

`npm run test:e2e` runs four tests across three spec files in Chromium against a Playwright-managed
`astro dev`, with zero external network traffic. An `e2e` job reports on every PR
and sits in `main`'s required-check list, so a comparer failure that renders as a
complete plan, or a superseded comparison that clobbers a newer one, blocks the
merge. A closed break PR records, in `test-plan.md` §6.6, each spec going red
alone against a real regression.

**Verify it:** `npm run test:e2e` green locally with the network cable
metaphorically cut; `gh api repos/Vegolas/10xdevs-mtg-upgraded/branches/main/protection`
returns `contexts` containing `e2e`; the break PR reports `mergeStateStatus: BLOCKED`
next to `mergeable: MERGEABLE`.

### Key Discoveries:

- **`plan.ts:95-96` awaits base then target sequentially**, so a comparison never
  has more than one Scryfall request in flight. Holding run A's *first*
  `POST /cards/collection` therefore stalls all of run A — which is what makes
  deferred-promise interception clean for risk #8.
- **The 700 ms debounce actively prevents the overlap risk #8 needs.** The effect
  cleanup at `DeckComparer.tsx:98-100` clears the pending timer, so typing deck A
  then deck B inside the window starts **one** run. The token never advances past 1
  and the drop at `:73` is never reached. Genuine overlap requires the Calculate
  CTA (`:106-109`), which bypasses the debounce.
- **The guard's drop path is completely silent** — a bare `return` at
  `DeckComparer.tsx:74`, no `setView`, no logging, no `AbortController`, and the
  token is a `useRef` that never reaches the DOM. Guard-worked and guard-failed are
  distinguishable only by rendered content.
- **The sharpest observable for #8 is not the plan.** The collapsed strip
  (`DeckComparer.tsx:141-159`) renders `countCardLines()` over the **live textarea
  state**, never the plan. A guard failure produces exactly the contradiction the
  risk names: the strip reports deck B's counts while the columns show deck A's cards.
- **`route.fulfill({status:500})` yields a deterministic message; `route.abort()`
  does not.** The 500 trips the explicit guard at `scryfall.ts:96-98` and produces
  `Scryfall /cards/collection failed: 500 …`; an abort rejects the raw `fetch` with a
  browser-dependent `"Failed to fetch"`. Both land in the single catch at
  `plan.ts:106-109` — and so does a `TypeError` from a malformed fixture, which is
  why the message must be asserted, not just the banner.
- **`AppLayout.astro:17` renders `<main>`**, so `page.getByRole("main")` is a real
  landmark and the `.dev.vars` DOM-divergence mitigation works.
- **The session cache has no test seam.** `resolve.ts:15` is a module-level `Map`
  and `clearSessionCache()` (`:257`) is not exported from the barrel
  (`src/lib/card-data/index.ts:8`). Reset is a fresh page load — and cards fetched
  before a failure are not re-requested on Retry. This is why Phase 2 fails the *first*
  POST and why Phase 3's decks must not share names across their own halves: in both
  cases a cache hit silently removes the request the test is built around.

## What We're NOT Doing

- **Not fixing the three findings.** `plan.ts:90-92` discarding `parsed.malformed`,
  `DeckComparer.tsx:251-254` claiming identity when the differing cards failed to
  resolve, and `MergedRow.tsx:51-113`'s a11y gap are recorded in `findings.md`, not
  repaired. Each would turn this into a bug-fix phase.
- **Not adding `data-testid` anywhere.** The repo has zero today; the a11y tree is
  the test surface.
- **Not touching the path-builder / diff-mode UI**, component render, or pixel
  tests — §7 holds all three out, and §7's E2E inclusion is explicitly "not a licence
  to browser-test a flow an integration or contract test already covers."
- **Not refactoring the five-site guard copy** (`DeckComparer.tsx:69,73` plus four
  flows in `PathEditor.tsx`). Recorded in `lessons.md` so a future refactor knows the
  drift exists.
- **Not adding a browser matrix.** Chromium only — these are failure-surfacing
  tests, not cross-browser rendering tests.
- **Not caching the Playwright browser in CI.** The cache key must contain the
  Playwright version and OS libs live outside `~/.cache/ms-playwright`, so a hit
  still needs `install-deps`. Ship without it.
- **Not fixing `AGENTS.md`'s stale "CI runs on `master`"** or `roadmap.md:64`'s
  stale testing bullet — noticed in passing, filed as out of scope.

## Implementation Approach

Five phases, mirroring the shape both prior gate-wiring phases used. **All
production and infrastructure change lands in Phase 1**, so Phases 2 and 3 are
pure test authoring driven by `/10x-e2e` — one risk per phase, matching that
skill's one-risk-at-a-time loop and its "rarely more than 1–3 per phase" budget
(`SKILL.md:238`).

Phase 4 wires the gate and writes every doc, because §6.7's recipe can only be
written honestly after the specs are green. Phase 5 is the house-style
deliberate-break PR, run twice so each spec is proven independently load-bearing.

Two conventions are settled and binding on generated code:

1. **Every locator is scoped inside `page.getByRole("main")`.** A contributor's
   gitignored `.dev.vars` sets the Supabase keys locally while CI has none, and
   `config-status.ts:14` + `Layout.astro:28-43` render a config error banner above
   the `<slot/>` when they are unset — the same test otherwise sees two different
   DOMs. Setting dummy keys instead was rejected: a non-falsy key makes
   `supabase.ts:7-9` return a real client, so `middleware.ts:13` would run
   `await supabase.auth.getUser()` on every request including `/`.
2. **All Scryfall traffic is intercepted.** No spec, including the seed, touches
   the live API.

## Critical Implementation Details

**Ordering is load-bearing in three places, and each has cost a prior phase a CI
round.**

- `@playwright/test` must be a devDependency before any `tests/e2e/` file is committed.
  `tsconfig.json:3` includes `**/*`, so an unresolved import fails `npm run typecheck`
  — a step in the already-required `ci` job. An uninstalled runner breaks a *different*
  gate than the one being added.
- The workflow edit merges to `main` **before** the branch-protection PATCH. Reversed,
  every PR blocks forever on a context that never reports.
- Phases 1–4 must be merged to `main` before Phase 5 opens, so the break forks from a
  `main` that actually contains the suite. Phase 2's closing note records this being
  assumed rather than done.

**The debounce defeats the obvious way to write risk #8.** Driving overlap by typing
into the textareas exercises nothing — the effect cleanup cancels the first run's timer
before `runPlan` is called. The CTA is the only entry point that produces two runs.

**A deliberate break must stay lint- and typecheck-clean by hand.** `ci` runs `lint`
before `typecheck` before `npm test`, so an orphaned import kills the job at the wrong
gate and the intended observation never happens. Phase 2 learned this by orphaning
`toPathStep`.

**`networkidle` is structurally impossible here.** `Layout.astro:19-24` preconnects and
stylesheet-links `fonts.googleapis.com` on every page, and Vite's HMR websocket stays
open. Wait on state, never on the network settling.

**`client:load` hydration is a real hang risk, and the obvious guard does not catch it.**
A `fill()` before React hydrates sets the DOM value without React state; React then mounts
with its own empty state, `bothFilled` stays false, and the Calculate CTA never enables.
Waiting for the CTA to enable *after* filling therefore cannot rescue it — the fill is
already orphaned, and the failure surfaces as a timeout blaming the button.

The barrier has to be crossed **before** the first `fill()`. The one trustworthy signal is
Astro's island: `astro-island` removes its `ssr` attribute only after
`await this.hydrator(...)` resolves, so its absence means React has committed. This is the
sole place a framework-internal selector is used, and it is a *wait*, never an assertion
target — which is why it lives behind a helper rather than in any spec.
_(Established empirically in Phase 1; the plan originally prescribed the CTA-enable check.)_

---

## Phase 1: Harness, seed, and the two failure surfaces' names

### Overview

Everything that is not a spec: the runner, its config, the shared interception fixture,
the seed exemplar, and the two one-line production edits that make the failure surfaces
addressable. After this phase, `/10x-e2e` can run.

### Changes Required:

#### 1. Playwright as a devDependency

**File**: `package.json`

**Intent**: Install the runner and expose the suite as a script. Must land before any
`tests/e2e/` file is committed, or `npm run typecheck` fails on the unresolved import.

**Contract**: `@playwright/test` in `devDependencies`; a `test:e2e` script running
`playwright test`. Chromium binary via `npx playwright install chromium` (local) — the
CI equivalent lands in Phase 4.

#### 2. Playwright configuration

**File**: `playwright.config.ts` (new, repo root)

**Intent**: Pin the suite to its own directory, let Playwright own the dev server, and
set the retry policy decided during planning.

**Contract**: `testDir: "./tests/e2e"` — pinning this is what stops Playwright's default
`testMatch` sweeping the 100+ vitest files. A single `chromium` project. `retries:
process.env.CI ? 1 : 0`. A `webServer` block running `astro dev` on a dedicated port
**4323** (not 4321 — `helpers/env.ts:11` defaults there with no collision handling, and
Astro inherits Vite's `strictPort: false`, so a taken port silently binds the next one)
with `--host 127.0.0.1` (without it Astro binds `localhost` and Node 18+ IPv6-first
resolution can leave `127.0.0.1` unreachable), `reuseExistingServer: !process.env.CI`,
and `timeout: 120_000` — Astro answers before it has compiled `/`, so the first `goto`
pays the Vite transform plus Tailwind, and Playwright's default 60 s leaves no headroom.

This block replaces the entire spawn / readiness-poll / process-tree-kill machinery
`tests/integration/global-setup.ts:76-100,108-120,137-155` hand-rolls. Do not port it.

#### 3. Ignore Playwright's output

**File**: `.gitignore`

**Intent**: Keep run artifacts out of the repo and out of `tsconfig`'s `**/*` sweep.

**Contract**: Four entries, all currently absent: `test-results/`, `playwright-report/`,
`blob-report/`, `playwright/.cache/`.

#### 4. The shared Scryfall interception fixture

**File**: `tests/e2e/fixtures/scryfall.ts` (new)

**Intent**: One helper every spec routes through, so the interception contract is written
once and correctly. This is the phase's most reusable artifact — both risk specs depend
on it.

**Contract**: A single `page.route("https://api.scryfall.com/**", …)` handler
discriminating on `request.method()` and, for POSTs, `request.postDataJSON().identifiers`.
Covers `POST /cards/collection` (`scryfall.ts:87`) and `GET /cards/named?fuzzy=`
(`scryfall.ts:123`). Names arrive in their original spelling, not lowercased
(`resolve.ts:158,172`). Chunk size is 75 (`scryfall.ts:30`) and the fuzzy throttle is
100 ms (`resolve.ts:7`) — two small decks with all names found is exactly 2 POSTs and
0 GETs.

The mock card shape is a hard contract — `normalize.ts:29,33,37-38` accesses `name`,
`type_line` and `prices` unguarded, and `resolve.ts:175,186` accesses `data` and
`not_found`, so omitting any yields a `TypeError`, not a partial result. Minimal valid
card: `{"name":"Sol Ring","type_line":"Artifact","layout":"normal","prices":{"usd":"1.50","eur":null}}`.
Deliberately omit `image_uris` — that kills traffic to `cards.scryfall.io`
(`cardImage.ts:11-17`), a different host the route does not cover, at the cost of the
per-card `<button aria-label={card.name}>` (`CardRow.tsx:32`) which no spec needs.

**Also expose `tests/e2e/fixtures/app.ts`** — `gotoComparer(page)` navigates and crosses
the hydration barrier, returning the `main` scope; `compare(main, base, target)` fills both
decks and runs via the CTA. Both traps this phase discovered (a `fill()` that races
hydration, and the debounce collapsing keystroke-driven overlap) are handled once here
rather than left as rules every generated spec must remember. Keeping the island selector
in this file is what stops it propagating into the specs.

Expose a deferred-release variant for Phase 3 in `scryfall.ts`: a handler that parks a *selected* request
on a manually resolved promise while continuing to fulfil every other request normally.
Selective parking is the requirement — Phase 3 holds one run's base POST while that same
run's follow-up target POST must still resolve, so a handler that parks everything cannot
express the scenario.

#### 5. The seed exemplar

**File**: `tests/e2e/seed.spec.ts` (new)

**Intent**: The primary quality lever. What the seed shows is what `/10x-e2e` generates,
so it must demonstrate mocked interception, role-based locators, `main`-scoping, and
wait-for-state in one readable happy path.

**Contract**: Named `seed.spec.ts` at exactly this path — `/10x-e2e` hard-codes the name
(`SKILL.md:63,125`, `seed-test-pattern.md:3,33`, `e2e-prompt-template.md:36,66`) and would
otherwise create a second, dead one outside `testDir`.

One test: install the Scryfall fixture, `gotoComparer(page)` to navigate and cross the
hydration barrier, `compare(main, …)` to fill both decks (labels at
`DeckComparer.tsx:164-176,179-191`) and run via the CTA, then assert the `Remove` and `Add`
column headings render. The CTA needs a **regex** name — `◆`, `→` and two `&nbsp;` sit
inside the button text and are not aria-hidden (`:196`), so an exact match fails. Column
headings are clean `getByRole("heading", {name: "Remove"|"Add"})` because the glyph span is
aria-hidden (`CardGroupColumn.tsx:31-37`). Every locator chains off the `main` scope
`gotoComparer` returns.

No `waitForTimeout`, no `networkidle`, no CSS selectors — the seed is where those
anti-patterns would propagate from.

#### 6. Name the error banner

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Make the retryable-error surface addressable and announce it to assistive
technology. Correct independently of testing — there are no live regions anywhere in the
component today.

**Contract**: `role="alert"` on the banner container at `:217`. The heading text
`Couldn't reach the card database.` (`:218`, U+2019 apostrophe) and the `Retry` button's
accessible name (`:220-231`) are unchanged.

#### 7. Name the unresolved notice

**File**: `src/components/deck/UnresolvedNotice.tsx`

**Intent**: Distinguish the notice from the error banner, which is currently impossible —
both are unnamed `<div>`s with a byte-identical class string.

**Contract**: An accessible name on the container at `:62` (`role="region"` +
`aria-label`, or an equivalent). Per-entry accept buttons already carry explicit
`aria-label`s (`:90-101`) and are untouched.

### Success Criteria:

#### Automated Verification:

- Lint passes over the new directory: `npm run lint`
- Typecheck passes with the new devDependency resolved: `npm run typecheck`
- Existing unit suite is unaffected: `npm test`
- Existing integration suite is unaffected: `npm run test:integration`
- The seed runs green with zero external network: `npm run test:e2e`
- Playwright collects exactly the seed and no vitest files: `npx playwright test --list`

#### Manual Verification:

- Killing the run mid-flight leaves no orphaned dev server on port 4323
- The error banner still looks unchanged in the browser after the `role="alert"` edit
- `git status` is clean after a run — no `test-results/` or `playwright-report/` tracked

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to the next phase.

---

## Phase 2: Risk #7 — a failure never reads as a complete plan

### Overview

Driven by `/10x-e2e`. Two tests proving that a card-data transport failure and a partial
resolution each surface their own notice, instead of a plan that reads as complete.

### Changes Required:

#### 1. The risk #7 spec

**File**: `tests/e2e/comparer-failure-surfacing.spec.ts` (new)

**Intent**: Pin §2 row #7 as written. Both tests pass green today — this is a regression
guard, and it builds the interception scaffolding Phase 3 reuses.

**Contract**: Two tests, a provenance header linking the spec to risk #7 and to
`seed.spec.ts`, all locators scoped to `page.getByRole("main")`.

*Test 1 — transport failure surfaces, and Retry recovers.* Fail the **first**
`POST /cards/collection` (the base deck's) and succeed on everything after it. Pinning the
failure to the first request is what keeps the recovery half simple: `fetchCardCollection`
throws before the cache write at `resolve.ts:181`, so nothing was ever cached and Retry
re-requests the full set. Failing the *target* deck's POST instead would leave the base
deck's cards cached and the recovery fixture would have to serve a partial set.

Induce it with `route.fulfill({status: 500})`, **not** `route.abort("failed")`: the 500 trips the explicit
guard at `scryfall.ts:96-98` and produces the deterministic message
`Scryfall /cards/collection failed: 500 …`, while an abort rejects the raw `fetch` with a
browser-dependent `"Failed to fetch"`. Assert the banner heading, **and the message text**
— a malformed fixture throws a `TypeError` into the same catch at `plan.ts:106-109`, so a
banner-only assertion cannot tell a real transport failure from a broken fixture. Match on
`/cards\/collection failed: 500/` and leave the `statusText` portion unasserted, since
`fulfill` may not populate it. Then assert the `Retry` button
(`getByRole("button", {name: "Retry"})`), re-route to success, click it, and assert the
plan renders. Retry calls `runPlan` again (`:226`) — a full re-run with a fresh token, not
a state reset.

*Test 2 — a partial resolution surfaces.* Return a `not_found` entry for one card in the
collection response and a 404 for its fuzzy follow-up, and assert the unresolved notice
renders and names the missed card. The notice appears iff `bothFilled` **and**
`status === "ready"` **and** `unresolved.length > 0` (`DeckComparer.tsx:63,235,237`). A
404 on the fuzzy endpoint is **not** an error (`scryfall.ts:130`) — it is the
ambiguous/not-found branch, which is exactly the path this test needs.

Avoid the merged view entirely — `MergedRow.tsx:51-113` renders add/remove as an
aria-hidden glyph plus CSS colour, so the two kinds are indistinguishable to
accessibility queries. Assert against the columns view.

### Success Criteria:

#### Automated Verification:

- Both tests pass: `npx playwright test tests/e2e/comparer-failure-surfacing.spec.ts`
- The whole suite still passes: `npm run test:e2e`
- Lint and typecheck pass over the new spec: `npm run lint && npm run typecheck`
- No external network: the run succeeds with `api.scryfall.com` unreachable

#### Manual Verification:

- Reviewed against all five agent E2E anti-patterns in
  `.claude/skills/10x-e2e/references/e2e-anti-patterns.md`, with the control question
  asked of every assertion: would this fail if the risk materialized?
- The tests read as independent — either can run alone, in any order
- The failure message on a deliberately malformed fixture is legible enough to
  distinguish it from a real transport failure

**Implementation Note**: Pause here for manual confirmation from the human that the manual
testing was successful before proceeding to the next phase.

---

## Phase 3: Risk #8 — a superseded comparison never renders

### Overview

Driven by `/10x-e2e`. One test that genuinely overlaps two in-flight comparisons and
proves the older one never reaches the rendered plan.

### Changes Required:

#### 1. The risk #8 spec

**File**: `tests/e2e/comparer-stale-response.spec.ts` (new)

**Intent**: Pin §2 row #8. The row's named anti-pattern is "a test that passes because it
never actually overlaps two runs", so the overlap has to be real, not sequential.

**Contract**: One test, `test.describe.configure({ retries: 0 })` overriding the global
policy — ordinary infrastructure flake is absorbed in CI, but a genuine out-of-order bug
must never retry its way to green, since this is the only test that covers it.

The sequence, driven through the **Calculate CTA** (the debounce cancels keystroke-driven
overlap, so it exercises nothing):

1. Route holds run A's first `POST /cards/collection` — its **base** deck — on a manually
   released deferred promise.
2. Fill both textareas with deck pair A; wait for the CTA to enable; click. Token → 1.
3. `await page.waitForRequest(…)` to prove A is actually in flight — without this the
   overlap is asserted, not established.
4. Rewrite both textareas to deck pair B. The inputs are still visible because
   `inputsCollapsed` (`:66`) requires `status === "ready"` and A is still `loading`.
   Click Calculate. Token → 2.
5. Fulfil B's requests; assert plan B rendered.
6. Release A's base POST. `plan.ts:95-96` awaits base **then** target, so A immediately
   issues a *second* POST for its target deck — the fixture must fulfil that one too, and
   this step anchors on `page.waitForResponse` for **A's target response**, not its base.
   Miss it and `generateUpgradePlan` never returns, the token comparison at `:73` is never
   reached, and step 7 passes while proving nothing — risk #8's own anti-pattern wearing a
   different costume.
7. Assert A's target POST was actually issued, **then** assert plan B survived and no
   plan-A content appeared. The first half is what distinguishes "the guard dropped A"
   from "A never finished".

**Decks A and B must share no card names and no line counts** — and deck A's own base and
target halves must not share names either, or A's target resolution is served from the
session cache (`resolve.ts:152,181`), no second POST fires, and step 6 has nothing to
anchor on. The drop path is silent —
a bare `return` at `:74`, no state change, no logging, and the token is a `useRef` that
never reaches the DOM — so guard-worked and guard-failed are distinguishable only by
rendered content.

The primary assertion is the **collapsed input strip** (`:141-159`), which renders
`countCardLines()` over the live textarea state, never the plan (`:32-34,153-155`). It is
a `<button>` whose accessible name carries both counts, so a guard failure is directly
assertable as the contradiction the risk names: the strip reports deck B's counts while
the columns below show deck A's cards.

### Success Criteria:

#### Automated Verification:

- The test passes: `npx playwright test tests/e2e/comparer-stale-response.spec.ts`
- The whole suite passes: `npm run test:e2e`
- Lint and typecheck pass: `npm run lint && npm run typecheck`
- The test fails when the guard is disarmed — invert or delete the comparison at
  `DeckComparer.tsx:73` locally and confirm red, then revert

#### Manual Verification:

- The `waitForRequest` in step 3 genuinely fires — confirm run A is in flight before B
  starts, rather than assuming it
- Reviewed against the five anti-patterns, with particular attention to #8's own named
  one: sequential awaits cannot reproduce an out-of-order arrival
- Run the spec 5× consecutively with no flake

**Implementation Note**: Pause here for manual confirmation from the human that the manual
testing was successful before proceeding to the next phase.

---

## Phase 4: The CI job, the gate, and the docs

### Overview

Turn a reporting workflow into an enforced gate, and write every document this rollout
phase owes. §6.7's recipe is written here, after the specs are green, because it can only
honestly record what they taught.

### Changes Required:

#### 1. The `e2e` CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the suite on every PR as a third sibling job.

**Contract**: A job with id `e2e` — **no `name:` field**, matching `ci` and `integration`,
so the reported check context is literally `e2e`. Steps: checkout → setup-node 22 with npm
cache → `npm ci` → `npx astro sync` → `npx playwright install --with-deps chromium` →
`npm run test:e2e` → upload the report artifact. **No Supabase** — copying the
`integration` job's stack would add ~90 s and a service-role key to a job that touches
neither. Estimated 1.5–2.5 min, cheaper than `integration`, so it does not extend the
critical path.

#### 2. The branch-protection change

**File**: none — an administrative API call, after the workflow is merged to `main`

**Intent**: Make the job block rather than merely report. §5's own rule: a workflow file
can only report; only a required status check blocks.

**Contract**: `gh api -X PATCH repos/Vegolas/10xdevs-mtg-upgraded/branches/main/protection`
moving `required_status_checks.contexts` from `["ci","integration"]` to
`["ci","integration","e2e"]`, preserving `strict: false` and `enforce_admins: true`.
**Strictly after** the workflow edit is on `main` — reversed, every PR blocks forever on a
context that never reports. No PR carries this and nothing in CI verifies it, which is why
§5 demands re-reading the list before claiming the row.

#### 3. Deferred findings

**File**: `context/changes/testing-comparer-failure-surfacing/findings.md` (new)

**Intent**: Keep three live defects from evaporating with the change folder.

**Contract**: Follows the Phase 2 house shape
(`context/archive/2026-08-11-testing-api-contract-pinning/findings.md`) — F-numbered, each
with **Where** (file:line, verified), **Observed**, **Impact**, **Why deferred**,
**Suggested owner**.

- **F-1** — `plan.ts:90-92` short-circuits to `empty` when either deck parses to zero
  entries and discards `parsed.malformed`; `DeckComparer.tsx:81-83` maps that to `idle`,
  which renders *"Paste a deck list into each box…"* while both boxes visibly contain text.
  Unparseable input reads as empty input.
- **F-2** — `DeckComparer.tsx:251-254` prints *"These lists are identical — nothing to add
  or remove."* whenever remove and add are both empty. If every *differing* card fails to
  resolve, `diffDecks` legitimately returns empty and the app makes an affirmative false
  claim. The unresolved notice does render above it, so this is a contradiction rather than
  silence.
- **F-3** — `MergedRow.tsx:51-113` renders add/remove as an aria-hidden glyph plus CSS
  colour; only `stay` carries text (`:103`). The two kinds are indistinguishable to
  accessibility queries. A testability finding rather than a user-facing defect — say so in
  the entry.

#### 4. The E2E cookbook recipe

**File**: `context/foundation/test-plan.md` — new §6.7

**Intent**: Fill the sub-section this rollout phase owes, matching Phase 2 (§6.3) and
Phase 3 (§6.4).

**Contract**: "Adding a browser E2E test", covering: the interception contract and the
unguarded mock fields; the `getByRole("main")` scoping rule and why; the debounce-vs-CTA
trap; `retries: 0` on any ordering-sensitive spec; the ban on `networkidle` and why it is
structural here; and the hydration barrier. Written from what Phases 2–3 actually taught,
not from this plan.

#### 5. Test-plan status and gate updates

**File**: `context/foundation/test-plan.md`

**Intent**: Move every row this phase changes from aspirational to true, and record the
one risk-map decision research settled.

**Contract**: §3 Phase 4 Status → `complete` with this change folder named. §4's `e2e` row
gains Playwright's real version and drops "planned". §5's `e2e on critical flows` row
becomes `required (wired §3 Phase 4)` — **only after** the PATCH is confirmed by re-reading
the list, per the rule that stopped Phase 3 from over-claiming. §2's "Not promoted to the
map" paragraph gains finding E, the silent quantity degradation at `resolve.ts:99-102`,
citing the layers that already document it (`plan.test.ts:65-78`, `resolve.ts:70-75`) — it
is not made risk #9 because the map is already at eight rows against a 5–7 budget and the
failure is not browser-only. §8 gains a freshness entry.

#### 6. The lessons file

**File**: `context/foundation/lessons.md` (new)

**Intent**: The file `/10x-e2e:109` and `/10x-implement` both read does not exist, so every
run silently skips a lever. Seed it with the three durable rules this phase surfaced.

**Contract**: (1) The 700 ms debounce defeats keystroke-driven overlap — a test that types
to create two runs exercises one. (2) `.dev.vars` does `Object.assign(process.env, parsed)`
with parsed winning (`@astrojs/cloudflare/dist/index.js:292-303`), so local and CI render
different DOMs; scope to a landmark rather than neutralizing the config. *Record the
correction:* `global-setup.ts:47` and §6.2 rule 4 both attribute this precedence to
`getPlatformProxy`; the precedence claim is right, the mechanism attribution is not.
(3) The stale-response guard is a five-site hand copy (`DeckComparer.tsx:69,73` plus four
flows in `PathEditor.tsx:225,245,267,275,292,326,330,335,352,358,363`) whose comments at
`PathEditor.tsx:188,191` assert a mirror relationship nothing enforces — and it has already
drifted four ways.

### Success Criteria:

#### Automated Verification:

- The workflow parses and the job runs on the PR: `gh pr checks` shows an `e2e` context
- All three jobs green on the PR: `ci`, `integration`, `e2e`
- After merge and PATCH, the list contains `e2e`:
  `gh api repos/Vegolas/10xdevs-mtg-upgraded/branches/main/protection --jq '.required_status_checks.contexts'`

#### Manual Verification:

- The PATCH ran **after** the merge, confirmed by the order of events, not by intent
- §5's e2e row was flipped only after re-reading the contexts list, not in the same edit
  as the workflow change
- `findings.md` entries each name a file:line that still resolves
- §6.7 records what the specs taught, not what this plan predicted they would

**Implementation Note**: Pause here for manual confirmation from the human that the manual
testing was successful. **Phases 1–4 must be merged to `main` before Phase 5 opens.**

---

## Phase 5: Deliberate-break PR — two runs

### Overview

The house-style closing check. Prove each spec is independently load-bearing by breaking
the two seams separately and watching each spec go red alone. Run as a PR, not locally —
a local revert proves the assertion fires; only the PR proves the red blocks.

### Changes Required:

#### 1. Run 1 — disarm the stale-response guard

**File**: `src/components/deck/DeckComparer.tsx` (on a break branch, never merged)

**Intent**: Reproduce risk #8 exactly. Research names this as the spec's explicit negative
control: if the test still passes, the spec is one of the naive shapes.

**Contract**: Invert or delete the token comparison at `:73`. Expected: `e2e` red on
`comparer-stale-response.spec.ts` alone; `comparer-failure-surfacing.spec.ts` green; `ci`
and `integration` green.

#### 2. Run 2 — remove the error-banner render

**File**: `src/components/deck/DeckComparer.tsx` (same branch, run 1 restored first)

**Intent**: Reproduce risk #7's core claim — a transport failure that reaches the user as a
plan with no notice.

**Contract**: Restore `:73`, then remove the `bothFilled && view.status === "error"` render
block at `:216-233`. **This is the run that must be kept lint-clean by hand.** Removing the
block orphans two imports — `RotateCw` (`:2`, used only at `:229`) and `Button` (`:5`, used
only at `:220`) — and `@typescript-eslint/no-unused-vars` is an error. `ci` runs `lint`
before `typecheck`, so leaving them kills the job at the lint step and the `e2e` observation
never happens; this is Phase 2's orphaned-`toPathStep` lesson exactly. Delete both imports
with the block. Expected: `e2e` red on `comparer-failure-surfacing.spec.ts` alone;
the ordering spec green. These two seams are genuinely independent, so two runs is honest
attribution, not the manufactured break Phase 3 warned against.

#### 3. Record the result

**File**: `context/foundation/test-plan.md` §6.6

**Intent**: Append the phase note, matching the Phase 2 and Phase 3 "closing gate check"
entries.

**Contract**: A "Phase 4, the closing gate check" entry with the two-run results table
(job, result, duration, attribution — which file and how many tests of how many), the PR
number, and `mergeStateStatus` read **next to** `mergeable` — `BLOCKED` alone does not
distinguish a required-check refusal from a merge conflict. Plus whatever the phase
learned that a future phase would otherwise re-learn. Close the PR unmerged.

### Success Criteria:

#### Automated Verification:

- Run 1: `e2e` red, attributed to `comparer-stale-response.spec.ts` only
- Run 2: `e2e` red, attributed to `comparer-failure-surfacing.spec.ts` only
- Both runs: `ci` and `integration` green — the break reaches only the intended gate
- Both runs: `gh pr view --json mergeable,mergeStateStatus` returns
  `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE`

#### Manual Verification:

- Each failure is diagnosable from the CI log alone, without local reproduction
- The break PR is closed unmerged and `main` is clean
- §6.6's note records what actually happened, including anything that contradicted this
  plan

**Implementation Note**: This is the final phase. After it, `change.md` moves to
`status: complete` and the change is ready for `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

None added. The resolver outcomes are already unit-owned (`plan.test.ts`,
`resolve.test.ts`) and §7 forbids re-testing the pure-logic engine. The gap this phase
closes is the step from outcome to *rendered surface*, which no unit test can see.

### Integration Tests:

None added. The comparer touches neither the API nor the database, so the existing
`integration` job has nothing to say about it.

### E2E Tests:

Four tests across three spec files, against `SKILL.md:238`'s budget of one *per risk*:

- `seed.spec.ts` — happy-path compare, mocked. Doubles as the quality lever and as proof
  the harness works.
- `comparer-failure-surfacing.spec.ts` — transport failure + Retry recovery; partial
  resolution.
- `comparer-stale-response.spec.ts` — genuine two-run overlap via the CTA.

### Manual Testing Steps:

1. Run `npm run test:e2e` with `api.scryfall.com` blocked at the OS level — the suite must
   still pass, proving no spec leaks to the live API.
2. Delete `.dev.vars` temporarily and re-run — the suite must pass identically, proving the
   `main`-scoping mitigation holds against the CI DOM.
3. Invert `DeckComparer.tsx:73` locally and confirm only the ordering spec goes red.
4. Remove the error-banner block locally and confirm only the failure-surfacing spec goes
   red.
5. Run the ordering spec 5× consecutively and confirm no flake with `retries: 0`.

## Performance Considerations

The `e2e` job is estimated at 1.5–2.5 min — cheaper than `integration` (~3.5 min), so it
runs in parallel and does not extend the PR critical path. Browser caching is deliberately
skipped: the cache key must contain the Playwright version, and OS libs live outside
`~/.cache/ms-playwright`, so a hit still needs `install-deps`. Revisit only if the install
step becomes the job's dominant cost.

Locally, `reuseExistingServer: !process.env.CI` means a warm `astro dev` is reused across
runs; the 120 s `webServer.timeout` only ever costs a cold start.

## Migration Notes

Nothing to migrate. Two production edits ship (`role="alert"`, an accessible name on the
unresolved notice) and both are additive semantics with no behavioral change — no user
flow, no stored data, and no API surface is touched.

The one irreversible-in-practice step is the branch-protection PATCH. Rolling it back is a
second PATCH removing `e2e` from `contexts`; there is no PR to revert.

## References

- Change brief: `context/changes/testing-comparer-failure-surfacing/change.md`
- Research: `context/changes/testing-comparer-failure-surfacing/research.md`
- Risk rows and response guidance: `context/foundation/test-plan.md` §2 (#7, #8)
- Scope boundary: `context/foundation/test-plan.md` §7
- Gate precedent (CI job + branch protection):
  `context/archive/2026-06-29-testing-server-boundary-auth/plan.md:331-390`
- Deliberate-break precedent:
  `context/archive/2026-08-11-testing-api-contract-pinning/plan.md:707-757` and
  `context/archive/2026-08-19-testing-derive-to-persist/plan.md:557-620`
- Findings house shape:
  `context/archive/2026-08-11-testing-api-contract-pinning/findings.md`
- E2E rules and anti-patterns: `.claude/skills/10x-e2e/references/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness, seed, and the two failure surfaces' names

#### Automated

- [x] 1.1 Lint passes over the new directory: `npm run lint` — af76b34
- [x] 1.2 Typecheck passes with the new devDependency resolved: `npm run typecheck` — af76b34
- [x] 1.3 Existing unit suite is unaffected: `npm test` — af76b34
- [x] 1.4 Existing integration suite is unaffected: `npm run test:integration` — af76b34
- [x] 1.5 The seed runs green with zero external network: `npm run test:e2e` — af76b34
- [x] 1.6 Playwright collects exactly the seed and no vitest files: `npx playwright test --list` — af76b34

#### Manual

- [x] 1.7 Killing the run mid-flight leaves no orphaned dev server on port 4323 — af76b34
- [x] 1.8 The error banner still looks unchanged in the browser after the `role="alert"` edit — af76b34
- [x] 1.9 `git status` is clean after a run — no `test-results/` or `playwright-report/` tracked — af76b34

### Phase 2: Risk #7 — a failure never reads as a complete plan

#### Automated

- [x] 2.1 Both tests pass: `npx playwright test tests/e2e/comparer-failure-surfacing.spec.ts` — 30fe61d
- [x] 2.2 The whole suite still passes: `npm run test:e2e` — 30fe61d
- [x] 2.3 Lint and typecheck pass over the new spec: `npm run lint && npm run typecheck` — 30fe61d
- [x] 2.4 No external network: the run succeeds with `api.scryfall.com` unreachable — 30fe61d

#### Manual

- [x] 2.5 Reviewed against all five agent E2E anti-patterns, with the control question asked of every assertion — 30fe61d
- [x] 2.6 The tests read as independent — either can run alone, in any order — 30fe61d
- [x] 2.7 The failure message on a deliberately malformed fixture is distinguishable from a real transport failure — 30fe61d

### Phase 3: Risk #8 — a superseded comparison never renders

#### Automated

- [x] 3.1 The test passes: `npx playwright test tests/e2e/comparer-stale-response.spec.ts`
- [x] 3.2 The whole suite passes: `npm run test:e2e`
- [x] 3.3 Lint and typecheck pass: `npm run lint && npm run typecheck`
- [x] 3.4 The test fails when the guard is disarmed at `DeckComparer.tsx:73`, then reverted

#### Manual

- [x] 3.5 The `waitForRequest` genuinely fires — run A confirmed in flight before B starts
- [x] 3.6 Reviewed against the five anti-patterns, especially #8's own named one
- [x] 3.7 Run the spec 5× consecutively with no flake

### Phase 4: The CI job, the gate, and the docs

#### Automated

- [ ] 4.1 The workflow parses and the job runs on the PR: `gh pr checks` shows an `e2e` context
- [ ] 4.2 All three jobs green on the PR: `ci`, `integration`, `e2e`
- [ ] 4.3 After merge and PATCH, the required-check list contains `e2e`

#### Manual

- [ ] 4.4 The PATCH ran after the merge, confirmed by the order of events
- [ ] 4.5 §5's e2e row was flipped only after re-reading the contexts list
- [ ] 4.6 `findings.md` entries each name a file:line that still resolves
- [ ] 4.7 §6.7 records what the specs taught, not what this plan predicted

### Phase 5: Deliberate-break PR — two runs

#### Automated

- [ ] 5.1 Run 1: `e2e` red, attributed to `comparer-stale-response.spec.ts` only
- [ ] 5.2 Run 2: `e2e` red, attributed to `comparer-failure-surfacing.spec.ts` only
- [ ] 5.3 Both runs: `ci` and `integration` green
- [ ] 5.4 Both runs: `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE`

#### Manual

- [ ] 5.5 Each failure is diagnosable from the CI log alone, without local reproduction
- [ ] 5.6 The break PR is closed unmerged and `main` is clean
- [ ] 5.7 §6.6's note records what actually happened, including anything that contradicted this plan
