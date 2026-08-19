import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";
import { createPath, addStep, countSteps, stepExists } from "./helpers/paths";

/**
 * Risk #1 (cross-owner / IDOR), step routes — the highest-value targets. `path_steps`
 * has no `owner_id`; it is protected transitively via an `EXISTS` subquery on the
 * parent path. A future too-broad policy could 404 the client while still mutating
 * B's rows, so these tests assert **DB state** (service-role read-back), not just
 * the HTTP status.
 */
describe("cross-owner isolation — step routes /api/paths/[id]/steps", () => {
  const ownerIds: string[] = [];
  let aCookie = "";
  let bPathId = "";
  let bStepId = "";

  beforeAll(async () => {
    const a = await createSignedInOwner(BASE_URL, "steps-a");
    const b = await createSignedInOwner(BASE_URL, "steps-b");
    ownerIds.push(a.user.id, b.user.id);
    aCookie = a.cookieHeader;

    const bPath = await createPath(BASE_URL, b.cookieHeader, "B's path with a step");
    bPathId = bPath.id;
    bStepId = (await addStep(BASE_URL, b.cookieHeader, bPathId, "base")).id;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  it("A appending a step to B's path gets 404 and no step is written into B's path", async () => {
    const before = await countSteps(bPathId);

    const res = await fetch(`${BASE_URL}/api/paths/${bPathId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL, Cookie: aCookie },
      body: JSON.stringify({ name: "A's injection", listText: "", snapshot: { cards: [], unresolved: [] } }),
    });

    expect(res.status).toBe(404);
    expect(await countSteps(bPathId)).toBe(before);
  });

  it("A deleting a step from B's path gets 404 and B's last step still exists", async () => {
    const before = await countSteps(bPathId);

    const res = await fetch(`${BASE_URL}/api/paths/${bPathId}/steps`, {
      method: "DELETE",
      headers: { Origin: BASE_URL, Cookie: aCookie },
    });

    expect(res.status).toBe(404);
    expect(await countSteps(bPathId)).toBe(before);
    expect(await stepExists(bStepId)).toBe(true);
  });
});
