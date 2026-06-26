-- User Accounts & Checkpointed Upgrade Paths
-- First migration in the project: the two owned tables backing server-persisted
-- multi-step upgrade paths, plus owner-only Row-Level Security.
--
-- An upgrade path is an ordered chain of named checkpoints (steps). Each step
-- stores its raw list_text plus a client-produced resolved snapshot (jsonb);
-- views recompute plans/costs from the snapshot, so the server never resolves
-- cards. RLS is the security boundary: every /api/paths/* query runs under the
-- signed-in user's JWT via the cookie-bound client, and these policies enforce
-- ownership in Postgres.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table upgrade_paths (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    title text not null,
    -- 'unlisted' is reserved for the deferred sharing slice; only 'private'
    -- is exercised today.
    visibility text not null default 'private' check (visibility in ('private', 'unlisted')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index upgrade_paths_owner_id_idx on upgrade_paths (owner_id);

create table path_steps (
    id uuid primary key default gen_random_uuid(),
    path_id uuid not null references upgrade_paths (id) on delete cascade,
    position int not null,
    name text not null,
    list_text text not null,
    snapshot jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (path_id, position)
);

create index path_steps_path_id_position_idx on path_steps (path_id, position);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table upgrade_paths enable row level security;
alter table path_steps enable row level security;

-- upgrade_paths: owner-only for every action.
create policy upgrade_paths_owner_all on upgrade_paths
    for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

-- DEFERRED (sharing slice): an additional `for select using (visibility =
-- 'unlisted')` read policy will go here to allow anyone holding the link to
-- read an unlisted path. Intentionally omitted now — only 'private' is exercised.

-- path_steps: owner-only via the parent path's ownership.
create policy path_steps_owner_all on path_steps
    for all
    using (
        exists (
            select 1
            from upgrade_paths p
            where p.id = path_steps.path_id
              and p.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from upgrade_paths p
            where p.id = path_steps.path_id
              and p.owner_id = auth.uid()
        )
    );

-- DEFERRED (sharing slice): a matching read policy mirroring the unlisted path
-- read above will go here so unlisted paths expose their steps for reading.
