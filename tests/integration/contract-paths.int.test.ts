import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PathTitleRequest } from "@/lib/api/contract";
import { BASE_URL } from "./helpers/env";
import { assertStatus } from "./helpers/http";
import { createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";
import { addStep, createPath } from "./helpers/paths";
import { expectApiError, expectExactKeys, expectPathStep, expectUpgradePath } from "./helpers/shape";

/**
 * Risk #3 (contract drift), `/api/paths` + `/api/paths/[id]`.
 *
 * Every assertion below cites the **decided-contract table** in
 * `context/changes/testing-api-contract-pinning/plan.md`, marked `documented`
 * (specified by an archived design doc, independently of today's code) or
 * `decided` (the docs are silent and the plan made the call). Nothing here reads a
 * value out of a handler to build its own expectation — that would pin the bug
 * instead of the contract.
 *
 * Three of these surfaces have never been exercised: the `{path, steps}` happy
 * path, the PATCH response body, and a successful `DELETE` (204). Key sets are
 * closed via `helpers/shape.ts`, statuses go through `assertStatus` so a failure
 * carries the body, and every mutating request carries `Origin` (Astro's CSRF
 * check 403s a same-shape POST without it, before the handler runs).
 */

/** Owner-authenticated JSON headers for a mutating request. */
function mutatingHeaders(cookieHeader: string): Record<string, string> {
  return { "Content-Type": "application/json", Origin: BASE_URL, Cookie: cookieHeader };
}

/** A timestamp-suffixed title so parallel runs and re-runs never collide. */
function uniqueTitle(label: string): string {
  return `contract-${label}-${Date.now()}`;
}

describe("contract — GET /api/paths (list)", () => {
  const ownerIds: string[] = [];
  let cookie = "";
  let olderId = "";
  let newerId = "";

  beforeAll(async () => {
    // A dedicated owner so the list is exactly the two rows this suite seeded —
    // the other describes in this file mutate their own owner's paths.
    const owner = await createSignedInOwner(BASE_URL, "contract-list");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;

    olderId = (await createPath(BASE_URL, cookie, uniqueTitle("list-older"))).id;
    newerId = (await createPath(BASE_URL, cookie, uniqueTitle("list-newer"))).id;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  // documented (newest-first list): 200, bare `UpgradePath[]`, `created_at` desc.
  it("returns 200 and a bare UpgradePath array, newest first", async () => {
    const res = await fetch(`${BASE_URL}/api/paths`, { headers: { Cookie: cookie } });

    await assertStatus(res, 200, "GET /api/paths");
    const body: unknown = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const rows = body as unknown[];
    const paths = rows.map((row, index) => expectUpgradePath(row, `GET /api/paths [${index}]`));
    expect(paths).toHaveLength(2);

    const ids = paths.map((path) => path.id);
    expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));

    const createdAt = paths.map((path) => Date.parse(path.createdAt));
    for (let i = 1; i < createdAt.length; i += 1) {
      expect(createdAt[i - 1]).toBeGreaterThanOrEqual(createdAt[i]);
    }
  });
});

describe("contract — POST /api/paths (create)", () => {
  const ownerIds: string[] = [];
  let cookie = "";
  let ownerUserId = "";

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "contract-create");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;
    ownerUserId = owner.user.id;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  // documented (created resource returned): 201 + the `UpgradePath` itself, owned by the caller.
  it("returns 201 and the created UpgradePath owned by the caller", async () => {
    const title = uniqueTitle("create");
    const body: PathTitleRequest = { title };
    const res = await fetch(`${BASE_URL}/api/paths`, {
      method: "POST",
      headers: mutatingHeaders(cookie),
      body: JSON.stringify(body),
    });

    await assertStatus(res, 201, "POST /api/paths");
    const created = expectUpgradePath(await res.json(), "POST /api/paths");
    expect(created.title).toBe(title);
    expect(created.ownerId).toBe(ownerUserId);
  });

  // documented (reject-400 on invalid input): the title guard trims, so the stored
  // and returned title is the trimmed form — the client never has to trim again.
  it("trims surrounding whitespace from the title", async () => {
    const title = uniqueTitle("trim");
    const body = { title: `   ${title}   ` } satisfies PathTitleRequest;
    const res = await fetch(`${BASE_URL}/api/paths`, {
      method: "POST",
      headers: mutatingHeaders(cookie),
      body: JSON.stringify(body),
    });

    await assertStatus(res, 201, "POST /api/paths with a padded title");
    const created = expectUpgradePath(await res.json(), "POST /api/paths with a padded title");
    expect(created.title).toBe(title);
  });

  // documented (reject-400 on invalid input): 400 `{error: "Title is required"}`.
  for (const [label, body] of [
    ["a missing title", {}],
    ["a blank title", { title: "   " }],
  ] as const) {
    it(`rejects ${label} with 400 {error: "Title is required"}`, async () => {
      const res = await fetch(`${BASE_URL}/api/paths`, {
        method: "POST",
        headers: mutatingHeaders(cookie),
        body: JSON.stringify(body),
      });

      await assertStatus(res, 400, `POST /api/paths with ${label}`);
      expectApiError(await res.json(), "Title is required", `POST /api/paths with ${label}`);
    });
  }
});

describe("contract — GET /api/paths/[id] (path + steps)", () => {
  const ownerIds: string[] = [];
  let cookie = "";
  let pathId = "";
  let pathTitle = "";

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "contract-read");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;

    pathTitle = uniqueTitle("read");
    pathId = (await createPath(BASE_URL, cookie, pathTitle)).id;
    // Three checkpoints so "ascending position" is a real ordering claim, not a
    // single-element tautology.
    await addStep(BASE_URL, cookie, pathId, "base");
    await addStep(BASE_URL, cookie, pathId, "second");
    await addStep(BASE_URL, cookie, pathId, "third");
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  // documented (path + ordered steps); the `{path, steps}` **envelope shape** is decided.
  it("returns 200 with exactly {path, steps}, steps ascending by position", async () => {
    const res = await fetch(`${BASE_URL}/api/paths/${pathId}`, { headers: { Cookie: cookie } });

    await assertStatus(res, 200, `GET /api/paths/${pathId}`);
    const envelope = expectExactKeys(await res.json(), ["path", "steps"], `GET /api/paths/${pathId}`);

    const path = expectUpgradePath(envelope.path, `GET /api/paths/${pathId} .path`);
    expect(path.id).toBe(pathId);
    expect(path.title).toBe(pathTitle);

    expect(Array.isArray(envelope.steps)).toBe(true);
    const steps = (envelope.steps as unknown[]).map((step, index) =>
      expectPathStep(step, `GET /api/paths/${pathId} .steps[${index}]`),
    );
    expect(steps.map((step) => step.position)).toEqual([0, 1, 2]);
    expect(steps.map((step) => step.name)).toEqual(["base", "second", "third"]);
    expect(steps.every((step) => step.pathId === pathId)).toBe(true);
  });
});

describe("contract — PATCH /api/paths/[id] (rename)", () => {
  const ownerIds: string[] = [];
  let cookie = "";

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "contract-patch");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  // **decided**: `PathEditor` reads `updated.title` off the response, so a body is
  // required and a 204 is rejected — 200 + the post-update `UpgradePath`.
  it("returns 200 and the post-update UpgradePath with an advanced updatedAt", async () => {
    const created = await createPath(BASE_URL, cookie, uniqueTitle("patch-before"));
    const renamed = uniqueTitle("patch-after");
    const body: PathTitleRequest = { title: renamed };

    const res = await fetch(`${BASE_URL}/api/paths/${created.id}`, {
      method: "PATCH",
      headers: mutatingHeaders(cookie),
      body: JSON.stringify(body),
    });

    await assertStatus(res, 200, `PATCH /api/paths/${created.id}`);
    const updated = expectUpgradePath(await res.json(), `PATCH /api/paths/${created.id}`);
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe(renamed);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
  });

  // documented (reject-400 on invalid input): the rename guard is the create guard.
  it("rejects a blank title with the same 400 Title-is-required body as create", async () => {
    const created = await createPath(BASE_URL, cookie, uniqueTitle("patch-blank"));

    const res = await fetch(`${BASE_URL}/api/paths/${created.id}`, {
      method: "PATCH",
      headers: mutatingHeaders(cookie),
      body: JSON.stringify({ title: "   " }),
    });

    await assertStatus(res, 400, `PATCH /api/paths/${created.id} with a blank title`);
    expectApiError(await res.json(), "Title is required", `PATCH /api/paths/${created.id} with a blank title`);
  });
});

describe("contract — DELETE /api/paths/[id]", () => {
  const ownerIds: string[] = [];
  let cookie = "";

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "contract-delete");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  // **decided**: no consumer reads a body (`handleDeletePath` only checks `.ok`),
  // so the contract is 204 with an empty body — never a JSON envelope.
  it("returns 204 with an empty body, and the path is then 404", async () => {
    const created = await createPath(BASE_URL, cookie, uniqueTitle("delete"));

    const res = await fetch(`${BASE_URL}/api/paths/${created.id}`, {
      method: "DELETE",
      headers: { Origin: BASE_URL, Cookie: cookie },
    });

    await assertStatus(res, 204, `DELETE /api/paths/${created.id}`);
    expect(await res.text()).toBe("");

    const after = await fetch(`${BASE_URL}/api/paths/${created.id}`, { headers: { Cookie: cookie } });
    await assertStatus(after, 404, `GET /api/paths/${created.id} after delete`);
    expectApiError(await after.json(), "Not found", `GET /api/paths/${created.id} after delete`);
  });
});

describe("contract — unresolvable [id] on /api/paths/[id]", () => {
  const ownerIds: string[] = [];
  let cookie = "";

  // documented for absent/not-owned; **non-UUID is decided (changed)** — it used to
  // reach Postgres and surface as a 500 carrying the driver's message.
  const ids = [
    ["a non-UUID id", "not-a-uuid"],
    ["an unknown UUID", "00000000-0000-0000-0000-000000000000"],
  ] as const;

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "contract-missing");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  for (const [label, id] of ids) {
    it(`answers GET with 404 {error: "Not found"} for ${label}`, async () => {
      const res = await fetch(`${BASE_URL}/api/paths/${id}`, { headers: { Cookie: cookie } });

      await assertStatus(res, 404, `GET /api/paths/${id}`);
      expectApiError(await res.json(), "Not found", `GET /api/paths/${id}`);
    });

    it(`answers PATCH with 404 {error: "Not found"} for ${label}`, async () => {
      const res = await fetch(`${BASE_URL}/api/paths/${id}`, {
        method: "PATCH",
        headers: mutatingHeaders(cookie),
        body: JSON.stringify({ title: uniqueTitle("missing-patch") }),
      });

      await assertStatus(res, 404, `PATCH /api/paths/${id}`);
      expectApiError(await res.json(), "Not found", `PATCH /api/paths/${id}`);
    });

    it(`answers DELETE with 404 {error: "Not found"} for ${label}`, async () => {
      const res = await fetch(`${BASE_URL}/api/paths/${id}`, {
        method: "DELETE",
        headers: { Origin: BASE_URL, Cookie: cookie },
      });

      await assertStatus(res, 404, `DELETE /api/paths/${id}`);
      expectApiError(await res.json(), "Not found", `DELETE /api/paths/${id}`);
    });
  }
});
