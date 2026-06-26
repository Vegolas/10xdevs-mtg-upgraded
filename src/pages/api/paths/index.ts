import type { APIRoute } from "astro";
import { jsonResponse, requireUser, toUpgradePath } from "@/lib/api/paths";
import { parseTitleInput } from "@/lib/path";

/** GET /api/paths — the signed-in user's paths, newest first (RLS-scoped to owner). */
export const GET: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }

  const { data, error } = await auth.supabase
    .from("upgrade_paths")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse(data.map(toUpgradePath));
};

/** POST /api/paths {title} — create a new path owned by the signed-in user. */
export const POST: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }

  const body = (await context.request.json().catch(() => null)) as unknown;
  const title = parseTitleInput(body);
  if (title === null) {
    return jsonResponse({ error: "Title is required" }, 400);
  }

  const { data, error } = await auth.supabase
    .from("upgrade_paths")
    .insert({ owner_id: auth.user.id, title })
    .select("*")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse(toUpgradePath(data), 201);
};
