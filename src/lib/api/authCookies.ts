import { parseCookieHeader } from "@supabase/ssr";

/**
 * Enumerate the session cookie names off an incoming request.
 *
 * Needed because `@supabase/ssr` **chunks** the session cookie when the token
 * is large: one logical `sb-<ref>-auth-token` arrives as `…-auth-token.0`,
 * `…-auth-token.1`, and so on. So "clear the session" is not a single known
 * name — the set has to be read from what the browser actually sent.
 *
 * Its one caller is `src/pages/api/auth/signout.ts`, which clears the session
 * locally when the server-side revoke fails. It lives in its own module rather
 * than inside that route for the same reason as `./audit`: it imports nothing
 * that reaches `astro:*` or `@/lib/supabase`, so plain vitest can load it and
 * the chunk handling gets real coverage. `@supabase/ssr` is safe to import here
 * — it is a plain dependency with no Astro surface.
 */

/** `sb-` is the prefix `@supabase/ssr` puts on every cookie it owns; nothing else uses it. */
const AUTH_COOKIE_PREFIX = "sb-";

/**
 * Every `sb-`-prefixed cookie name present in `cookieHeader`, in header order.
 *
 * Parsed with `parseCookieHeader` — the same parser `src/lib/supabase.ts:13`
 * feeds the server client — rather than a hand-rolled `split(";")`, so the two
 * sides agree on quoting, whitespace and duplicate handling by construction.
 * A hand-rolled split is where a name like `sb-x-auth-token.1` that carries an
 * `=` inside a quoted value would silently be read wrong.
 */
export function authCookieNames(cookieHeader: string): string[] {
  return parseCookieHeader(cookieHeader)
    .map(({ name }) => name)
    .filter((name) => name.startsWith(AUTH_COOKIE_PREFIX));
}
