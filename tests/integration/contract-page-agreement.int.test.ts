import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL } from "./helpers/env";
import { assertStatus } from "./helpers/http";
import { createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";
import { addStep, createPath } from "./helpers/paths";
import { expectExactKeys, expectPathStep, expectUpgradePath } from "./helpers/shape";

/**
 * Risk #3, the one *live* drift risk this codebase actually carries:
 * `GET /api/paths/[id]` and `src/pages/paths/[id].astro` independently query and
 * map the same two tables with the same `.order()` clauses. Neither notices when
 * the other changes, and the symptom — a path whose checkpoints render in a
 * different order than the API reports — is silent.
 *
 * The check is a raw-text index comparison, deliberately not DOM parsing: seed
 * distinctively named steps, then assert each name's first occurrence in the HTML
 * advances in the same order as the API's `steps[].name`. That catches a divergent
 * `.order()` clause or mapper without asserting anything about markup, which keeps
 * it clear of test-plan §7's component-testing exclusion.
 */
describe("contract — GET /api/paths/[id] agrees with the /paths/[id] page", () => {
  const ownerIds: string[] = [];
  let cookie = "";
  let pathId = "";
  let pathTitle = "";
  let seededNames: string[] = [];

  beforeAll(async () => {
    const owner = await createSignedInOwner(BASE_URL, "contract-agreement");
    ownerIds.push(owner.user.id);
    cookie = owner.cookieHeader;

    // Timestamp-suffixed, alphanumeric-and-hyphen names: unique per run, and free
    // of any character React would escape in the rendered markup.
    const stamp = Date.now();
    seededNames = [`agreement-alpha-${stamp}`, `agreement-beta-${stamp}`, `agreement-gamma-${stamp}`];

    pathTitle = `agreement-path-${stamp}`;
    pathId = (await createPath(BASE_URL, cookie, pathTitle)).id;
    for (const name of seededNames) {
      await addStep(BASE_URL, cookie, pathId, name);
    }
  });

  afterAll(async () => {
    await deleteOwners(ownerIds);
  });

  it("renders the path title and its steps in the API's order", async () => {
    const apiRes = await fetch(`${BASE_URL}/api/paths/${pathId}`, { headers: { Cookie: cookie } });
    await assertStatus(apiRes, 200, `GET /api/paths/${pathId}`);
    const envelope = expectExactKeys(await apiRes.json(), ["path", "steps"], `GET /api/paths/${pathId}`);
    const path = expectUpgradePath(envelope.path, `GET /api/paths/${pathId} .path`);
    const apiNames = (envelope.steps as unknown[]).map(
      (step, index) => expectPathStep(step, `GET /api/paths/${pathId} .steps[${index}]`).name,
    );

    // Guard against a vacuous pass: the API itself must report the seeded order.
    expect(apiNames).toEqual(seededNames);

    const pageRes = await fetch(`${BASE_URL}/paths/${pathId}`, { headers: { Cookie: cookie } });
    await assertStatus(pageRes, 200, `GET /paths/${pathId}`);
    const html = await pageRes.text();

    expect(html).toContain(path.title);

    const positions = apiNames.map((name) => ({ name, at: html.indexOf(name) }));
    for (const { name, at } of positions) {
      if (at < 0) {
        throw new Error(`GET /paths/${pathId}: step "${name}" is in the API response but absent from the page HTML`);
      }
    }
    for (let i = 1; i < positions.length; i += 1) {
      const previous = positions[i - 1];
      const current = positions[i];
      if (previous.at >= current.at) {
        throw new Error(
          `GET /paths/${pathId}: page order disagrees with the API — "${previous.name}" appears at ${previous.at} ` +
            `but "${current.name}" (later in the API's steps) appears at ${current.at}`,
        );
      }
    }
  });
});
