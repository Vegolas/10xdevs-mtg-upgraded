# User Accounts & Checkpointed Upgrade Paths — Plan Brief

> Full plan: `context/changes/user-accounts/plan.md`
> Research: `context/changes/user-accounts/research.md`
> PRD (brownfield): `context/foundation/prd-v2.md` · Shape notes: `context/foundation/shape-notes.md`

## What & Why

DeckDelta can only compare two lists, on-device, single-user. Players actually upgrade in **stages** (precon → "$50 upgrade" → "bracket 3"), and want those saved and reachable across devices. This change activates accounts and adds **server-persisted, multi-step upgrade paths** — an ordered chain of named checkpoints where each step diffs against the previous one. This is the **A+C MVP**; sharing/forking is a deliberate later slice.

## Starting Point

Supabase email/password auth is fully scaffolded but **unused** and unlinked from the product. The diff/cost engine already operates on resolved `DeckCard[]` structures, so it can be reused unchanged. The database is **empty** (no migrations yet). On-device history lives in localStorage with a single consumer (the `/` comparer).

## Desired End State

A signed-in user creates a named path at **/paths**, appends named checkpoints (each diffing against the prior step), and sees every step's grouped plan, per-step cost, and a cumulative cost — reopenable from any device without re-pasting. Logged-out visitors keep `/` as a stateless quick-check tool. Private paths are invisible to other users (RLS).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| MVP scope | Accounts + checkpoint paths (A+C); defer sharing | Finishable slice that proves the core "upgrade = a path" insight | Shape/PRD |
| Auth method | Email + password (reuse scaffold) | Already built; near-zero cost vs new integrations | Shape/PRD |
| Data access | Server `/api/paths/*` on cookie-bound client | Keeps key server-only, RLS as the user, matches existing auth routes | Plan |
| Data model | `upgrade_paths` + `path_steps`, resolved snapshot as `jsonb`; base = step 0 | Snapshot serializes existing `DeckCard[]` directly; uniform steps | Plan |
| Snapshot production | Client resolves, server validates + stores | Resolution stays client-side (engine guardrail; no Worker Scryfall calls) | Plan |
| Price/image refresh | Snapshot-only; defer refresh | Leanest slice; matches "approximate/may be stale" NFR | Plan |
| Cumulative cost | Sum of per-step add costs (approximate) | Stage-by-stage spend; reuses `planAddCost` | Shape/PRD |
| On-device history | Retire it (FR-009); `/` becomes stateless | No double-persistence; saving is account-only | Shape/PRD |
| `profiles` table | Defer to sharing slice | Nothing in A+C needs a public handle | Plan |
| Testing | Unit (logic) + RLS check + manual UI | Matches repo convention; covers chain math + security guardrail | Plan |

## Scope

**In scope:** email/password sign-in activated into the product; `/paths` list + `/paths/[id]` editor; create/rename/delete path; append + delete-last step; per-step plan, per-step cost, cumulative cost; first DB schema + RLS; retire on-device history.

**Out of scope:** sharing/fork/unlisted read, public gallery, price refresh, mid-path editing, branching, OAuth/passwordless/confirmation-email, localStorage import, server-side resolution, `profiles`, component-test tooling.

## Architecture / Approach

Browser resolves a step's list (existing client-side path) and POSTs `list_text` + a resolved snapshot to `/api/paths/*`, which run on the cookie-bound Supabase server client so **RLS** enforces ownership. Saved-path views recompute each step's plan via `diffDecks(steps[i-1].cards, steps[i].cards)` and cost via `planAddCost` — entirely from stored snapshots, no re-resolution. The `/` comparer and the diff/cost engine are untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB foundation & RLS | First migration: tables + owner-only RLS | Getting RLS policies correct (security-critical) |
| 2. Engine-reuse helpers | `resolveDeck`, `stepPlan`, `cumulativePathCost`, snapshot (de)serialize | `resolveDeck` refactor must keep engine output identical |
| 3. Server data API | `/api/paths/*` CRUD + step append/delete-last | Snapshot validation; correct status codes under RLS |
| 4. Path builder UI | `/paths` list + `/paths/[id]` editor | Reusing render components for base vs diff steps |
| 5. Auth wiring & history retirement | Header, redirect, remove localStorage history | No dangling history imports; `/` stays usable |

**Prerequisites:** local Supabase (Docker) for `db:reset`; the linked Supabase project for `db:push`.
**Estimated effort:** ~4–5 weeks after-hours across 5 phases (per the acknowledged shape-notes timeline).

## Open Risks & Assumptions

- **RLS is the entire security boundary** — a wrong policy leaks private paths. Phase 1's isolation test is the gate.
- The `resolveDeck` extraction assumes the existing deck tests fully pin engine behavior; if coverage is thin, parity must be checked manually.
- Snapshots freeze prices/images at save time; users have no in-app refresh until a later slice (accepted).
- Dropping localStorage history loses existing users' local data (accepted, FR-009).

## Success Criteria (Summary)

- A user builds a multi-step path and reopens it on another device without re-pasting; every step shows the right plan + cost.
- A second user cannot read or edit a private path (RLS verified).
- The anonymous `/` comparer still works, with no Save/History, and the engine output is unchanged.
