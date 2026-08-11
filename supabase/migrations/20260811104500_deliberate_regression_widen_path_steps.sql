-- ###########################################################################
-- DELIBERATE REGRESSION — DO NOT MERGE. DO NOT COPY.
--
-- Exists only to verify plan step 4.4 of the `testing-server-boundary-auth`
-- change: that a PR carrying a cross-owner (IDOR) regression is caught by the
-- CI `integration` job and cannot be merged green.
--
-- What it breaks: `path_steps` has no `owner_id`; it is protected transitively
-- via an EXISTS subquery on the parent path's `owner_id`. This drops that check
-- and lets ANY authenticated caller read/write ANY owner's steps.
--
-- Expected CI failure: tests/integration/ownership-steps.int.test.ts —
-- "A deleting a step from B's path gets 404 and B's last step still exists".
-- The DELETE step route relies on RLS alone (no parent-path pre-check), so A's
-- request now returns 204 and B's step is really gone: the status assertion AND
-- the service-role DB-state read-back both fail.
--
-- This branch is closed unmerged; `main` never carries this file.
-- ###########################################################################

drop policy path_steps_owner_all on path_steps;

create policy path_steps_owner_all on path_steps
    for all
    using (true)
    with check (true);
