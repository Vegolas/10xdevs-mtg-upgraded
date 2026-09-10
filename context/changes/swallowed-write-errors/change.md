---
change_id: swallowed-write-errors
title: Discarded failure results on four server paths
status: implemented
created: 2026-09-09
updated: 2026-09-10
archived_at: null
---

## Notes

Seeded from the M3L5 lesson (`Debugowanie z AI: od stack trace`), practical task #1 —
find the try/catch-or-discarded-error pattern that logs (or does not even log) a failure
and still answers the caller with success. Class name: **swallowed error**
(OWASP A10:2025, Mishandling of Exceptional Conditions).

Candidate sites found while reading the repo on 2026-09-09 — to be confirmed by research,
not treated as a settled defect list:

- `src/pages/api/paths/[id]/steps.ts:190` (POST) and `:234` (DELETE) — the parent
  `upgrade_paths.updated_at` bump is fire-and-forget: the Supabase result is never
  destructured, so a failed UPDATE cannot be seen. Handler still answers 201 / 204.
  User-visible consequence: `PathEditor.tsx:255` and `VisitorView.tsx:79` keep rendering
  `Saved <stale date>`. No test covers it — `updatedAt` is only asserted for PATCH
  (`tests/integration/contract-paths.int.test.ts:223`).
- `src/pages/api/auth/signout.ts:7` — `await supabase.auth.signOut()` result discarded,
  then an unconditional redirect to `/`. A failed sign-out redirects with a live session.
- `src/middleware.ts:13-16` — `getUser()`'s `error` is dropped, so an auth-backend outage
  degrades silently to "anonymous" and the user is bounced to sign-in as if logged out.
- `src/lib/api/paths.ts` `toPathStep` — `parseSnapshot(...) ?? { cards: [], unresolved: [] }`
  is a deliberate, documented corruption fallback, but emits no signal at all. Not the same
  defect as the ones above; the question for the plan is whether it should log.

Method the lesson prescribes and this change follows: red test that asserts the **persisted
state** (not the response status) first, then the fix. `/10x-tdd` owns that loop.

Explicitly out of scope: monitoring / error tracking (Sentry vs Cloudflare Observability MCP).
`context/foundation/roadmap.md:63` records observability as partial; that is a separate change.

## F-2 executed (2026-09-10)

F-2 — filed at `context/archive/2026-08-11-testing-api-contract-pinning/findings.md:51-80`
with the ruling "_keep degrading, but log the step id against the same `[api]` prefix_",
owner test-plan §3 Phase 3 — was **executed by Phase 2 of this change, exactly as filed**.
`toPathStep` and `toPathWithSummary` still fall back to `{ cards: [], unresolved: [] }` on an
unparseable stored snapshot; the fallback now emits one `[api] degraded … cause=snapshot-corrupt`
line naming the step id (`src/lib/api/paths.ts`, `emptySnapshot`). Recorded here because F-2's
own `findings.md` lives under `context/archive/` and is immutable, so its execution has no
other home.

One deviation from the letter of the ruling, and it is deliberate: the prefix is
`[api] degraded`, not the `[api]` of `serverError`'s log. `serverError` is `ref`-keyed because
its `500` body carries the same `ref`; a read-path fallback has no such body, so the line is
keyed on the step id instead. See `docs/reference/contract-surfaces.md` for the registered
shape.

Note also that the grid mapper runs once per step per listed path, so one corrupt row logs
once per render rather than once ever. Accepted — this branch does not execute in normal
operation, and a repeated line is a better failure than silence.

## The frame's two corrections to the seed notes above (2026-09-09)

Both are material, and both **contradict this file's own notes**, which are preserved above as
written rather than edited.

1. **The stale-`Saved <date>` symptom is far less reachable than the first bullet claims.**
   `formatSavedDate` (`src/components/path/metadata.ts:16`) formats at **day granularity**, and
   `path` is a frozen SSR prop with no refetch — so observing the symptom needs both a page
   reload _and_ a calendar-day boundary. A same-day E2E run cannot see it, which is why this
   change tests the persisted `updatedAt` at the integration layer instead and deliberately
   ships no E2E for the symptom.
2. **"Destructure the error" is not a sufficient fix**, even where an error check is what is
   wanted. An RLS refusal, or a path deleted mid-request, matches **zero rows with
   `error === null`** (confirmed against `supabase/tests/rls_paths.sql:38-48`). Proving the bump
   landed requires rows matched — `update(values, { count: "exact" })` — which is why
   `auditSideEffect` carries a `write-missed` cause distinct from `write-failed`.

A third correction is worth recording alongside them because it reversed the change's whole
direction: the seed's proposed fix — propagate the failure to the caller — is **worse than the
defect** on both `steps.ts` verbs. A POST answered `500` after its INSERT committed leaves a
retry re-reading `max(position)` and manufacturing a duplicate; a DELETE answered `500` after
its delete committed leaves a retry destroying a second checkpoint. Three of the four status
codes were already correct and stayed untouched. See `frame.md` and `plan.md` §"What We're NOT
Doing".
