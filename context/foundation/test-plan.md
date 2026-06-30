# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-29 (Phase 1 change opened)

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
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
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
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | A signed-in user reads or mutates **another owner's** upgrade path because a query path bypasses RLS or skips an ownership check on `/api/paths/*` | High | High | interview Q1 (top fear) + Q2 (lived incident: RLS looked right, a query path bypassed it, rows leaked cross-tenant); hot-spot dir `src/pages/api` (8 commits/30d); abuse lens (authorization / IDOR) |
| 2 | An **unauthenticated or expired-session** request reaches `/api/paths/*`, or a gated route (`/paths`, `/dashboard`) is served while signed-out — or a signed-in owner is wrongly bounced | High | Medium | roadmap baseline (middleware gates `/paths`/`/dashboard`); interview Q4 (server boundary untested); hot-spot dir `src/components/auth` (12 commits/30d); abuse lens (access) |
| 3 | A handler's **request/response contract changes** and a stale caller still references the old shape — a path-builder flow breaks silently | Medium | Medium | interview Q3 (changing API handlers, fear of a forgotten reference to the old one); hot-spot dir `src/pages/api` (8 commits/30d) |
| 4 | A diff-mode checkpoint **persists a list that does not equal `prior frozen list ± delta`**, silently corrupting an immutable saved step | High | Medium | prd-v3 §Guardrails (derived-snapshot correctness) + §Success Criteria; hot-spot dir `src/lib/path` (23 commits/30d) |
| 5 | An **unapplicable delta** (`− card` absent from the prior list) or an **unresolved `+ card`** is silently dropped at persist instead of being flagged before save | High | Medium | prd-v3 FR-003 / US-02 + PRD §Guardrails (graceful input handling, no silent omission); hot-spot dirs `src/lib/card-data` (23) + `src/lib/path` (23 commits/30d) |
| 6 | The **preserved full-paste add flow or the resolve/diff/cost engine** regresses behind the additive diff-mode change | Medium | Medium | prd-v3 FR-005 / FR-007 (preserved behavior promise); hot-spot dirs `src/lib/deck` (29) + `src/lib/path` (23 commits/30d) |

**Impact × Likelihood rubric.** High = user loses access/data/money or failure
is publicly visible / area changes weekly or already burned us. Medium =
feature degrades, workaround exists / touched occasionally, has been a bug
source. Low = cosmetic / stable code. Risk #1 is the only High × High — the
lived cross-tenant incident plus the most-churned untested boundary — so it
is protected first.

Not promoted to the map (recorded so the rollout doesn't silently widen):
card misidentification from Scryfall resolution (already unit-tested plus a
live test; external-source drift is better served by the existing live test
and observability than a rollout phase) and secret/PII leakage (small scale,
Supabase anon key is expected-public) — both are folded into Phase 1
research as one-line checks rather than their own rows.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Owner A requesting Owner B's `path_id` is denied, and B's rows are never returned through any read/write route | "logged in ⇒ authorized for this resource"; "an RLS policy exists ⇒ every query path is actually scoped" | the real handler→query path for each `/api/paths/*` route; how the cookie-bound Supabase client scopes the owner; what enforces ownership beyond RLS | integration against the **real** handler + DB (local Supabase), not a mock that can't reproduce an RLS bypass | happy-path-only (owner reads own path and calling it "auth tested"); asserting the policy SQL instead of exercising the live query path |
| #2 | No-session and expired-session requests get 401/redirect on the API; gated routes redirect when signed-out; a valid owner still gets through | "middleware runs on every protected path"; "build-green ⇒ the gate works" | middleware matcher coverage; session/cookie shape on expiry; the redirect target for signed-out access | integration | testing only the signed-in path; mocking away the session check so the gate is never exercised |
| #3 | A change to a handler's shape makes a stale caller's test fail loudly rather than silently breaking the flow | "all callers get updated together with the handler" | the request/response contract of each `/api/paths/*` route and who consumes it | contract + integration | mirroring the handler's *current* output as the expected value (oracle problem — pins the bug, not the contract) |
| #4 | The persisted list equals an **independently constructed** `prior ± delta`, verified through the POST→persist path, not just the pure function | "the derive logic is unit-tested, so the wired flow must be correct too" | the derive→resolve→persist seam; the frozen prior-snapshot source the delta reads from | integration | building the "expected" list by calling the same derive function under test (tautological oracle) |
| #5 | An unapplicable or unresolved line blocks-or-flags the save; the wrong snapshot is never persisted | "no error returned ⇒ everything resolved/applied" | where the surfacing/rejection happens before persist; how `− not present` vs `+ unresolved` differ | integration | happy-path-only; asserting the *absence* of an error rather than the *presence* of the flag/rejection |
| #6 | The engine's golden output is unchanged and a full-paste add still produces an identical snapshot after the diff-mode change | "an additive change cannot touch the preserved path" | the engine's stable output contract; the full-paste add-flow seam | golden output + integration | duplicating the existing strong unit suite instead of pinning the engine output and the add-flow seam |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|---------------|
| 1 | Server-boundary auth & ownership | Prove cross-owner isolation and the signed-out gate on `/api/paths/*` + middleware, and make CI run the suite | #1, #2 | integration + CI gate | change opened | context/changes/testing-server-boundary-auth/ |
| 2 | API contract pinning | Freeze `/api/paths/*` request/response shapes and the engine golden output so a stale caller or preserved-flow regression fails loudly | #3, #6 | contract + integration + golden | not started | — |
| 3 | Derive-to-persist correctness | Prove the persisted snapshot equals `prior ± delta` and that unapplicable/unresolved lines are flagged, not silently dropped | #4, #5 | integration | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened`
→ `researched` → `planned` → `implementing` → `complete`.

Order rationale: Phase 1 defends the only High × High risk (a lived incident
on the most-churned untested boundary) and unlocks signal for everything
after it by wiring `npm test` into CI (health-check Fix #1 — CI currently
runs lint + build but not the tests). Phase 2 hardens the churny API
contract surface the team changes without confidence (interview Q3). Phase 3
closes the correctness guardrail on the newest feature (diff-mode derive).
E2E and frontend/component testing are deliberately **out** of this rollout
(see §7), gated behind the logic boundary per interview Q4's sequencing.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit (logic) | Vitest | ^4.1.9 | `node` env, `src/**/*.test.ts`, `@/*` alias. 20 test files, **all pure-logic** (`src/lib/{card-data,deck,path}` + deck helpers). `npm test` → `vitest run`. |
| integration (API + boundary) | Vitest + local Supabase | ^4.1.9 | **none yet — see §3 Phase 1.** Exercise `/api/paths/*` handlers against the real query path (local Supabase / `supabase db reset`), not a mock that can't reproduce an RLS bypass. |
| contract | Vitest | ^4.1.9 | **none yet — see §3 Phase 2.** Pin request/response shapes of `/api/paths/*`. |
| live (external) | Vitest | ^4.1.9 | `src/lib/card-data/scryfall.live.test.ts` — network-dependent Scryfall check; keep for card-data-accuracy drift signal. |
| e2e | none | — | **deliberately deferred — see §7.** Re-evaluate only after Phases 1–3 land. |
| component render | none (no jsdom/RTL by design) | — | **deliberately deferred — see §7** (interview Q5: frontend later). |

**Stack grounding tools (current session):**
- Docs: **Context7** available — can ground current Vitest 4 / Astro 6 / Supabase SSR / Cloudflare Workers test-setup APIs (e.g. `unstable_dev`, cookie-bound client testing) when planning Phase 1–2; checked: 2026-06-29
- Search: **none** — no Exa.ai or web-search MCP exposed in this session; checked: 2026-06-29
- Runtime/browser: **Claude Preview + Claude-in-Chrome** available as a possible verification/E2E layer; **not used** — E2E is out of scope for this rollout (no Playwright MCP present); checked: 2026-06-29
- Provider/platform: **Supabase** via CLI/skill only (no DB MCP); `gh` CLI available for the CI test-step change in Phase 1; checked: 2026-06-29

Use docs MCPs for current framework/library APIs and setup details. Do not
use MCP docs/search to infer code failure anchors; those belong in per-phase
`/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout phase
lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift (ESLint strictTypeChecked, type-aware) |
| build | local + CI | required (already wired) | broken Astro build |
| unit (logic) | local; **CI after §3 Phase 1** | required after §3 Phase 1 | logic regressions (suite exists, CI does not yet run it) |
| integration (API + ownership) | local + CI | required after §3 Phase 1 | cross-owner leak, signed-out gate failures |
| contract (`/api/paths/*`) | local + CI | required after §3 Phase 2 | stale-caller / changed-shape breaks |
| derive-to-persist integration | local + CI | required after §3 Phase 3 | corrupted or silently-wrong snapshots |
| e2e on critical flows | CI on PR | deferred — see §7 | broken signed-in path flow (revisit post-rollout) |

The load-bearing gate change is in **Phase 1**: add a `npm test` step to
`.github/workflows/ci.yml` between lint and build, so the suite (existing +
new integration tests) actually gates PRs. Until then, CI green is false
confidence on a correctness-critical surface.

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

- TBD — see §3 Phase 1. Will cover: exercising `/api/paths/*` against the
  real query path with two distinct owners (cross-owner denial), signed-out
  / expired-session rejection, and the local-Supabase setup/teardown pattern.

### 6.3 Adding a contract test for `/api/paths/*`

- TBD — see §3 Phase 2. Will cover: pinning request/response shape so a stale
  caller fails loudly, with the contract oracle drawn from the documented
  shape — never mirrored from the handler's current output.

### 6.4 Adding a derive-to-persist correctness test

- TBD — see §3 Phase 3. Will cover: asserting the persisted snapshot equals
  an independently-constructed `prior ± delta` through the POST→persist path,
  and that unapplicable/unresolved lines are flagged rather than dropped.

### 6.5 Adding a test for a new API endpoint

- TBD — see §3 Phase 1/2. Test type: integration (preferred) plus a contract
  pin. Assert request → response shape AND the ownership-scoped side effect.
  Mock only the external HTTP edge (Scryfall); never mock internal modules or
  the RLS query path.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Frontend / component rendering & layout** — the team will polish the UI
  once the logic is set in stone; spending budget on render/interaction tests
  now would churn against an unstable surface. Re-evaluate when the logic
  boundary (Phases 1–3) is locked and the UI is being finalized. (Source:
  Phase 2 interview Q5.)
- **Browser-level E2E** — sequenced after unit + integration on the server
  boundary; not worth building until that boundary is covered. Re-evaluate
  after §3 Phases 1–3 complete. (Source: Phase 2 interview Q4 + Q5.)
- **Re-testing the pure-logic engine** (`deck/diff`, `deck/plan`,
  `path/derive`, etc.) — already covered by the 20-file Vitest suite;
  duplicate coverage adds maintenance, not signal. Phase 2 pins the engine's
  *golden output* once rather than re-deriving its internals. (Source: §1
  principle 1 + interview Q5.)
- **Pixel / snapshot tests of the deck card layout** — brittle against
  Tailwind tweaks, low signal. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-29
- Stack versions last verified: 2026-06-29
- AI-native tool references last verified: 2026-06-29

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes (e.g. the logic
  boundary is locked and frontend/E2E testing becomes worthwhile).
