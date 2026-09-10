# Frame Brief: Discarded failure results on four server paths

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

"W kodzie serwerowym istnieją operacje zapisu/efektu ubocznego, których wynik błędu
jest odrzucany, a wywołujący dostaje sukces (201 / 204 / redirect) albo cichą
degradację. Żaden test ani żaden kanał sygnału tego nie obejmuje."

= There are write / side-effect operations in the server code whose error result is
discarded, and the caller is answered with success (201 / 204 / redirect) or a silent
degradation. No test and no signal channel covers any of them.

Entry point was a proactive code sweep prompted by lesson M3L5, **not** a user ticket.
There is no runtime evidence that any of these has ever fired.

## Initial Framing (preserved)

- **Stated cause**: these are instances of one class — the "swallowed error"
  (OWASP A10:2025) — and the proactive test pipeline cannot see them by construction.
- **Proposed direction**: a red integration test asserting persisted state (not response
  status), then a fix that propagates the failure to the caller.
- **Pre-dispatch narrowing** (Step 1.5): the leading concern is **"brak jakiegokolwiek
  sygnału"** — *if these writes failed we would not learn about it in any way*. Explicitly
  NOT the stale `Saved <date>` symptom. No occurrence has been observed ("sweep
  proaktywny"). Scope: all four sites.

## Dimension Map

1. **Failure reachability** — can these writes realistically fail at all?
2. **Evidence channel** — what trace would each failure leave, on any channel? ← leading concern
3. **Route semantics** — is propagating to the caller even the correct response? ← initial framing
4. **Symptom render reach** — does the consequence reach a user-visible surface?
5. **Class cohesion** — are these four one class, or several problems sharing a name?

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **D1** The discarded UPDATE can realistically fail | Realistic modes are narrow but real: transport failure to PostgREST (`postgrest-js/dist/index.mjs:291` resolves with `{error}` rather than throwing, and `:19-27` excludes PATCH from `RETRYABLE_METHODS`), transient 503/520, and missing table privilege — the last one **historically hit in this repo**, per `supabase/migrations/20260811081145_grant_table_privileges.sql:5-11`. Crucially an **RLS refusal is NOT one of them**: the only policy is `upgrade_paths_owner_all` (`20260626121519_user_accounts_paths.sql:51-54`) and a `using` refusal yields **zero rows and `error === null`**, confirmed against `supabase/tests/rls_paths.sql:38-48`. No triggers or generated columns exist. | **PARTIAL** |
| **D2** No evidence channel carries these failures | True at the signal level, false at the infrastructure level. `serverError` (`src/lib/api/paths.ts:79-85`) is the project's **only** `console.*` in all of `src/`, has 13 call sites — **7 of them inside `steps.ts` itself** — and mints a correlation `ref` that `docs/reference/contract-surfaces.md:85-88` records as load-bearing. `wrangler.jsonc:14-16` already ships `observability.enabled`, so the channel reaches production; it simply has nothing to ingest. `eslint.config.js:23` sets `no-console` to **warn**, with an established justified-exemption precedent at `paths.ts:82`. | **STRONG** |
| **D3** Propagating the failure to the caller would be better (initial framing) | Traced in client code, both verbs, and it is worse. **POST → 500**: the INSERT at `steps.ts:173-188` has committed; `setSteps` lives only in the success commit (`PathEditor.tsx:376-387`) so the step is in the DB and not on screen, the form does not clear, the CTA re-enables (`:981`), and a full-paste retry re-reads `max(position)` (`steps.ts:41-54`) producing a **duplicate** that `unique (path_id, position)` does not block; a diff-mode retry instead gets a 409 that misstates the cause (`PathEditor.tsx:366-367`). **DELETE → 500**: the delete has committed, the step stays rendered (`PathEditor.tsx:553-560`), and because the route removes the highest-position step **per call** (pinned by `tests/integration/contract-steps.int.test.ts:385`), a retry **destroys a second checkpoint**. | **NONE** |
| **D4** The consequence reaches a user-visible surface | `updated_at` renders in exactly one real place (`PathEditor.tsx:255`; `VisitorView.tsx:79` is `?preview=visitor` chrome). `formatSavedDate` (`src/components/path/metadata.ts:16`) formats at **day granularity**, so a same-day failure is byte-identical to success. `path` is a frozen SSR prop — no `setPath`, no refetch, no view transitions — so the label is stale after a successful bump too, until reload. Nothing orders by `updated_at`; all eight `.order(...)` calls use `created_at` or `position`. | **WEAK** |
| **D5** The four sites are one defect class | They are three. **steps.ts ×2**: supplementary write, primary write honest, status correct. **signout.ts:7**: the **primary** operation is the discarded one. **middleware.ts:13-16**: no write, no success claim, and the discard is *correct as written*. **paths.ts `toPathStep`**: a read-path parse fallback already filed and owned. | **STRONG** (against the framing) |

## Narrowing Signals

- **The same operation is treated both ways, twice.** `upgrade_paths.update({updated_at})` is
  error-checked at `src/pages/api/paths/[id].ts:71-80` and discarded at `steps.ts:190` / `:234`.
  `parseSnapshot(...) === null` is a logged 500 on the write path (`steps.ts:98-101`, reasoning at
  `:66-69` — "that corruption is ours to find in the log") and a silent fallback on the read path
  (`src/lib/api/paths.ts:142`, `:159`). The convention exists; these sites are the omission.
- **`middleware.ts`'s discard is correct.** `getUser()` returns a populated `error` for the ordinary
  anonymous visitor — `AuthSessionMissingError` at
  `@supabase/auth-js/dist/main/GoTrueClient.js:2496-2498`. Logging or propagating it indiscriminately
  would fire on **every anonymous request**. The real gap is the absence of *discrimination* between
  that and `AuthRetryableFetchError`; both helpers are exported by the library.
- **`signout.ts` is a genuine behavior defect, verified in library source.** `_signOut`
  (`GoTrueClient.js:3182-3208`) returns at `:3198` for any revoke failure other than 401/403/404,
  **without reaching `_removeSession()` at `:3203`**. Cookie clearing happens only through the
  `SIGNED_OUT` notification (`@supabase/ssr/dist/main/createServerClient.js:48-66`,
  `cookies.js:328-380`), so no `_removeSession` means **no `Set-Cookie`, session intact** — while the
  caller is redirected to `/` as though signed out. `signin.ts:15-19` and `signup.ts:15-19` both route
  their `error`; signout is the only auth route that does not.
- **This was already seen once and lost.**
  `context/archive/2026-08-11-testing-api-contract-pinning/research.md:123` records the discarded
  bumps verbatim. It reached no plan, no `findings.md`, no contract test, and no test-plan risk row.
  Separately, the `toPathStep` fallback **was** filed — `.../findings.md:51-80` (F-2), recommending
  "*keep degrading, but log the step id against the same `[api]` prefix*", owner test-plan §3 Phase 3
  — and never executed.
- **There is no seam to inject a Supabase failure.** Integration tests run a real local stack; e2e can
  intercept Scryfall and the app's own `/api/**` from the browser, but nothing sits between the Worker
  and Supabase (`tests/e2e/fixtures/appApi.ts:32`). The "red test first" loop is only available at
  `signout.ts`, where the auth endpoint can be stubbed.

## Cross-System Convention

This project already has a decided convention for exactly this condition, in three places:
`serverError`'s redacted-body-plus-logged-`ref` (`src/lib/api/paths.ts:79-85`, contract-registered at
`docs/reference/contract-surfaces.md:85-88`); the `?error=` redirect channel for auth routes
(`contract-surfaces.md:74`); and F-2's explicit ruling for degradations — **keep degrading, log the
detail**. The leading hypothesis matches the convention exactly. The initial framing (propagate to the
caller) contradicts it, and `context/foundation/lessons.md:251-261` already records the specific trap
it walks into: a fix whose failure mode is worse than the defect's.

## Reframed Problem Statement

> **The actual problem to plan around is**: this project has exactly one server-side evidence channel,
> and four failure paths that need it do not use it — while the status codes those paths return are,
> with one exception, already correct.

The initial framing was wrong in its *direction*, not its *sites*. Three of the four discards are
correct answers to the caller that merely emit no evidence; changing their status codes would
manufacture duplicate checkpoints (POST) and destroy a second checkpoint on retry (DELETE). The one
exception is `signout.ts:7`, which is not an observability gap at all but a live behavior defect: the
primary operation fails, the session survives, and the caller is told it succeeded. Addressing the
reframed problem means the next failure of any of these paths leaves a `ref`-correlated line in a
production log channel that is already switched on — which is what "we would not learn about it in any
way" was asking for.

Two corrections to the change's own seed notes, both material:

1. **Reachability of the stale-date symptom was overstated** (`change.md:20-25`). It needs a reload
   *and* a calendar-day boundary; an E2E test cannot observe it in a same-day run.
2. **Destructuring the error is not sufficient** even where it is wanted: the RLS/race case matches
   zero rows and reports no error, so a check that must prove "the bump landed" has to assert on rows
   matched, not on `error`.

## Confidence

**HIGH** — four independent investigations, every load-bearing claim carrying `file:line`, two of them
verified against installed library source (`@supabase/auth-js`, `@supabase/ssr`, `postgrest-js`), plus
a prior in-repo record of the same observation. The one residual unknown is runtime frequency (how
often the Worker↔Supabase transport actually fails), which no amount of code reading can settle and
which does not change the conclusion.

## What Changes for /10x-plan

Plan an **evidence** change, not a propagation change: route the discarded failures at
`steps.ts:190`/`:234` and the `toPathStep`/`toPathWithSummary` fallbacks onto the existing
`serverError`-style logged-`ref` channel **without touching their status codes**, and give
`middleware.ts` a type-discriminated log that stays silent on `AuthSessionMissingError`. Split
`signout.ts:7` out as the one genuine behavior defect — it is the only site with a real red test
available (stub the auth endpoint, assert no clearing `Set-Cookie` and that the replayed cookie still
authenticates) and the only one where the caller's answer must change. The plan must also state what
verification is for the other three, given that no seam exists to inject a Supabase failure.

## References

- Sites: `src/pages/api/paths/[id]/steps.ts:190`, `:234`; `src/pages/api/auth/signout.ts:7`;
  `src/middleware.ts:13-16`; `src/lib/api/paths.ts:142`, `:159`
- Channel: `src/lib/api/paths.ts:79-85`; `wrangler.jsonc:14-16`; `eslint.config.js:23`;
  `docs/reference/contract-surfaces.md:74`, `:85-88`
- Counter-examples in-repo: `src/pages/api/paths/[id].ts:71-80`;
  `src/pages/api/paths/[id]/steps.ts:98-101`; `src/pages/api/auth/signin.ts:15-19`
- Prior records: `context/archive/2026-08-11-testing-api-contract-pinning/research.md:123` and
  `findings.md:51-80` (F-2); `context/foundation/lessons.md:251-261`
- Adjacent sites found but not in scope: `src/pages/paths/[id].astro:22`, `:25`;
  `src/pages/paths/index.astro:17`
- Investigations: four parallel read-only agents (reachability + route semantics; evidence-channel
  audit; auth-surface semantics; `updated_at` render reach), 2026-09-09
