import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveCards } from "@/lib/card-data";
import { deckCardsToText, parseDeckList, resolveDeck } from "@/lib/deck";
import { deriveSnapshot } from "@/lib/path";
import type { DerivedViolation, StepSnapshot } from "@/lib/path";
import type { PathStep, StepCreateRequest } from "@/lib/api/contract";
import { BASE_URL } from "./helpers/env";
import { assertStatus } from "./helpers/http";
import { createSignedInOwner } from "./helpers/owners";
import { deleteOwners } from "./helpers/cleanup";
import { countSteps, createPath } from "./helpers/paths";
import { expectApiError, expectExactKeys, expectPathStep } from "./helpers/shape";
import {
  BASE_HOLDINGS,
  BASE_LIST_TEXT,
  CANONICAL_DELTA,
  CANONICAL_HOLDINGS,
  CARRY_DELTA,
  CARRY_HOLDINGS,
  CARRY_UNRESOLVED,
  CHAIN_DELTA,
  CHAIN_FULL_PASTE_TEXT,
  CHAIN_HOLDINGS,
  PARTIAL_BASE_LIST_TEXT,
  SWAP_DELTA,
  SWAP_FULL_PASTE_TEXT,
  SWAP_HOLDINGS,
  baseSnapshot,
  holdingsOf,
  partialBaseSnapshot,
  resolveFromCatalog,
  snapshotOf,
} from "./helpers/derive";

/**
 * Risks #4 and #5 through the whole seam: derive → POST → `jsonb` → GET, against a
 * real database with RLS live (testing-derive-to-persist, test-plan §3 Phase 3).
 *
 * The pure engine is not re-tested here. `derive.test.ts` owns `deriveSnapshot`'s
 * branches, `add-flow.golden.test.ts` owns diff-vs-full-paste equivalence, and
 * `verify.test.ts` owns the verifier's rule set. What nothing covered before this
 * file is the **wiring**: that a derive whose prior came back out of `jsonb` still
 * lands as the same holdings, that a chain of derives does not drift, that
 * `list_text` and `snapshot` agree, and that each of the server's refusals actually
 * refuses *and persists nothing*.
 *
 * **The oracle is never the function under test.** Every expected value here is
 * either a hand-written record in `helpers/derive.ts` or a list taken through the
 * *full-paste* add flow (`resolveDeck` → `attachQuantities`), which is a different
 * code path from `deriveSnapshot`. Building the expectation by calling
 * `deriveSnapshot` is the tautological-oracle anti-pattern risk #4's response names
 * by name; `deriveSnapshot` appears below only where a real client would call it —
 * producing the *input* that gets POSTed.
 *
 * Two things the full-paste oracle cannot do, and how they are handled:
 *   - **Canonicalization.** Before the Phase 1 join fix both add flows fell back to
 *     one copy for a `+3` line the source renames, so the oracle shares the defect.
 *     That case is hand-authored only.
 *   - **Rejections.** There is no second implementation of "which rule broke", so
 *     the refusal table transcribes the decided wire messages as literal strings —
 *     the same reasoning as `helpers/shape.ts`'s literal key arrays. A message read
 *     back out of the response would assert nothing.
 *
 * **Process boundary.** `vi.mock("@/lib/card-data", importOriginal)` replaces
 * `resolveCards` in the *test* process only, with `resolutionKey` kept real (the
 * `add-flow.golden.test.ts` pattern) so quantities join on exactly the key
 * production uses. There is no cross-process concern: the app server never resolves
 * a card in a request path — that is precisely why the verifier is resolution-free —
 * so the `astro dev` process under test has nothing to mock.
 *
 * Every status check routes through `assertStatus` (Phase 1's durable rule: a bare
 * status comparison throws away the body that explains a CI-only failure), and every
 * path gets a unique title so re-runs and the serialized worker cannot collide.
 */

// Mock only the card-data edge; keep everything else real. See the docstring above.
vi.mock("@/lib/card-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/card-data")>();
  return { ...actual, resolveCards: vi.fn() };
});

const resolveCardsMock = vi.mocked(resolveCards);

const ownerIds: string[] = [];
let cookie = "";
let sequence = 0;

/** A path title no other test (or re-run) can produce. */
function uniqueTitle(label: string): string {
  sequence += 1;
  return `${label}-${Date.now()}-${sequence}`;
}

/** `POST /api/paths/{pathId}/steps` as the suite's owner. Bodies here are always well-formed. */
async function postStep(pathId: string, body: StepCreateRequest): Promise<Response> {
  return fetch(`${BASE_URL}/api/paths/${pathId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL, Cookie: cookie },
    body: JSON.stringify(body),
  });
}

/** A fresh path seeded with one full-paste base checkpoint; returns the id and the created step. */
async function seedBase(
  label: string,
  listText: string,
  snapshot: StepSnapshot,
): Promise<{ pathId: string; base: PathStep }> {
  const path = await createPath(BASE_URL, cookie, uniqueTitle(label));
  const res = await postStep(path.id, { name: "base", listText, snapshot });
  await assertStatus(res, 201, `${label}: seed the base checkpoint`);
  return { pathId: path.id, base: expectPathStep(await res.json(), `${label}: the base checkpoint`) };
}

/** Read a path's steps back through the contract's own read route, each shape-checked. */
async function readSteps(pathId: string, label: string): Promise<PathStep[]> {
  const res = await fetch(`${BASE_URL}/api/paths/${pathId}`, { headers: { Cookie: cookie } });
  await assertStatus(res, 200, label);
  const envelope = expectExactKeys(await res.json(), ["path", "steps"], label);
  expect(Array.isArray(envelope.steps)).toBe(true);
  return (envelope.steps as unknown[]).map((step, index) => expectPathStep(step, `${label} .steps[${index}]`));
}

/**
 * Append a diff checkpoint the way `handleAddStep` does: derive from the prior
 * step's frozen snapshot, render the POSTed `listText` from the derived cards, send
 * the raw delta as provenance, and name the step derived from
 * (`PathEditor.tsx:214-300`).
 *
 * The derive here is the request's *payload*, not an expectation — a real client
 * builds the snapshot this way, and the whole point of the phase is that the server
 * no longer takes that snapshot on trust. Nothing below compares a persisted value
 * against this function's output.
 */
async function deriveAndPost(pathId: string, prior: PathStep, name: string, deltaText: string): Promise<Response> {
  const derived = await deriveSnapshot(prior.snapshot, deltaText);
  return postStep(pathId, {
    name,
    listText: deckCardsToText(derived.snapshot.cards),
    snapshot: derived.snapshot,
    deltaText,
    priorStepId: prior.id,
  });
}

/** Copies per card name, summed from parsed deck-list text — the `list_text` side of the agreement check. */
function holdingsOfText(text: string): Record<string, number> {
  const parsed = parseDeckList(text);
  expect(parsed.malformed).toEqual([]);

  const byName: Record<string, number> = {};
  for (const entry of parsed.entries) {
    byName[entry.name] = (byName[entry.name] ?? 0) + entry.quantity;
  }
  return byName;
}

beforeAll(async () => {
  const owner = await createSignedInOwner(BASE_URL, "derive-persist");
  ownerIds.push(owner.user.id);
  cookie = owner.cookieHeader;
  resolveCardsMock.mockImplementation(resolveFromCatalog);
});

afterAll(async () => {
  await deleteOwners(ownerIds);
});

describe("derive-to-persist — accepted appends", () => {
  // Risk #4's core claim. Phase 2's round-trip used a hand-authored literal and
  // never derived from a snapshot that had been through `jsonb`; a chained path
  // re-round-trips the same card objects at every step, and nothing exercised that.
  it("persists a snapshot derived from the prior step read back out of jsonb", async () => {
    const { pathId } = await seedBase("derive-from-persisted", BASE_LIST_TEXT, baseSnapshot());

    // The prior is the *returned* step, not the literal that was posted.
    const seeded = await readSteps(pathId, "GET after seeding the base");
    expect(holdingsOf(seeded[0].snapshot.cards)).toEqual(BASE_HOLDINGS);

    const res = await deriveAndPost(pathId, seeded[0], "swap", SWAP_DELTA);
    await assertStatus(res, 201, "POST a checkpoint derived from the persisted base");

    const steps = await readSteps(pathId, "GET after the derived append");
    expect(steps).toHaveLength(2);
    expect(steps[1].position).toBe(1);
    expect(steps[1].deltaText).toBe(SWAP_DELTA);
    expect(holdingsOf(steps[1].snapshot.cards)).toEqual(SWAP_HOLDINGS);
  });

  // The independent oracle: the same holdings entered through the *other* add flow,
  // on its own path. Compared as a multiset — `jsonb` does not preserve array order
  // and the two flows emit their cards in different orders by design (test-plan §6.6),
  // so `toEqual` on the `cards` arrays would fail for a reason nobody cares about.
  it("agrees with a full-paste checkpoint of the equivalent list on holdings", async () => {
    const diffPath = await seedBase("derive-oracle-diff", BASE_LIST_TEXT, baseSnapshot());
    const appended = await deriveAndPost(diffPath.pathId, diffPath.base, "swap", SWAP_DELTA);
    await assertStatus(appended, 201, "POST the derived checkpoint to the diff path");

    // The hand-written equivalent list, resolved the way a full paste resolves it.
    const resolved = await resolveDeck(SWAP_FULL_PASTE_TEXT);
    const pastePath = await seedBase("derive-oracle-paste", SWAP_FULL_PASTE_TEXT, {
      cards: resolved.deck,
      unresolved: resolved.unresolved.map((entry) => ({
        name: entry.name,
        reason: entry.reason,
        suggestion: entry.suggestion,
      })),
    });

    const derived = (await readSteps(diffPath.pathId, "GET the diff path"))[1];
    const pasted = (await readSteps(pastePath.pathId, "GET the full-paste path"))[0];

    expect(holdingsOf(derived.snapshot.cards)).toEqual(holdingsOf(pasted.snapshot.cards));
    // …and both against the hand-written record, so a defect the two flows shared
    // could not make this pass.
    expect(holdingsOf(derived.snapshot.cards)).toEqual(SWAP_HOLDINGS);
  });

  // base → derive → derive, each from its predecessor's *persisted* snapshot. The
  // final holdings are checked against the composed delta applied once, both as a
  // hand-written record and through the full-paste flow.
  it("does not drift across a three-step chain of derives", async () => {
    const { pathId, base } = await seedBase("derive-chain", BASE_LIST_TEXT, baseSnapshot());

    const first = await deriveAndPost(pathId, base, "swap", SWAP_DELTA);
    await assertStatus(first, 201, "POST the first derived checkpoint");
    const afterFirst = await readSteps(pathId, "GET after the first derive");
    expect(holdingsOf(afterFirst[1].snapshot.cards)).toEqual(SWAP_HOLDINGS);

    const second = await deriveAndPost(pathId, afterFirst[1], "tower", CHAIN_DELTA);
    await assertStatus(second, 201, "POST the second derived checkpoint");

    const steps = await readSteps(pathId, "GET after the second derive");
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.position)).toEqual([0, 1, 2]);

    const composed = await resolveDeck(CHAIN_FULL_PASTE_TEXT);
    expect(holdingsOf(steps[2].snapshot.cards)).toEqual(holdingsOf(composed.deck));
    expect(holdingsOf(steps[2].snapshot.cards)).toEqual(CHAIN_HOLDINGS);

    // Saved steps are immutable: a later derive must never rewrite its predecessors.
    expect(holdingsOf(steps[0].snapshot.cards)).toEqual(BASE_HOLDINGS);
    expect(holdingsOf(steps[1].snapshot.cards)).toEqual(SWAP_HOLDINGS);
  });

  // Risk #5's other half: an unresolved `+` is *flagged*, not dropped — and the
  // prior's own misses must lead, verbatim. `derive.ts` seeds `unresolved` with the
  // prior's entries and appends its own after them; that ordering is an invariant
  // nothing checked before, and the server now refuses a submission that breaks it.
  it("carries the prior unresolved entries forward verbatim and appends the new miss", async () => {
    const { pathId, base } = await seedBase("derive-unresolved", PARTIAL_BASE_LIST_TEXT, partialBaseSnapshot());

    const res = await deriveAndPost(pathId, base, "orchard", CARRY_DELTA);
    await assertStatus(res, 201, "POST a derived checkpoint whose add does not resolve");

    const steps = await readSteps(pathId, "GET after the unresolved-carry append");
    expect(holdingsOf(steps[1].snapshot.cards)).toEqual(CARRY_HOLDINGS);
    expect(steps[1].snapshot.unresolved).toEqual(CARRY_UNRESOLVED);
  });

  // `list_text` is a second derived artifact (`deckCardsToText(result.snapshot.cards)`),
  // so the two persisted columns can silently disagree. Asserted here, not enforced
  // by the server: a mismatch is a test failure, not a 400 — `list_text` is never
  // re-parsed on read, so a disagreement misleads a human rather than corrupting a plan.
  it("persists a list_text that re-parses to the same holdings as the snapshot", async () => {
    const { pathId, base } = await seedBase("derive-list-text", BASE_LIST_TEXT, baseSnapshot());

    const res = await deriveAndPost(pathId, base, "swap", SWAP_DELTA);
    await assertStatus(res, 201, "POST the derived checkpoint");

    const steps = await readSteps(pathId, "GET after the derived append");
    expect(holdingsOfText(steps[1].listText)).toEqual(holdingsOf(steps[1].snapshot.cards));
    expect(holdingsOfText(steps[1].listText)).toEqual(SWAP_HOLDINGS);
  });

  // The class the full-paste oracle is blind to, so the expectation is hand-authored:
  // `+3 Jace the Mind Sculptor` resolves to `Jace, the Mind Sculptor`, a different
  // `resolutionKey`. Before Phase 1's join fix both add flows joined on the canonical
  // key, missed, and persisted the `?? 1` fallback — a listed 3 becoming 1 silently.
  it("persists three copies of a +3 line whose name the source canonicalizes", async () => {
    const { pathId, base } = await seedBase("derive-canonical", BASE_LIST_TEXT, baseSnapshot());

    const res = await deriveAndPost(pathId, base, "jace", CANONICAL_DELTA);
    await assertStatus(res, 201, "POST a derived checkpoint whose add is canonicalized");

    const steps = await readSteps(pathId, "GET after the canonicalizing append");
    const holdings = holdingsOf(steps[1].snapshot.cards);
    expect(holdings).toEqual(CANONICAL_HOLDINGS);
    // Named on its own line: the 3 is the whole point, and a failure log should say so.
    expect(holdings["Jace, the Mind Sculptor"]).toBe(3);
  });
});

/**
 * One deliberately contradicting submission per {@link DerivedViolation}.
 *
 * A `Record` over the closed reason set, exactly as the route's `VIOLATION_MESSAGE`
 * is: adding a violation to the verifier is a wire-contract change, and this is a
 * second place `tsc` says so — a new rule cannot land without a case that proves it
 * rejects.
 *
 * **Each break is narrow on purpose.** The verifier is layered and reports its
 * *outermost* violated rule (Phase 2's lesson, restated in `verify.ts`'s docstring),
 * so a submission that breaks two rules names the earlier one and the expected
 * message would be wrong. Every row below leaves the preceding rules satisfied.
 *
 * `message` is the decided wire sentence transcribed as a literal — the rule's
 * phrasing from the route's map, then the verdict's `detail`. Reading it back out of
 * the response would assert nothing (`helpers/shape.ts`, rule 2).
 */
interface BreakCase {
  /** How the submission contradicts its own delta, for the test name. */
  label: string;
  /** The base checkpoint this case derives from. */
  prior: () => StepSnapshot;
  /** That checkpoint's `list_text`. */
  priorListText: string;
  /** The delta the submission claims to have applied. */
  deltaText: string;
  /** The snapshot that contradicts it. */
  submitted: () => StepSnapshot;
  /** The exact 400 body: the rule's sentence, then the verdict's detail. */
  message: string;
}

const BREAKS: Record<DerivedViolation, BreakCase> = {
  // Risk #5's headline: `- <card the prior never held>` was a silent no-op, while
  // `deltaText` persisted claiming a removal that never happened. The submission is
  // the untouched prior — which is exactly what the UI would have sent, since the
  // line no-ops — so no other rule is in play.
  "unapplicable-removal": {
    label: "removes a card the previous checkpoint does not have",
    prior: baseSnapshot,
    priorListText: BASE_LIST_TEXT,
    deltaText: "- Black Lotus",
    submitted: baseSnapshot,
    message: "That change removes a card the previous checkpoint does not have: - Black Lotus",
  },

  // The delta says one Forest left; the snapshot kept all four. Everything else in
  // the submission is correct, so the copy-count rule is the first one reached.
  "quantity-mismatch": {
    label: "keeps a card the delta reduces at its old count",
    prior: baseSnapshot,
    priorListText: BASE_LIST_TEXT,
    deltaText: "-1 Forest",
    submitted: () =>
      snapshotOf([
        ["Forest", 4],
        ["Llanowar Elves", 2],
        ["Sol Ring", 1],
      ]),
    message: "The saved copy counts do not match the changes: Forest: expected 3 copies, found 4",
  },

  // Forest is reduced correctly, so the delta-named card passes; Llanowar Elves is
  // inflated with no line naming it, which is the corruption this rule exists for.
  "untouched-card-changed": {
    label: "inflates a card no delta line mentions",
    prior: baseSnapshot,
    priorListText: BASE_LIST_TEXT,
    deltaText: "-1 Forest",
    submitted: () =>
      snapshotOf([
        ["Forest", 3],
        ["Llanowar Elves", 5],
        ["Sol Ring", 1],
      ]),
    message:
      "A card your changes never mention was altered: Llanowar Elves: 2 copies became 5, with no delta line naming it",
  },

  // Every carried-forward card is right, so the prior-cards pass is clean; the delta
  // has no `+` line at all, yet the snapshot smuggles in a card.
  "excess-new-cards": {
    label: "smuggles in a card no + line added",
    prior: baseSnapshot,
    priorListText: BASE_LIST_TEXT,
    deltaText: "-1 Forest",
    submitted: () =>
      snapshotOf([
        ["Forest", 3],
        ["Llanowar Elves", 2],
        ["Sol Ring", 1],
        ["Cultivate", 2],
      ]),
    message:
      "The checkpoint holds cards your changes never added: 1 cards absent from the previous step (Cultivate) for 0 added lines",
  },

  // Holdings are all correct here — the only thing wrong is that the prior's
  // unresolved miss was dropped, which is the last rule the verifier reaches.
  "unresolved-prefix": {
    label: "drops the previous checkpoint's unresolved entry",
    prior: partialBaseSnapshot,
    priorListText: PARTIAL_BASE_LIST_TEXT,
    deltaText: "-1 Forest",
    submitted: () =>
      snapshotOf([
        ["Forest", 3],
        ["Llanowar Elves", 2],
      ]),
    message:
      "The previous checkpoint's unresolved cards must carry forward: " +
      "the previous step's 1 unresolved entries must lead; found 0 in total",
  },
};

describe("derive-to-persist — refused appends", () => {
  for (const [rule, row] of Object.entries(BREAKS)) {
    it(`answers 400 naming the ${rule} rule when the snapshot ${row.label}, and persists nothing`, async () => {
      const { pathId, base } = await seedBase(`derive-break-${rule}`, row.priorListText, row.prior());
      const label = `POST a snapshot that ${row.label}`;

      const res = await postStep(pathId, {
        name: "swap",
        // Blank on purpose: `list_text` is provenance, not part of the verified
        // claim, and leaving it out keeps the case about the snapshot alone.
        listText: "",
        snapshot: row.submitted(),
        deltaText: row.deltaText,
        priorStepId: base.id,
      });

      await assertStatus(res, 400, label);
      expectApiError(await res.json(), row.message, label);
      // The refusal's other half: the base is still the only step on the path.
      expect(await countSteps(pathId)).toBe(1);
    });
  }

  // The stale-prior case is a 409, not a verifier 400: the submitted snapshot is a
  // *correct* derive from the step this caller read — what changed is which step is
  // last. Concurrency is checked before verification precisely so this reports
  // "reload", not a correctness complaint naming cards the user never touched.
  it("answers 409 for a second append claiming the same priorStepId, and leaves the chain unchanged", async () => {
    const { pathId, base } = await seedBase("derive-raced", BASE_LIST_TEXT, baseSnapshot());

    const first = await deriveAndPost(pathId, base, "swap", SWAP_DELTA);
    await assertStatus(first, 201, "POST the first derived checkpoint");

    // A second tab still holds the base as its prior, so it names a step that is no
    // longer last.
    const second = await deriveAndPost(pathId, base, "swap-again", SWAP_DELTA);
    await assertStatus(second, 409, "POST a second derive from the same prior");
    expectApiError(await second.json(), "Path changed since you started", "POST a second derive from the same prior");

    expect(await countSteps(pathId)).toBe(2);
    const steps = await readSteps(pathId, "GET after the raced append");
    expect(steps.map((step) => step.name)).toEqual(["base", "swap"]);
    expect(holdingsOf(steps[1].snapshot.cards)).toEqual(SWAP_HOLDINGS);
  });
});
