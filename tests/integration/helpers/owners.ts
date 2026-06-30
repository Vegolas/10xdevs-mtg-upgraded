import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

/**
 * Two-owner seeding + faithful cookie acquisition for the integration suite.
 *
 * Owners are created with the service-role admin API (setup/teardown only).
 * Session cookies are obtained by POSTing the app's OWN `/api/auth/signin`, so
 * the cookies come out in the exact `@supabase/ssr` chunked format the real
 * middleware expects — no hand-formatted cookies.
 */

/** Service-role client — privileged setup/teardown + DB-state read-back ONLY. Never an assertion oracle for RLS. */
export const admin: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/** Min password length is 6 (supabase/config.toml); this clears it. */
const TEST_PASSWORD = "integration-test-pw";

export interface Owner {
  user: User;
  email: string;
  password: string;
}

/** Create a distinct, immediately-usable owner (email confirmations are disabled locally). */
export async function createOwner(label: string): Promise<Owner> {
  const email = `owner-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
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
 * Sign in through the app's own route and reassemble all `sb-*` cookies
 * (including chunked `.0`/`.1`) into a single `Cookie` header for replay.
 * `redirect: "manual"` keeps the 302 → `/paths` from being followed so the
 * `Set-Cookie` headers survive.
 */
export async function signIn(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/signin`, {
    method: "POST",
    redirect: "manual",
    // `Origin` must match the host — Astro's CSRF check 403s same-shape form
    // POSTs that arrive without a matching Origin, before the handler runs.
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: baseUrl },
    body: new URLSearchParams({ email, password }),
  });

  const pairs = res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0].trim())
    .filter((pair) => pair.startsWith("sb-"));

  if (pairs.length === 0) {
    throw new Error(`signIn(${email}) set no sb-* cookies (status ${res.status}); check the local anon key.`);
  }
  return pairs.join("; ");
}

/** Convenience: create an owner and return them already signed in with a replayable cookie header. */
export async function createSignedInOwner(baseUrl: string, label: string): Promise<Owner & { cookieHeader: string }> {
  const owner = await createOwner(label);
  const cookieHeader = await signIn(baseUrl, owner.email, owner.password);
  return { ...owner, cookieHeader };
}
