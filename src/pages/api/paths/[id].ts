import type { APIRoute } from "astro";
import { jsonResponse, requireUser, toUpgradePath, toPathStep } from "@/lib/api/paths";
import { parseTitleInput } from "@/lib/path";

/** GET /api/paths/[id] — the path plus its ordered steps. 404 when not owned/absent (RLS). */
export const GET: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = context.params.id;
  if (!id) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const { data: pathRow, error: pathError } = await auth.supabase
    .from("upgrade_paths")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (pathError) {
    return jsonResponse({ error: pathError.message }, 500);
  }
  if (!pathRow) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const { data: stepRows, error: stepsError } = await auth.supabase
    .from("path_steps")
    .select("*")
    .eq("path_id", id)
    .order("position", { ascending: true });

  if (stepsError) {
    return jsonResponse({ error: stepsError.message }, 500);
  }

  return jsonResponse({
    path: toUpgradePath(pathRow),
    steps: stepRows.map(toPathStep),
  });
};

/** PATCH /api/paths/[id] {title} — rename the path. 404 when not owned/absent (RLS). */
export const PATCH: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = context.params.id;
  if (!id) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const body = (await context.request.json().catch(() => null)) as unknown;
  const title = parseTitleInput(body);
  if (title === null) {
    return jsonResponse({ error: "Title is required" }, 400);
  }

  const { data, error } = await auth.supabase
    .from("upgrade_paths")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  if (!data) {
    return jsonResponse({ error: "Not found" }, 404);
  }
  return jsonResponse(toUpgradePath(data));
};

/** DELETE /api/paths/[id] — delete the path (steps cascade). 404 when not owned/absent (RLS). */
export const DELETE: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = context.params.id;
  if (!id) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const { data, error } = await auth.supabase.from("upgrade_paths").delete().eq("id", id).select("id");

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  if (data.length === 0) {
    return jsonResponse({ error: "Not found" }, 404);
  }
  return new Response(null, { status: 204 });
};
