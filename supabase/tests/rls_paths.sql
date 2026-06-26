-- RLS isolation assertion for upgrade_paths / path_steps.
--
-- Proves the owner-only policies from 20260626121519_user_accounts_paths.sql:
-- user B sees 0 of user A's rows, and B cannot write into A's path. Runs as a
-- single transaction that ROLLBACKs, so it leaves no residue and is safe to run
-- repeatedly against a `db:reset`-ed local database.
--
-- Run locally (requires the local stack up via `supabase start`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_paths.sql
--
-- Any failed assertion RAISEs and, with ON_ERROR_STOP=1, exits non-zero.

begin;

-- --- Setup (privileged): two real auth users to satisfy the owner_id FK. ----
insert into auth.users (id, email) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rls-user-a@test.local'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rls-user-b@test.local');

-- --- Act as user A: create a private path with one step. -------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into upgrade_paths (id, owner_id, title)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A private path');

insert into path_steps (path_id, position, name, list_text, snapshot)
    values ('11111111-1111-1111-1111-111111111111', 0, 'base', '1 Sol Ring', '{"cards":[],"unresolved":[]}'::jsonb);

-- User A must see exactly their own rows.
do $$
begin
    if (select count(*) from upgrade_paths) <> 1 then
        raise exception 'RLS FAIL: user A should see 1 path, saw %', (select count(*) from upgrade_paths);
    end if;
    if (select count(*) from path_steps) <> 1 then
        raise exception 'RLS FAIL: user A should see 1 step, saw %', (select count(*) from path_steps);
    end if;
end $$;

-- --- Switch to user B: must see none of A's rows. --------------------------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
begin
    if (select count(*) from upgrade_paths) <> 0 then
        raise exception 'RLS FAIL: user B must see 0 of user A''s paths, saw %', (select count(*) from upgrade_paths);
    end if;
    if (select count(*) from path_steps) <> 0 then
        raise exception 'RLS FAIL: user B must see 0 of user A''s steps, saw %', (select count(*) from path_steps);
    end if;
end $$;

-- User B must not be able to write a step into user A's path (with check).
do $$
begin
    begin
        insert into path_steps (path_id, position, name, list_text, snapshot)
            values ('11111111-1111-1111-1111-111111111111', 1, 'sneaky', 'x', '{}'::jsonb);
        raise exception 'RLS FAIL: user B inserted a step into user A''s path';
    exception
        when insufficient_privilege then
            null; -- expected: the with-check policy blocked the write
    end;
end $$;

select 'RLS isolation OK' as result;

rollback;
