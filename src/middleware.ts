import { defineMiddleware } from "astro:middleware";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { logDegraded } from "@/lib/api/audit";
import { createClient } from "@/lib/supabase";

// `/paths` pages require a session and redirect to sign-in. The `/api/paths/*`
// routes are NOT listed here — they self-check and return 401 JSON rather than
// redirecting (and their pathname starts with `/api/paths`, not `/paths`).
const PROTECTED_ROUTES = ["/dashboard", "/paths"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
    // Degrading to anonymous is correct and stays — `getUser` catches every
    // `AuthError` and answers `{user: null, error}` rather than throwing, so a
    // signed-in user during an auth outage is still redirected to sign-in below.
    // What was missing is the ability to tell that outage apart from an ordinary
    // anonymous visitor, whose "no session" error is the expected case on every
    // public request. Logging it indiscriminately would fire on all of them.
    if (error && !isAuthSessionMissingError(error)) {
      logDegraded({
        op: "middleware.getUser",
        subject: { route: context.url.pathname },
        cause: "auth-unavailable",
        detail: error,
      });
    }
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
