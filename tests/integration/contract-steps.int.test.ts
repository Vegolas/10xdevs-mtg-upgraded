import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { assertStatus } from "./helpers/http";
import { createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";
import { addStep, createPath } from "./helpers/paths";
import { realisticSnapshot } from "./helpers/snapshot";
import { expectApiError, expectExactKeys, expectPathStep } from "./helpers/shape";

/**
 * Risk #3 (contract drift), `/api/paths/[id]/steps` — plus the three value-drift
 * seams research ranked highest, which is where a stale caller actually breaks:
 * `deltaText` collapsing `null → undefined`, the server-assigned `position` the
 * client ignores in favour of array order, and a snapshot round-tripping
 * unvalidated.
 *
 * Every assertion cites the decided-contract table in
 * `context/changes/testing-api-contract-pinning/plan.md`, marked `documented` or
 * `decided` — never a value read back out of the handler.
 */

/** A well-formed step body; `overrides` deliberately breaks or extends one field. */
function stepBody(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, listText: "", snapshot: { cards: [], unresolved: [] }, ...overrides };
}

/**
 * The diff-mode fixtures, hand-written as a matched set (testing-derive-to-persist
 * §3 Phase 3).
 *
 * {@link diffPrior} is the base checkpoint, {@link DIFF_DELTA} the change text,
 * and {@link diffDerived} the one snapshot the server will accept alongside it:
 * `+1 Sol Ring` takes Sol Ring from 1 copy to 2, `-1 Forest` takes Forest from 4
 * to 3. Both cards are already in the prior list, so every count here is exactly
 * checkable without resolving anything — which is what lets this suite pin the
 * statuses without a card-data mock. **Written out rather than derived**: calling
 * `deriveSnapshot` to build the expectation would make the verifier's own logic the
 * oracle for whether the verifier accepts.
 *
 * The wider derive→persist behaviour is Phase 4's suite. What belongs here is only
 * the wire contract: which status and which body each shape answers with.
 */
const DIFF_DELTA = "+1 Sol Ring\n-1 Forest";

function forest(quantity: number): Record<string, unknown> {
  return {
    quantity,
    card: {
      name: "Forest",
      typeLine: "Basic Land - Forest",
      category: "land",
      imageUrl: null,
      priceUsd: 0.25,
      priceEur: 0.25,
    },
  };
}

function solRing(quantity: number): Record<string, unknown> {
  return {
    quantity,
    card: {
      name: "Sol Ring",
      typeLine: "Artifact",
      category: "artifact",
      imageUrl: null,
      priceUsd: 1.5,
      priceEur: 1.25,
    },
  };
}

/** The base checkpoint a diff-mode append derives from. Fresh objects per call. */
function diffPrior(): Record<string, unknown> {
  return { cards: [forest(4), solRing(1)], unresolved: [] };
}

/** The only `diffPrior() ± DIFF_DELTA` result: Forest 4→3, Sol Ring 1→2. */
function diffDerived(): Record<string, unknown> {
  return { cards: [forest(3), solRing(2)], unresolved: [] };
}

/**
 * Create a path, seed it with `DIFF_PRIOR` as a full-paste base, and hand back the
 * path id plus the base step's id — the `priorStepId` a diff append must name.
 */
async function seedDiffPath(cookie: string, label: string): Promise<{ pathId: string; priorStepId: string }> {
  const path = await createPath(BASE_URL, cookie, `${label}-${Date.now()}`);
  const res = await postStep(
    cookie,
    path.id,
    stepBody("base", { listText: "4 Forest\n1 Sol Ring", snapshot: diffPrior() }),
  );
  await assertStatus(res, 201, `${label}: seed the base checkpoint`);
  const base = expectPathStep(await res.json(), `${label}: seed the base checkpoint`);
  return { pathId: path.id, priorStepId: base.id };
}

/** `POST /api/paths/{pathId}/steps` as the given owner. Body is untyped so malformed cases are expressible. */
async function postStep(cookie: string, pathId: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_URL}/api/paths/${pathId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL, Cookie: cookie },
    body: JSON.stringify(body),
  });
}

/** `DELETE /api/paths/{pathId}/steps` as the given owner — bodyless, so `Origin` is what clears Astro's CSRF check. */
async function deleteStep(cookie: string, pathId: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/paths/${pathId}/steps`, {
    method: "DELETE",
    headers: { Origin: BASE_URL, Cookie: cookie },
  });
}

/** Read a path's steps back through the contract's own read route. */
async function readSteps(cookie: string, pathId: string, label: string): Promise<unknown[]> {
  const res = await fetch(`${BASE_URL}/api/paths/${pathId}`, { headers: { Cookie: cookie } });
  await assertStatus(res, 200, label);
  const envelope = expectExactKeys(await res.json(), ["path", "steps"], label);
  expect(Array.isArray(envelope.steps)).toBe(true);
  return envelope.steps as unknown[];
}

const ownerIds: string[] = [];
let aCookie = "";
let bCookie = "";
let bPathId = "";

beforeAll(async () => {
  // One signed-in owner per file (plus a second owner for the cross-owner rows):
  // the suite's cost is dominated by signin round-trips, not by path creation.
  const a = await createSignedInOwner(BASE_URL, "contract-steps-a");
  const b = await createSignedInOwner(BASE_URL, "contract-steps-b");
  ownerIds.push(a.user.id, b.user.id);
  aCookie = a.cookieHeader;
  bCookie = b.cookieHeader;

  bPathId = (await createPath(BASE_URL, bCookie, `contract-steps-b-${Date.now()}`)).id;
  await addStep(BASE_URL, bCookie, bPathId, "b-base");
});

afterAll(async () => {
  await deleteOwners(ownerIds);
});

describe("contract — POST /api/paths/[id]/steps", () => {
  // documented (`position = max+1`, base is 0): 201 + the created `PathStep`.
  it("returns 201 and a PathStep echoing the request", async () => {
    const path = await createPath(BASE_URL, aCookie, `contract-step-create-${Date.now()}`);

    const res = await postStep(aCookie, path.id, stepBody("base", { listText: "4 Forest" }));

    await assertStatus(res, 201, "POST steps");
    const step = expectPathStep(await res.json(), "POST steps");
    expect(step.pathId).toBe(path.id);
    expect(step.name).toBe("base");
    expect(step.listText).toBe("4 Forest");
    expect(step.snapshot).toEqual({ cards: [], unresolved: [] });
  });

  // documented (`position = max+1`, base is 0) + contract-wide decision 3
  // (`position` is server-owned): a `position` in the request body is ignored.
  it("assigns position server-side and ignores a position sent in the body", async () => {
    const path = await createPath(BASE_URL, aCookie, `contract-step-position-${Date.now()}`);

    const first = await postStep(aCookie, path.id, stepBody("base", { position: 42 }));
    await assertStatus(first, 201, "POST steps (first, with a conflicting position)");
    expect(expectPathStep(await first.json(), "POST steps (first)").position).toBe(0);

    const second = await postStep(aCookie, path.id, stepBody("second", { position: 7 }));
    await assertStatus(second, 201, "POST steps (second, with a conflicting position)");
    expect(expectPathStep(await second.json(), "POST steps (second)").position).toBe(1);
  });

  // Contract-wide decision 2: `deltaText` is `string | null` on the response — never
  // `undefined`, never absent — and a bad value collapses rather than 400-ing
  // (`request.ts` treats it as optional provenance, not validated input).
  const deltaCases = [
    ["absent", {}],
    ["blank", { deltaText: "   " }],
    ["a non-string", { deltaText: 42 }],
  ] as const;

  for (const [label, override] of deltaCases) {
    it(`returns 201 with deltaText null when the request sends ${label}`, async () => {
      const path = await createPath(BASE_URL, aCookie, `contract-step-delta-${Date.now()}`);

      const res = await postStep(aCookie, path.id, stepBody("base", override));

      await assertStatus(res, 201, `POST steps with ${label} deltaText`);
      const step = expectPathStep(await res.json(), `POST steps with ${label} deltaText`);
      expect(step.deltaText).toBe(null);
    });
  }

  // **decided (changed, testing-derive-to-persist)**: a real `deltaText` no longer
  // rides through on its own. It is now a claim the server checks, so the 201 needs
  // the whole diff shape — a prior step, the `priorStepId` naming it, and a snapshot
  // that is `prior ± delta`. The pinning is unchanged in kind: the string comes back
  // verbatim, and `priorStepId` is request-only and never echoed (the closed
  // `PathStep` key set in `expectPathStep` is what proves the second half).
  it("returns 201 with deltaText verbatim for a well-formed diff append", async () => {
    const { pathId, priorStepId } = await seedDiffPath(aCookie, "contract-step-delta-diff");

    const res = await postStep(
      aCookie,
      pathId,
      stepBody("swap", {
        listText: "3 Forest\n2 Sol Ring",
        snapshot: diffDerived(),
        deltaText: DIFF_DELTA,
        priorStepId,
      }),
    );

    await assertStatus(res, 201, "POST steps with a well-formed diff append");
    const step = expectPathStep(await res.json(), "POST steps with a well-formed diff append");
    expect(step.deltaText).toBe(DIFF_DELTA);
    expect(step.position).toBe(1);
  });

  // **decided**: `priorStepId` collapses on the way in exactly as `deltaText` does
  // (blank / non-string / absent → `null`), so a full-paste body carrying junk there
  // is still a 201 — the field is ignored when there is no delta to anchor.
  const priorIdNoise = [
    ["blank", { priorStepId: "   " }],
    ["a non-string", { priorStepId: 42 }],
    ["a stale id", { priorStepId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" }],
  ] as const;

  for (const [label, override] of priorIdNoise) {
    it(`ignores ${label} priorStepId on a full-paste body and still returns 201`, async () => {
      const path = await createPath(BASE_URL, aCookie, `contract-step-prior-noise-${Date.now()}`);

      const res = await postStep(aCookie, path.id, stepBody("base", override));

      await assertStatus(res, 201, `POST steps (full paste) with ${label} priorStepId`);
      const step = expectPathStep(await res.json(), `POST steps (full paste) with ${label} priorStepId`);
      expect(step.deltaText).toBe(null);
      expect(step.position).toBe(0);
    });
  }

  // **decided**: a diff checkpoint on a path with no steps at all. There is nothing
  // to derive from, so this precedes the missing-`priorStepId` check — a caller in
  // this state cannot supply a valid one.
  it("answers 400 Diff-checkpoint-needs-a-previous-step for a delta on an empty path", async () => {
    const path = await createPath(BASE_URL, aCookie, `contract-step-delta-empty-${Date.now()}`);

    const res = await postStep(aCookie, path.id, stepBody("swap", { deltaText: DIFF_DELTA, priorStepId: null }));

    await assertStatus(res, 400, "POST steps with a delta against an empty path");
    expectApiError(
      await res.json(),
      "Diff checkpoint needs a previous step",
      "POST steps with a delta against an empty path",
    );
  });

  // **decided**: `priorStepId` is required once `deltaText` is set — but it gets its
  // own 400, not `parseStepInput`'s generic one, because "name the step you derived
  // from" is actionable and "Invalid step payload" is not.
  it("answers 400 Diff-checkpoint-must-name-the-step when a delta arrives without priorStepId", async () => {
    const { pathId } = await seedDiffPath(aCookie, "contract-step-delta-unnamed");

    const res = await postStep(aCookie, pathId, stepBody("swap", { snapshot: diffDerived(), deltaText: DIFF_DELTA }));

    await assertStatus(res, 400, "POST steps with a delta and no priorStepId");
    expectApiError(
      await res.json(),
      "Diff checkpoint must name the step it derives from",
      "POST steps with a delta and no priorStepId",
    );
  });

  // **decided**: `409` is its own status, distinct from the verifier's 400s. The
  // submitted snapshot here is perfectly consistent with the step the client *read*;
  // what changed is which step is last, and the fix is a reload, not an edit.
  it("answers 409 Path-changed-since-you-started when priorStepId is not the last step", async () => {
    const { pathId, priorStepId } = await seedDiffPath(aCookie, "contract-step-delta-raced");
    // A second append lands, so `priorStepId` now names the second-to-last step.
    await addStep(BASE_URL, aCookie, pathId, "raced-in");

    const res = await postStep(
      aCookie,
      pathId,
      stepBody("swap", { snapshot: diffDerived(), deltaText: DIFF_DELTA, priorStepId }),
    );

    await assertStatus(res, 409, "POST steps with a stale priorStepId");
    expectApiError(await res.json(), "Path changed since you started", "POST steps with a stale priorStepId");
  });

  // **decided**: the verifier's refusals are 400s whose body is the rule's sentence
  // plus the offending line or card. This pins the *pairing* with one rule —
  // `unapplicable-removal`, risk #5's silent no-op — and leaves the other four to
  // Phase 4's suite, which owns rule-by-rule attribution. The delta must break only
  // that rule: `- Black Lotus` names a card the prior list never held, and the
  // submitted snapshot is the untouched prior, so nothing else is out of place.
  it("answers 400 naming the unapplicable-removal rule and the line at fault", async () => {
    const { pathId, priorStepId } = await seedDiffPath(aCookie, "contract-step-delta-unapplicable");

    const res = await postStep(
      aCookie,
      pathId,
      stepBody("swap", { snapshot: diffPrior(), deltaText: "- Black Lotus", priorStepId }),
    );

    await assertStatus(res, 400, "POST steps with an unapplicable removal");
    expectApiError(
      await res.json(),
      "That change removes a card the previous checkpoint does not have: - Black Lotus",
      "POST steps with an unapplicable removal",
    );
  });

  // documented (`PathStep`, incl. server-assigned `position` and `deltaText`): the
  // snapshot the client sent must survive POST -> jsonb -> GET unchanged. `jsonb`
  // does not preserve key order, so this is a deep equality, not a string compare.
  it("round-trips a realistic snapshot through POST, persistence and GET", async () => {
    const fixture = realisticSnapshot();
    const path = await createPath(BASE_URL, aCookie, `contract-step-snapshot-${Date.now()}`);

    const res = await postStep(aCookie, path.id, stepBody("base", { listText: "4 Forest", snapshot: fixture }));
    await assertStatus(res, 201, "POST steps with the realistic snapshot");
    const created = expectPathStep(await res.json(), "POST steps with the realistic snapshot");
    expect(created.snapshot).toEqual(fixture);

    const steps = await readSteps(aCookie, path.id, "GET path after the snapshot round-trip");
    expect(steps).toHaveLength(1);
    const persisted = expectPathStep(steps[0], "GET path .steps[0] after the snapshot round-trip");
    expect(persisted.snapshot).toEqual(fixture);
  });

  // **decided**: 400 `{error: "Invalid step payload"}` for anything `parseStepInput` rejects.
  const malformed = [
    ["a missing name", { listText: "", snapshot: { cards: [], unresolved: [] } }],
    ["a blank name", stepBody("   ")],
    ["a non-string listText", stepBody("base", { listText: 5 })],
    [
      "a snapshot that fails the guard",
      stepBody("base", { snapshot: { cards: [{ quantity: 1, card: { name: "Forest" } }], unresolved: [] } }),
    ],
  ] as const;

  for (const [label, body] of malformed) {
    it(`rejects ${label} with 400 and the Invalid-step-payload body`, async () => {
      const path = await createPath(BASE_URL, aCookie, `contract-step-invalid-${Date.now()}`);

      const res = await postStep(aCookie, path.id, body);

      await assertStatus(res, 400, `POST steps with ${label}`);
      expectApiError(await res.json(), "Invalid step payload", `POST steps with ${label}`);
    });
  }

  // **decided**: body validation runs BEFORE the ownership check, so a malformed
  // body aimed at another owner's path answers 400, not 404. A *well-formed* body
  // aimed at the same path is 404 (pinned in ownership-steps.int.test.ts) — the two
  // together are what make the ordering observable.
  it("answers 400, not 404, when a malformed body targets another owner's path", async () => {
    const res = await postStep(aCookie, bPathId, stepBody("   "));

    await assertStatus(res, 400, "POST steps with a malformed body against another owner's path");
    expectApiError(
      await res.json(),
      "Invalid step payload",
      "POST steps with a malformed body against another owner's path",
    );
  });

  // documented for absent/not-owned; **non-UUID is decided (changed)**: `parsePathId`
  // runs before body validation, so even a well-formed body gets the 404.
  it("answers 404 Not found for a non-UUID path id", async () => {
    const res = await postStep(aCookie, "not-a-uuid", stepBody("base"));

    await assertStatus(res, 404, "POST steps with a non-UUID path id");
    expectApiError(await res.json(), "Not found", "POST steps with a non-UUID path id");
  });
});

describe("contract — DELETE /api/paths/[id]/steps", () => {
  // **decided** (204 empty body); the delete-last invariant itself is documented.
  it("returns 204 with an empty body and removes only the highest-position step", async () => {
    const path = await createPath(BASE_URL, aCookie, `contract-step-delete-${Date.now()}`);
    await addStep(BASE_URL, aCookie, path.id, "base");
    await addStep(BASE_URL, aCookie, path.id, "second");

    const res = await deleteStep(aCookie, path.id);

    await assertStatus(res, 204, "DELETE steps");
    expect(await res.text()).toBe("");

    const steps = await readSteps(aCookie, path.id, "GET path after DELETE steps");
    expect(steps).toHaveLength(1);
    const remaining = expectPathStep(steps[0], "GET path .steps[0] after DELETE steps");
    expect(remaining.position).toBe(0);
    expect(remaining.name).toBe("base");
  });

  // **decided**: an empty path answers 404 `{error: "No steps to delete"}`.
  it("answers 404 No-steps-to-delete once the path has no steps left", async () => {
    const path = await createPath(BASE_URL, aCookie, `contract-step-delete-empty-${Date.now()}`);
    await addStep(BASE_URL, aCookie, path.id, "base");

    const first = await deleteStep(aCookie, path.id);
    await assertStatus(first, 204, "DELETE steps (the only step)");

    const second = await deleteStep(aCookie, path.id);
    await assertStatus(second, 404, "DELETE steps on a now-empty path");
    expectApiError(await second.json(), "No steps to delete", "DELETE steps on a now-empty path");
  });

  // **decided** (the cross-owner shape): this route never queries `upgrade_paths`,
  // so RLS simply hides B's steps and A gets the *empty-path* body — deliberately
  // indistinguishable from "your own path has no steps", never "Not found".
  it("gives another owner's path the same No-steps-to-delete body, not Not found", async () => {
    const res = await deleteStep(aCookie, bPathId);

    await assertStatus(res, 404, "DELETE steps against another owner's path");
    expectApiError(await res.json(), "No steps to delete", "DELETE steps against another owner's path");
  });

  // documented for absent/not-owned; **non-UUID is decided (changed)**.
  it("answers 404 Not found for a non-UUID path id", async () => {
    const res = await deleteStep(aCookie, "not-a-uuid");

    await assertStatus(res, 404, "DELETE steps with a non-UUID path id");
    expectApiError(await res.json(), "Not found", "DELETE steps with a non-UUID path id");
  });
});
