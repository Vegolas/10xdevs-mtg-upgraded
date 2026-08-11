import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { assertStatus } from "./helpers/http";
import { corruptCookies, createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";

/**
 * Risk #2 (auth gate), API path: `/api/paths/*` is NOT middleware-redirected — it
 * is gated independently by `requireUser`, which returns 401 JSON when there is
 * no valid session. Exercised with BOTH no cookie and a present-but-invalid
 * token on representative routes, plus a valid-owner control that must get 200.
 */
describe("auth gate — API 401", () => {
  const ownerIds: string[] = [];
  let validCookie = "";
  let invalidCookie = "";
  // The list route and one `[id]` route — the id need not exist; the gate runs first.
  const apiRoutes = ["/api/paths", "/api/paths/00000000-0000-0000-0000-000000000000"];

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "gate-api");
    ownerIds.push(owner.user.id);
    validCookie = owner.cookieHeader;
    invalidCookie = corruptCookies(owner.cookieHeader);
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  for (const route of apiRoutes) {
    it(`returns 401 Unauthorized for ${route} with no cookie`, async () => {
      const res = await fetch(`${BASE_URL}${route}`);

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("Unauthorized");
    });

    it(`returns 401 Unauthorized for ${route} with an invalid-token cookie`, async () => {
      const res = await fetch(`${BASE_URL}${route}`, { headers: { Cookie: invalidCookie } });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("Unauthorized");
    });
  }

  it("lets a valid owner call GET /api/paths (200)", async () => {
    const res = await fetch(`${BASE_URL}/api/paths`, { headers: { Cookie: validCookie } });

    await assertStatus(res, 200, "GET /api/paths with a valid owner's cookies");
  });
});
