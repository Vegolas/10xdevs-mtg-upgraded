import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { corruptCookies, createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";

/**
 * Risk #2 (auth gate), page-redirect path: the middleware redirects protected
 * pages (`/dashboard`, `/paths`) to `/auth/signin` (302) when there is no valid
 * session — exercised with BOTH no cookie and a present-but-invalid token — and
 * a valid owner is NOT bounced. This is a separate enforcement path from the API
 * 401 gate (gate-api.int.test.ts).
 */
describe("auth gate — protected page redirect", () => {
  const ownerIds: string[] = [];
  let validCookie = "";
  let invalidCookie = "";
  // A syntactically valid id; the middleware redirects before the page loads it.
  const protectedPaths = ["/paths", "/paths/00000000-0000-0000-0000-000000000000", "/dashboard"];

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "gate-pages");
    ownerIds.push(owner.user.id);
    validCookie = owner.cookieHeader;
    invalidCookie = corruptCookies(owner.cookieHeader);
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  for (const path of protectedPaths) {
    it(`redirects ${path} to /auth/signin (302) with no cookie`, async () => {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/auth/signin");
    });

    it(`redirects ${path} to /auth/signin (302) with an invalid-token cookie`, async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        redirect: "manual",
        headers: { Cookie: invalidCookie },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/auth/signin");
    });
  }

  it("lets a valid owner through to /paths (200, not redirected)", async () => {
    const res = await fetch(`${BASE_URL}/paths`, {
      redirect: "manual",
      headers: { Cookie: validCookie },
    });

    expect(res.status).toBe(200);
  });
});
