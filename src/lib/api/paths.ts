/**
 * Server-only plumbing shared by the `/api/paths/*` route handlers
 * (user-accounts).
 *
 * Centralizes the four things every handler needs: response builders typed against
 * the declared wire contract (`./contract`), the auth gate (cookie-bound client +
 * signed-in user, or a 401), `[id]` validation, and row→domain mappers that turn
 * snake_case DB rows into the camelCase `@/lib/path` types the client consumes.
 * RLS — not this code — is the security boundary: the client is always the
 * cookie-bound one, so every query runs under the user's JWT.
 *
 * Server-only by design: this module reaches for Supabase and `astro`. The browser
 * side of the same contract is `./client`, which imports `./contract` and nothing
 * from here.
 */

import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { overallPathSummary, parseSnapshot } from "@/lib/path";
import type { PathStep, PathSummary, UpgradePath } from "@/lib/path";
import type { ApiError, ApiServerError } from "./contract";

/** The non-null cookie-bound client type, derived so it tracks `createClient`'s return. */
type DbClient = NonNullable<ReturnType<typeof createClient>>;
type PathRow = Database["public"]["Tables"]["upgrade_paths"]["Row"];
type StepRow = Database["public"]["Tables"]["path_steps"]["Row"];

/**
 * The canonical `uuid` text form Postgres hands back and every `[id]` route
 * expects. Case-insensitive, version-agnostic; the brace/unhyphenated variants
 * Postgres would also accept are deliberately rejected — a caller sending one is
 * not a client of ours.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build a JSON {@link Response} carrying `T` with the given status (default 200).
 *
 * Generic so a handler's response body is type-checked against the declared wire
 * contract — but ONLY when the call site writes the type argument explicitly
 * (`jsonResponse<UpgradePath>(toUpgradePath(row), 201)`). A bare call infers `T`
 * from the argument and therefore checks nothing, so the explicit argument is the
 * whole gate: it is what turns "a mapper stopped producing an `UpgradePath`" into
 * a `tsc` error instead of a silently reshaped response.
 *
 * `T` appears once in the signature on purpose, which is why the lint exemption
 * below is deliberate: the rule assumes a once-used parameter exists for
 * inference, but this one exists to be *written*, and constraining `data` to the
 * caller-declared type is the entire point.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- see the docstring above
export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A 4xx {@link ApiError} body — the one place the error envelope is constructed,
 * replacing the inline `{ error: … }` literals every handler used to write.
 */
export function errorResponse(message: string, status: number): Response {
  return jsonResponse<ApiError>({ error: message }, status);
}

/**
 * An unexpected-failure 500: log `detail` against a fresh correlation `ref`, then
 * return the redacted {@link ApiServerError} body.
 *
 * A raw `PostgrestError.message` names tables, columns and constraints, so it must
 * not reach the wire. The diagnosis path it used to serve moves to the server log:
 * the same `ref` appears in both, and the integration harness pipes the dev
 * server's output to the parent's stderr so CI keeps the detail
 * (`tests/integration/global-setup.ts`).
 */
export function serverError(detail: unknown): Response {
  const ref = crypto.randomUUID();
  // The only channel that still carries the cause — see the docstring above.
  // eslint-disable-next-line no-console -- deliberate: `ref` correlates this line to the 500 body
  console.error(`[api] 500 ref=${ref}`, detail);
  return jsonResponse<ApiServerError>({ error: "Internal error", ref }, 500);
}

/**
 * The validated `[id]` route param, or `null` when it is missing **or not a
 * UUID**. Handlers turn `null` into the decided 404: passing a malformed id
 * through to `.eq("id", …)` makes Postgres reject the query, which used to
 * surface as a 500 carrying its message.
 */
export function parsePathId(context: APIContext): string | null {
  const id = context.params.id;
  if (id === undefined || !UUID_PATTERN.test(id)) {
    return null;
  }
  return id;
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
    return errorResponse("Unauthorized", 401);
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

/** A listed path paired with its computed base→final {@link PathSummary} (grid metadata). */
export interface PathWithSummary {
  path: UpgradePath;
  summary: PathSummary;
}

/**
 * Map a path row plus its embedded step rows to the saved-decks grid shape: the
 * domain path plus an {@link overallPathSummary} (base→final cost + in/out counts)
 * computed from the stored snapshots only — no card-data lookups. Step rows are
 * sorted by `position` first so the first/last pair is the true base/final.
 */
export function toPathWithSummary(row: PathRow, stepRows: StepRow[]): PathWithSummary {
  const snapshots = [...stepRows]
    .sort((a, b) => a.position - b.position)
    .map((step) => parseSnapshot(step.snapshot) ?? { cards: [], unresolved: [] });
  return { path: toUpgradePath(row), summary: overallPathSummary(snapshots) };
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
    deltaText: row.delta_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
