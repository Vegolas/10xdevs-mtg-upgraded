# Discarded failure results on four server paths — Plan Brief

> Full plan: `context/changes/swallowed-write-errors/plan.md`
> Frame brief: `context/changes/swallowed-write-errors/frame.md`

## What & Why

This project has exactly one server-side evidence channel, and four failure paths that need it
do not use it — while the status codes those paths return are, with one exception, already
correct. The exception is `signout.ts`, which is not an observability gap at all but a live
behavior defect: the token revoke fails, the session survives, and the caller is told it
succeeded.

## Starting Point

`serverError` (`src/lib/api/paths.ts:79-85`) is the only `console.*` in all of `src/`, and
`observability.enabled` is already shipped in `wrangler.jsonc` — so the channel reaches
production and simply has nothing to ingest from these sites. The convention for exactly this
condition exists in-repo three times over (`[id].ts:71-80`, `steps.ts:98-101`,
`signin.ts:15-19`), which is what makes these four omissions rather than open questions. The
same observation was already recorded once, in an archived research doc, and reached no plan,
no test and no registry.

## Desired End State

Each of the five sites emits one `[api] degraded` line when its operation fails, and none of
them changes the answer it gives the caller. Sign-out is the exception: a failed revoke now
clears the browser session anyway, so the user who clicked "sign out" is genuinely signed out
of that browser, and the reason is in the log.

## Key Decisions Made

| Decision              | Choice                                                        | Why (1 sentence)                                                                                              | Source   |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Direction of the fix  | Evidence, not propagation — status codes untouched            | Propagating manufactures a duplicate checkpoint on POST retry and destroys a second on DELETE retry.          | Frame    |
| Class split           | Three problems, not one                                       | `steps.ts` ×2 are evidence gaps, `signout.ts` is a behavior defect, `middleware.ts`'s discard is correct.     | Frame    |
| Log shape             | `[api] degraded op=… <entity>=… cause=…`, own prefix          | A `201`/`204` has no body to carry a `ref`, and the registry calls `ref` "the handle, not decoration."        | Plan     |
| Bump check            | `error` **and** `{ count: "exact" }` zero-rows, logged apart  | An RLS refusal or mid-request delete matches zero rows with `error === null`, so `error` alone proves nothing. | Frame    |
| Helper location       | New import-free `src/lib/api/audit.ts`                        | `src/lib/api/paths.ts` reaches `astro:env/server`, so a test there cannot load — this is the only unit seam.   | Plan     |
| Sign-out semantics    | Clear `sb-*` cookies locally, log, still redirect to `/`      | Honors what the user clicked; leaving them signed in on a shared machine is worse than a live refresh token.   | Plan     |
| Middleware            | Discriminate by error type, log only the unexpected           | `getUser()` returns an error for every anonymous visitor, so logging indiscriminately floods the one channel.  | Frame    |
| Read-path fallbacks   | Log both mappers, keep degrading                              | Executes F-2 exactly as it was filed and never done.                                                          | Frame    |
| Verification          | Unit coverage + a fault proxy for sign-out only               | Sign-out is the one site with a reachable red test; the bump sites have no injectable seam.                    | Plan     |
| Bookkeeping           | All four registries                                           | The frame traced the original loss precisely to the absence of any of them.                                   | Plan     |

## Scope

**In scope:**

- The two discarded `updated_at` bumps in `steps.ts` (POST `:190`, DELETE `:234`)
- Both `parseSnapshot` read-path fallbacks in `src/lib/api/paths.ts` (`:142`, `:159`)
- `middleware.ts`'s dropped `getUser` error, type-discriminated
- `signout.ts` — the one behavior fix, plus a real red-then-green test
- A fault-injection proxy scoped to `POST /auth/v1/logout`
- Registration across contract surfaces, test plan, lessons, and F-2's execution

**Out of scope:**

- Any status-code change on `steps.ts`
- Monitoring / error tracking (Sentry, Observability MCP) — roadmap owns it
- Behavior changes in `middleware.ts` (no `503`, no new error page)
- Global revoke on sign-out failure, and any `?error=` surface for it
- Fault injection for the two bump sites
- E2E coverage of the stale `Saved <date>` symptom — needs a calendar-day boundary
- The adjacent discards in `src/pages/paths/[id].astro` and `index.astro`

## Architecture / Approach

One import-free module (`src/lib/api/audit.ts`) owns the channel and its branch logic; five call
sites use it; one of those five also changes behavior. The module is deliberately separate from
`serverError` so plain vitest can load it — that is the only layer where these branches get
automated coverage, since nothing sits between the Worker and Supabase. For sign-out, a
transparent `node:http` proxy in front of Supabase's auth endpoint, fronting a second dev server,
provides the one failure the real stack will not produce on demand.

## Phases at a Glance

| Phase                         | What it delivers                                            | Key risk                                                                             |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. The evidence module        | `audit.ts` + unit coverage of every branch and the format    | Accidentally importing Astro/Supabase makes the module untestable                     |
| 2. Wire the evidence sites    | Both bumps, both mappers, middleware; `updatedAt` pinned     | `count` may not be populated on a minimal-return update, leaving the miss branch dead |
| 3. Harness + sign-out spec    | Reusable boot, fault proxy, spec annotated `it.fails()`      | The fault server re-reads `.dev.vars` and bypasses the proxy — a vacuous green spec   |
| 4. The sign-out fix           | Local cookie clearing + log; the spec turns green            | Deleting cookies after the redirect is built silently drops the `Set-Cookie`          |
| 5. Registration               | Contract surface, risk row `#11`, lessons entry, F-2 note    | Low — but skipping it is exactly how this was lost the first time                     |

**Prerequisites:** local Supabase running (`npx supabase start`) and a filled `.env.test`, as the
integration suite already requires.
**Estimated effort:** ~4-5 sessions; Phase 3 is the single largest piece and the only one that
touches shared harness code.

## Open Risks & Assumptions

- **`count` on a minimal-return `UPDATE` is assumed to be populated.** `Prefer: count=exact` is
  supported by the client, but whether PostgREST returns `Content-Range` without a `select()` is
  a runtime fact. Phase 2 verifies it explicitly; if it comes back `null`, the zero-rows branch
  is dead code and the frame's correction #2 needs a different mechanism (e.g. `.select("id")`).
- **The two-dev-server boot depends on `.dev.vars` being read once at startup.** Verified in the
  adapter, but an `astro dev` config reload could re-run that hook. The proxy's hit counter is
  the guard, and it must be asserted or the spec proves nothing.
- **Sign-out's fix accepts a live refresh token** until expiry. Pinned by a test so any future
  move to global revoke is deliberate.
- **No runtime evidence any of these has ever fired.** The change's value is that the next
  occurrence is visible, not that a known incident is being fixed.

## Success Criteria (Summary)

- If any of these five operations fails in production, a `ref`-free but entity-keyed
  `[api] degraded` line lands in a log channel that is already switched on — which is what
  "we would not learn about it in any way" was asking for.
- A user who clicks sign out is signed out of that browser even when the server-side revoke
  fails, instead of being redirected with a live session.
- Every claim above is defended by something automated, or by a named deliberate break — and the
  class is registered so the next instance is caught by reading rather than by another sweep.
