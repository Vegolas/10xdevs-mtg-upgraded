import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { assertStatus } from "./helpers/http";
import { createOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";

/**
 * Risk #3, `POST /api/auth/signin` — the harness's own foundation.
 *
 * Every other integration suite obtains its cookies through this route, so a
 * change to its 302 / `Set-Cookie` contract currently fails *everything* with a
 * confusing error ("set no sb-* cookies") instead of one clear failure here. This
 * suite is that clear failure.
 *
 * The oracle is the decided-contract table in
 * `context/changes/testing-api-contract-pinning/plan.md`: `documented` — 302 for
 * pages, 401 JSON for the API. The second test pins Astro's CSRF behaviour, which
 * is framework, not application: a form-shaped cross-origin POST without a
 * matching `Origin` is refused **before** the handler runs, with a plain-text 403.
 * Every future test author trips over it once; this is where it is written down.
 */
describe("contract — POST /api/auth/signin", () => {
  const ownerIds: string[] = [];
  let email = "";
  let password = "";

  beforeAll(async () => {
    const owner = await createOwner("contract-signin");
    ownerIds.push(owner.user.id);
    email = owner.email;
    password = owner.password;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  // documented (302 for pages, 401 JSON for the API): the redirect target and the
  // chunked `sb-*` cookies are the whole contract — and the cookies must actually work.
  it("returns 302 to /paths with sb-* cookies that then authenticate the API", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: "POST",
      // Without `manual`, fetch follows the 302 and the Set-Cookie headers are lost.
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE_URL },
      body: new URLSearchParams({ email, password }),
    });

    await assertStatus(res, 302, "POST /api/auth/signin");
    expect(res.headers.get("location")).toBe("/paths");

    const sbCookies = res.headers.getSetCookie().filter((cookie) => cookie.startsWith("sb-"));
    expect(sbCookies.length).toBeGreaterThan(0);

    // Reassemble exactly the way a browser would: name=value pairs, semicolon-joined.
    const cookieHeader = sbCookies.map((cookie) => cookie.split(";")[0].trim()).join("; ");
    const listRes = await fetch(`${BASE_URL}/api/paths`, { headers: { Cookie: cookieHeader } });

    await assertStatus(listRes, 200, "GET /api/paths with the cookies signin issued");
    expect(Array.isArray(await listRes.json())).toBe(true);
  });

  // Framework behaviour, pinned deliberately: Astro's `security.checkOrigin` refuses
  // a form-like non-GET request that carries no matching `Origin`, with a plain-text
  // 403 and no session cookie. It is NOT the app's `{error}` envelope — which is why
  // `helpers/owners.ts` sends `Origin` on every mutating request.
  it("is refused with a plain-text 403, not a JSON error, when Origin is missing", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password }),
    });

    await assertStatus(res, 403, "POST /api/auth/signin without an Origin header");
    expect(res.headers.getSetCookie().filter((cookie) => cookie.startsWith("sb-"))).toHaveLength(0);

    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).not.toContain("application/json");

    const text = await res.text();
    let parsesAsJson = true;
    try {
      JSON.parse(text);
    } catch {
      parsesAsJson = false;
    }
    expect(parsesAsJson).toBe(false);
  });
});
