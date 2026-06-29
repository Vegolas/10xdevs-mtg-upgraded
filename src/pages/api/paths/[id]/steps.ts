import type { APIRoute } from "astro";
import { jsonResponse, requireUser, toPathStep } from "@/lib/api/paths";
import { parseStepInput, serializeSnapshot } from "@/lib/path";
import type { Json } from "@/lib/database.types";

/**
 * POST /api/paths/[id]/steps {name, listText, snapshot} — append a checkpoint.
 *
 * Server computes `position = max(position) + 1` (base is 0), validates the
 * snapshot via {@link parseStepInput} (400 on a malformed body), stores it, and
 * bumps the parent's `updated_at`. 404 when the path is not owned/absent (RLS).
 */
export const POST: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = context.params.id;
  if (!id) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const body = (await context.request.json().catch(() => null)) as unknown;
  const input = parseStepInput(body);
  if (input === null) {
    return jsonResponse({ error: "Invalid step payload" }, 400);
  }

  // Confirm the path exists and is owned (RLS-scoped) before appending.
  const { data: pathRow, error: pathError } = await auth.supabase
    .from("upgrade_paths")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (pathError) {
    return jsonResponse({ error: pathError.message }, 500);
  }
  if (!pathRow) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const { data: last, error: lastError } = await auth.supabase
    .from("path_steps")
    .select("position")
    .eq("path_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return jsonResponse({ error: lastError.message }, 500);
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
    return jsonResponse({ error: error.message }, 500);
  }

  await auth.supabase.from("upgrade_paths").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return jsonResponse(toPathStep(data), 201);
};

/**
 * DELETE /api/paths/[id]/steps — remove only the highest-position step
 * (delete-last invariant), then bump the parent's `updated_at`. 404 when the
 * path has no steps or is not owned/absent (RLS).
 */
export const DELETE: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = context.params.id;
  if (!id) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const { data: last, error: lastError } = await auth.supabase
    .from("path_steps")
    .select("id, position")
    .eq("path_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return jsonResponse({ error: lastError.message }, 500);
  }
  if (!last) {
    return jsonResponse({ error: "No steps to delete" }, 404);
  }

  const { error } = await auth.supabase.from("path_steps").delete().eq("id", last.id);
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  await auth.supabase.from("upgrade_paths").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return new Response(null, { status: 204 });
};
