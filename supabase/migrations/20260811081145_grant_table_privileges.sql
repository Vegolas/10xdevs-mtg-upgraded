-- Explicit table privileges for upgrade_paths / path_steps
--
-- The first migration (20260626121519_user_accounts_paths.sql) created both
-- tables and their RLS policies but never granted table-level privileges,
-- relying implicitly on the `public` schema default privileges that a Supabase
-- stack bootstraps. That is not a guarantee: on a FRESH current stack those
-- defaults are absent, so every `/api/paths/*` query failed with
-- `permission denied for table upgrade_paths` (HTTP 500) even though the JWT
-- was valid and the RLS policies were correct — privileges are checked BEFORE
-- row-level security, so the request never reached a policy.
--
-- This surfaced only when CI ran the integration suite against a freshly
-- created stack; long-lived local volumes and the existing cloud project carry
-- the implicit defaults and hid it. Granting explicitly makes the schema
-- self-contained and reproducible on any new environment. Re-granting an
-- existing privilege is a no-op, so this is safe to apply to environments that
-- already work.
--
-- Scope note: `anon` is deliberately NOT granted anything. The sharing slice
-- (public read of `visibility = 'unlisted'`) is still deferred and has no read
-- policy; grant anon only when that slice lands, together with its policy.
-- `service_role` is granted because it needs table privileges too — it bypasses
-- RLS, not the privilege system — and the integration suite's setup, teardown
-- and DB-state read-backs run through it.

grant select, insert, update, delete on table public.upgrade_paths to authenticated, service_role;

grant select, insert, update, delete on table public.path_steps to authenticated, service_role;
