import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteOwners } from "./helpers/cleanup";
import { armLogoutFailure, disarmFaults, faultStats, FAULT_BASE_URL } from "./helpers/faultProxy";
import { assertStatus } from "./helpers/http";
import { createOwner, signIn } from "./helpers/owners";

/**
 * `POST /api/auth/signout` when the token revoke fails — the change's one live
 * behavior defect, not an observability gap.
 *
 * Verified in library source: `GoTrueClient._signOut` returns `{error}` for any
 * revoke failure other than 401/403/404 **without reaching `_removeSession()`**.
 * Cookie clearing happens only through the `SIGNED_OUT` notification, so no
 * `_removeSession` means no `Set-Cookie` — and `signout.ts` redirects to `/`
 * regardless. The user is told they signed out while their session is fully
 * intact.
 *
 * ## Why this spec is annotated `it.fails()`
 *
 * It asserts the behavior Phase 4 will produce, so it is red on today's code.
 * Annotated, the suite stays green now and Playwright's/Vitest's "expected to
 * fail, but passed" reddens the moment the fix lands, at which point the
 * annotation comes off (Phase 4 step 3). See `context/foundation/lessons.md`,
 * "Pin a live defect with `test.fail()`".
 *
 * Both traps that entry names apply here:
 *
 * 1. **The annotation inverts the whole body**, so a broken harness inside it
 *    would report as an expected failure and cover nothing. Every piece of
 *    setup — the owner, the sign-in, the baseline hit count — is therefore in
 *    `beforeAll`, where a failure is a *hook* failure and stays real.
 * 2. **A red body proves nothing about which line was red.** Manual
 *    verification for this phase is: run once with the annotation removed and
 *    confirm the error is the missing clearing `Set-Cookie` and not a sign-in,
 *    a 403 or a proxy that was never reached.
 *
 * ## Why the hit count is asserted
 *
 * This spec only means anything if the fault dev server actually resolved its
 * `SUPABASE_URL` to the proxy. That resolution is fragile by construction —
 * `global-setup.ts` writes the local `.dev.vars` *after* this server boots, and
 * an `astro dev` config reload would silently repoint it at real Supabase,
 * where `logout` simply succeeds and the "no clearing cookie" assertion would
 * then be measuring the happy path. So the proxy counts logout hits and the
 * body asserts the count moved: a run that never routed through the proxy has
 * to fail, not pass.
 */
describe("fault — POST /api/auth/signout with a failing revoke", () => {
  const ownerIds: string[] = [];
  let cookieHeader = "";
  let logoutsBefore = 0;

  beforeAll(async () => {
    // Also the harness precondition: this throws a proxy-specific error if the
    // proxy is not up, which must not be absorbed by the inverted body below.
    await disarmFaults();

    const owner = await createOwner("fault-signout");
    ownerIds.push(owner.user.id);
    // Sign in against the FAULT server, through the still-transparent proxy, so
    // the cookies are real chunked `sb-*` cookies for a live session.
    cookieHeader = await signIn(FAULT_BASE_URL, owner.email, owner.password);
    logoutsBefore = (await faultStats()).logoutHits;
  });

  afterAll(async () => {
    await disarmFaults();
    await deleteOwners(ownerIds);
  });

  it.fails("clears every sb-* cookie so the user is signed out locally", async () => {
    await armLogoutFailure(500);

    const res = await fetch(`${FAULT_BASE_URL}/api/auth/signout`, {
      method: "POST",
      // Without `manual`, fetch follows the 302 and the Set-Cookie headers are lost.
      redirect: "manual",
      // `Origin` must match the host — Astro's CSRF check 403s same-shape form
      // POSTs that arrive without a matching Origin, before the handler runs.
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: FAULT_BASE_URL, Cookie: cookieHeader },
    });

    // Unchanged contract: the answer to the caller is the same as on success.
    await assertStatus(res, 302, "POST /api/auth/signout with a failing revoke");
    expect(res.headers.get("location")).toBe("/");

    // Anti-vacuity: the revoke was actually attempted through the armed proxy.
    expect((await faultStats()).logoutHits).toBeGreaterThan(logoutsBefore);

    // The defect and the fix, in one assertion per chunk: every cookie the
    // browser sent back must be answered with a clearing `Set-Cookie`.
    const cleared = new Set(
      res.headers
        .getSetCookie()
        .filter((cookie) => isClearing(cookie))
        .map((cookie) => cookieName(cookie)),
    );
    const sent = cookieHeader
      .split(";")
      .map((pair) => pair.split("=")[0].trim())
      .filter((name) => name.startsWith("sb-"));

    expect(sent.length).toBeGreaterThan(0);
    for (const name of sent) {
      expect(cleared, `no clearing Set-Cookie for ${name}`).toContain(name);
    }
  });
});

/** Name of a `Set-Cookie` header value. */
function cookieName(setCookie: string): string {
  return setCookie.split("=")[0].trim();
}

/**
 * Whether a `Set-Cookie` tells the browser to drop the cookie.
 *
 * Keyed on the expiry, not on an empty value: Astro's `cookies.delete` emits
 * `name=deleted; Expires=Thu, 01 Jan 1970 …` (`astro/dist/core/cookies/cookies.js`
 * — `DELETED_VALUE` is the string `"deleted"`), so a "value is empty" check
 * would read a correct deletion as no deletion at all.
 */
function isClearing(setCookie: string): boolean {
  const attributes = setCookie
    .split(";")
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase());

  const maxAge = attributes.find((attribute) => attribute.startsWith("max-age="));
  if (maxAge !== undefined && Number(maxAge.slice("max-age=".length)) <= 0) {
    return true;
  }

  const expires = attributes.find((attribute) => attribute.startsWith("expires="));
  if (expires !== undefined) {
    const when = Date.parse(expires.slice("expires=".length));
    return !Number.isNaN(when) && when <= Date.now();
  }

  return false;
}
