---
change_id: testing-server-boundary-auth
title: Server-boundary auth & ownership tests (test-plan rollout Phase 1)
status: implementing
created: 2026-06-29
updated: 2026-06-30
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Server-boundary auth & ownership".
Risks covered: #1 (cross-owner path access via a query path bypassing RLS / missing ownership check on /api/paths/*) and #2 (unauthenticated/expired-session request reaching /api/paths/* or a gated route served signed-out).
Test types planned: integration (real handler + local Supabase, not a mock that can't reproduce an RLS bypass) + a CI gate change (add `npm test` to ci.yml between lint and build, per health-check Fix #1).
Risk response intent:
- #1: prove Owner A requesting Owner B's path_id is denied and B's rows never return; challenge "logged in => authorized" and "RLS exists => every query path is scoped"; avoid happy-path-only / asserting policy SQL.
- #2: prove no-/expired-session gets 401/redirect and gated routes redirect signed-out while a valid owner gets through; challenge "middleware runs everywhere" / "build-green => gate works"; avoid testing only the signed-in path.
After creating the folder, follow the downstream continuation rule (suggest /10x-research next).
