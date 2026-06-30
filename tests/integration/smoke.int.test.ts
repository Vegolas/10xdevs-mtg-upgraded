import { afterAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { createOwner, signIn } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";

/**
 * Harness smoke test: prove the whole machinery works before any risk suite.
 * One owner is seeded and signed in; a real authorized `GET /api/paths` returns
 * 200 + an array. No guarantee is asserted beyond "boots, seeds, authenticates,
 * authorized request succeeds."
 */
describe("integration harness smoke", () => {
  const createdOwnerIds: string[] = [];

  afterAll(async () => {
    await deleteOwners(createdOwnerIds);
  });

  it("seeds an owner, authenticates via the app, and serves their paths", async () => {
    const owner = await createOwner("smoke");
    createdOwnerIds.push(owner.user.id);

    const cookieHeader = await signIn(BASE_URL, owner.email, owner.password);

    const res = await fetch(`${BASE_URL}/api/paths`, {
      headers: { Cookie: cookieHeader },
    });

    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
