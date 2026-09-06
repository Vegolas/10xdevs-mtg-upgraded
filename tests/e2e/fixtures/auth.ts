import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { PathStep, StepCreateRequest, PathTitleRequest, UpgradePath } from "@/lib/api/contract";
import type { Database } from "@/lib/database.types";
import { BASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

/**
 * Owner acquisition + path seeding for the browser suite.
 *
 * Ported from `tests/integration/helpers/{owners,paths,cleanup,http}.ts` rather than
 * imported: those modules resolve their env through `vitest.integration.config.ts`,
 * which Playwright never loads. The SHAPES are deliberately identical, so a change to
 * the create contract shows up in both places.
 *
 * Two house rules are load-bearing here:
 *
 * 1. AUTH NEVER GOES THROUGH THE UI. The owner is created with the service-role admin
 *    API (setup/teardown only), then signed in by POSTing the app's OWN
 *    `/api/auth/signin`, so the cookies come out in the exact `@supabase/ssr` chunked
 *    format the real middleware expects. Nothing is hand-formatted, and no spec ever
 *    types a password.
 * 2. WRITES GO THROUGH THE APP'S API. Seeding a path with `POST /api/paths` exercises
 *    RLS instead of bypassing it, which is what keeps the seeded row indistinguishable
 *    from one a real user made.
 *
 * `Origin` is set on every write: Astro's CSRF check answers a plain-text 403 to a
 * same-shape POST that arrives without a matching Origin, BEFORE the handler runs
 * (pinned in `tests/integration/contract-signin.int.test.ts:67-89`).
 */

/** Service-role client — owner create/delete ONLY. Never an assertion oracle for RLS. */
export const admin: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/** Min password length is 6 (`supabase/config.toml`); this clears it. */
const TEST_PASSWORD = "browser-e2e-test-pw";

export interface Owner {
  user: User;
  email: string;
  password: string;
}

/**
 * Status assertion that surfaces the response body on mismatch — the same reason
 * `tests/integration/helpers/http.ts` exists. A bare status check throws away the one
 * part of the response that explains a CI-only failure. On a 500 the body is redacted
 * to `{error, ref}`; match that `ref` against the `[api] 500 ref=…` line the dev
 * server writes to stderr, which `webServer.stderr: "pipe"` forwards to the report.
 */
async function assertStatus(res: APIResponse, expected: number, label: string): Promise<void> {
  if (res.status() === expected) {
    return;
  }
  let detail: string;
  try {
    detail = (await res.text()).trim();
  } catch {
    detail = "<body unreadable>";
  }
  if (detail.length > 800) {
    detail = `${detail.slice(0, 800)}…`;
  }
  const suffix = detail.length > 0 ? ` — body: ${detail}` : " — empty body";
  throw new Error(`${label} expected ${expected}, got ${res.status()}${suffix}`);
}

/** Create a distinct, immediately-usable owner (email confirmations are disabled locally). */
export async function createOwner(label: string): Promise<Owner> {
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`createOwner(${label}) failed: ${error.message}`);
  }
  return { user: data.user, email, password: TEST_PASSWORD };
}

/**
 * Sign in through the app's own route, leaving the real `sb-*` cookies in the given
 * request context's jar — from where `request.storageState()` hands them to the
 * browser. `maxRedirects: 0` keeps the 302 → `/paths` from being followed, and is
 * also what makes a failure legible: the handler answers a FAILED sign-in with a 302
 * to `/auth/signin?error=…` rather than a 4xx, so the location is the only signal.
 */
export async function signIn(request: APIRequestContext, owner: Owner): Promise<void> {
  const res = await request.post("/api/auth/signin", {
    form: { email: owner.email, password: owner.password },
    headers: { Origin: BASE_URL },
    maxRedirects: 0,
  });

  // `headers()` is typed as a TOTAL record; a non-redirect response simply has no
  // `location`, so the honest type is optional.
  const location = (res.headers() as Partial<Record<string, string>>).location ?? "";
  if (location.startsWith("/auth/signin")) {
    throw new Error(
      `signIn(${owner.email}) was rejected (redirected to ${location}). The dev server is probably ` +
        "not pointed at the LOCAL Supabase stack — check that `.dev.vars` was stashed and that a " +
        "stale dev server on this port is not being reused (`reuseExistingServer`).",
    );
  }
  await assertStatus(res, 302, `signIn(${owner.email})`);
}

/** Create an owner and leave them signed in on this request context. */
export async function createSignedInOwner(request: APIRequestContext, label: string): Promise<Owner> {
  const owner = await createOwner(label);
  await signIn(request, owner);
  return owner;
}

/**
 * Seed a path with one saved checkpoint — the state `/paths/[id]` needs before the
 * builder's Check and diff flows are reachable at all.
 *
 * The title carries a timestamp suffix so parallel workers and re-runs cannot collide
 * on it, and every spec seeds its OWN path so it can run standalone in any order.
 */
export async function seedPathWithStep(
  request: APIRequestContext,
  title: string,
): Promise<{ path: UpgradePath; step: PathStep }> {
  const pathBody: PathTitleRequest = { title: `${title} ${Date.now()}` };
  const pathRes = await request.post("/api/paths", {
    data: pathBody,
    headers: { Origin: BASE_URL },
  });
  await assertStatus(pathRes, 201, `seedPathWithStep("${title}") — create path`);
  const path = (await pathRes.json()) as UpgradePath;

  const stepBody: StepCreateRequest = { name: "base", listText: "", snapshot: { cards: [], unresolved: [] } };
  const stepRes = await request.post(`/api/paths/${path.id}/steps`, {
    data: stepBody,
    headers: { Origin: BASE_URL },
  });
  await assertStatus(stepRes, 201, `seedPathWithStep("${title}") — create step`);
  const step = (await stepRes.json()) as PathStep;

  return { path, step };
}

/** Remove a seeded path (and, by cascade, its steps) through the app's own API. */
export async function deletePath(request: APIRequestContext, pathId: string): Promise<void> {
  const res = await request.delete(`/api/paths/${pathId}`, { headers: { Origin: BASE_URL } });
  // 404 means it is already gone — cleanup must never mask the failure that got us here.
  if (res.status() !== 404) {
    await assertStatus(res, 204, `deletePath(${pathId})`);
  }
}

/** Delete an owner (and, by cascade, all their paths + steps). */
export async function deleteOwner(owner: Owner | string): Promise<void> {
  const userId = typeof owner === "string" ? owner : owner.user.id;
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`deleteOwner(${userId}) failed: ${error.message}`);
  }
}
