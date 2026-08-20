/**
 * Golden output for the add-checkpoint flow (test-plan risk #6, seam C).
 *
 * Risk #6's actual claim is that the additive diff-mode change did not touch the
 * preserved full-paste add flow — concretely, that a diff-mode checkpoint and a
 * full-paste checkpoint of the *same resulting list* produce the same snapshot.
 * `derive.test.ts` owns `deriveSnapshot`'s branches in isolation and `plan.test.ts`
 * owns `resolveDeck`'s; neither runs the two flows against each other, so nothing
 * verifies the equality in either direction. This file does, at the only seam that
 * can express it.
 *
 * **The equality is a multiset equality, not a byte one.** `deriveSnapshot` emits
 * `working` Map insertion order (prior cards first, then newly resolved ones —
 * `derive.ts:166`) while full paste emits the resolver's order
 * (`quantity.ts:31`'s `resolved.map`). The archived diff-style-checkpoint-entry
 * plan called the two "byte-equivalent"; that promise was stronger than the code,
 * and `derive.ts`'s docstring was corrected in Phase 1 of this change. The
 * "array order differs" assertion below pins the *real* guarantee as a fact rather
 * than leaving the weaker form implicit — if it ever stops holding, that docstring
 * needs revisiting.
 *
 * Seam: `vi.mock("@/lib/card-data", importOriginal)` with `resolveCards` replaced
 * and `resolutionKey` kept real (the `plan.test.ts:8-11` pattern), so both flows
 * join quantities on exactly the key production uses. No `clearSessionCache()` is
 * needed — with `resolveCards` mocked the real `sessionCache` in `resolve.ts` is
 * never touched, so cache warmth cannot influence ordering. The order difference
 * under test is therefore the genuine one, and the final test re-runs the whole
 * comparison with both mock `resolved` arrays permuted to prove the equality is not
 * an artifact of the mock's return order.
 *
 * The fixture. Prior checkpoint (a full-paste snapshot) holds Sol Ring ×1,
 * Forest ×10, Llanowar Elves ×4, Birds of Paradise ×2, and carries one unresolved
 * miss ("Sword of Feast", ambiguous). The delta covers every branch:
 *
 * | delta line           | branch                                    | effect                 |
 * | -------------------- | ----------------------------------------- | ---------------------- |
 * | `+ Cultivate`        | `+` new card, resolves                    | Cultivate ×1           |
 * | `+2 Llanowar Elves`  | `+` card already held, bumps quantity     | 4 → 6                  |
 * | `-2 Forest`          | `-` partial reduction                     | 10 → 8                 |
 * | `- Sol Ring`         | `-` to zero, drops the card               | removed                |
 * | `+3 Command Tower`   | `+` second new card (permutable resolve)  | Command Tower ×3       |
 * | `- Black Lotus`      | `-` for a card the prior never held       | `not-in-prior` warning |
 * | `+ Forbidden Orchrd` | `+` new card that fails to resolve        | snapshot.unresolved    |
 * | `Mox Diamond`        | no leading sign                           | `malformed` warning    |
 *
 * Resulting holdings: Forest ×8, Llanowar Elves ×6, Birds of Paradise ×2,
 * Cultivate ×1, Command Tower ×3 (20 copies), unresolved = the carried-forward
 * "Sword of Feast" plus the new "Forbidden Orchrd".
 *
 * The full-paste text below is the hand-written equivalent of exactly that list. It
 * includes both unresolved *names*, because a user re-pasting the same holdings
 * still has those lines in their list — they simply do not resolve. Both flows are
 * given the same `Card` objects for the same names, which is the claim's real
 * scope: identical at-save card data in, identical holdings out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Card } from "@/lib/card-data";
import { resolveCards } from "@/lib/card-data";
import { resolutionOf } from "@/lib/card-data/__fixtures__/resolution";
import { resolveDeck } from "@/lib/deck";
import type { DeckCard } from "@/lib/deck";
import { deriveSnapshot } from "./derive";
import type { DeriveResult } from "./derive";
import type { StepSnapshot, UnresolvedLite } from "./types";

// Mock only the resolver (the one network seam); keep `resolutionKey` real so both
// flows join quantities exactly as in production.
vi.mock("@/lib/card-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/card-data")>();
  return { ...actual, resolveCards: vi.fn() };
});

const resolveCardsMock = vi.mocked(resolveCards);

const FOREST: Card = {
  name: "Forest",
  typeLine: "Basic Land — Forest",
  category: "land",
  imageUrl: "https://cards.example.test/forest.png",
  priceUsd: 0.25,
  priceEur: 0.25,
};

const LLANOWAR_ELVES: Card = {
  name: "Llanowar Elves",
  typeLine: "Creature — Elf Druid",
  category: "creature",
  imageUrl: "https://cards.example.test/llanowar-elves.png",
  priceUsd: 0.5,
  priceEur: 0.25,
};

const BIRDS_OF_PARADISE: Card = {
  name: "Birds of Paradise",
  typeLine: "Creature — Bird",
  category: "creature",
  imageUrl: null,
  priceUsd: null,
  priceEur: null,
};

const SOL_RING: Card = {
  name: "Sol Ring",
  typeLine: "Artifact",
  category: "artifact",
  imageUrl: "https://cards.example.test/sol-ring.png",
  priceUsd: 1.5,
  priceEur: 1.25,
};

const CULTIVATE: Card = {
  name: "Cultivate",
  typeLine: "Sorcery",
  category: "sorcery",
  imageUrl: "https://cards.example.test/cultivate.png",
  priceUsd: 0.75,
  priceEur: 0.5,
};

const COMMAND_TOWER: Card = {
  name: "Command Tower",
  typeLine: "Land",
  category: "land",
  imageUrl: "https://cards.example.test/command-tower.png",
  priceUsd: 1.25,
  priceEur: 1.5,
};

/** Carried forward verbatim from the prior checkpoint — covers the `ambiguous` reason. */
const PRIOR_MISS: UnresolvedLite = { name: "Sword of Feast", reason: "ambiguous", suggestion: null };

/** The delta's own `+` that fails to resolve — appended after the carried-forward miss. */
const DELTA_MISS: UnresolvedLite = {
  name: "Forbidden Orchrd",
  reason: "not-found",
  suggestion: "Forbidden Orchard",
};

const PRIOR: StepSnapshot = {
  cards: [
    { card: SOL_RING, quantity: 1 },
    { card: FOREST, quantity: 10 },
    { card: LLANOWAR_ELVES, quantity: 4 },
    { card: BIRDS_OF_PARADISE, quantity: 2 },
  ],
  unresolved: [PRIOR_MISS],
};

const DELTA_TEXT = [
  "+ Cultivate",
  "+2 Llanowar Elves",
  "-2 Forest",
  "- Sol Ring",
  "+3 Command Tower",
  "- Black Lotus",
  "+ Forbidden Orchrd",
  "Mox Diamond",
].join("\n");

const FULL_PASTE_TEXT = [
  "8 Forest",
  "6 Llanowar Elves",
  "2 Birds of Paradise",
  "1 Cultivate",
  "3 Command Tower",
  "Sword of Feast",
  "Forbidden Orchrd",
].join("\n");

/** Cards the delta's two new `+` lines resolve to, in the resolver's default order. */
const DERIVED_RESOLVED: Card[] = [CULTIVATE, COMMAND_TOWER];

/** The same five cards the equivalent full paste resolves to — a deliberately different order. */
const FULL_PASTE_RESOLVED: Card[] = [COMMAND_TOWER, BIRDS_OF_PARADISE, CULTIVATE, FOREST, LLANOWAR_ELVES];

/** `(name, quantity)` pairs in canonical name order — the multiset the equality claim is about. */
function holdings(cards: DeckCard[]): [string, number][] {
  return cards
    .map((entry): [string, number] => [entry.card.name, entry.quantity])
    .sort((a, b) => a[0].localeCompare(b[0], "en"));
}

/** Card names in emit order — the array order the claim deliberately does *not* fix. */
function order(cards: DeckCard[]): string[] {
  return cards.map((entry) => entry.card.name);
}

/** Sort a snapshot by name so two order-differing snapshots compare, and the golden is stable. */
function canonical(snapshot: StepSnapshot): StepSnapshot {
  return {
    cards: [...snapshot.cards].sort((a, b) => a.card.name.localeCompare(b.card.name, "en")),
    unresolved: [...snapshot.unresolved].sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}

/**
 * Run both add flows over the fixture and return their snapshots.
 *
 * The two `resolved` orders are parameters so the last test can permute them and
 * prove the multiset equality is not an artifact of the mock's return order.
 */
async function runBothFlows(
  derivedResolved: Card[],
  fullPasteResolved: Card[],
): Promise<{ derived: DeriveResult; fullPaste: StepSnapshot }> {
  resolveCardsMock.mockResolvedValueOnce(resolutionOf(derivedResolved, [DELTA_MISS]));
  const derived = await deriveSnapshot(PRIOR, DELTA_TEXT);

  resolveCardsMock.mockResolvedValueOnce(resolutionOf(fullPasteResolved, [PRIOR_MISS, DELTA_MISS]));
  const resolvedDeck = await resolveDeck(FULL_PASTE_TEXT);
  // Mirrors the production full-paste seam verbatim (PathEditor.tsx:250-259): the
  // resolved deck becomes `cards`, and each `UnresolvedCard` is narrowed to an
  // `UnresolvedLite`. If that mapping changes, this golden is where it surfaces.
  const fullPaste: StepSnapshot = {
    cards: resolvedDeck.deck,
    unresolved: resolvedDeck.unresolved.map((entry) => ({
      name: entry.name,
      reason: entry.reason,
      suggestion: entry.suggestion,
    })),
  };

  return { derived, fullPaste };
}

beforeEach(() => {
  resolveCardsMock.mockReset();
});

describe("add-flow equality: diff-mode vs full paste", () => {
  it("resolves only the delta's genuinely new cards", async () => {
    await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    // Cards already held are re-quantified from the frozen prior snapshot, so a
    // derive costs one lookup for the new names only — never the whole list.
    expect(resolveCardsMock).toHaveBeenNthCalledWith(1, ["Cultivate", "Command Tower", "Forbidden Orchrd"]);
  });

  it("produces the same holdings as a full paste of the equivalent list", async () => {
    const { derived, fullPaste } = await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    // Hand-computed from the fixture table, not read from either flow's output.
    expect(holdings(derived.snapshot.cards)).toEqual([
      ["Birds of Paradise", 2],
      ["Command Tower", 3],
      ["Cultivate", 1],
      ["Forest", 8],
      ["Llanowar Elves", 6],
    ]);
    expect(holdings(fullPaste.cards)).toEqual(holdings(derived.snapshot.cards));
    // Equal in full card content too, not just name/quantity.
    expect(canonical(fullPaste).cards).toEqual(canonical(derived.snapshot).cards);
  });

  it("emits the two lists in *different* array order — the guarantee is multiset, not byte", async () => {
    const { derived, fullPaste } = await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    // Prior cards first, then newly resolved ones (derive.ts:166 Map order)...
    expect(order(derived.snapshot.cards)).toEqual([
      "Forest",
      "Llanowar Elves",
      "Birds of Paradise",
      "Cultivate",
      "Command Tower",
    ]);
    // ...versus the resolver's order (quantity.ts:31 `resolved.map`).
    expect(order(fullPaste.cards)).toEqual([
      "Command Tower",
      "Birds of Paradise",
      "Cultivate",
      "Forest",
      "Llanowar Elves",
    ]);
    expect(order(derived.snapshot.cards)).not.toEqual(order(fullPaste.cards));
  });

  it("carries the prior miss forward and matches the full paste's unresolved as a multiset", async () => {
    const { derived, fullPaste } = await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    // The carried-forward miss comes first, verbatim; the delta's own miss appends.
    expect(derived.snapshot.unresolved).toEqual([PRIOR_MISS, DELTA_MISS]);
    expect(canonical(fullPaste).unresolved).toEqual(canonical(derived.snapshot).unresolved);
  });

  it("keeps warnings preview-only — they reach neither snapshot", async () => {
    const { derived, fullPaste } = await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    expect(derived.warnings).toEqual([
      { line: "- Black Lotus", reason: "not-in-prior" },
      { line: "Mox Diamond", reason: "malformed" },
    ]);

    // A no-op `-` and an unreadable line are surfaced to the user and dropped —
    // never written into an immutable checkpoint, on either flow.
    const warned = ["Black Lotus", "Mox Diamond"];
    for (const snapshot of [derived.snapshot, fullPaste]) {
      expect(snapshot.cards.filter((entry) => warned.includes(entry.card.name))).toEqual([]);
      expect(snapshot.unresolved.filter((entry) => warned.includes(entry.name))).toEqual([]);
    }
  });

  it("pins the canonicalised derived snapshot", async () => {
    const { derived } = await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    expect(canonical(derived.snapshot)).toMatchSnapshot();
  });

  it("pins the derive summary", async () => {
    const { derived } = await runBothFlows(DERIVED_RESOLVED, FULL_PASTE_RESOLVED);

    // +2 Llanowar +1 Cultivate +3 Command Tower = 6 added; -1 Sol Ring -2 Forest = 3
    // removed; 8 Forest + 4 Llanowar + 2 Birds = 14 unchanged; 20 copies total.
    expect(derived.summary).toEqual({ added: 6, removed: 3, unchanged: 14, total: 20 });
    expect(derived.summary).toMatchSnapshot();
  });

  it("holds under a permuted resolver order — the equality is not a mock artifact", async () => {
    const { derived, fullPaste } = await runBothFlows(
      [COMMAND_TOWER, CULTIVATE],
      [LLANOWAR_ELVES, FOREST, CULTIVATE, BIRDS_OF_PARADISE, COMMAND_TOWER],
    );

    expect(holdings(derived.snapshot.cards)).toEqual(holdings(fullPaste.cards));
    expect(canonical(fullPaste).cards).toEqual(canonical(derived.snapshot).cards);
    expect(canonical(fullPaste).unresolved).toEqual(canonical(derived.snapshot).unresolved);
    // Both array orders moved with the permutation; the holdings did not.
    expect(order(derived.snapshot.cards)).not.toEqual(order(fullPaste.cards));
    expect(derived.summary).toEqual({ added: 6, removed: 3, unchanged: 14, total: 20 });
  });
});
