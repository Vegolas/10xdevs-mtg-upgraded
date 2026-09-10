/**
 * `authCookieNames` unit coverage.
 *
 * The risk this file defends: `src/pages/api/auth/signout.ts` clears the session
 * locally when the revoke fails, and it can only clear the names this function
 * returns. Two ways that goes silently wrong, and neither is observable from the
 * integration suite:
 *
 * 1. **A missed chunk leaves a live session.** `@supabase/ssr` splits a large
 *    token across `…-auth-token.0` / `.1`, so a function that only knows the
 *    unsuffixed name would clear nothing and the "fix" would reproduce the
 *    defect. Local Supabase issues a *single*, unchunked cookie — verified while
 *    writing `tests/integration/fault-signout.int.test.ts`, whose failure named
 *    exactly one cookie — so the chunked shape is **only** reachable here. A
 *    green integration run is not evidence about it.
 * 2. **An over-broad match logs the user out of something else.** Anything that
 *    is not `sb-`-prefixed belongs to the site or a third party and must survive
 *    a sign-out untouched.
 */

import { describe, expect, it } from "vitest";
import { authCookieNames } from "./authCookies";

describe("authCookieNames", () => {
  it("returns both halves of a chunked session cookie", () => {
    const header = "sb-127-auth-token.0=chunk-one; sb-127-auth-token.1=chunk-two";

    expect(authCookieNames(header)).toEqual(["sb-127-auth-token.0", "sb-127-auth-token.1"]);
  });

  it("returns the single unchunked name — the shape local Supabase actually issues", () => {
    expect(authCookieNames("sb-127-auth-token=base64-payload")).toEqual(["sb-127-auth-token"]);
  });

  it("leaves cookies it does not own alone", () => {
    const header = "theme=dark; sb-127-auth-token=payload; _ga=GA1.1.42; session-hint=sb-lookalike";

    expect(authCookieNames(header)).toEqual(["sb-127-auth-token"]);
  });

  it("returns nothing for an empty header", () => {
    expect(authCookieNames("")).toEqual([]);
  });

  it("returns nothing when the request carries no sb-* cookie at all", () => {
    expect(authCookieNames("theme=dark; _ga=GA1.1.42")).toEqual([]);
  });
});
