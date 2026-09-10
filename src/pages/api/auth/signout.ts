import type { APIRoute } from "astro";
import { logDegraded } from "@/lib/api/audit";
import { authCookieNames } from "@/lib/api/authCookies";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut();

    // A failed revoke used to leave the session fully intact while redirecting
    // the user to `/` as though they had signed out. `GoTrueClient._signOut`
    // returns `{error}` for any revoke failure other than 401/403/404 WITHOUT
    // reaching `_removeSession()`, and the cookies are only cleared through the
    // `SIGNED_OUT` notification that `_removeSession` raises — so no
    // `Set-Cookie` at all, and the next request is still authenticated.
    //
    // Honour what the user clicked: drop the session on this side. That is a
    // LOCAL sign-out — the refresh token stays valid server-side until it
    // expires, which is a deliberate tradeoff pinned by
    // `tests/integration/fault-signout.int.test.ts` so a future move to a
    // global revoke has to be a deliberate test edit.
    if (error) {
      // Read the names off the request rather than assuming one: `@supabase/ssr`
      // chunks a large token across `…-auth-token.0` / `.1`. `path: "/"` matches
      // the path it set them on (`DEFAULT_COOKIE_OPTIONS`); a mismatched path
      // emits a `Set-Cookie` the browser applies to a different cookie.
      for (const name of authCookieNames(context.request.headers.get("Cookie") ?? "")) {
        context.cookies.delete(name, { path: "/" });
      }

      logDegraded({
        op: "auth.signOut.revoke",
        subject: { user: context.locals.user?.id ?? "anonymous" },
        cause: "revoke-failed",
        detail: error,
      });
    }
  }

  // Unchanged in both cases — and the deletions above must already be recorded,
  // since Astro attaches outgoing cookie mutations to whatever response the
  // route returns. Deleting after building the response drops the `Set-Cookie`
  // silently, reproducing the defect with the fix apparently in place.
  return context.redirect("/");
};
