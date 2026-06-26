import { defineMiddleware } from "astro:middleware";
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
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
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
