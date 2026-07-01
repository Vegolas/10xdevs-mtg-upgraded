import { admin } from "./owners";

/**
 * Path/step helpers for the ownership suites.
 *
 * WRITES go through the app's own JSON API with an owner's cookies (the
 * authentic path a real client takes). READ-BACKS go through the service-role
 * `admin` client, which bypasses RLS — the only way to prove "B's row is still
 * there / unchanged" after A's request, since RLS hides B's rows from A.
 * Service-role is used for setup + assertions-about-DB-state ONLY, never as the
 * oracle for whether A's request was allowed (that is the HTTP status).
 */

export interface CreatedPath {
  id: string;
  title: string;
}

/** Create a path as the given owner via `POST /api/paths` (201). */
export async function createPath(baseUrl: string, cookieHeader: string, title: string): Promise<CreatedPath> {
  const res = await fetch(`${baseUrl}/api/paths`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl, Cookie: cookieHeader },
    body: JSON.stringify({ title }),
  });
  if (res.status !== 201) {
    throw new Error(`createPath("${title}") expected 201, got ${res.status}`);
  }
  const body = (await res.json()) as CreatedPath;
  return { id: body.id, title: body.title };
}

/** Append a checkpoint step as the given owner via `POST /api/paths/{id}/steps` (201). Returns the step id. */
export async function addStep(baseUrl: string, cookieHeader: string, pathId: string, name = "base"): Promise<string> {
  const res = await fetch(`${baseUrl}/api/paths/${pathId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl, Cookie: cookieHeader },
    body: JSON.stringify({ name, listText: "", snapshot: { cards: [], unresolved: [] } }),
  });
  if (res.status !== 201) {
    throw new Error(`addStep(${pathId}) expected 201, got ${res.status}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** Service-role read-back: the path's current title, or `null` if the row is gone. */
export async function readPathTitle(pathId: string): Promise<string | null> {
  const { data, error } = await admin.from("upgrade_paths").select("title").eq("id", pathId).maybeSingle();
  if (error) {
    throw new Error(`readPathTitle(${pathId}) failed: ${error.message}`);
  }
  return data?.title ?? null;
}

/** Service-role read-back: whether the path row still exists. */
export async function pathExists(pathId: string): Promise<boolean> {
  return (await readPathTitle(pathId)) !== null;
}

/** Service-role read-back: how many steps the path currently has (RLS-bypassing count). */
export async function countSteps(pathId: string): Promise<number> {
  const { count, error } = await admin
    .from("path_steps")
    .select("*", { count: "exact", head: true })
    .eq("path_id", pathId);
  if (error) {
    throw new Error(`countSteps(${pathId}) failed: ${error.message}`);
  }
  return count ?? 0;
}

/** Service-role read-back: whether a specific step id still exists. */
export async function stepExists(stepId: string): Promise<boolean> {
  const { data, error } = await admin.from("path_steps").select("id").eq("id", stepId).maybeSingle();
  if (error) {
    throw new Error(`stepExists(${stepId}) failed: ${error.message}`);
  }
  return data !== null;
}
