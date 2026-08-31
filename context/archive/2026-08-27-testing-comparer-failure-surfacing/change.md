---
change_id: testing-comparer-failure-surfacing
title: Prove the comparer surfaces its own failures and never renders a superseded plan
status: archived
created: 2026-08-27
updated: 2026-08-31
archived_at: 2026-08-31T17:53:31Z
---

## Notes

Rollout Phase 4 of `context/foundation/test-plan.md` §3 — the first phase opened
after the 2026-08-25 refresh (`context/archive/2026-08-25-test-plan-refresh-2026-08-25/`)
scoped browser E2E in.

Risks covered — §2 rows #7 and #8, both browser-only:

- **#7** (High × Medium) — a partial resolution or a card-data transport failure
  reaches the user as a plan that **looks complete**, because the unresolved notice
  or the retryable error banner never renders.
- **#8** (Medium × Low) — a slow earlier comparison resolves *after* a newer one and
  clobbers it, so the user reads a plan built from deck text they already replaced.

What research has to settle (per §4 and the §2 response rows):

- **Runner and harness shape.** §4 names Playwright as *planned*, not installed —
  no `package.json` entry, no `playwright.config.*`, no `e2e/` directory. Choosing
  and installing it is this phase's call, not a settled premise.
- **The outcome-to-render seam** for #7: which rendered surface owns each resolver
  outcome, and what the retry affordance does on a transport failure. The resolver
  outcomes themselves are already unit-owned — the gap is the step from outcome to
  rendered surface.
- **The ordering guarantee** for #8: what marks a resolution stale, and where an
  out-of-order arrival is dropped before it reaches the rendered plan.

Scope boundary — §7 holds it. Browser E2E is scoped in *only* for the comparer's
failure-surfacing. Component render, pixel/snapshot tests, and the path-builder /
diff-mode UI stay out; §1 principle 1 still forbids reaching for a browser where a
cheaper layer already gives signal.

Gate to wire — §5's `e2e on critical flows` row currently reads
`planned (§3 Phase 4)`. Per §5's own rule, it stays aspirational until its job name
sits in `main`'s required-check list (currently `["ci", "integration"]`,
`enforce_admins: true`). Confirm the list before claiming the row.

Anti-patterns named in §2's response rows: for #7, a happy-path browser test that
never induces a partial resolution or a transport failure, so no notice is ever
exercised; for #8, a test that passes because it never actually overlaps two runs —
sequential awaits cannot reproduce an out-of-order arrival.
