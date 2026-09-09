---
change_id: swallowed-write-errors
title: Discarded failure results on four server paths
status: implementing
created: 2026-09-09
updated: 2026-09-09
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
