---
date: 2026-08-27T10:29:28+02:00
researcher: Mateusz Tomanek
git_commit: 436221912542b8694f672873951cedbb0984d1ea
branch: main
repository: Vegolas/10xdevs-mtg-upgraded
topic: "Browser-E2E harness and failure-surfacing coverage for the deck comparer (test-plan §3 Phase 4, risks #7 and #8)"
tags: [research, codebase, e2e, playwright, deck-comparer, ci, quality-gates]
status: complete
last_updated: 2026-08-27
last_updated_by: Mateusz Tomanek
---

# Research: Browser-E2E for the deck comparer's failure surfacing

**Date**: 2026-08-27T10:29:28+02:00
**Researcher**: Mateusz Tomanek
**Git Commit**: 436221912542b8694f672873951cedbb0984d1ea
**Branch**: main
**Repository**: Vegolas/10xdevs-mtg-upgraded

> **No GitHub permalinks in this document.** `HEAD` sits 7 commits ahead of
> `origin/main`, so permalinks at this SHA would 404. All references are local
> `file:line` and resolve once the branch is pushed.

## Research Question

Settle what `context/foundation/test-plan.md` §3 Phase 4 needs before it can be
planned: the browser runner and harness shape, the outcome-to-render seam for
risk #7, the ordering guarantee for risk #8, and the CI job that turns the §5
`e2e on critical flows` row from `planned` into a real gate.

Scope decided before research: **include** the CI gate; run the harness against
`astro dev` rather than a production build.

## Summary

**The harness is far cheaper than the existing integration harness, and almost
none of it needs hand-porting.** The comparer lives at `/`
(`src/pages/index.astro:17`), `src/middleware.ts:7` protects only `/dashboard`
and `/paths`, and card resolution is a browser-side `fetch` to Scryfall
(`src/lib/card-data/scryfall.ts:15,87,123`). So this phase needs no Supabase, no
auth, no service-role key, and no `.env.test`. Playwright's `webServer` block
replaces the entire `astro dev` spawn / readiness-poll / process-tree-kill
machinery that `tests/integration/global-setup.ts` hand-rolls — that is the
single biggest simplification available.

**Both risks are deterministically reproducible via `page.route()` interception**,
which matters because §2's response rows name "a test that never actually
overlaps two runs" as risk #8's anti-pattern. The interception contract is
concrete and small: `POST https://api.scryfall.com/cards/collection` plus a
follow-up `GET /cards/named?fuzzy=` on misses.

**Three findings change how the phase should be planned:**

1. **`/10x-e2e` cannot bootstrap this phase.** It assumes Playwright is installed
   and stops when `playwright.config.*` and `*.spec.ts` are both absent
   (`.claude/skills/10x-e2e/SKILL.md:61,113-122`), and it does not wire CI. An
   `/10x-implement` phase must land install + config + seed first.
2. **The 700 ms debounce actively prevents the overlap risk #8 needs.** A
   keystroke-driven test silently exercises nothing.
3. **A `.dev.vars` file makes local and CI render different DOMs.** The same test
   sees a config error banner in CI that it does not see locally.

**The gate is two separate operations, in a forced order** — merge the workflow
edit to `main` first, then PATCH branch protection. Reversing them blocks every
PR forever on a context that never reports.

## Detailed Findings

### 1. The comparer's outcome-to-render seam (risk #7)

The pipeline produces exactly three outcomes (`src/lib/deck/plan.ts:46-49`); the
component holds four view states in one variable
(`src/components/deck/DeckComparer.tsx:20-24,49`). There is no second error or
status variable.

| Pipeline outcome                          | Produced at       | View state | Rendered by                |
| ----------------------------------------- | ----------------- | ---------- | -------------------------- |
| `ok` (plan + `unresolved[]`)              | `plan.ts:105`     | `ready`    | `DeckComparer.tsx:235-273` |
| `error` (transport, retryable)            | `plan.ts:106-109` | `error`    | `DeckComparer.tsx:216-233` |
| `empty` (either deck parsed to 0 entries) | `plan.ts:90-92`   | **`idle`** | `DeckComparer.tsx:203-207` |
| — (in flight)                             | —                 | `loading`  | `DeckComparer.tsx:209-214` |

"Partial resolution" is not a state — it is `view.unresolved.length > 0` on the
`ready` variant (`plan.ts:100-103`), merging parser-level malformed lines
(`parse.ts:113-116`) with resolver misses (`resolve.ts:139,205`).

**Both surfaces named in risk #7 exist.**

- **Unresolved notice** renders iff `bothFilled` _and_ `status === "ready"` _and_
  `unresolved.length > 0` (`DeckComparer.tsx:63,235,237`).
- **Error banner** at `DeckComparer.tsx:216-233`, with a fixed heading
  `"Couldn't reach the card database."` (`:218`, note U+2019 apostrophe), the raw
  `Error.message` (`:219`), and a **`Retry` button** (`:220-231`) whose accessible
  name is exactly `Retry` — the lucide icon is aria-hidden. Retry calls
  `runPlan` again (`:226`): a full re-run with a fresh token, not a state reset.

**Four silent-completion paths, ranked by test value:**

- **(A) `empty` → `idle` discards `parsed.malformed`.** `plan.ts:90-92`
  short-circuits when either deck parses to zero entries and throws the malformed
  list away; `DeckComparer.tsx:81-83` maps that to `idle`, which renders _"Paste a
  deck list into each box…"_ (`:203-206`) while both boxes visibly contain text.
  Unparseable input reads as empty input. Deterministic, no network needed.
- **(B) An affirmative false claim of identity.** `DeckComparer.tsx:251-254`
  prints _"These lists are identical — nothing to add or remove."_ whenever remove
  and add are both empty. If every _differing_ card fails to resolve, that is
  literally true of the resolved decks, so `diffDecks` (`diff.ts:109-142`)
  legitimately returns empty. `CostSummary` is suppressed too (`:241`). The
  unresolved notice _does_ render above it, making this a **contradiction rather
  than silence** — and therefore a sharper invariant to pin than "the notice must
  appear".
- **(C) Stale plan during the debounce window** (`DeckComparer.tsx:86-101`) — the
  previous `ready` plan stays on screen with no loading indicator for up to 700 ms
  after a keystroke. Timing-dependent; weak E2E target.
- **(E) Silent quantity degradation.** `resolve.ts:99-102` records nothing when a
  batch leaves ≥2 residual cards; `quantifyResolved` falls back to `?? 1`
  (`resolve.ts:240`, again at `quantity.ts:47`). `3 Jace the Mind Sculptor` becomes
  one copy with **no `unresolved` entry and no notice**. Documented as intentional
  at `src/lib/deck/plan.test.ts:65-78`. The plan renders complete and is
  quantitatively wrong.

### 2. The stale-response guard and how to overlap two runs (risk #8)

The guard is a monotonic `useRef` — declared `DeckComparer.tsx:61`, pre-incremented
at `:69`, compared at `:73`, dropped with a bare `return` at `:74`. No `setView`,
no logging, no `AbortController` anywhere in `src/` — the superseded fetch runs to
completion and its result is discarded only at the React boundary.

**Three entry points start a run:** the debounce effect (`:94-96`), the Calculate
CTA `handleCalculate` (`:106-109`, immediate), and Retry (`:226`).

**`plan.ts:95-96` awaits base then target sequentially**, so a comparison never has
more than one Scryfall request in flight. Holding run A's _first_
`POST /cards/collection` therefore stalls the whole of run A — its target-deck POST
is never issued. That is what makes deferred-promise interception clean.

**The debounce is the trap.** Typing deck A then deck B inside 700 ms does **not**
create two runs: the effect cleanup `clearTimeout` at `:98-100` cancels A's pending
timer before `runPlan` is ever called. One run starts, the token never advances
past 1, and `:74` is never reached. Genuine overlap requires the CTA, which
bypasses the debounce entirely.

**Sequence that genuinely overlaps:**

1. `page.route` holds run A's first POST on a manually released deferred promise.
2. Fill both textareas with deck pair A; click Calculate. Token → 1.
3. `await page.waitForRequest(...)` to prove A is actually in flight.
4. Rewrite both textareas to deck pair B — the inputs are still visible, because
   `inputsCollapsed` (`:66`) requires `status === "ready"` and A is still `loading`.
   Click Calculate. Token → 2.
5. Fulfil B's requests; assert plan B rendered.
6. Release A, anchored on `page.waitForResponse` for A's released request.
7. Assert plan B survived and no plan-A content appeared.

**Observability.** The drop path is completely silent — no attribute, no live
region, no console output, and the token is a `useRef` that never reaches the DOM.
Guard-worked vs. guard-failed is distinguishable only by rendered content, so
**decks A and B must share no card names and no line counts**.

The sharpest observable is not plan content at all: the collapsed input strip
(`DeckComparer.tsx:141-159`) renders `countCardLines()` over the **live textarea
state**, never the plan (`:32-34,153-155`). A guard failure therefore produces
exactly the contradiction the risk names — the strip reports deck B's counts while
the columns below show deck A's cards. That is a positive, directly assertable
invariant.

**Negative control:** invert or delete the comparison at `DeckComparer.tsx:73`.
If the test still passes, it is one of the naive shapes above.

### 3. The Scryfall interception contract

One handler covers both endpoints: `page.route('https://api.scryfall.com/**', …)`,
discriminating on `request.method()` and, for POSTs, `request.postDataJSON().identifiers`.

|            | Endpoint 1                                                                                         | Endpoint 2                                          |
| ---------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| URL        | `https://api.scryfall.com/cards/collection`                                                        | `https://api.scryfall.com/cards/named?fuzzy=<name>` |
| Method     | POST                                                                                               | GET                                                 |
| Defined at | `scryfall.ts:15,85-101`                                                                            | `scryfall.ts:121-139`                               |
| Fires      | once per deck, per 75-name chunk                                                                   | once per miss, after a 100 ms throttle              |
| Request    | `{"identifiers":[{"name":"Sol Ring"}]}` — original spelling, not lowercased (`resolve.ts:158,172`) | —                                                   |

**Response fields the client accesses unguarded** — omit any and you get a
`TypeError`, not a partial result:

- `data: ScryfallCard[]` (`resolve.ts:175`) and `not_found: {name?}[]` (`resolve.ts:186`)
- per card: `name`, `type_line`, and **`prices`** (`normalize.ts:29,33,37-38`)

Minimal valid mock card:
`{"name":"Sol Ring","type_line":"Artifact","layout":"normal","prices":{"usd":"1.50","eur":null}}`

**Constants:** chunk size 75 (`scryfall.ts:30`, applied `resolve.ts:162`); throttle
100 ms (`resolve.ts:7,167-169,198-200`); **no retry, no backoff, no 429 handling**.
Two small decks, all names found = exactly 2 POSTs, 0 GETs, 0 delay.

**Transport failure — two throw sites, one handler.** `route.abort('failed')`
rejects the raw `fetch` (`scryfall.ts:87`); `route.fulfill({status:500})` trips the
explicit guard (`:96-98`). Both land in the single catch at `plan.ts:106-109`. A
404 on _fuzzy_ is **not** an error (`:130`) — it is the ambiguous/not-found branch.

**Fixture trap:** a malformed mock throws a `TypeError` into that _same_ catch, so
a broken fixture is indistinguishable from a transport failure. Assert the message,
not just the banner.

**Session cache has no test seam.** `resolve.ts:15` is a module-level `Map`, read
`:152`, written `:181`, persisting for the page's lifetime.
`clearSessionCache()` exists at `:257` but is **not exported from the barrel**
(`src/lib/card-data/index.ts:8`), so it is unreachable from the browser. Reset is a
fresh page load. This also blunts the Retry path: cards fetched successfully before
a failure are not re-requested.

**Images are a different host.** `cards.scryfall.io` (`cardImage.ts:11-17`), not
covered by an `api.scryfall.com` route. Omitting `image_uris` from mocks kills the
traffic — at the cost of the per-card `<button aria-label={card.name}>`
(`CardRow.tsx:32`), which only exists when an image resolved.

### 4. Locator inventory and accessibility gaps

**Zero `data-testid` anywhere under `src/`.** The page is largely well-labelled.

Good handles: `getByLabel("Base deck — what you have now")` /
`getByLabel("Target deck — what you want")` (`DeckComparer.tsx:164-176,179-191`);
`getByRole("button", {name: "Retry"})` (`:220-231`); per-entry accept buttons carry
an explicit `aria-label` (`UnresolvedNotice.tsx:90-101`); column headings are clean
`getByRole("heading", {name: "Remove"|"Add"})` because the glyph span is aria-hidden
(`CardGroupColumn.tsx:31-37`).

**The Calculate CTA needs a regex** — `◆`, `→` and two `&nbsp;` sit inside the
button text and are not aria-hidden (`DeckComparer.tsx:196`), so exact-name match
fails.

**Genuine gaps, in descending severity:**

| Gap                                                                 | Where                                                 | Consequence                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Merged-row add/remove kind is `aria-hidden` glyph + CSS colour only | `MergedRow.tsx:51-113`                                | `add` and `remove` are **indistinguishable** to accessibility queries; only `stay` has text (`:103`) |
| No live regions anywhere                                            | `DeckComparer.tsx:209,217`, `UnresolvedNotice.tsx:62` | `getByRole("alert"\|"status")` finds nothing; every result transition is silent to AT                |
| Error banner / unresolved notice / CostSummary containers unnamed   | `:217`, `UN:62`, `CostSummary.tsx:20-24`              | must locate by inner text                                                                            |
| Column total count unlabelled                                       | `CardGroupColumn.tsx:38`                              | cannot assert "Add: 7" without a testid or `aria-label`                                              |

`/10x-e2e` is explicit that an element with no accessible name is _"a signal to fix
the app's accessibility, not to reach for a brittle selector"_
(`references/browser-driven-generation.md:37-59`). See Open Questions.

### 5. Harness shape

`tests/integration/global-setup.ts` hand-rolls what Playwright's `webServer` does
natively. **Replaced outright:** the spawn (`:108-120`), the `npx.cmd`/`shell`
platform branch (`:110,118`), stdio plumbing (`:128-135`), the readiness poll and
60 s boot timeout (`:19,137-155`), and the whole tree-kill teardown (`:76-100`) —
`taskkill /pid /t /f` on win32, negative-pid `SIGTERM` elsewhere. Playwright's
launcher does the same internally. **Not hand-porting this is the phase's single
biggest simplification.**

**Everything Supabase-shaped drops.** Verified on three counts: `astro.config.mjs:19-20`
declares `SUPABASE_URL`/`SUPABASE_KEY` as `optional: true`; `src/lib/supabase.ts:7-9`
returns `null` when either is falsy; `src/middleware.ts:12-19` handles the null
client. Dropped: `assertPrerequisites()` (`global-setup.ts:28-43`), the `.dev.vars`
snapshot/restore dance (`:55-74`), service-role forwarding, `.env.test` loading, and
the `TEST_PORT`/`TEST_BASE_URL` indirection.

**Port.** `TEST_PORT` defaults to 4321 (`helpers/env.ts:11`) with no collision
handling, and Astro inherits Vite's `strictPort: false` — a taken port silently
binds the next one while the poll keeps hitting 4321. Use a dedicated port (4323)
and `reuseExistingServer: !process.env.CI`.

**Test-glob collision runs the opposite way from the obvious worry.** `npm test`
globs `src/**/*.test.ts` (`vitest.config.ts:14`) and `test:integration` requires both
`tests/integration/` and the `.int.` infix (`vitest.integration.config.ts:69`) — an
`e2e/` directory is outside both. The real hazard is **Playwright's own default
`testMatch`**, which would sweep all 100+ vitest files if `testDir` were the repo
root. Pin `testDir: "./e2e"` plus an explicit `testMatch: /.*\.e2e\.ts$/`.

**Lint and typecheck already reach `e2e/` — verified empirically, not inferred.**
`npx eslint .` currently lints 125 files including root-level `.ts` outside `src/`
(`eslint.config.js:41`), and `astro check` typechecks 126 files because
`tsconfig.json:3` includes `**/*`. Two consequences:

- `@playwright/test` **must** be a devDependency or `npm run typecheck` fails on the
  unresolved import — and that is a step in the already-required `ci` job
  (`.github/workflows/ci.yml:25`). An uninstalled runner breaks a _different_ gate.
- `.gitignore` needs `test-results/`, `playwright-report/`, `blob-report/`,
  `playwright/.cache/` — **all currently absent**, and `tsconfig`'s `**/*` would
  otherwise sweep Playwright output.

`strictTypeChecked` friction is minor: `verbatimModuleSyntax` forces
`import type`; `no-floating-promises` requires awaiting every `page.*`;
`no-non-null-assertion` will flag `postDataJSON()!`. No new override needed unless
the noise gets loud.

### 6. The CI job and the gate

Current `.github/workflows/ci.yml`: two jobs, `ci` (`:10`) and `integration` (`:36`),
both `ubuntu-latest`, both checkout → setup-node 22 + npm cache → `npm ci` →
`npx astro sync`. `ci` then runs lint → typecheck → `npm test` → build with secrets;
`integration` boots Supabase, exports keys from `supabase status` into `$GITHUB_ENV`,
runs `npm run test:integration`, and stops the stack with `if: always()`.

**Neither job declares `name:`, so the reported check contexts are literally `ci`
and `integration`.** Preserve that — the new job's context will be `e2e`.

The new job slots in as a third sibling: checkout → setup-node 22 → `npm ci` →
`npx astro sync` → `npx playwright install --with-deps chromium` → `npm run test:e2e`
→ upload the report artifact. **No Supabase** — copying it would add ~90 s and a
service-role key to a job that touches neither. Estimated 1.5–2.5 min, cheaper than
`integration`, so it will not extend the critical path.

Browser caching is optional and easy to get wrong: the cache key **must contain the
Playwright version**, and OS libs live outside `~/.cache/ms-playwright` so a cache
hit still needs `playwright install-deps`. Recommended: ship without the cache first.

**Gate wiring is two operations in a forced order:**

1. Workflow edit, via PR, merged to `main`. This alone leaves the gate aspirational,
   exactly as `test-plan.md:180` says.
2. A **separate administrative** `gh api -X PATCH .../branches/main/protection` call
   moving `required_status_checks.contexts` from `["ci","integration"]` to
   `["ci","integration","e2e"]`. No PR carries it, no reviewer sees it, nothing in CI
   verifies it — which is precisely why `test-plan.md:227` demands re-reading the list
   before claiming the row.

Reversing the order blocks every PR forever on a context that never reports.
`enforce_admins: true` does not exempt the admin from routing the workflow change
through a PR.

### 7. Environment gotchas

**`.dev.vars` overwrites `process.env` — local and CI render different DOMs.**
`node_modules/@astrojs/cloudflare/dist/index.js:292-303` does
`readFileSync(".dev.vars") → parseEnv → Object.assign(process.env, parsed)`, parsed
winning. A contributor has a real gitignored `.dev.vars` (`.gitignore:15`), so
locally the Supabase keys are set; CI has none. And `src/lib/config-status.ts:14` +
`src/layouts/Layout.astro:28-43` render an **error `<Banner>` with a link above the
`<slot/>` on every page** when the keys are unset. Same test, two DOMs.
Cheapest mitigation: scope every locator inside `page.getByRole("main")`
(`src/layouts/AppLayout.astro:17`) and never assert on the banner region.

_Correction worth recording:_ `global-setup.ts:47` and test-plan §6.2 rule 4 both
attribute this precedence to `getPlatformProxy`. In adapter 13.5.0 it is the plain
`readFileSync`/`Object.assign` above. The precedence claim is correct; the mechanism
attribution is not.

**`networkidle` will never settle.** `src/layouts/Layout.astro:19-24` preconnects and
stylesheet-links `fonts.googleapis.com` on every page, and Vite's HMR websocket stays
open. `/10x-e2e` already bans `networkidle`
(`references/browser-driven-generation.md:108-124`); this repo makes it structurally
impossible.

**`client:load` hydration is a real hang risk.** `src/pages/index.astro:17`. SSR
renders both textareas, but a pre-hydration `fill()` sets the DOM value without React
state, so the run never fires and the test waits on a plan that will not build. The
user-visible barrier is `disabled={!bothFilled}` on Calculate
(`DeckComparer.tsx:63,195`), which flips to enabled only once React state has both
inputs.

**Dev-server boot budget.** Astro answers before it has compiled `/`, so the first
`goto` pays the Vite transform plus Tailwind. Set `webServer.timeout: 120_000` —
Playwright's default 60 s matches the integration harness's budget
(`global-setup.ts:19`) but leaves no headroom for lazy compilation.

Keep `--host 127.0.0.1`; without it Astro binds `localhost` and Node 18+ IPv6-first
resolution can leave `127.0.0.1` unreachable.

**Node version drift (pre-existing, not e2e-specific):** local 24.11.1, CI pins 22
(`ci.yml:16`), `.nvmrc` says 22.14.0.

## Code References

- `src/pages/index.astro:17` — mounts `<DeckComparer client:load />` at `/`
- `src/middleware.ts:7` — `PROTECTED_ROUTES = ["/dashboard","/paths"]`; `/` is open
- `src/components/deck/DeckComparer.tsx:61,69,73,74` — the stale-response guard
- `src/components/deck/DeckComparer.tsx:17,86-101` — 700 ms debounce and its cleanup
- `src/components/deck/DeckComparer.tsx:106-109` — CTA path that bypasses the debounce
- `src/components/deck/DeckComparer.tsx:141-159` — collapsed strip; counts live text, not the plan
- `src/components/deck/DeckComparer.tsx:216-233` — error banner and `Retry`
- `src/components/deck/DeckComparer.tsx:251-254` — the "these lists are identical" claim
- `src/lib/deck/plan.ts:90-92` — `empty` short-circuit that discards `parsed.malformed`
- `src/lib/deck/plan.ts:95-96` — sequential base-then-target resolution
- `src/lib/deck/plan.ts:106-109` — the single catch every failure lands in
- `src/lib/card-data/scryfall.ts:15,85-101,121-139` — the two network endpoints
- `src/lib/card-data/resolve.ts:15,152,181,257` — session cache with no exported reset
- `src/lib/card-data/normalize.ts:29,33,37-38` — unguarded field access in mocks
- `src/components/deck/MergedRow.tsx:51-113` — add/remove kind invisible to a11y
- `tests/integration/global-setup.ts:76-100,108-120,137-155` — the spawn/poll/kill machinery Playwright replaces
- `.github/workflows/ci.yml:10,25,36` — job ids (= check contexts) and the typecheck step
- `node_modules/@astrojs/cloudflare/dist/index.js:292-303` — `.dev.vars` precedence
- `src/lib/config-status.ts:14` + `src/layouts/Layout.astro:28-43` — the config error banner

## Architecture Insights

- **The guard is a five-site hand copy with no shared abstraction.**
  `DeckComparer.tsx:69/73` plus four flows in `PathEditor.tsx` (`:225,245,267,275,292`
  for add; `:326,330,335` for check; `:352,358,363` for diff-check). Comments at
  `PathEditor.tsx:188,191` assert a mirror relationship nothing enforces — and it has
  already drifted four ways, most notably PathEditor guarding inside `catch` (which
  DeckComparer does not need only because `generateUpgradePlan` swallows throws) and
  `runCheck`/`runDiffCheck` sharing one counter across two state slots. The
  path-builder UI is out of scope per §7; recorded so a future refactor of
  DeckComparer's guard knows it will not propagate.
- **The house gate pattern does not apply here.** Phases 2 and 3 both added gates
  with zero workflow changes by choosing a filename that rides an already-required
  job — _"pick the filename that lands the suite in a required job before inventing a
  job"_ (`test-plan.md:625-629`). Browsers cannot ride an existing job, so Phase 4
  reverts to the Phase 1 shape: new job plus branch protection.
- **Accessibility is the locator strategy.** With zero testids, the a11y tree _is_
  the test surface, so gaps in it are gaps in testability rather than a separate
  concern.

## Historical Context (from prior changes)

- `context/archive/2026-06-29-testing-server-boundary-auth/plan.md:331-390` — the only
  prior phase that added a CI job **and** changed branch protection. The precedent to
  copy.
- `context/archive/2026-06-29-testing-server-boundary-auth/plan.md:422-457` — its
  `## Migration Notes` keeps three falsified assumptions verbatim, "recorded here
  rather than quietly edited away, because each cost a CI round". The third is the one
  that matters: the deliberate-regression PR turned `integration` red as designed, but
  `main` had no protection, so nothing blocked — _"the whole Phase-4 claim that the
  suite 'gates PRs' rested on a convention, not an enforced rule."_
- `context/foundation/test-plan.md:578-585` — the rule that came out of it: _"A
  workflow file can only report; only a required status check blocks… run it as a PR,
  not locally."_
- `context/archive/2026-08-11-testing-api-contract-pinning/plan.md:707-757` and
  `context/archive/2026-08-19-testing-derive-to-persist/plan.md:557-620` — the
  deliberate-break protocol as a **dedicated final phase**. Ten steps; the two
  non-obvious ones are merging the change PR to `main` first (so the break forks from a
  `main` containing the new suite) and keeping gates 1..N-1 green by hand (Phase 2's
  break orphaned an import, and lint runs before typecheck, so the job would have died
  at the wrong gate — `test-plan.md:648-652`).
- `context/archive/2026-08-25-test-plan-refresh-2026-08-25/plan.md` — the refresh that
  scoped browser E2E in. `test-plan.md:789-796` holds the boundary: _"That is the whole
  of the inclusion. It is not a licence to browser-test a flow an integration or
  contract test already covers."_
- Prior phases each recorded their own refusal to reach for the browser
  (`.../testing-server-boundary-auth/plan.md:82`,
  `.../testing-api-contract-pinning/plan.md:108-109`,
  `.../testing-derive-to-persist/plan.md:108-110`) — the reasoning is on record, so
  this phase should not re-litigate it.

## Related Research

- `context/foundation/test-plan.md` §2 rows #7/#8 and their Risk Response Guidance rows
  — the risk statements this phase must satisfy; `/10x-e2e` reads them directly.
- `.claude/skills/10x-e2e/references/e2e-anti-patterns.md` — the five anti-patterns any
  generated spec is reviewed against, with the control question: _would this assertion
  fail if the risk materialized?_
- `.claude/skills/10x-e2e/references/e2e-quality-rules.md:10-24` — the canonical locator
  / wait / independence rules, already mirrored in `CLAUDE.md:1-31`.
- `.claude/skills/10x-e2e/references/seed-test-pattern.md` — `seed.spec.ts` is _"the
  primary E2E quality lever… what you show is what you get"_.

## Implied plan shape

Not a plan — the ordering constraints research turned up, for `/10x-plan` to use.

1. **Install + config + seed** (`/10x-implement`). `@playwright/test`,
   `playwright.config.ts`, `.gitignore` entries, `test:e2e` script, `seed.e2e.ts`.
   Must land first: `/10x-e2e` refuses to run without it, and an uninstalled runner
   breaks the existing `typecheck` gate.
2. **Risk #7 spec** (`/10x-e2e`). Transport failure → banner + Retry; partial
   resolution → unresolved notice.
3. **Risk #8 spec** (`/10x-e2e`). Deferred-promise overlap via the CTA.
4. **CI job** (`/10x-implement`), then the branch-protection PATCH. Cannot precede
   step 2 — a job with no specs is not a gate.
5. **Deliberate-break PR** (`/10x-implement`), per house style.

Budget check: `.claude/skills/10x-e2e/SKILL.md:238` caps this at _"one test per risk,
rarely more than 1–3 per phase"_ — two risks, two specs, one per file.

## Decisions Taken

Settled with the user on 2026-08-27, after research and before planning. These are
binding inputs to `/10x-plan`, not suggestions.

1. **Accessibility: fix only what the risks need.** Add `role="alert"` to the error
   banner (`DeckComparer.tsx:217`) and an accessible name to the unresolved notice
   container (`UnresolvedNotice.tsx:62`). Both are one-line semantic corrections that
   are right independently of testing. **The merged-row add/remove gap
   (`MergedRow.tsx:51-113`) is NOT fixed** — the specs avoid it by asserting against
   the columns view, and the gap is recorded as a finding instead. Rationale: keeps the
   production change minimal against §7's exclusion of UI work, and avoids introducing
   the codebase's first `data-testid`.

2. **Risk #7 spec targets the row as written.** Induce a transport failure and a partial
   resolution through `page.route()`; assert the error banner plus `Retry` and the
   unresolved notice actually render. The spec passes green as a regression guard, keeps
   faith with the §2 row `/10x-e2e` consumes as an interface, and builds the interception
   scaffolding risk #8 needs anyway.

   **The two contradictions go to `findings.md`, not to a spec.** Finding (A)
   (`plan.ts:90-92` discarding `parsed.malformed`, so unparseable input renders as "paste
   a deck list") and finding (B) (`DeckComparer.tsx:251-254` claiming identity when the
   differing cards failed to resolve) are **live defects** — a spec for either fails red
   today, which would make this a bug-fix phase rather than a coverage phase. They are
   filed for a separate change, following the Phase 2 house pattern
   (`context/archive/2026-08-11-testing-api-contract-pinning/findings.md`, F-numbered with
   Where / Observed / Impact / Why deferred / Suggested owner).

3. **Retries: `1` globally, `0` on the risk #8 spec.** `playwright.config.ts` sets
   `retries: process.env.CI ? 1 : 0`; the ordering spec overrides with
   `test.describe.configure({ retries: 0 })`. Ordinary infrastructure flake is absorbed in
   CI without ever letting a genuine out-of-order bug retry its way to green — which would
   defeat the only test that covers it.

4. **Finding E is recorded as not-promoted in §2, not made a risk.** The silent quantity
   degradation at `resolve.ts:99-102` gets a line in §2's existing "Not promoted to the
   map" paragraph, citing the layers that already document it
   (`plan.test.ts:65-78`, `resolve.ts:70-75`). It does not become risk #9: the map is
   already at eight rows against a 5-7 budget, and the failure is not browser-only — it
   needs a crafted collection response, so E2E is not obviously its cheapest layer.

   _Note for the plan:_ this is an edit to `context/foundation/test-plan.md` §2, so it
   belongs in whichever phase already touches that file (the §5/§6 status updates), not in
   a phase of its own.

## Open Questions

1. **`context/foundation/lessons.md` does not exist**, though `/10x-e2e:109` and
   `/10x-lesson` both expect it. Several durable rules surfaced here are lesson-shaped: the
   debounce-defeats-overlap trap, the `.dev.vars` local/CI DOM divergence, and the
   five-site guard copy-paste. Worth a `/10x-lesson` pass, but not a blocker for this plan.
2. **Stale docs noticed in passing**, out of scope for this change: `roadmap.md:64`'s
   Baseline testing bullet is stamped 2026-06-27 and predates all three rollout phases;
   `AGENTS.md` still says CI runs on `master`.
3. **Node version drift**, pre-existing: local 24.11.1, CI pins 22 (`ci.yml:16`), `.nvmrc`
   says 22.14.0. Not e2e-specific, but Playwright is the kind of dependency where that gap
   eventually surfaces.
