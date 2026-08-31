# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-25 (refresh applied. §3 Phases 1–3 remain `complete`
> and Phase 4 is open at `not started` — the comparer's failure-surfacing,
> risks #7 and #8. Browser E2E is in scope for that phase only; component
> render and pixel tests stay out (§7). §6.5 is filled, so no cookbook
> sub-section is a stub, and §8 records the three grounding claims this
> refresh corrected rather than implemented.)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression. For DeckDelta this means: defend the server boundary
   (`/api/paths/*`, middleware) and the derive→persist correctness at the
   integration layer; do not re-test the pure-logic engine that the 20-file
   Vitest suite already covers, and do not reach for browser/E2E until the
   logic boundary is locked.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data. The top risk here —
   cross-owner path access — is a lived incident (an RLS policy that looked
   right but a query path bypassed), not a documented requirement.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/components`, `src/lib`,
`src/pages`, `src/middleware.ts` — excluding tests, build output, and the
retired `src/lib/history`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                  | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A signed-in user reads or mutates **another owner's** upgrade path because a query path bypasses RLS or skips an ownership check on `/api/paths/*`                                       | High   | High       | interview Q1 (top fear) + Q2 (lived incident: RLS looked right, a query path bypassed it, rows leaked cross-tenant); hot-spot dir `src/pages/api` (8 commits/30d); abuse lens (authorization / IDOR) |
| 2   | An **unauthenticated or expired-session** request reaches `/api/paths/*`, or a gated route (`/paths`, `/dashboard`) is served while signed-out — or a signed-in owner is wrongly bounced | High   | Medium     | roadmap baseline (middleware gates `/paths`/`/dashboard`); interview Q4 (server boundary untested); hot-spot dir `src/components/auth` (12 commits/30d); abuse lens (access)                         |
| 3   | A handler's **request/response contract changes** and a stale caller still references the old shape — a path-builder flow breaks silently                                                | Medium | Medium     | interview Q3 (changing API handlers, fear of a forgotten reference to the old one); hot-spot dir `src/pages/api` (8 commits/30d)                                                                     |
| 4   | A diff-mode checkpoint **persists a list that does not equal `prior frozen list ± delta`**, silently corrupting an immutable saved step                                                  | High   | Medium     | prd-v3 §Guardrails (derived-snapshot correctness) + §Success Criteria; hot-spot dir `src/lib/path` (23 commits/30d)                                                                                  |
| 5   | An **unapplicable delta** (`− card` absent from the prior list) or an **unresolved `+ card`** is silently dropped at persist instead of being flagged before save                        | High   | Medium     | prd-v3 FR-003 / US-02 + PRD §Guardrails (graceful input handling, no silent omission); hot-spot dirs `src/lib/card-data` (23) + `src/lib/path` (23 commits/30d)                                      |
| 6   | The **preserved full-paste add flow or the resolve/diff/cost engine** regresses behind the additive diff-mode change                                                                     | Medium | Medium     | prd-v3 FR-005 / FR-007 (preserved behavior promise); hot-spot dirs `src/lib/deck` (29) + `src/lib/path` (23 commits/30d)                                                                             |
| 7   | A partial resolution or a card-data transport failure reaches the user as a plan that **looks complete**, because the unresolved notice or the retryable error banner never renders      | High   | Medium     | interview 2026-08-25 (comparer is the live surface); hot-spot dir `src/components/deck` (1 commit/30d, 18 commits/90d); §4 records no browser or render layer, so this wiring is covered at no layer |
| 8   | A slow earlier comparison resolves **after** a newer one and clobbers it, so the user reads an upgrade plan built from deck text they have already replaced                              | Medium | Low        | interview 2026-08-25 (comparer is the live surface); hot-spot dir `src/components/deck` (1 commit/30d, 18 commits/90d); §4 lists no browser or render layer; guard stable since first commit ⇒ Low   |

**Impact × Likelihood rubric.** High = user loses access/data/money or failure
is publicly visible / area changes weekly or already burned us. Medium =
feature degrades, workaround exists / touched occasionally, has been a bug
source. Low = cosmetic / stable code. Risk #1 is the only High × High — the
lived cross-tenant incident plus the most-churned untested boundary — so it
is protected first.

**Eight rows, against the schema's 5–7.** Rows #1–#6 are retained rather than
merged or dropped, because §3 Phases 1–3 cite those numbers and the schema
forbids renumbering — so the overflow is recorded here rather than avoided by
rewriting settled history. #7 is High × Medium, which leaves #1 the only
High × High. #8 is deliberately last and is the weakest row in the map: it is
promoted because it rides Phase 4's harness at near-zero marginal cost and is
deterministically reproducible in a browser, not because anything suggests a
live defect. A future refresh may prefer to split §2 into protected and open
sets rather than let the map keep growing.

Not promoted to the map (recorded so the rollout doesn't silently widen):
card misidentification from Scryfall resolution (already unit-tested plus a
live test; external-source drift is better served by the existing live test
and observability than a rollout phase) and secret/PII leakage (small scale,
Supabase anon key is expected-public) — both are folded into Phase 1
research as one-line checks rather than their own rows.

Also considered and not promoted: an upgrade-plan **cost total that
under-reports** because some cards carry no price. The computation is already
covered at §4's `unit (logic)` layer across every case including the
all-unpriced one, and pinned by that layer's engine goldens (recipes §6.1 and
§6.3 rule 9); the surface already discloses the gap rather than showing a
false zero. The only residual slice is the render of that disclosure, which
§7 excludes as component rendering — so there is no layer this row could buy.
Recorded so a future refresh does not re-propose it.

Also considered and not promoted, surfaced by Phase 4 research: an upgrade plan that is
**quantitatively wrong and says nothing about it**. When a `/cards/collection` batch
leaves two or more residual cards, `resolve.ts:99-102` declines to guess the association
and records nothing, so `quantifyResolved` falls back to one copy (`resolve.ts:240`,
again at `quantity.ts:47`) — `3 Jace the Mind Sculptor` renders as a single copy with no
`unresolved` entry and no notice. The degradation is **deliberate** (guessing a pairing
would silently swap copy counts, which is worse) and is documented as such at
`resolve.ts:70-75` and pinned as a case at `src/lib/deck/plan.test.ts:65-78`. It is not
made risk #9 for two reasons: the map is already at eight rows against the schema's 5–7,
and the failure is not browser-only — it needs a crafted collection response, so E2E is
not obviously its cheapest layer. What it shares with #7 is the shape — a plan that reads
as complete while being wrong — so a future refresh weighing #7's family should weigh
this with it rather than rediscovering it.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                    | Must challenge                                                                                           | Context `/10x-research` must ground                                                                                                                  | Likely cheapest layer                                                                                         | Anti-pattern to avoid                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Owner A requesting Owner B's `path_id` is denied, and B's rows are never returned through any read/write route                                 | "logged in ⇒ authorized for this resource"; "an RLS policy exists ⇒ every query path is actually scoped" | the real handler→query path for each `/api/paths/*` route; how the cookie-bound Supabase client scopes the owner; what enforces ownership beyond RLS | integration against the **real** handler + DB (local Supabase), not a mock that can't reproduce an RLS bypass | happy-path-only (owner reads own path and calling it "auth tested"); asserting the policy SQL instead of exercising the live query path |
| #2   | No-session and expired-session requests get 401/redirect on the API; gated routes redirect when signed-out; a valid owner still gets through   | "middleware runs on every protected path"; "build-green ⇒ the gate works"                                | middleware matcher coverage; session/cookie shape on expiry; the redirect target for signed-out access                                               | integration                                                                                                   | testing only the signed-in path; mocking away the session check so the gate is never exercised                                          |
| #3   | A change to a handler's shape makes a stale caller's test fail loudly rather than silently breaking the flow                                   | "all callers get updated together with the handler"                                                      | the request/response contract of each `/api/paths/*` route and who consumes it                                                                       | contract + integration                                                                                        | mirroring the handler's _current_ output as the expected value (oracle problem — pins the bug, not the contract)                        |
| #4   | The persisted list equals an **independently constructed** `prior ± delta`, verified through the POST→persist path, not just the pure function | "the derive logic is unit-tested, so the wired flow must be correct too"                                 | the derive→resolve→persist seam; the frozen prior-snapshot source the delta reads from                                                               | integration                                                                                                   | building the "expected" list by calling the same derive function under test (tautological oracle)                                       |
| #5   | An unapplicable or unresolved line blocks-or-flags the save; the wrong snapshot is never persisted                                             | "no error returned ⇒ everything resolved/applied"                                                        | where the surfacing/rejection happens before persist; how `− not present` vs `+ unresolved` differ                                                   | integration                                                                                                   | happy-path-only; asserting the _absence_ of an error rather than the _presence_ of the flag/rejection                                   |
| #6   | The engine's golden output is unchanged and a full-paste add still produces an identical snapshot after the diff-mode change                   | "an additive change cannot touch the preserved path"                                                     | the engine's stable output contract; the full-paste add-flow seam                                                                                    | golden output + integration                                                                                   | duplicating the existing strong unit suite instead of pinning the engine output and the add-flow seam                                   |
| #7   | A partial resolution and a transport failure each surface their own notice in the rendered plan, instead of a plan that reads as complete      | "a plan rendered means a plan complete"; "the resolver returned the outcome ⇒ the user was told"         | the outcome-to-render seam: which rendered surface owns each resolver outcome, and what the retry affordance does on a transport failure             | browser E2E (§3 Phase 4) — the notice exists only once rendered; the outcomes are already unit-owned          | a happy-path browser test that never induces a partial resolution or a transport failure, so no notice is ever exercised                |
| #8   | Two overlapping comparisons resolve out of order and the rendered plan matches the newest input, never the superseded one                      | "the token guard exists, so ordering is safe"; "the newer request always resolves last"                  | the ordering guarantee: what marks a resolution stale, and where an out-of-order arrival is dropped before it reaches the rendered plan              | browser E2E (§3 Phase 4) — rides Phase 4's harness; needs two real in-flight resolutions to overlap           | a test that passes because it never actually overlaps two runs — sequential awaits cannot reproduce an out-of-order arrival             |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                       | Goal (one line)                                                                                                                                                                  | Risks covered | Test types                      | Status   | Change folder                                                                  |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------ |
| 1   | Server-boundary auth & ownership | Prove cross-owner isolation and the signed-out gate on `/api/paths/*` + middleware, and make CI run the suite                                                                    | #1, #2        | integration + CI gate           | complete | context/archive/2026-06-29-testing-server-boundary-auth/ (archived 2026-08-11) |
| 2   | API contract pinning             | Freeze `/api/paths/*` request/response shapes and the engine golden output so a stale caller or preserved-flow regression fails loudly                                           | #3, #6        | contract + integration + golden | complete | context/archive/2026-08-11-testing-api-contract-pinning/ (archived 2026-08-19) |
| 3   | Derive-to-persist correctness    | Prove the persisted snapshot equals `prior ± delta` and that unapplicable/unresolved lines are flagged, not silently dropped                                                     | #4, #5        | integration                     | complete | context/changes/testing-derive-to-persist/                                     |
| 4   | Comparer failure-surfacing       | Prove the comparer surfaces its own failures — a partial resolution or a card-data transport failure is visible in the rendered plan — and never renders a superseded comparison | #7, #8        | browser E2E                     | complete | context/changes/testing-comparer-failure-surfacing/                            |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened`
→ `researched` → `planned` → `implementing` → `complete`.

Order rationale: Phase 1 defends the only High × High risk (a lived incident
on the most-churned untested boundary) and unlocks signal for everything
after it by wiring `npm test` into CI (health-check Fix #1 — CI currently
runs lint + build but not the tests). Phase 2 hardens the churny API
contract surface the team changes without confidence (interview Q3). Phase 3
closes the correctness guardrail on the newest feature (diff-mode derive).
Phase 4 is that sequencing paying out, not reversing it: interview Q4 gated
browser work behind the logic boundary, Phases 1–3 locked that boundary, so
browser E2E now enters scope — narrowly, for the comparer's failure-surfacing,
where the notice exists only once rendered. Frontend/component render and pixel
testing stay deliberately **out** (see §7): their deferral rested on the UI
being unstable, and Phases 1–3 did not change that.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                        | Tool                          | Version | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit (logic)                 | Vitest                        | ^4.1.9  | `node` env, `src/**/*.test.ts`, `@/*` alias. All pure-logic (`src/lib/{card-data,deck,path}` + deck helpers). `npm test` → `vitest run`. Includes the `*.golden.test.ts` engine goldens with committed `__snapshots__/*.snap` — see §6.3 rule 9.                                                                                                                        |
| integration (API + boundary) | Vitest + local Supabase       | ^4.1.9  | `tests/integration/**/*.int.test.ts` via `vitest.integration.config.ts`; `npm run test:integration`. Real HTTP through a `globalSetup`-spawned `astro dev` against local Supabase with RLS live — never a mock that can't reproduce an RLS bypass. Recipe in §6.2.                                                                                                      |
| contract                     | Vitest                        | ^4.1.9  | `tests/integration/contract-*.int.test.ts` — rides the `integration` job via the `.int.` infix. Pins request/response shapes of `/api/paths/*` and `signin`'s 302 against the decided-contract table, with the declared types in `src/lib/api/contract.ts` gated by `npm run typecheck`. Recipe in §6.3.                                                                |
| live (external)              | Vitest                        | ^4.1.9  | `src/lib/card-data/scryfall.live.test.ts` — network-dependent Scryfall check; keep for card-data-accuracy drift signal.                                                                                                                                                                                                                                                 |
| e2e (browser)                | Playwright                    | ^1.62.1 | `tests/e2e/**/*.spec.ts` via `playwright.config.ts`; `npm run test:e2e`. Chromium only, against a Playwright-managed `astro dev` on port 4323, with **all** Scryfall traffic intercepted — no Supabase, no auth, no external network. Rides its own `e2e` CI job (see §5). Scope is held by §7: the comparer's failure surfacing, not component render. Recipe in §6.7. |
| component render             | none (no jsdom/RTL by design) | —       | **deliberately deferred — see §7** (interview Q5: frontend later).                                                                                                                                                                                                                                                                                                      |

**Stack grounding tools (current session):**

- Docs: **Context7** available — can ground current Vitest 4 / Astro 6 / Supabase SSR / Cloudflare Workers test-setup APIs (e.g. `unstable_dev`, cookie-bound client testing), and Playwright's when Phase 4 plans. Versions re-confirmed rather than changed: declared `astro ^6.3.1` resolves to 6.4.8 and `vitest ^4.1.9` resolves to 4.1.9, so "Vitest 4 / Astro 6" still reads correctly; checked: 2026-08-25
- Search: **general web search available** — built-in web search/fetch, plus a `web_search` tool on two connected MCP servers; still **no Exa.ai or dedicated docs-search MCP**, so Context7 stays the grounding path for framework APIs; checked: 2026-08-25
- Runtime/browser: browser-test tooling exists **as skills, not as an MCP server** — a dedicated E2E workflow skill in this repo (`/10x-e2e`, which reads §2's risk rows directly) plus a Playwright-driven web-app testing skill in the session; **no Playwright MCP server is exposed**, so nothing in-session drives a browser on its own. Both halves matter: the first is why §3 Phase 4 is openable at all, the second is why the runner and harness choice is still that phase's research to make; checked: 2026-08-25
- Provider/platform: **Supabase** via CLI/skill only (no DB MCP); `gh` CLI available — it carried the CI test-step change in Phase 1 and the branch-protection re-reads recorded in §5; checked: 2026-08-25

Use docs MCPs for current framework/library APIs and setup details. Do not
use MCP docs/search to infer code failure anchors; those belong in per-phase
`/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout phase
lands; before that, the gate is `planned`.

| Gate                          | Where      | Required?                                                                                                                         | Catches                                                                                                                                                      |
| ----------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| lint                          | local + CI | required (already wired)                                                                                                          | `eslint .` with `strictTypeChecked` — type-aware rules, but **not** assignability errors; see the typecheck row                                              |
| typecheck                     | local + CI | **required (wired §3 Phase 2)** — `npm run typecheck` (`astro check`) in the `ci` job between lint and unit                       | type drift, and the declared `/api/paths/*` wire contract (`src/lib/api/contract.ts` plus the explicitly parameterized `jsonResponse<T>` / `requestJson<T>`) |
| build                         | local + CI | required (already wired)                                                                                                          | broken Astro build (`astro build` does **not** typecheck)                                                                                                    |
| unit (logic)                  | local + CI | **required (wired §3 Phase 1)** — `npm test` in the `ci` job between typecheck and build                                          | logic regressions                                                                                                                                            |
| golden (engine output)        | local + CI | **required (wired §3 Phase 2)** — the `*.golden.test.ts` files ride `npm test` in the `ci` job                                    | silent drift in the diff/cost engine's rendered output, or in the preserved full-paste add flow                                                              |
| integration (API + ownership) | local + CI | **required (wired §3 Phase 1)** — `npm run test:integration` in the separate `integration` job, against an ephemeral local stack  | cross-owner leak, signed-out gate failures                                                                                                                   |
| contract (`/api/paths/*`)     | local + CI | **required (wired §3 Phase 2)** — the `contract-*.int.test.ts` files ride `npm run test:integration` in the `integration` job     | stale-caller / changed-shape breaks                                                                                                                          |
| derive-to-persist integration | local + CI | **required (wired §3 Phase 3)** — `derive-persist.int.test.ts` rides `npm run test:integration` in the `integration` job          | corrupted or silently-wrong snapshots — a persisted checkpoint that is not `prior ± delta`, or a dropped unapplicable/unresolved line                        |
| e2e on critical flows         | CI on PR   | planned (§3 Phase 4) — no job wired and no runner installed; aspirational until its job name sits in `main`'s required-check list | once Phase 4 lands: a comparer failure that still renders as a complete plan (risk #7), and a superseded comparison clobbering a newer one (risk #8)         |

The load-bearing gate change **landed in Phase 1**: `.github/workflows/ci.yml`
now runs `npm test` between lint and build, plus a separate `integration` job
that boots an ephemeral local Supabase and runs `npm run test:integration`, so
both suites actually gate PRs. CI green is no longer false confidence on the
server boundary. The integration job sources its keys — including service-role —
from `supabase status` on the running stack, so no long-lived service-role
secret exists in the repo or in Actions secrets.

**Phase 2 added two gates and no jobs.** The contract suites carry the `.int.test.ts`
infix, so `vitest.integration.config.ts` globs them and they ride the already-required
`integration` job; the engine goldens are plain `src/**/*.test.ts` files, so they ride
`npm test` in the already-required `ci` job. No job name was added and no
branch-protection change was needed — the cheap way to add a gate here, and worth
copying in Phase 3.

**Phase 3 copied it: one gate, no jobs, no workflow change.** `derive-persist.int.test.ts`
carries the same `.int.` infix, so it rides `npm run test:integration` in the
`integration` job. The required-check list on `main` was re-read before claiming the
row — `["ci", "integration"]` with `enforce_admins: true` and `strict: false`, verified
2026-08-20 via `gh api repos/…/branches/main/protection` — so `integration` was already
required and no branch-protection change was needed. Stating that explicitly is the
point: per Phase 2's lesson, "the suite will catch it" is a claim about a CI step, so
the row is only honest once the job name has been confirmed present in that list.
Phase 3 also widened what the `ci` job gates without touching it, for the same reason:
`verify.test.ts` and the Phase 1 canonicalization cases are plain `src/**/*.test.ts`
files and ride `npm test`.

The one workflow change Phase 2 did need was `npm run typecheck`. Until it landed,
**nothing in the pipeline typechecked**: `eslint` is type-aware but does not report
assignability errors, and `astro build` does not typecheck at all (`astro check` is a
separate command). So the single row that used to read "lint + typecheck — required
(already wired)" was half aspirational, and the declared wire types would have gated
nothing. The rows above are now split so the distinction stays visible.

**"Required" means required on the branch, not just in the workflow file.**
`main` carries classic branch protection with `ci` + `integration` as required
status checks and `enforce_admins: true`. Verified 2026-08-11 by a PR that
deliberately widened the `path_steps` RLS policy to `using (true)`: `integration`
went red on the step-route DELETE test, `ci` stayed green, and the PR reported
`mergeStateStatus: BLOCKED`. Re-verified 2026-08-19 for the Phase 2 gates by PR #5,
which returned the raw DB row from `POST /api/paths/[id]/steps`: `ci` went red on
`typecheck` in 1m07s, and with the type argument dropped so the break compiled,
`integration` went red alone on `contract-steps.int.test.ts` — both runs `BLOCKED`
with `mergeable: MERGEABLE` (see §6.6). Two consequences for contributors: every change to
`main` — including docs-only ones — goes through a PR, and adding a gate to this
table also means adding its job name to the required-check list, or the row is
aspirational.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section reads "TBD — see
§3 Phase N."

### 6.1 Adding a unit test (logic)

- **Location**: next to the unit under test, e.g. `src/lib/deck/<module>.test.ts`.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/path/derive.test.ts` (derive correctness),
  `src/lib/deck/plan.test.ts` (engine output).
- **Run locally**: `npm test`.

### 6.2 Adding an integration test (API + ownership)

- **Location**: `tests/integration/<risk>.int.test.ts` — outside `src/`, so
  `npm test` (which globs `src/**/*.test.ts`) never picks it up.
- **Naming**: `<risk-or-surface>.int.test.ts`. The `.int.` infix is what
  `vitest.integration.config.ts` globs.
- **Reference tests**: `ownership-steps.int.test.ts` (cross-owner + DB-state
  read-back), `gate-api.int.test.ts` (401 gate), `smoke.int.test.ts` (thinnest
  possible harness proof).
- **Prerequisite**: local Supabase up (`npx supabase start`) and `.env.test`
  filled from `npx supabase status` (copy `.env.test.example`). With Supabase
  down the suite fails fast with that instruction, not a timeout.
- **Run locally**: `npm run test:integration`. CI runs it in a separate
  `integration` job against an ephemeral stack.

The recipe, and why each piece is load-bearing:

1. **Separate Vitest config**, not a second glob in the unit config
   (`vitest.integration.config.ts`): loads `.env.test` into `process.env`,
   forwards only the needed keys to worker forks via `test.env`, and keeps
   `npm test` fast and DB-free. Real env vars win over the file, so CI
   overrides without writing one.
2. **`globalSetup` spawns a real `astro dev`** (`tests/integration/global-setup.ts`)
   and polls until it answers. There is nothing in-process to mock without
   bypassing the thing under test — the session check is one real network call
   in middleware, and RLS only applies to a real query.
3. **The dev server needs the env, not just the test process.** It gets the
   local URL + **anon** key only. The service-role key stays in the test
   process (admin seeding, teardown, DB read-back) and is never handed to the
   server.
4. **`.dev.vars` is overridden, not just the spawn env.** The Cloudflare
   adapter resolves `astro:env/server` from `.dev.vars` via `getPlatformProxy`,
   which _wins_ over injected env. Setup snapshots the contributor's real file
   to a `.intbak` sidecar and restores it on teardown; a leftover sidecar from
   a killed run is recovered before the next snapshot.
5. **Seed owners via the admin API, then sign in through the app's own
   `/api/auth/signin`** (`helpers/owners.ts`) with `redirect: "manual"` so the
   302 doesn't swallow `Set-Cookie`. Reassemble every `sb-*` cookie (including
   the chunked `.0`/`.1` parts) into one replayable `Cookie` header. Hand-built
   cookies would test a shape the app doesn't actually emit.
6. **For the invalid-session case use `corruptCookies()`** — keep the real
   cookie _names_, replace the values. A garbage token is the faithful proxy
   for expiry: both collapse to the same observable behavior (302 for pages,
   401 for the API), and no truly time-expired JWT has to be minted.
7. **Denial is `404` (single resource) or a filtered `200` (list), never
   `403`.** RLS makes other owners' rows invisible, so the handler cannot tell
   "absent" from "not yours." Assert 404 + row absence.
8. **Assert DB state, not just status, on any mutating cross-owner test.**
   Read back with the service-role client (`helpers/owners.ts`). A 404 alone
   would still pass if a too-broad policy 404'd the client _and_ wrote the row.
   This is the whole point of the `path_steps` tests — that table has no
   `owner_id` and is protected transitively by an `EXISTS` subquery.
9. **Self-seed and self-clean.** Unique timestamp-suffixed emails; delete
   owners in `afterAll` (`helpers/cleanup.ts`) and let `on delete cascade`
   drop their paths and steps. No `seed.sql` fixtures — the suite must pass
   twice in a row.
10. **Never use service-role for an assertion's subject.** Setup, teardown and
    read-back only; asserting through a privileged client would bypass the
    mechanism under test.

Execution is serialized (`fileParallelism: false`, `pool: "forks"`) because the
suite shares one DB and one dev server, with `testTimeout`/`hookTimeout` raised
to 30s for boot + real network round-trips.

### 6.3 Adding a contract test for `/api/paths/*`

- **Location**: `tests/integration/contract-<surface>.int.test.ts`. Same harness as
  §6.2 — a contract pin is worthless against a mock of the thing it pins, so it
  runs over real HTTP with RLS live. The `contract-` prefix is convention; the
  `.int.` infix is what `vitest.integration.config.ts` globs, and that is what
  makes the suite ride the already-required `integration` job (see §5).
- **Naming**: `contract-<surface>.int.test.ts`.
- **Reference tests**: `contract-paths.int.test.ts` (list / create / read / rename /
  delete, incl. the `{path, steps}` envelope and both `204`s),
  `contract-steps.int.test.ts` (the `PathStep` body, server-owned `position`, the
  `deltaText` rule, and the snapshot round-trip),
  `contract-signin.int.test.ts` (the harness's own foundation: 302 + `Location` +
  chunked `sb-*` cookies), `contract-page-agreement.int.test.ts` (the API and the
  SSR page agree on step order).
- **Prerequisite / run locally**: identical to §6.2 — local Supabase up
  (`npx supabase start`), `.env.test` filled, then `npm run test:integration`.
- **Engine goldens live elsewhere**: `src/lib/<module>/<name>.golden.test.ts`, picked
  up by `npm test` in the `ci` job. Reference: `src/lib/deck/diff.golden.test.ts`,
  `src/lib/path/add-flow.golden.test.ts`.

The recipe, and why each piece is load-bearing:

1. **Write the contract down before writing an assertion, and cite the writing —
   never the handler.** A contract test that expects what the code currently emits
   pins the bug (the oracle problem). The decided-contract table in
   `context/changes/testing-api-contract-pinning/plan.md` is the oracle: one row per
   route giving status + success body, plus a second table for every error body. Each
   row is marked **`documented`** (an archived design doc specifies it, independently
   of today's code) or **`decided`** (the docs are silent and the plan made the call,
   with the reason). Extend that table before pinning a new route; a `decided` row is
   a real decision, so record why.
2. **Mark each assertion with its oracle in a comment.** Every test in the suites
   carries a one-line `// documented (…)` or `// decided (…)` comment restating the
   row it pins. It is how a reviewer checks the test against the contract instead of
   against the code, and how a future contributor knows that changing an expectation
   means changing a decision.
3. **Key sets are closed, and the expected key lists are literal strings.** Assert
   through `helpers/shape.ts` (`expectUpgradePath`, `expectPathStep`,
   `expectApiError`, or `expectExactKeys` for a one-off envelope): a body must carry
   _exactly_ the contract's keys — no extras, none missing. Two consequences worth
   the strictness: an additive field becomes a deliberate test edit rather than a
   silent pass, and a raw-DB-row regression fails on both halves at once (snake_case
   keys extra, camelCase keys missing). The key arrays are hand-written strings on
   purpose — deriving them from the domain type, or from `Object.keys` of a live
   response, would make a rename rename the expectation too.
4. **Never assert a bare status code** — Phase 1's rule (§6.6) still holds. Route
   every status through `helpers/http.ts#assertStatus`, which puts the body in the
   failure message. Since Phase 2 a 500 body is redacted to `{error, ref}`, so the
   diagnosis is now: `ref` from the failure message, cause from the dev server's
   stderr, which `global-setup.ts` pipes to the parent.
5. **Send `Origin` on every mutating request.** Astro's `security.checkOrigin` answers
   **403 plain text** — before the handler runs — for a cross-origin non-GET that is
   form-like _or carries no `content-type` at all_, which includes both bodyless
   `DELETE` routes. `helpers/paths.ts` and `helpers/owners.ts` already set it; a
   hand-rolled `fetch` in a new test must too, or you will pin a CSRF rejection and
   think you pinned the route.
6. **Declare the shape in `src/lib/api/contract.ts` and let `tsc` gate the cheap
   half.** A test can only catch drift that ships; a type catches it at the keyboard.
   The mechanism is the _explicit_ type argument at each call site —
   `jsonResponse<UpgradePath>(toUpgradePath(row), 201)` server-side,
   `requestJson<PathStep>(…)` in the island. A bare `jsonResponse(…)` infers `T` from
   its argument and checks nothing. This only gates because `ci` runs
   `npm run typecheck`; see §5.
7. **Round-trip anything stored, and compare deeply.** For a body that persists,
   POST a realistic fixture and read it back through the GET route — the seam is the
   column, not the handler. Use `helpers/snapshot.ts#realisticSnapshot()`
   (nullable prices, a null `imageUrl`, one entry per `unresolved` reason) rather than
   the `{cards: [], unresolved: []}` the ownership helpers send, which exercises none
   of the value-shaped seams. `jsonb` does not preserve key order, so the assertion is
   `toEqual`, never a serialized-string comparison.
8. **Self-seed, self-clean, unique names.** Same as §6.2 rules 9–10: a dedicated owner
   per `describe` where the assertion is about a _list_, timestamp-suffixed titles and
   step names, `deleteOwners` in `afterAll`, and service-role only for setup /
   teardown / read-back — never as an assertion's subject.
9. **Goldens: `.snap` files are committed, and never run `-u` blind.** `.gitignore`
   has no `*.snap` / `__snapshots__` entry deliberately — the recorded value _is_ the
   pin, so it belongs in review. Vitest refuses to write new snapshots when `CI` is
   truthy, so a missing, mismatched **or obsolete** snapshot fails the run rather than
   being silently created; GitHub Actions sets `CI=true`, which makes that guard
   structural. When a golden legitimately changes, diff the new recording against the
   fixture's hand-computed expectation _before_ accepting it — `-u` with an unread
   diff converts the gate back into a mirror of the code.
10. **Pick fixture numbers that are exact binary fractions** (`.25` / `.5` / `.75`).
    `planAddCost` accumulates raw floats and `PlanCost.total` is unrounded, so
    arbitrary prices record a reviewer-hostile `27.250000000000004`. The value is
    deterministic either way; this only decides whether a human can check it.
11. **When two code paths serve the same data, pin the agreement, not just each side.**
    `GET /api/paths/[id]` and `src/pages/paths/[id].astro` run the same mappers and
    ordering independently. `contract-page-agreement.int.test.ts` seeds
    distinctively-named steps and compares each name's `indexOf` in the page's raw
    HTML against the API's `steps[].name` order — a divergent `.order()` clause fails,
    with no markup parsing and no component test (§7 stays intact).

### 6.4 Adding a derive-to-persist correctness test

- **Location**: `tests/integration/derive-persist.int.test.ts`, fixtures in
  `tests/integration/helpers/derive.ts`. Same harness as §6.2 — the claim is about the
  `jsonb` column and the route, so a mock of either proves nothing. The `.int.` infix is
  what makes it ride the already-required `integration` job (see §5).
- **Naming**: `<seam>-persist.int.test.ts`.
- **Reference tests**: `derive-persist.int.test.ts` (the whole seam),
  `src/lib/path/verify.test.ts` (the pure rule set the route enforces),
  `src/lib/path/add-flow.golden.test.ts` (the independent full-paste oracle at the unit
  layer).
- **Prerequisite / run locally**: identical to §6.2 — local Supabase up
  (`npx supabase start`), `.env.test` filled, then `npm run test:integration`.

The recipe, and why each piece is load-bearing:

1. **Check who actually derives before writing a single assertion.** The claim reads
   "the persisted snapshot equals `prior ± delta`", which sounds like a test-only task
   and is not: `deriveSnapshot` runs in the **browser**, and until Phase 3 the route
   stored whatever snapshot arrived. Verifying a client-side promise from the client
   side is circular. Find the party that can be held to the invariant — here, a pure
   server-side `verifyDerived` the route calls — then test the wiring.
2. **Test the wiring, not the derivation.** `derive.test.ts`, `add-flow.golden.test.ts`
   and `verify.test.ts` own the branches, the multiset equality and the rule set. What
   only integration can show is that a derive whose prior came back out of `jsonb` still
   lands as the same holdings, that a chain does not drift, and that each refusal
   refuses. Re-deriving unit coverage here is the duplication §1 principle 1 forbids.
3. **Never build an expectation by calling the function under test.** A tautological
   oracle is the named anti-pattern for this risk. `deriveSnapshot` may appear exactly
   once — building the request payload the way `handleAddStep` does — and no persisted
   value may ever be compared against its output.
4. **Publish each delta next to two independent statements of its result**, in the
   fixture module rather than in the test: a hand-written holdings record, and the
   equivalent full-paste deck-list text. Keeping them adjacent is what stops a delta and
   its expectation from drifting; taking the second one through `resolveDeck` →
   `attachQuantities` is what makes it a genuine cross-check rather than a restatement.
5. **Compare holdings, never `cards` arrays.** Fold both sides to copies-per-card
   (`helpers/derive.ts#holdingsOf`) and `toEqual` the records. `jsonb` does not preserve
   array order and the two add flows emit their cards in different orders **by design**
   (see §6.6, Phase 2's third note), so an array comparison fails for a reason nobody
   cares about.
6. **Derive from the _persisted_ prior, not from the literal you posted.** Read the base
   back through the GET route and feed _that_ snapshot to the derive. The whole gap this
   suite exists to close is a chain that re-round-trips the same card objects at every
   step; posting a literal and deriving from the same literal never touches the column.
7. **Mock only the card-data edge, and only in the test process.**
   `vi.mock("@/lib/card-data", importOriginal)` with `resolveCards` replaced and
   `resolutionKey` kept **real**, so quantities join on exactly the key production uses.
   There is no cross-process concern precisely because the server never resolves a card
   in a request path — check that that is still true before relying on it.
8. **Build the mock's `ResolutionResult` through the sanctioned builders**
   (`src/lib/card-data/__fixtures__/resolution.ts`), never as an inline literal.
   `matched` is the association the quantity join runs through, and a _wrong_ `matched`
   quietly sends the join down its `?? 1` fallback — making a canonicalization test pass
   for the wrong reason.
9. **A canonicalizing name needs a hand-authored oracle.** The card-data source answers
   `Jace the Mind Sculptor` with `Jace, the Mind Sculptor`, a different `resolutionKey`.
   Before the join fix **both** add flows fell back to one copy there, so full-paste
   equivalence shares the defect and cannot see the class. Write the expected count out
   by hand.
10. **Assert the rejection _and_ the non-persistence.** A 400 alone would still pass if
    the route answered 400 and wrote the row anyway. Every refusal case checks the status
    through `assertStatus`, the exact body through `expectApiError`, and `countSteps`
    unchanged via the service-role read-back (§6.2 rule 8, same reasoning).
11. **Break narrowly, one rule at a time, and drive the cases from a `Record` over the
    reason set.** The verifier is layered and reports its **outermost** violated rule
    (§6.6, Phase 2's third closing note), so a submission that breaks two rules names the
    earlier one and the expected message is wrong. A `Record<DerivedViolation, …>` makes
    `tsc` demand a case for every new rule, mirroring the route's own message map.
12. **Expected messages are literal strings, transcribed from the decided contract.**
    There is no second implementation of "which rule broke", so the message cannot be
    cross-checked the way holdings can — and reading it back out of the response would
    assert nothing. Same reasoning as §6.3 rule 3's literal key arrays.
13. **A second derived column gets asserted, not enforced.** `list_text` is rendered
    from the derived cards and never re-parsed on read, so a disagreement with `snapshot`
    misleads a human rather than corrupting a plan. Parse it back and compare holdings in
    the suite; do not make it a 400.
14. **Prove the red is load-bearing with a break that reproduces a real seam.** Reverting
    the quantity join to its pre-fix form — one token, lint- and typecheck-clean — reddens
    the unit canonicalization case and the integration one together. Run it as a PR, not
    locally (§6.6, Phase 1's closing note), and keep the earlier gates green by hand or
    you measure the wrong one.

### 6.5 Adding a test for a new API endpoint

- **Test type**: integration (§6.2) plus a contract pin (§6.3). There is no new
  recipe here — this sub-section is the order to run the existing ones in, plus the
  two traps that belong to standing up a _new_ route rather than testing an
  existing one.
- **Location / naming / harness**: identical to §6.2 and §6.3 —
  `tests/integration/<risk>.int.test.ts` and
  `tests/integration/contract-<surface>.int.test.ts`. The `.int.` infix is what makes
  both ride the already-required `integration` job (see §5).
- **Prerequisite / run locally**: identical to §6.2 — local Supabase up
  (`npx supabase start`), `.env.test` filled, then `npm run test:integration`.

The sequence, and which recipe owns each step:

1. **Extend the decided-contract table before writing an assertion** — §6.3 rule 1.
   A new route has no archived design doc behind most of its rows, so most will be
   `decided`; record the reason for each. Skip this and the contract test pins the
   handler's current output instead of a decision.
2. **Declare the wire shape in `src/lib/api/contract.ts`, with the explicit type
   argument at every call site** — §6.3 rule 6. This is the half `tsc` gates, and it
   is free at the keyboard.
3. **If the route reads or writes a new table, assert the `grant` in the migration
   that creates it.** Privileges are checked _before_ RLS, so a table with correct
   policies and no grant answers `permission denied` to a valid JWT — and long-lived
   local volumes carry the `public`-schema defaults that hide it, so no local run can
   see the gap. This is the one trap a green local suite is structurally unable to
   catch; only a fresh stack is an honest verifier (§6.6, Phase 1).
4. **Write the ownership-scoped integration test** — §6.2. Cross-owner denial is 404
   or a filtered 200, never 403 (rule 7), and every mutating route needs the
   service-role read-back proving the row was not written (rule 8).
5. **Send `Origin` on every mutating request** — §6.3 rule 5. `security.checkOrigin`
   answers 403 plain text before the handler runs, including on the bodyless
   `DELETE`s, so a hand-rolled `fetch` that omits it pins a CSRF rejection and looks
   like a passing route test. The existing helpers already set it; a new one must too.
6. **Pin the response with closed key sets and hand-written literal key arrays** —
   §6.3 rule 3 — and round-trip anything the route persists through its own GET
   (rule 7), since the seam is the column, not the handler.
7. **Mock only the external HTTP edge (Scryfall), through the sanctioned builders** —
   §6.4 rules 7–8. Never mock an internal module or the RLS query path: a mock cannot
   reproduce the bypass the suite exists to catch.
8. **Self-seed, self-clean, unique timestamp-suffixed names** — §6.2 rule 9. The
   suite must pass twice in a row.
9. **Prove the red is load-bearing with a PR, not a local revert** — §6.6, Phase 1's
   closing note. A local revert shows the assertion fires; only the PR shows the gate
   blocks.

When the endpoint's failure mode is observable nowhere but the rendered page — a
notice that exists only once it is on screen — this is the wrong layer. That is §3
Phase 4's scope, and §7 holds the boundary.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

**Phase 1 (2026-08-11).** Three things cost real time and are worth knowing
before Phase 2:

- Injecting `SUPABASE_*` into the spawned `astro dev` env is **not enough** —
  the Cloudflare adapter resolves `astro:env/server` from `.dev.vars` via
  `getPlatformProxy`, which silently wins. The harness has to override that
  file (and restore it) or the suite quietly runs against the cloud project.
- Cross-owner denial surfaces as **404 / filtered 200, never 403**, so a
  status-only assertion is nearly worthless on mutating routes. The
  service-role read-back is what actually proves nothing leaked.
- Killing the dev server needs a **process-tree** kill (`taskkill /t` on
  Windows, negative-pid `SIGTERM` elsewhere); `child.kill()` alone orphaned
  the server and the next run collided on the port.

**The phase paid for itself on its first CI run.** Against a freshly created
stack, every authenticated query returned 500 —
`permission denied for table upgrade_paths` — while the 401 gate tests passed.
The first migration had created both tables and their RLS policies but never
granted table-level privileges, leaning on the `public` schema defaults a stack
bootstraps. **Privileges are checked before RLS**, so a valid JWT died before any
policy was consulted, and the policies (which are correct) were never the
problem. Long-lived local volumes and the existing cloud project carry those
defaults, so no local run could see it; any newly provisioned environment would
have had a dead `/api/paths/*`. Two durable rules follow:

- **Migrations must grant explicitly.** Never rely on implicit default
  privileges — assert the grant in the migration that creates the table.
- **A green local suite is not evidence for anything bootstrap- or
  privilege-shaped.** The local DB carries state a fresh one does not; CI on a
  fresh stack is the only honest verifier. This is also why the integration job
  boots its own stack rather than reusing a warm one.

And a harness rule the same failure taught: **never assert a bare status code.**
`expect(res.status).toBe(200)` discarded the `{"error": …}` body that named the
cause, turning a one-line diagnosis into a blind CI round. Route status checks
through `helpers/http.ts#assertStatus`, which puts the body in the message.

**Closing the phase surfaced one more rule: a suite that goes red is not a gate.**
The deliberate-regression PR proved the suite catches a cross-owner leak — and
proved that nothing stopped the merge, because `main` was unprotected. A workflow
file can only _report_; only a required status check _blocks_. So the last step of
wiring any gate is enabling it on the branch and watching a real PR report
`BLOCKED` — see §5. Corollary for the deliberate-break check itself: run it as a
PR, not locally. A local revert proves the assertion fires; only the PR proves the
red is load-bearing.

**Phase 2 (2026-08-18).** Four notes worth carrying into Phase 3 — three lessons this
phase learned the hard way, one correction it had to make to an earlier promise, and one
thing that went right cheaply enough to copy.

- **Nothing typechecked in CI, so "types as a contract gate" was a no-op.** The plan's
  load-bearing decision was to convert the top contract-drift seams into `tsc` errors
  rather than assertions — a declared `src/lib/api/contract.ts` plus an _explicitly_
  parameterized `jsonResponse<T>` / `requestJson<T>`. Both halves were written before
  anyone checked what actually ran the compiler: `eslint` is type-aware but does not
  report assignability errors, and `astro build` does not typecheck at all. The whole
  type layer was decorative until `npm run typecheck` (`astro check`) was wired into
  the `ci` job. Generalization: **"the types will catch it" is a claim about a CI step,
  not about the types.** Check which command enforces an invariant before counting it
  as a gate — the same mistake as Phase 1's "a workflow file can only report."
- **Redacting a 500 body silently destroys Phase 1's diagnosis rule.** The raw
  `PostgrestError.message` leaked table, column and constraint names, so it had to
  stop reaching the wire — but that message was exactly what made `assertStatus`
  useful (Phase 1's whole lesson came from reading
  `permission denied for table upgrade_paths` out of a CI log). `global-setup.ts`
  accumulated the spawned dev server's output into a local string and printed it
  **only** when boot failed, discarding it afterwards, so moving the detail
  server-side would have sent it nowhere. The fix is two changes that must land
  together: `serverError` logs the cause against a fresh `ref` and returns
  `{error: "Internal error", ref}`, and the harness pipes the child's stdout/stderr
  to the parent's stderr. Generalization: **when you redact a diagnostic channel,
  the replacement channel ships in the same commit**, and something has to correlate
  the two ends — here, the `ref`.
- **A doc promise was stronger than the code, and only the live copy was fixable.**
  The archived diff-style-checkpoint-entry plan called a derived snapshot
  "byte-equivalent" to a full-paste one. It is not: `deriveSnapshot` emits `working`
  Map insertion order while full paste emits the resolver's order, so the guarantee is
  **multiset** equality. Nothing verified it in either direction. The goldens now pin
  the real guarantee (and re-run the comparison with the mock's `resolved` array
  permuted, so the equality cannot be an artifact of fixture order), and the live
  docstring at `src/lib/path/derive.ts` was corrected. The two archived copies are
  immutable per CLAUDE.md and **stand superseded** — cite this note, not them.
  Generalization: when a claim spans archive and code, correct the code's copy and
  record the supersession somewhere live; do not weaken a test to match a stale doc.
- **Two gates, no new jobs.** Naming the contract suites `contract-*.int.test.ts` and
  the goldens `*.golden.test.ts` put them inside the already-required `integration`
  and `ci` jobs, so §5 gained two required rows with zero branch-protection work.
  Worth copying in Phase 3: pick the filename that lands the suite in a required job
  before inventing a job.

**Phase 2, the closing gate check (2026-08-19).** The deliberate-break PR (#5, closed unmerged) reproduced
research's #1 seam — `POST /api/paths/[id]/steps` returning the raw DB row instead of the
mapped `PathStep` — and ran it twice, once against each gate layer. The observed order:

| Run                                       | `ci`                                          | `integration`                          |
| ----------------------------------------- | --------------------------------------------- | -------------------------------------- |
| 1 — explicit `jsonResponse<PathStep>`     | **fail 1m07s** — `ts(2345)` at `steps.ts:80`  | fail 3m44s — `contract-steps`, 7 of 17 |
| 2 — bare `jsonResponse`, type arg dropped | pass 1m17s — **0 errors, the break compiles** | **fail 3m24s** — same 7, same message  |

Four things worth carrying:

- **The declared contract is the cheaper gate by ~2.5 minutes, and it is genuinely
  independent of the suite.** Run 1 caught the break at 1m07s without booting a database;
  run 2 proved the suite still blocks alone once the compiler is bypassed. Neither layer is
  redundant: dropping the explicit type argument is a one-token edit that silently disarms
  the first, which is exactly why `jsonResponse<T>`'s docstring insists the argument is
  written, not inferred.
- **A deliberate break has to be lint-clean, or it proves the wrong gate.** Swapping the
  mapper out orphaned the `toPathStep` import, and `@typescript-eslint/no-unused-vars` is an
  error — `ci` runs `lint` _before_ `typecheck`, so the job would have died at the lint step
  and the typecheck observation would never have happened. Generalization: when staging a
  break to test gate N, keep gates 1..N-1 green by hand, or you measure the wrong one.
- **The closed key set fired; the `deltaText` rule never did.** The plan predicted failure
  "on both the closed key set and the `deltaText` rule". All seven failures — including the
  four `deltaText`-named cases — carried the key-set message
  (`missing [pathId, listText, deltaText, createdAt, updatedAt], extra [path_id, …]`),
  because `expectExactKeys` throws before `expectPathStep` reaches its `deltaText` branch.
  The seam is caught, but by the outer guard. Generalization: **a layered asserter reports
  its outermost violated rule, not every violated rule.** A rule you want named in the log
  must either fail first, or be reached by a break narrow enough to leave the outer guards
  satisfied.
- **`BLOCKED` only means something read next to `mergeable`.** Both runs reported
  `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE` — refused by the required checks
  with `enforce_admins` on, not by a merge conflict. `BLOCKED` alone does not distinguish
  the two, and only one of them is evidence about the gate.

Attribution was exact: one failing file of nine, seven failing tests of seventeen, and the
message names the missing and extra key sets in full — diagnosable from the CI log without
reproducing locally. One process note: the plan's Phase 5 success criteria assumed `main` already
carried the plan's Phase 4 commit, but phases 1–4 were still open in draft PR #4 when the phase
started; the change was merged first (`c3fc395`) so the break could fork from a `main` that
actually contains the contract suite.

**Phase 3 (2026-08-20).** The phase's own framing was the first thing that had to change,
and the rest follows from it.

- **"Prove the persisted snapshot equals `prior ± delta`" was not a test task, because
  the server never derived.** `deriveSnapshot` runs in the browser; the route validated
  the snapshot's _shape_ and stored whatever arrived, so any structurally valid snapshot
  was accepted alongside any `deltaText`. Written as planned, the suite would have
  asserted a client-side promise from the client side — a test that passes by
  construction. The phase became production-first: a pure, resolution-free
  `verifyDerived` plus one owner-scoped read of the prior step, and only then a suite over
  the seam. Generalization: **before testing an invariant, find the party that can be held
  to it.** If the only enforcer is the caller, the test is circular and the missing piece
  is production code, not coverage.
- **The verifier is deliberately asymmetric, and saying so beat papering over it.** Keys
  the prior list already holds are fully checkable (`prior + adds − removes`, and an
  unnamed card must come back byte-identical). A genuinely new `+` line is not: the source
  canonicalizes names past `resolutionKey`'s reach, so the server cannot know which key a
  new line resolves into without resolving it — the one thing a request path must not do.
  New keys are therefore bounded by **count** only, and the docstring says which
  corruption remains merely count-bounded. Generalization: a gate that overstates its own
  coverage is worse than a narrower one that names its edge.
- **Research found a live silent-corruption bug, and Phase 2's oracle was structurally
  blind to it.** Both add flows looked a typed copy count up by the _canonical_ key, so
  `+3 Jace the Mind Sculptor` → `Jace, the Mind Sculptor` missed and fell through a
  documented `?? 1` to one copy — no warning, no `unresolved` entry. Full-paste
  equivalence could not see it because **both flows shared the defect**, and the golden's
  mock returned cards whose names matched the typed names exactly. Generalization: an
  equivalence oracle only catches divergence, never a defect the two sides share — and a
  mock that never exercises canonicalization guarantees they share it. Any case that turns
  on identity normalization needs a hand-authored expectation.
- **The resolver had to degrade rather than guess.** Fixing the join needed a query-key →
  card association, but pairing a returned card back to the identifier that fetched it is
  only positional once direct key matches are exhausted. Positional pairing of two or more
  residuals would rest on a response-ordering guarantee this codebase has never depended
  on, and a _mis_-assigned quantity is worse than the missing one being fixed. So
  `pairBatch` pairs directly, then pairs a **sole** residual, and otherwise records
  nothing and lets the old `?? 1` stand. Generalization: when an association is
  ambiguous, absent beats guessed — degrade to the pre-existing behavior, and make the
  degrade path a test case (`unattributed`).
- **One gate, no jobs, no workflow change** — the `.int.` infix again (see §5). Worth
  noting that Phase 2's advice held on the third try, which is when it stops being luck.

**Phase 3, the closing gate check (2026-08-20).** The deliberate-break PR (#11, closed
unmerged) reverted the quantity join to its pre-fix form — one token in
`quantifyResolved`, keying `viaMatched` by the caller's input key instead of the resolved
card's canonical key, so a canonicalized name falls back to one copy exactly as it did
before Phase 1. Forked from a `main` already carrying the suite, because the change PR
(#10) was merged first.

| Job           | Result         | Attribution                                                                                                   |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `ci`          | **fail 1m15s** | 3 files / 4 tests, every one a canonicalization case: `plan.test.ts`, `quantity.test.ts` ×2, `derive.test.ts` |
| `integration` | **fail 3m35s** | 1 file of 10, 1 test of 73 — `derive-persist.int.test.ts` > "persists three copies of a +3 line…"             |

Four things worth carrying:

- **This break could not be narrowed to one layer, and that is the honest result.** Phase
  2 ran its break twice to show each gate blocking alone; here the join is a _single
  shared function_ both add flows call, so the unit cases and the integration case fail
  together by construction. Neither is redundant — the unit cases pin the join's output,
  the integration case pins that the join's output is what reaches the column — but no
  edit disarms one without the other. Do not manufacture an artificial break to produce a
  tidier table.
- **A break must land _downstream_ of the mock seam or it measures nothing.** The obvious
  candidate was `pairBatch`'s sole-residual pairing, which is where the association is
  actually computed. It would have reddened `resolve.test.ts` **only**: the integration
  suite mocks `resolveCards` and builds `matched` itself through the fixture builders, so
  `pairBatch` never executes there. Generalization: when a suite mocks an edge, a
  deliberate break upstream of that mock is invisible to it — pick the break by which
  layer can observe it, not by which code reads as the root cause.
- **Attribution was exact with no local reproduction.** The failure diff read
  `- "Jace, the Mind Sculptor": 3` / `+ "Jace, the Mind Sculptor": 1` — the bug in one
  line. That legibility is a direct payoff of comparing **holdings as a record** rather
  than `cards` arrays (§6.4 rule 5): the array form would have printed two long
  arrays and left the reader to spot the differing entry.
- **`BLOCKED` next to `MERGEABLE` again.** `mergeStateStatus: BLOCKED` with
  `mergeable: MERGEABLE` — refused by the required checks with `enforce_admins` on, not by
  a conflict. Same reading rule as Phase 2's fourth note.

**Written at the close of Phase 3, and superseded:** _"The rollout is complete. §3 Phases
1–3 are all `complete`, which is the condition §7 names for re-evaluating the E2E and
component-render exclusions. That re-evaluation is a decision to take deliberately (via
`/10x-test-plan --refresh`), not a fourth phase that follows automatically."_ That is
exactly what happened — the 2026-08-25 refresh took the decision and opened Phase 4. The
sentence is kept rather than deleted because it records the condition correctly; read it
as of 2026-08-20, not as a standing claim about the rollout.

### 6.7 Adding a browser E2E test

- **Test type**: Playwright against a real browser. Reach for it **only** when the claim is
  about something that exists once rendered and nowhere else — §1 principle 1 still rules,
  and §7 scopes browser E2E to the comparer's failure surfacing, not to any flow an
  integration or contract test already covers.
- **Location**: `tests/e2e/<risk>.spec.ts`, fixtures in `tests/e2e/fixtures/`. `testDir` is
  pinned to `./tests/e2e` in `playwright.config.ts` — that pin is what stops Playwright's
  default `testMatch` from sweeping the 33 vitest files under `src/` and
  `tests/integration/`.
- **Naming**: `comparer-<risk>.spec.ts`. No `.int.` infix here — unlike every other suite in
  this project these do **not** ride an existing job; §5's `e2e` row is a separate CI job and
  a separate required check.
- **Reference tests**: `seed.spec.ts` (the exemplar — read it first; what you show is what you
  get), `comparer-failure-surfacing.spec.ts` (risk #7, interception + recovery),
  `comparer-stale-response.spec.ts` (risk #8, genuine concurrency).
- **Prerequisite / run locally**: nothing. No Supabase, no `.env.test`, no auth — the comparer
  mounts at `/` and `src/middleware.ts:7` protects only `/dashboard` and `/paths`. Playwright's
  `webServer` boots `astro dev` on port 4323 itself. `npm run test:e2e`.

The recipe, and why each piece is load-bearing:

1. **Make the surface addressable in production code, not in the test.** Both surfaces risk #7
   covers were unnamed `<div>`s carrying a **byte-identical** class string, so a locator for
   one matched the other. The fix was two one-line production edits — `role="alert"` on the
   error banner (`DeckComparer.tsx:220`) and `role="region"` plus `aria-label="Unresolved
cards"` on the notice (`UnresolvedNotice.tsx:66-67`) — both of which improve the app. This
   repo has **zero** `data-testid` and that is deliberate: the accessibility tree is the test
   surface, so a surface that is hard to locate is usually telling you something. Never reach
   for a CSS selector, an XPath, or DOM structure instead.
2. **Cross the hydration barrier before the first `fill()`, and do it in a helper.**
   `index.astro` mounts the comparer `client:load`. SSR renders both textareas, so `fill()`
   succeeds immediately — but it writes the DOM value without React state, React then hydrates
   with its own empty state, `bothFilled` stays false, and the CTA never enables. **Waiting for
   the CTA to enable does not rescue this**: the fill is already orphaned, and the failure
   surfaces as a timeout blaming the button. _The plan for this phase originally prescribed
   exactly that check; Phase 1 disproved it._ The one trustworthy signal is Astro's island —
   `astro-island` removes its `ssr` attribute only after `await this.hydrator(...)` resolves —
   so `expect(page.locator("astro-island[ssr]")).toHaveCount(0)` means React has committed.
   This is the sole framework-internal selector in the suite, it lives in `gotoComparer()`, and
   it is a **wait**, never an assertion target.
3. **Scope every locator to the `main` landmark.** `gotoComparer()` returns
   `page.getByRole("main")`; chain off it. A contributor's gitignored `.dev.vars` sets the
   Supabase keys locally while CI has none, and `Layout.astro:28-43` renders a config-error
   banner above the `<slot/>` when they are unset — so an unscoped spec sees two different
   DOMs. Do **not** "fix" this by giving CI dummy keys: a non-falsy key makes `supabase.ts:7-9`
   return a real client, and `middleware.ts:12-15` then runs `auth.getUser()` on every
   anonymous request to `/`. See `lessons.md`.
4. **Never `waitForTimeout`, and never `networkidle` either.** The second is not a style
   preference here, it is structural: `Layout.astro:19-24` preconnects and stylesheet-links
   `fonts.googleapis.com` on every page and Vite's HMR websocket stays open, so the network
   never settles. Wait on state — `toBeVisible()`, `waitForURL()`, `waitForRequest()`,
   `waitForResponse()`.
5. **Intercept all card-data traffic, and register a blocking fallback first.** Every helper in
   `fixtures/scryfall.ts` calls `blockUnmockedScryfall()` before its specific handler.
   Playwright matches route handlers **most-recently-registered first**, so the specific handler
   still wins for the URLs it covers and everything else aborts loudly instead of quietly
   reaching the real API. That is what makes "no external network" an enforced property rather
   than an assumption. Note that `cards.scryfall.io` is a **different host** from
   `api.scryfall.com`: mock cards omit `image_uris` to kill that traffic at the source, and the
   fallback glob covers both.
6. **Build mock cards only through `mockCard()`.** `normalize.ts:33,37-38` reads `raw.name` and
   `raw.prices.usd` / `.eur` **unguarded**, so a card literal missing `prices` throws a
   `TypeError` — and that `TypeError` lands in the _same_ catch as a real transport failure
   (`plan.ts:106-109`), producing a passing-looking error banner for entirely the wrong reason.
   `type_line` is the one field that _is_ guarded (`:29`, falling back to `""`), which is worse
   in its own way: omit it and the card silently classifies as uncategorized instead of failing.
   Either way the fixture, not the app, is what the test ends up measuring.
7. **Therefore assert the message, not just the banner.** Because a broken fixture and a real
   failure render the same container, matching on `/cards\/collection failed: 500/` is what
   separates them. Leave `statusText` unasserted — `route.fulfill()` does not reliably populate
   it.
8. **Induce a transport failure with `fulfill({status: 500})`, never `route.abort()`.** The 500
   trips the explicit `!response.ok` guard in `scryfall.ts:96-98` and yields a deterministic
   message naming the endpoint and status; an abort rejects the raw `fetch` with a
   browser-dependent `"Failed to fetch"` you cannot assert on.
9. **The session cache has no test seam — plan around it.** `resolve.ts:15` is a module-level
   `Map` and `clearSessionCache()` is not exported from the barrel, so the only reset is a fresh
   page load. Two consequences, both of which have already bitten: fail the **first**
   `/cards/collection` POST (nothing is cached yet, so Retry re-requests the full set), and give
   any two decks in one spec **disjoint card names** — including a single run's own base and
   target halves, or the target resolution is served from cache, the second POST never fires,
   and the test loses the request it was anchored on.
10. **Drive concurrency through the Calculate CTA, never by typing.** The 700 ms debounce's
    effect cleanup cancels the pending timer on every keystroke, so typing deck A then deck B
    starts **one** run. `compare()` in `fixtures/app.ts` goes through the CTA, which bypasses the
    debounce. (Its accessible name needs a regex — a diamond glyph, an arrow and two `&nbsp;`
    sit inside the button text and are not `aria-hidden`, so an exact-name match fails.) See
    `lessons.md`.
11. **Park selectively, and let the superseded run finish.** `mockScryfallWithParkedCollection`
    holds _one_ matching request and resolves everything else, because `plan.ts:95-96` awaits
    base **then** target: releasing run A's base immediately issues a second POST for A's target,
    and the stale-response guard is only reached once `generateUpgradePlan` **returns**. A
    handler that parked everything would leave that promise unsettled, and the spec would pass
    having never exercised the guard — risk #8's own anti-pattern in a different costume. Await
    `parked.arrived` before starting the second run (otherwise the overlap is asserted, not
    established), and `waitForResponse` on the _target_ request before asserting the drop.
12. **`retries: 0` on any ordering-sensitive spec.** The config retries once in CI to absorb
    ordinary infrastructure flake; `comparer-stale-response.spec.ts` overrides it with
    `test.describe.configure({ retries: 0 })`. A genuine out-of-order bug must never retry its
    way to green when a single test is the only thing covering it.
13. **A negative assertion needs an observation window, not a sample.** "Plan A never rendered"
    cannot be shown by a `toBeHidden()` after the response arrives: that samples a single instant
    and, verified with the guard disabled, stayed **green while plan A rendered a frame later**.
    Start a `waitFor({ state: "visible" })` race that resolves to a boolean _before_ releasing
    the superseded run, and assert the resolved value. Any "X never happens" claim in a browser
    needs the same shape.
14. **Pick the sharpest observable, and check it is reachable by role.** For risk #8 that is the
    collapsed input strip, which counts the **live textarea state** and never the plan — so a
    guard failure renders the exact contradiction the risk names: the strip reports deck B's
    counts above columns showing deck A's cards. Conversely, merged view is **not** assertable:
    `MergedRow.tsx` signals add-vs-remove with an `aria-hidden` glyph plus a CSS colour, so the
    two kinds are identical to accessibility queries (`findings.md` F-3). Assert the columns view.
15. **A phase like this is coverage, not repair.** Both specs pass green on the code as it
    stands. Three live defects surfaced along the way and were filed to
    `context/changes/testing-comparer-failure-surfacing/findings.md` rather than fixed — a spec
    for any of them would be red today, which would make it a different phase. Write the finding
    down; do not smuggle the fix in.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5), re-scoped
2026-08-25 once §3 Phases 1–3 completed — each bullet carries its own source.
Future contributors should respect these unless the underlying assumption
changes.

- **Frontend / component rendering & layout** — the team will polish the UI
  once the logic is set in stone; spending budget on render/interaction tests
  now would churn against an unstable surface. Re-evaluate when the logic
  boundary (Phases 1–3) is locked and the UI is being finalized. (Source:
  Phase 2 interview Q5.)
- **Re-testing the pure-logic engine** (`deck/diff`, `deck/plan`,
  `path/derive`, etc.) — already covered by the 20-file Vitest suite;
  duplicate coverage adds maintenance, not signal. Phase 2 pins the engine's
  _golden output_ once rather than re-deriving its internals. (Source: §1
  principle 1 + interview Q5.)
- **Pixel / snapshot tests of the deck card layout** — brittle against
  Tailwind tweaks, low signal. (Source: Phase 2 interview Q5.)
- **The path-builder and diff-mode UI** — excluded on coverage, not on churn.
  Its load-bearing behavior is already defended underneath the surface:
  §3 Phase 3 pins the derive→persist seam and Phases 1–2 pin the routes it
  drives, so what is left is the rendering of an already-verified
  result — the thinnest remaining slice in the app. The churn is stated plainly
  so the reasoning survives a busier month: `src/components/path` carries
  2 commits/30d and 9/90d, _more_ recent activity than the comparer's
  `src/components/deck` (1 and 18), so this is not a dormancy argument and does
  not expire when the directory heats up. Re-read it instead if a path-builder
  failure ever surfaces that the integration and contract layers could not have
  caught. (Source: §3 Phases 1–3 `complete` + directory churn measured
  2026-08-25; see §8 for the churn-citation convention.)
- **Browser-level E2E is no longer excluded** — it is scoped in, narrowly, at
  §3 Phase 4: the comparer's failure-surfacing (risks #7 and #8), where the
  notice and the superseded plan exist only once rendered and no cheaper layer
  can see them. That is the whole of the inclusion. It is not a licence to
  browser-test a flow an integration or contract test already covers — §1
  principle 1 still rules, and §4 still records no runner installed.
  (Source: Phase 2 interview Q4 + Q5, whose sequencing condition — the logic
  boundary locked — §3 Phases 1–3 satisfied.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-25 — §2 (risks #7–#8 appended with their
  response rows), §3 (Phase 4 opened), §4 (e2e row plus all four grounding bullets) and
  §5 (the e2e gate row) updated 2026-08-25 by the refresh below; §1 unchanged since
  2026-06-29 and re-read as still current
- Cookbook (§6) last reviewed: 2026-08-31 — §6.7 filled by rollout Phase 4 (browser E2E);
  §6.4 filled by rollout Phase 3; §6.5 filled 2026-08-25 as a sequencing checklist over
  §6.2–§6.4, so no sub-section is a stub
- Rollout: §3 Phases 1–3 all `complete` as of 2026-08-20 — the trigger §7 named for
  re-evaluating the E2E and component-render exclusions. That re-evaluation was taken
  deliberately on 2026-08-25 (below): browser E2E in for the comparer only, component
  render and pixel tests still out
- **Refresh completed 2026-08-25** through `context/changes/test-plan-refresh-2026-08-25/`
  (`/10x-test-plan --refresh` ran 2026-08-25 and opened it). What it changed: §2 gained
  risk #7 (a partial resolution or a card-data transport failure reaches the user as a
  plan that looks complete) and risk #8 (a slow earlier comparison clobbers a newer one),
  their Risk Response Guidance rows, and a recorded note on the resulting 8-row overflow
  against the schema's 5–7; §3 gained Phase 4 (comparer failure-surfacing, browser E2E,
  `not started`, no change folder); §4's e2e row names Playwright as planned-not-installed
  and all four grounding bullets were re-stamped; §5's e2e gate stopped reading "deferred"
  and now points at §3 Phase 4; §6.5 was filled; §7 scoped browser E2E in and added the
  path-builder / diff-mode UI as an exclusion.
- **Three claims the staged refresh note carried were corrected, not implemented.**
  Recorded here so a future refresh does not re-propose them. (a) An "astro 6→7 drift":
  `package.json` declares `astro ^6.3.1`, resolving to 6.4.8, so §4's "Astro 6" was
  confirmed rather than re-stamped — there was no drift to record. (b)
  "`src/components/deck` 55 commits/90d": the directory carries 18 commits/90d and 1/30d;
  55 was the sum of per-file touch counts inside it, a different measurement from the
  `N commits/30d` every §2 Source cell uses. (c) "Path builder dormant":
  `src/components/path` carries 9 commits/90d and 2/30d — more recent activity than the
  comparer's — so §7 excludes that surface on coverage, not on dormancy. A fourth staged
  proposal, a risk for an upgrade-plan cost total that under-reports, was not promoted;
  §2's not-promoted paragraph records the layers that already cover it.
- **Churn-citation convention** (adopted 2026-08-25, so a future refresh measures the
  same way): a churn figure in §2 or §7 is the count of commits touching a directory —
  `git log --oneline --no-merges --since=<window> -- <dir>` — never a sum of per-file
  touch counts, which counts one commit once per file it changed. Always state the window
  next to the number, and state both the 30d and 90d windows when they tell different
  stories about the same directory.
- **Rollout Phase 4 landed 2026-08-31** through
  `context/changes/testing-comparer-failure-surfacing/`. What it changed: §2's
  not-promoted set gained the silent quantity degradation (`resolve.ts:99-102`), recorded
  rather than promoted because the map is already over budget and the failure is not
  browser-only; §3's Phase 4 row moved to `complete` and names the change folder; §4's
  `e2e` row stopped reading "planned" and now carries Playwright `^1.62.1` with the real
  harness shape; §5's `e2e on critical flows` row moved from `planned` to required, but
  **only after** the required-check list on `main` was re-read (see that row); §6.7 was
  filled from what the specs actually taught, which in two places contradicted the plan
  that predicted them (the hydration barrier and the one-shot negative assertion).
  `context/foundation/lessons.md` was also created — it had never existed, so every prior
  run of `/10x-implement`, `/10x-e2e` and the review skills silently skipped it.
- **A correction Phase 4 owes two earlier artifacts.** `tests/integration/global-setup.ts:47-48`
  and §6.2 rule 4 both attribute `.dev.vars`' precedence over the spawn env to
  `getPlatformProxy`. The precedence claim is right and the harness that depends on it is
  correct; the mechanism is not — the Cloudflare adapter parses the file and calls
  `Object.assign(process.env, parsed)` (`@astrojs/cloudflare/dist/index.js:292-303`). Left
  in place rather than rewritten, because it is recorded in `lessons.md` and the fix is a
  comment edit no one should make blind; it matters because it says where to look when the
  override stops working.
- Stack versions last verified: 2026-08-31 — Playwright `^1.62.1` added and verified by
  Phase 4; every other row re-read as still current and unchanged since 2026-08-25
- AI-native tool references last verified: 2026-08-25

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes (e.g. the logic
  boundary is locked and frontend/E2E testing becomes worthwhile).
