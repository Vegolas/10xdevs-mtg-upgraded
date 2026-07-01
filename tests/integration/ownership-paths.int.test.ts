import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";
import { createPath, addStep, pathExists, readPathTitle } from "./helpers/paths";

/**
 * Risk #1 (cross-owner / IDOR), single-resource routes: Owner A must never read
 * or mutate Owner B's path through `/api/paths/[id]`. Denial is a **404** (RLS
 * makes B's row invisible, so the handler can't tell "absent" from "not yours"),
 * and every mutating case also asserts B's DB row is unchanged/present via a
 * service-role read-back — not merely the status.
 */
describe("cross-owner isolation — single-resource /api/paths/[id]", () => {
  const ownerIds: string[] = [];
  let aCookie = "";
  let bPathId = "";
  const bTitle = "B's private path";

  beforeAll(async () => {
    const a = await createSignedInOwner(BASE_URL, "paths-a");
    const b = await createSignedInOwner(BASE_URL, "paths-b");
    ownerIds.push(a.user.id, b.user.id);
    aCookie = a.cookieHeader;

    const bPath = await createPath(BASE_URL, b.cookieHeader, bTitle);
    bPathId = bPath.id;
    await addStep(BASE_URL, b.cookieHeader, bPathId, "base");
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  it("A reading B's path gets 404 and none of B's data leaks in the body", async () => {
    const res = await fetch(`${BASE_URL}/api/paths/${bPathId}`, { headers: { Cookie: aCookie } });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { path?: unknown; steps?: unknown; error?: string };
    expect(body.path).toBeUndefined();
    expect(body.steps).toBeUndefined();
  });

  it("A patching B's path gets 404 and B's title is unchanged in the DB", async () => {
    const res = await fetch(`${BASE_URL}/api/paths/${bPathId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: BASE_URL, Cookie: aCookie },
      body: JSON.stringify({ title: "pwned by A" }),
    });

    expect(res.status).toBe(404);
    expect(await readPathTitle(bPathId)).toBe(bTitle);
  });

  it("A deleting B's path gets 404 and B's row still exists in the DB", async () => {
    const res = await fetch(`${BASE_URL}/api/paths/${bPathId}`, {
      method: "DELETE",
      headers: { Origin: BASE_URL, Cookie: aCookie },
    });

    expect(res.status).toBe(404);
    expect(await pathExists(bPathId)).toBe(true);
  });
});

/**
 * Risk #1, list route: `GET /api/paths` is pure-RLS (no `owner_id` filter in the
 * handler), so a leak here would be a filtered-200 surfacing B's rows. Prove A's
 * list contains none of B's path ids.
 */
describe("cross-owner isolation — list /api/paths", () => {
  const ownerIds: string[] = [];
  let aCookie = "";
  let bPathId = "";

  beforeAll(async () => {
    const a = await createSignedInOwner(BASE_URL, "list-a");
    const b = await createSignedInOwner(BASE_URL, "list-b");
    ownerIds.push(a.user.id, b.user.id);
    aCookie = a.cookieHeader;

    // A has a path of their own so the list is non-empty (rules out a false pass
    // from A simply seeing nothing).
    await createPath(BASE_URL, a.cookieHeader, "A's own path");
    const bPath = await createPath(BASE_URL, b.cookieHeader, "B's private path");
    bPathId = bPath.id;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  it("A's list returns 200 with A's rows and none of B's ids", async () => {
    const res = await fetch(`${BASE_URL}/api/paths`, { headers: { Cookie: aCookie } });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.map((row) => row.id)).not.toContain(bPathId);
  });
});
