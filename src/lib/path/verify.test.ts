/**
 * `verifyDerived` unit coverage (test-plan §3 Phase 3, risks #4 and #5).
 *
 * One test per member of the closed {@link DerivedViolation} set, an accept path
 * built from a **real `deriveSnapshot` call** (so the verifier is proven to accept
 * what production actually emits, not what this file imagines it emits), and the
 * near-miss cases that would false-positive if a rule were written as a net sum
 * instead of a replay.
 *
 * The accept fixture mirrors `add-flow.golden.test.ts`'s delta table branch for
 * branch — new `+` card, `+` on a held card, partial `-`, `-` to zero, a second new
 * `+`, an unresolvable `+`, and an unsigned line — with one deliberate omission:
 * the golden's `- Black Lotus`. That row is the golden's *unapplicable* removal, and
 * refusing it is this module's entire job for risk #5, so it gets its own rejection
 * test below rather than sitting inside the accept path. Fixtures are local and
 * minimal (the `derive.test.ts` convention) — the two files enumerate the same
 * branches, so a new branch in `deriveSnapshot` belongs in both.
 *
 * Seam: `vi.mock("@/lib/card-data", importOriginal)` with `resolveCards` replaced
 * and `resolutionKey` kept real, so the verifier keys holdings exactly as
 * production does. `verifyDerived` itself is pure and needs no mock at all — only
 * the `deriveSnapshot`-fed accept path does.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Card, CardCategory } from "@/lib/card-data";
import { resolveCards } from "@/lib/card-data";
import { resolutionOf } from "@/lib/card-data/__fixtures__/resolution";
import type { DeckCard } from "@/lib/deck";
import { deriveSnapshot } from "./derive";
import type { StepSnapshot, UnresolvedLite } from "./types";
import { verifyDerived } from "./verify";

vi.mock("@/lib/card-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/card-data")>();
  return { ...actual, resolveCards: vi.fn() };
});

const resolveCardsMock = vi.mocked(resolveCards);

/** Build a minimal {@link Card}; name/category are all these tests inspect. */
function card(name: string, category: CardCategory = "other"): Card {
  return { name, typeLine: category, category, imageUrl: null, priceUsd: null, priceEur: null };
}

/** A snapshot from quantity-tagged cards plus optional carried-over misses. */
function snapshot(cards: DeckCard[], unresolved: UnresolvedLite[] = []): StepSnapshot {
  return { cards, unresolved };
}

const SOL_RING = card("Sol Ring", "artifact");
const FOREST = card("Forest", "land");
const LLANOWAR_ELVES = card("Llanowar Elves", "creature");
const BIRDS_OF_PARADISE = card("Birds of Paradise", "creature");
const CULTIVATE = card("Cultivate", "sorcery");
const COMMAND_TOWER = card("Command Tower", "land");

/** Carried forward verbatim from the prior checkpoint. */
const PRIOR_MISS: UnresolvedLite = { name: "Sword of Feast", reason: "ambiguous", suggestion: null };

/** The delta's own `+` that fails to resolve — appended after the carried-forward miss. */
const DELTA_MISS: UnresolvedLite = { name: "Forbidden Orchrd", reason: "not-found", suggestion: "Forbidden Orchard" };

const PRIOR: StepSnapshot = snapshot(
  [
    { card: SOL_RING, quantity: 1 },
    { card: FOREST, quantity: 10 },
    { card: LLANOWAR_ELVES, quantity: 4 },
    { card: BIRDS_OF_PARADISE, quantity: 2 },
  ],
  [PRIOR_MISS],
);

/** Every applicable branch of the golden's delta table. */
const DELTA = [
  "+ Cultivate",
  "+2 Llanowar Elves",
  "-2 Forest",
  "- Sol Ring",
  "+3 Command Tower",
  "+ Forbidden Orchrd",
  "Mox Diamond",
].join("\n");

/** Run the real derive over the fixture, with only the resolver mocked. */
async function derived(): Promise<StepSnapshot> {
  resolveCardsMock.mockResolvedValueOnce(resolutionOf([CULTIVATE, COMMAND_TOWER], [DELTA_MISS]));
  const result = await deriveSnapshot(PRIOR, DELTA);
  return result.snapshot;
}

beforeEach(() => {
  resolveCardsMock.mockReset();
});

describe("verifyDerived — accepts what deriveSnapshot produces", () => {
  it("accepts a real derive over every applicable branch of the golden's delta table", async () => {
    expect(verifyDerived(PRIOR, await derived(), DELTA)).toEqual({ ok: true });
  });

  it("accepts the same holdings in a different array order (the guarantee is multiset)", async () => {
    const reordered = snapshot([...(await derived()).cards].reverse(), [PRIOR_MISS, DELTA_MISS]);

    // `jsonb` does not preserve array order, so a round-tripped snapshot may come
    // back in any order — see test-plan §6.6.
    expect(verifyDerived(PRIOR, reordered, DELTA)).toEqual({ ok: true });
  });

  it("accepts an empty delta when the snapshot is unchanged", () => {
    expect(verifyDerived(PRIOR, PRIOR, "")).toEqual({ ok: true });
  });
});

describe("verifyDerived — non-violations", () => {
  it("ignores a malformed line rather than treating it as a claim", () => {
    const prior = snapshot([{ card: FOREST, quantity: 4 }]);

    expect(verifyDerived(prior, prior, "Mox Diamond")).toEqual({ ok: true });
  });

  it("accepts a `-` clamped past zero dropping the card entirely", () => {
    const prior = snapshot([{ card: FOREST, quantity: 2 }]);

    expect(verifyDerived(prior, snapshot([]), "-5 Forest")).toEqual({ ok: true });
  });

  it("accepts a `+` that failed to resolve and landed in unresolved instead of cards", () => {
    const prior = snapshot([{ card: FOREST, quantity: 4 }]);
    const submitted = snapshot([{ card: FOREST, quantity: 4 }], [DELTA_MISS]);

    expect(verifyDerived(prior, submitted, "+ Forbidden Orchrd")).toEqual({ ok: true });
  });

  it("sums two delta lines naming one card", () => {
    const prior = snapshot([{ card: FOREST, quantity: 4 }]);
    const submitted = snapshot([{ card: FOREST, quantity: 9 }]);

    expect(verifyDerived(prior, submitted, "+2 Forest\n+3 Forest")).toEqual({ ok: true });
  });

  it("accepts a card emptied and re-added at any quantity — the second `+` goes to the resolver", () => {
    // `deriveSnapshot` deletes the key on the `-`, so the later `+` is a *new* card:
    // it is resolved afresh, comes back as whatever card data the source has now, and
    // is quantified by the resolver join. None of that is checkable here, so the key
    // falls into the count-bounded bucket rather than the exact-quantity one.
    const prior = snapshot([{ card: FOREST, quantity: 1 }]);
    const refreshed = { ...FOREST, priceUsd: 0.3 };
    const submitted = snapshot([{ card: refreshed, quantity: 2 }]);

    expect(verifyDerived(prior, submitted, "- Forest\n+2 Forest")).toEqual({ ok: true });
  });

  it("accepts extra unresolved entries appended after the prior's prefix", () => {
    const prior = snapshot([{ card: FOREST, quantity: 4 }], [PRIOR_MISS]);
    const submitted = snapshot([{ card: FOREST, quantity: 4 }], [PRIOR_MISS, DELTA_MISS]);

    expect(verifyDerived(prior, submitted, "+ Forbidden Orchrd")).toEqual({ ok: true });
  });
});

describe("verifyDerived — unapplicable-removal", () => {
  it("refuses a `-` for a card the prior list does not hold, naming the line", () => {
    const prior = snapshot([{ card: SOL_RING, quantity: 1 }]);

    expect(verifyDerived(prior, prior, "- Black Lotus")).toEqual({
      ok: false,
      reason: "unapplicable-removal",
      detail: "- Black Lotus",
    });
  });

  it("refuses the golden's full delta table — its `- Black Lotus` is the silent no-op risk #5 names", async () => {
    // The golden fixture deliberately includes an unapplicable removal, and
    // `deriveSnapshot` persists a snapshot for it while surfacing a preview-only
    // warning the UI is free to discard. That snapshot's `deltaText` claims a removal
    // that never happened, which is exactly what must not reach the database.
    resolveCardsMock.mockResolvedValueOnce(resolutionOf([CULTIVATE, COMMAND_TOWER], [DELTA_MISS]));
    const goldenDelta = [DELTA, "- Black Lotus"].join("\n");
    const result = await deriveSnapshot(PRIOR, goldenDelta);

    expect(verifyDerived(PRIOR, result.snapshot, goldenDelta)).toEqual({
      ok: false,
      reason: "unapplicable-removal",
      detail: "- Black Lotus",
    });
    // The derive itself only warned — the refusal is the server's contribution.
    expect(result.warnings).toEqual([
      { line: "- Black Lotus", reason: "not-in-prior" },
      { line: "Mox Diamond", reason: "malformed" },
    ]);
  });

  it("refuses a `-` for a card only a *later* `+` introduces", () => {
    // Order matters: `deriveSnapshot` adds new `+` cards after the loop, so the `-`
    // sees a list that does not hold Cultivate yet.
    const prior = snapshot([{ card: FOREST, quantity: 4 }]);

    expect(verifyDerived(prior, prior, "+ Cultivate\n- Cultivate")).toEqual({
      ok: false,
      reason: "unapplicable-removal",
      detail: "- Cultivate",
    });
  });
});

describe("verifyDerived — quantity-mismatch", () => {
  it("refuses a named card whose count is not prior + adds − removes", () => {
    const prior = snapshot([{ card: FOREST, quantity: 10 }]);
    const submitted = snapshot([{ card: FOREST, quantity: 9 }]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "quantity-mismatch",
      detail: "Forest: expected 8 copies, found 9",
    });
  });

  it("refuses a named card that vanished instead of being reduced", () => {
    const prior = snapshot([{ card: FOREST, quantity: 10 }]);

    expect(verifyDerived(prior, snapshot([]), "-2 Forest")).toEqual({
      ok: false,
      reason: "quantity-mismatch",
      detail: "Forest: expected 8 copies, found none",
    });
  });

  it("refuses a card the delta empties that is still in the snapshot", () => {
    const prior = snapshot([{ card: FOREST, quantity: 2 }]);
    const submitted = snapshot([{ card: FOREST, quantity: 2 }]);

    expect(verifyDerived(prior, submitted, "-5 Forest")).toEqual({
      ok: false,
      reason: "quantity-mismatch",
      detail: "Forest: the delta removes every copy, but 2 remain",
    });
  });
});

describe("verifyDerived — untouched-card-changed", () => {
  it("refuses a quantity change on a card no delta line names", () => {
    const prior = snapshot([
      { card: FOREST, quantity: 10 },
      { card: SOL_RING, quantity: 1 },
    ]);
    const submitted = snapshot([
      { card: FOREST, quantity: 8 },
      { card: SOL_RING, quantity: 4 },
    ]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "untouched-card-changed",
      detail: "Sol Ring: 1 copies became 4, with no delta line naming it",
    });
  });

  it("refuses a silent drop of a card no delta line names", () => {
    const prior = snapshot([
      { card: FOREST, quantity: 10 },
      { card: SOL_RING, quantity: 1 },
    ]);
    const submitted = snapshot([{ card: FOREST, quantity: 8 }]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "untouched-card-changed",
      detail: "Sol Ring: dropped, with no delta line naming it",
    });
  });

  it("refuses rewritten card data on a card no delta line names", () => {
    // A snapshot is immutable once saved, so a re-priced carry-forward is not a
    // refresh — it is a rewrite of a frozen step's contents.
    const prior = snapshot([
      { card: FOREST, quantity: 10 },
      { card: SOL_RING, quantity: 1 },
    ]);
    const submitted = snapshot([
      { card: FOREST, quantity: 8 },
      { card: { ...SOL_RING, priceUsd: 999 }, quantity: 1 },
    ]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "untouched-card-changed",
      detail: "Sol Ring: card data changed, with no delta line naming it",
    });
  });

  it("refuses a canonicalizing `+` that overwrites a held card instead of adding to it", () => {
    // `deriveSnapshot` treats `+1 Jace the Mind Sculptor` as a *new* card (its key is
    // front-face-lowercase, so the comma-less spelling misses the held entry), then
    // writes the resolved card back under the canonical key — replacing the held
    // quantity rather than incrementing it. The submitted snapshot below is what
    // production emits today, and refusing it is correct: it is not `prior ± delta`.
    // Fixing the overwrite is `derive.ts`'s job, not this module's.
    const jace = card("Jace, the Mind Sculptor", "planeswalker");
    const prior = snapshot([{ card: jace, quantity: 2 }]);
    const submitted = snapshot([{ card: jace, quantity: 1 }]);

    expect(verifyDerived(prior, submitted, "+1 Jace the Mind Sculptor")).toEqual({
      ok: false,
      reason: "untouched-card-changed",
      detail: "Jace, the Mind Sculptor: 2 copies became 1, with no delta line naming it",
    });
  });
});

describe("verifyDerived — excess-new-cards", () => {
  it("refuses more new cards than the delta has distinct new `+` keys", () => {
    const prior = snapshot([{ card: FOREST, quantity: 4 }]);
    const submitted = snapshot([
      { card: FOREST, quantity: 4 },
      { card: CULTIVATE, quantity: 1 },
      { card: COMMAND_TOWER, quantity: 3 },
    ]);

    expect(verifyDerived(prior, submitted, "+ Cultivate")).toEqual({
      ok: false,
      reason: "excess-new-cards",
      detail: "2 cards absent from the previous step (Cultivate, Command Tower) for 1 added lines",
    });
  });

  it("refuses a new card smuggled in under a delta that adds nothing", () => {
    const prior = snapshot([{ card: FOREST, quantity: 10 }]);
    const submitted = snapshot([
      { card: FOREST, quantity: 8 },
      { card: COMMAND_TOWER, quantity: 3 },
    ]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "excess-new-cards",
      detail: "1 cards absent from the previous step (Command Tower) for 0 added lines",
    });
  });

  it("counts distinct keys, not lines — two `+` lines for one new card allow one new key", () => {
    const prior = snapshot([{ card: FOREST, quantity: 4 }]);
    const submitted = snapshot([
      { card: FOREST, quantity: 4 },
      { card: CULTIVATE, quantity: 3 },
    ]);

    expect(verifyDerived(prior, submitted, "+ Cultivate\n+2 Cultivate")).toEqual({ ok: true });
  });
});

describe("verifyDerived — unresolved-prefix", () => {
  it("refuses a snapshot that drops the prior's carried-forward misses", () => {
    const prior = snapshot([{ card: FOREST, quantity: 10 }], [PRIOR_MISS]);
    const submitted = snapshot([{ card: FOREST, quantity: 8 }]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "unresolved-prefix",
      detail: "the previous step's 1 unresolved entries must lead; found 0 in total",
    });
  });

  it("refuses a snapshot that appends the prior's misses after its own", () => {
    const prior = snapshot([{ card: FOREST, quantity: 10 }], [PRIOR_MISS]);
    const submitted = snapshot([{ card: FOREST, quantity: 8 }], [DELTA_MISS, PRIOR_MISS]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "unresolved-prefix",
      detail: 'unresolved entry 1 is "Forbidden Orchrd", expected "Sword of Feast"',
    });
  });

  it("refuses a rewritten suggestion on a carried-forward miss", () => {
    const prior = snapshot([{ card: FOREST, quantity: 10 }], [PRIOR_MISS]);
    const submitted = snapshot([{ card: FOREST, quantity: 8 }], [{ ...PRIOR_MISS, suggestion: "Sword of Fire" }]);

    expect(verifyDerived(prior, submitted, "-2 Forest")).toEqual({
      ok: false,
      reason: "unresolved-prefix",
      detail: 'unresolved entry 1 is "Sword of Feast", expected "Sword of Feast"',
    });
  });
});

describe("verifyDerived — a full-paste snapshot must never be routed here", () => {
  it("rejects an unrelated list submitted with no delta lines", () => {
    // With no readable delta the submitted snapshot must equal the prior, so a
    // full-paste checkpoint would be refused on sight. The exclusion belongs in the
    // route (`deltaText === null` skips the check) — this pins the consequence of
    // getting that ordering wrong, so Phase 3 cannot make it silently.
    const prior = snapshot([{ card: FOREST, quantity: 10 }]);
    const fullPaste = snapshot([
      { card: COMMAND_TOWER, quantity: 3 },
      { card: CULTIVATE, quantity: 1 },
    ]);

    expect(verifyDerived(prior, fullPaste, "")).toEqual({
      ok: false,
      reason: "untouched-card-changed",
      detail: "Forest: dropped, with no delta line naming it",
    });
  });
});
