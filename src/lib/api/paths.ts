/**
 * Server-only plumbing shared by the `/api/paths/*` route handlers
 * (user-accounts).
 *
 * Centralizes the three things every handler needs: a JSON `Response` helper, the
 * auth gate (cookie-bound client + signed-in user, or a 401), and row→domain
 * mappers that turn snake_case DB rows into the camelCase `@/lib/path` types the
 * client consumes. RLS — not this code — is the security boundary: the client is
 * always the cookie-bound one, so every query runs under the user's JWT.
 */

import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { parseSnapshot } from "@/lib/path";
import type { PathStep, UpgradePath } from "@/lib/path";

/** The non-null cookie-bound client type, derived so it tracks `createClient`'s return. */
type DbClient = NonNullable<ReturnType<typeof createClient>>;
type PathRow = Database["public"]["Tables"]["upgrade_paths"]["Row"];
type StepRow = Database["public"]["Tables"]["path_steps"]["Row"];

/** Build a JSON {@link Response} with the given status (default 200). */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Resolve the cookie-bound client and the signed-in user, or a `401` JSON
 * {@link Response} when either is missing. Handlers branch on the result:
 * `if (auth instanceof Response) return auth;`.
 */
export function requireUser(context: APIContext): { supabase: DbClient; user: User } | Response {
  const supabase = createClient(context.request.headers, context.cookies);
  const user = context.locals.user;
  if (!supabase || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return { supabase, user };
}

/** Map an `upgrade_paths` row to the {@link UpgradePath} domain type. */
export function toUpgradePath(row: PathRow): UpgradePath {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map a `path_steps` row to the {@link PathStep} domain type. A stored snapshot
 * is parsed defensively; the empty-snapshot fallback only triggers on corruption
 * (snapshots are validated on write), so a single bad row degrades to an empty
 * checkpoint rather than failing the whole path load.
 */
export function toPathStep(row: StepRow): PathStep {
  return {
    id: row.id,
    pathId: row.path_id,
    position: row.position,
    name: row.name,
    listText: row.list_text,
    snapshot: parseSnapshot(row.snapshot) ?? { cards: [], unresolved: [] },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
