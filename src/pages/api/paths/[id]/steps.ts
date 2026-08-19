import type { APIRoute } from "astro";
import { errorResponse, jsonResponse, parsePathId, requireUser, serverError } from "@/lib/api/paths";
import type { PathStep } from "@/lib/api/contract";
import { parseStepInput, serializeSnapshot } from "@/lib/path";
import type { Json } from "@/lib/database.types";

/**
 * POST /api/paths/[id]/steps {name, listText, snapshot} — append a checkpoint.
 *
 * Server computes `position = max(position) + 1` (base is 0), validates the
 * snapshot via {@link parseStepInput} (400 on a malformed body), stores it, and
 * bumps the parent's `updated_at`. 404 when the path is not owned/absent (RLS).
 *
 * Body validation runs BEFORE the ownership check, so a malformed body aimed at
 * another owner's path answers 400, not 404. That ordering is part of the decided
 * contract, not an accident — keep it.
 */
export const POST: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = parsePathId(context);
  if (id === null) {
    return errorResponse("Not found", 404);
  }

  const body = (await context.request.json().catch(() => null)) as unknown;
  const input = parseStepInput(body);
  if (input === null) {
    return errorResponse("Invalid step payload", 400);
  }

  // Confirm the path exists and is owned (RLS-scoped) before appending.
  const { data: pathRow, error: pathError } = await auth.supabase
    .from("upgrade_paths")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (pathError) {
    return serverError(pathError);
  }
  if (!pathRow) {
    return errorResponse("Not found", 404);
  }

  const { data: last, error: lastError } = await auth.supabase
    .from("path_steps")
    .select("position")
    .eq("path_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return serverError(lastError);
  }
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await auth.supabase
    .from("path_steps")
    .insert({
      path_id: id,
      position,
      name: input.name,
      list_text: input.listText,
      snapshot: serializeSnapshot(input.snapshot) as Json,
      delta_text: input.deltaText ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error);
  }

  await auth.supabase.from("upgrade_paths").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return jsonResponse<PathStep>(data, 201);
};

/**
 * DELETE /api/paths/[id]/steps — remove only the highest-position step
 * (delete-last invariant), then bump the parent's `updated_at`. 404 when the
 * path has no steps or is not owned/absent (RLS).
 *
 * This route never queries `upgrade_paths`, so a cross-owner call is answered by
 * RLS hiding the steps: `{error: "No steps to delete"}`, indistinguishable from an
 * empty own path. Correct, and a pinned contract fact.
 */
export const DELETE: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = parsePathId(context);
  if (id === null) {
    return errorResponse("Not found", 404);
  }

  const { data: last, error: lastError } = await auth.supabase
    .from("path_steps")
    .select("id, position")
    .eq("path_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return serverError(lastError);
  }
  if (!last) {
    return errorResponse("No steps to delete", 404);
  }

  const { error } = await auth.supabase.from("path_steps").delete().eq("id", last.id);
  if (error) {
    return serverError(error);
  }

  await auth.supabase.from("upgrade_paths").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return new Response(null, { status: 204 });
};
