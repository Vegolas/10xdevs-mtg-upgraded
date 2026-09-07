import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { parkAppApi } from "./fixtures/appApi";
import { mockScryfallSuccess } from "./fixtures/scryfall";
import { gotoPathBuilder } from "./fixtures/app";
import { createSignedInOwner, deleteOwner, seedPathWithStep, type Owner } from "./fixtures/auth";
import type { UpgradePath } from "@/lib/api/contract";

/**
 * RISK #10 (test-plan.md §2) — "In the path builder, the rendered checkpoint list or
 * path title disagrees with the server after a mutation: two overlapping deletes,
 * renames or creates settle in an order the UI did not account for, so the user acts on
 * a list or a title the server does not hold."
 *
 * The mutation half of what `shared-stale-response-guard` repaired. Risk #9 — and the
 * four specs in `path-builder-stale-ordering.spec.ts` — is specifically about the
 * PRE-SAVE surfaces: a Check verdict or a diff preview describing text that moved on.
 * These two are about persists, and they are new ground: `handleDeleteLast`,
 * `handleRename` and `handleDeletePath` carried no guard of any kind before this change.
 *
 * WHY THESE TWO ARE GREEN AND THE OTHER FOUR WERE INVERTED. `test.fail()` is for pinning
 * a live defect against the behavior you want (`lessons.md`, "Pin a live defect with
 * `test.fail()`"), and its value there was that the four specs became the specification
 * for a fix nobody had written yet. That argument does not extend here: these flows had
 * no guard to specify, so there was nothing for an inverted spec to pin the shape of.
 * The decision to write them green, against the repaired behavior and inside the change
 * that repairs it, was taken when the change was opened — see its `change.md`.
 *
 * THE FILED FINDING'S SYMPTOM IS WRONG, AND THAT IS WHY THESE SPECS LOOK LIKE THIS.
 * F-5 (`context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md`)
 * says "two rapid deletes can pop two steps for one server delete". They cannot:
 * `DELETE /api/paths/[id]/steps` removes the highest-position step PER CALL
 * (`src/pages/api/paths/[id]/steps.ts:214-236`), so two overlapping deletes produce two
 * server deletes and the client agrees with the server about the count. The reachable
 * divergence on a one-step path is a FALSE ERROR BANNER: the first DELETE answers 204
 * and pops, the second answers 404 "No steps to delete" and writes `mutationError` over
 * a delete that succeeded. So the delete spec's subject is that banner and the disabled
 * trigger that prevents it — not a step count.
 *
 * F-5'S IMPLIED FIX WOULD HAVE BEEN WORSE THAN THE DEFECT. A latest-wins token on
 * `handleDeleteLast` drops the first call's successful 204 as superseded — no pop — and
 * lets the second call's 404 set the error, leaving a step rendered against a server
 * holding zero. That is exactly the failure the guard is meant to prevent, manufactured
 * by the guard. The three mutations therefore run under TWO disciplines: both deletes
 * are at-most-one (trigger disabled), the rename is latest-wins. Each spec below drives
 * one of them, and neither may ever ship on the argument that it mirrors the other —
 * that argument is what produced F-5 (`lessons.md`, "Treat the stale-response guard as
 * five hand copies, not one pattern").
 *
 * WHAT REACHES THE SERVER, PER SPEC, AND WHY IT IS NOT A DETAIL. The delete's parked
 * request IS delivered (`parkAppApi`'s `deliver`), because the 404 that produces the
 * false banner only exists once the server has actually lost its last step; park it
 * without delivering and the second DELETE answers 204 too, no banner ever renders, and
 * the spec passes with the guard reverted. The rename's parked PATCH is deliberately
 * NEVER delivered, so the server holds exactly one title and the assertion is about the
 * client guard alone. See `fixtures/appApi.ts` for both.
 *
 * AUTH. Identical to `path-builder-stale-ordering.spec.ts`: each test provisions its OWN
 * owner, `adoptSession` moves that session into the browser's jar, and one `deleteOwner`
 * in `afterEach` cascades away every path and step it seeded. All setup lives in
 * `beforeEach`. Nothing signs in through the UI.
 */
test.describe.configure({ retries: 0 });

/** The step `seedPathWithStep` creates. Every query for it passes `exact: true`, and that
 *  is not decoration: `getByRole`'s name match is a case-insensitive SUBSTRING by default,
 *  so a bare "base" also matches the "Add base deck" section heading (`PathEditor.tsx:704`)
 *  — which appears precisely when the step is gone, so the assertion that the step
 *  disappeared would read as if it never did. Verified by watching it do exactly that. */
const SEEDED_STEP_NAME = "base";

/** The empty-state copy (`PathEditor.tsx:672-675`), as a substring. With a one-step path
 *  this IS "exactly one step was removed": the list cannot render both. */
const NO_CHECKPOINTS = "No checkpoints yet";

/** The path-level error banner's accessible name (`PathEditor.tsx:640-654`). The name, not
 *  the class string: all three banners on this surface render byte-identical classes, and
 *  the `aria-label` is the only thing that says which one a query found (test-plan §6.7
 *  items 1 and 27). */
const PATH_ERROR = "Path error";

/** The rename that loses. Fixed strings are safe — every test seeds its own path under its
 *  own owner, so nothing can collide — and neither may ever appear on screen by any route
 *  other than the one under test. */
const RENAME_SUPERSEDED = "the superseded title";
/** The rename that wins, and the only title that may stand at the end. */
const RENAME_WINNER = "the winning title";

/** Owner-email label; uniqueness comes from `createOwner`'s timestamp + random suffix. */
const OWNER_LABEL = "path-builder-mutation";

/** Per-test state, handed from the hook to the body. Tests in a file run serially in one
 *  worker (`fullyParallel` is unset), so a module-level slot is safe. The whole
 *  `UpgradePath` is kept, not just its id: the rename spec answers a held PATCH with a
 *  faithful copy of this row carrying a stale title. */
let owner: Owner | null = null;
let seeded: UpgradePath | null = null;

test.beforeEach(async ({ page, request }, testInfo) => {
  owner = await createSignedInOwner(request, OWNER_LABEL);
  await adoptSession(page, request);
  const { path } = await seedPathWithStep(request, testInfo.title);
  seeded = path;
  // Neither spec resolves a card — the builder renders saved steps from their stored
  // snapshots and never re-resolves, and nothing here clicks Check or Add. This is the
  // backstop that keeps "no external network" an ENFORCED property of the suite rather
  // than an assumption about which controls these tests happen to touch: the helper
  // registers `blockUnmockedScryfall`, so a stray lookup aborts loudly instead of
  // reaching the real API.
  await mockScryfallSuccess(page);
});

test.afterEach(async () => {
  seeded = null;
  if (owner === null) {
    return;
  }
  const doomed = owner;
  // Cleared BEFORE the await so a failing delete cannot leave a stale id behind for the
  // next test's teardown to trip over.
  owner = null;
  await deleteOwner(doomed);
});

/**
 * Hand the browser the session `request` is currently holding.
 *
 * The chromium project starts every context from the `setup` project's `storageState`,
 * which belongs to the RUN's owner. A test that provisions its own owner has therefore
 * moved only the API context; without this the page would still be browsing as the run
 * owner and `/paths/[id]` would answer 404 for a path it does not own.
 */
async function adoptSession(page: Page, request: APIRequestContext): Promise<void> {
  const { cookies } = await request.storageState();
  await page.context().clearCookies();
  await page.context().addCookies(cookies);
}

/** The path the hook seeded for the running test. */
function seededPath(): UpgradePath {
  if (seeded === null) {
    throw new Error("beforeEach did not seed a path — setup was skipped or failed.");
  }
  return seeded;
}

/**
 * "A delete that succeeded never reports an error" — the at-most-one discipline.
 *
 * The overlap: a one-step path, the last checkpoint deleted, and a second click landing
 * while the first DELETE is still outstanding. Repaired, the second click cannot happen —
 * the lane's `inFlight` is committed as the trigger's `disabled` before the request is
 * even issued, so no second request exists and no 404 can be answered.
 *
 * WHY THE SECOND CLICK IS ATTEMPTED ANYWAY, AND WHY IT IS `force`. Asserting the
 * attribute proves the attribute; it does not prove the attribute stops anything, and it
 * is not the assertion this spec is named for. `force` skips PLAYWRIGHT's own enabled
 * check and hands the decision to the BROWSER, which dispatches no click event to a
 * disabled form control — so this is a no-op exactly while the guard is doing its job,
 * and issues a real second DELETE the moment it is not. That is what makes the
 * deliberate-break run fail on the false banner (`lessons.md`, "Pin a live defect with
 * `test.fail()`", trap 2, which applies to a green spec for the same reason) instead of
 * failing one line earlier on an attribute nobody filed a finding about.
 */
test("a delete that succeeded never reports an error", async ({ page }) => {
  const path = seededPath();

  // DELIVERED, not merely held: the server must actually lose its last step while the
  // client is still waiting, or the second DELETE answers 204 as well and the false
  // banner this spec exists for can never render. See `fixtures/appApi.ts`.
  const parked = await parkAppApi(
    page,
    (method, url) => method === "DELETE" && url.includes(`/api/paths/${path.id}/steps`),
    { deliver: true },
  );

  const main = await gotoPathBuilder(page, path.id);

  // The list starts with the seeded checkpoint, so its disappearance below is a change
  // this test caused rather than a state it inherited.
  await expect(main.getByRole("heading", { name: SEEDED_STEP_NAME, exact: true })).toBeVisible();

  const deleteLast = main.getByRole("button", { name: "Delete last checkpoint" });
  await expect(deleteLast).toBeEnabled();
  await deleteLast.click();

  // Prove the DELETE is genuinely in flight before anything else happens. Without this
  // the whole test is vacuous — a guard that is never reached cannot be shown to work.
  await parked.arrived;

  // SAMPLED into a variable rather than asserted here, and deliberately: the assertions
  // at the bottom have to run in a fixed order, with the banner first, so a run with the
  // guard reverted reports the false banner rather than this attribute. The read is
  // sound at this point — `inFlight` commits synchronously inside the click event, which
  // is strictly before the browser issued the request the fixture just caught.
  const disabledWhileInFlight = await deleteLast.isDisabled();

  // The second delete a user can physically attempt. See the header above for why.
  await deleteLast.click({ force: true });

  // The parked run must be shown to have run to COMPLETION, not merely to have been
  // released: the commit is reached only after `requestJson` returns.
  const deleteResponse = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().includes(`/api/paths/${path.id}/steps`),
  );

  // Watch CONTINUOUSLY, and start watching BEFORE the release. A `toBeHidden()` sampled
  // afterwards cannot prove a negative: it reads one instant and passes before React has
  // committed the write (test-plan §6.7 item 13). It also has to be open early enough to
  // catch the banner a reverted guard raises from the second DELETE's 404, which lands
  // before the release rather than after it.
  const bannerEverRendered = main
    .getByRole("alert", { name: PATH_ERROR })
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  await parked.releaseFromServer();
  await deleteResponse;

  // The claim, in the order it has to be read: no error was reported for a delete that
  // succeeded; the trigger is what made that true; and exactly one checkpoint went away.
  expect(await bannerEverRendered).toBe(false);
  expect(disabledWhileInFlight).toBe(true);
  await expect(main.getByRole("heading", { name: SEEDED_STEP_NAME, exact: true })).toBeHidden();
  await expect(main.getByText(NO_CHECKPOINTS)).toBeVisible();
});

/**
 * "A superseded rename never restores the old title" — the latest-wins discipline.
 *
 * The mirror image of the spec above, and the reason the two disciplines are not one
 * rule. Here a second rename genuinely supersedes the first: the newer title is the
 * user's newer intent, so the older PATCH's `setTitle` must be dropped rather than the
 * older request prevented. Accordingly the Save button does NOT disable, and this spec
 * asserts that it does not — a disabled Save would make the overlap undrivable and turn
 * the assertion below into a claim about a button (test-plan §6.7 item 26's failure mode).
 *
 * The held PATCH is answered with a stale `UpgradePath` the server never saw, carrying
 * the title the FIRST rename asked for. That keeps the server holding exactly one title
 * — the newer one — so the only thing that could put the old title back on screen is the
 * client applying a superseded response.
 */
test("a superseded rename never restores the old title", async ({ page }) => {
  const path = seededPath();

  // NOT delivered: the first PATCH must never reach the server, or which title the row
  // ends up holding depends on the order the server applied two writes in, and the
  // assertion stops being about the client guard.
  const parked = await parkAppApi(page, (method, url) => method === "PATCH" && url.includes(`/api/paths/${path.id}`));

  const main = await gotoPathBuilder(page, path.id);

  await expect(main.getByRole("heading", { name: path.title, exact: true })).toBeVisible();
  await main.getByRole("button", { name: "Rename path" }).click();

  const titleInput = main.getByLabel("Path title");
  const save = main.getByRole("button", { name: "Save" });

  await titleInput.fill(RENAME_SUPERSEDED);
  await save.click();

  // The first PATCH must be genuinely in flight before the second rename starts, or the
  // two runs never overlap and nothing below proves anything.
  await parked.arrived;

  // Latest-wins is the point, so the trigger stays live. This is a claim about the
  // repair, not a precondition: gating Save on its own lane would be the deleteLast
  // discipline applied to a flow that does not want it.
  await expect(save).toBeEnabled();

  await titleInput.fill(RENAME_WINNER);
  await save.click();

  // Prove the second rename ran to COMPLETION and won. The rendered heading is the
  // sharpest available proof: `setRenaming(false)` sits in the same synchronous block as
  // `setTitle`, so the editing input is only replaced by a heading once that commit ran.
  await expect(main.getByRole("heading", { name: RENAME_WINNER, exact: true })).toBeVisible();

  // Registered only NOW, after the winner is on screen: both PATCHes share a method and a
  // URL, so the one response this can still match is the superseded one.
  const staleResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes(`/api/paths/${path.id}`),
  );

  // An observation window, not a sample, for the same reason as the spec above: a stale
  // write lands a React commit later than the response that triggered it.
  const oldTitleEverRendered = main
    .getByRole("heading", { name: RENAME_SUPERSEDED, exact: true })
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  // A faithful copy of the seeded row with the stale title swapped in — the response the
  // first rename would have got had it not been superseded. `handleRename` reads
  // `result.data.title`, so this is the exact write the lane has to drop.
  await parked.release({ ...path, title: RENAME_SUPERSEDED });
  await staleResponse;

  expect(await oldTitleEverRendered).toBe(false);
  await expect(main.getByRole("heading", { name: RENAME_WINNER, exact: true })).toBeVisible();
});
