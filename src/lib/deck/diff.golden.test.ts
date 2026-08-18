/**
 * Golden output for the pure diff + cost engine (test-plan risk #6, seam A).
 *
 * `diff.test.ts` owns the *behavior* — partitions, quantity deltas, DFC matching,
 * empty-category omission. It deliberately projects the result down to
 * name/quantity pairs, and its `card()` helper hard-codes `imageUrl`, `priceUsd`
 * and `priceEur` to `null`, so `typeLine`, images, both prices and the group
 * boundaries a consumer actually renders are pinned by nothing. This file pins the
 * whole `UpgradePlan` plus the `PlanCost` derived from it. `diffDecks` and
 * `planAddCost` are pure and order-stable by construction (fixed `CATEGORY_ORDER`,
 * explicit `"en"` in-group collation), so the golden costs zero stubbing.
 *
 * Oracle discipline: the fixture below is hand-written and its expected partitions
 * are stated in the table, so the recorded `.snap` is reviewed against a
 * computed-by-hand expectation rather than accepted because it ran. Prices are
 * exact binary fractions (.25/.5/.75) because `planAddCost` accumulates raw floats
 * and `PlanCost.total` is unrounded (`cost.ts:38`) — arbitrary prices would record
 * a reviewer-hostile `27.250000000000004`.
 *
 * The fixture (quantities are copies held):
 *
 * | card                   | category    | base | target | shared | remove | add |
 * | ---------------------- | ----------- | ---: | -----: | -----: | -----: | --: |
 * | Mountain               | land        |    8 |      5 |      5 |      3 |   — |
 * | Island                 | land        |    6 |     10 |      6 |      — |   4 |
 * | Sol Ring               | artifact    |    1 |      1 |      1 |      — |   — |
 * | Counterspell           | instant     |    2 |      — |      — |      2 |   — |
 * | Meren of Clan Nel Toth | creature    |    1 |      3 |      1 |      — |   2 |
 * | Zurgo Helmsmasher      | creature    |    — |      1 |      — |      — |   1 |
 * | Anafenza, the Foremost | creature    |    — |      1 |      — |      — |   1 |
 * | Brainstorm             | instant     |    — |      3 |      — |      — |   3 |
 * | Rhystic Study          | enchantment |    — |      1 |      — |      — |   1 |
 *
 * Which exercises, in one pair: five `CATEGORY_ORDER` buckets; two partially
 * changed cards that must appear in `shared` *and* in `add`/`remove` (Island up,
 * Mountain down); an unchanged-count card that must appear in neither (Sol Ring); a
 * null-priced card in the add partition (Zurgo, driving `missingCount`); and
 * insertion orders chosen so both the group order and the in-group name sort have
 * to do real work — the base lists Mountain before Island, and the target lists the
 * creatures Zurgo → Meren → Anafenza.
 *
 * Expected groups, therefore:
 *   remove  land[Mountain ×3], instant[Counterspell ×2]
 *   add     land[Island ×4], creature[Anafenza ×1, Meren ×2, Zurgo ×1],
 *           instant[Brainstorm ×3], enchantment[Rhystic Study ×1]
 *   shared  land[Island ×6, Mountain ×5], creature[Meren ×1], artifact[Sol Ring ×1]
 */

import { describe, it, expect } from "vitest";
import type { Card } from "@/lib/card-data";
import { diffDecks } from "./diff";
import type { DeckCard } from "./diff";
import { planAddCost } from "./cost";

/** Pair a fixture card with a copy count. */
function held(card: Card, quantity: number): DeckCard {
  return { card, quantity };
}

const MOUNTAIN: Card = {
  name: "Mountain",
  typeLine: "Basic Land — Mountain",
  category: "land",
  imageUrl: "https://cards.example.test/mountain.png",
  priceUsd: 0.25,
  priceEur: 0.25,
};

/**
 * Island appears in both decks at *different* prices — snapshots capture at-save
 * card data, so a base and a target legitimately disagree. `diffDecks` keeps the
 * base object for `remove`/`shared` and the target's for `add`, so the golden shows
 * Island at 0.25 under `shared` and at 0.5 under `add`. That is the documented
 * behavior, not a bug, and it is what makes the add cost 4 × 0.5.
 */
const ISLAND_BASE: Card = {
  name: "Island",
  typeLine: "Basic Land — Island",
  category: "land",
  imageUrl: "https://cards.example.test/island.png",
  priceUsd: 0.25,
  priceEur: 0.5,
};

const ISLAND_TARGET: Card = { ...ISLAND_BASE, priceUsd: 0.5, priceEur: 0.75 };

const SOL_RING: Card = {
  name: "Sol Ring",
  typeLine: "Artifact",
  category: "artifact",
  imageUrl: "https://cards.example.test/sol-ring.png",
  priceUsd: 1.5,
  priceEur: 1.25,
};

const COUNTERSPELL: Card = {
  name: "Counterspell",
  typeLine: "Instant",
  category: "instant",
  imageUrl: "https://cards.example.test/counterspell.png",
  priceUsd: 0.75,
  priceEur: 0.5,
};

const MEREN: Card = {
  name: "Meren of Clan Nel Toth",
  typeLine: "Legendary Creature — Human Shaman",
  category: "creature",
  imageUrl: "https://cards.example.test/meren.png",
  priceUsd: 4.75,
  priceEur: 4.5,
};

/** The unpriced, imageless card: drives `PlanCost.missingCount` and the `null` image path. */
const ZURGO: Card = {
  name: "Zurgo Helmsmasher",
  typeLine: "Legendary Creature — Orc Warrior",
  category: "creature",
  imageUrl: null,
  priceUsd: null,
  priceEur: null,
};

const ANAFENZA: Card = {
  name: "Anafenza, the Foremost",
  typeLine: "Legendary Creature — Human Soldier",
  category: "creature",
  imageUrl: "https://cards.example.test/anafenza.png",
  priceUsd: 2.5,
  priceEur: 2.25,
};

const BRAINSTORM: Card = {
  name: "Brainstorm",
  typeLine: "Instant",
  category: "instant",
  imageUrl: "https://cards.example.test/brainstorm.png",
  priceUsd: 0.25,
  priceEur: 0.25,
};

const RHYSTIC_STUDY: Card = {
  name: "Rhystic Study",
  typeLine: "Enchantment",
  category: "enchantment",
  imageUrl: "https://cards.example.test/rhystic-study.png",
  priceUsd: 12.5,
  priceEur: 11.75,
};

/** Mountain before Island, so the `shared` land group's in-group sort has to reorder. */
const BASE: DeckCard[] = [
  held(MOUNTAIN, 8),
  held(ISLAND_BASE, 6),
  held(SOL_RING, 1),
  held(COUNTERSPELL, 2),
  held(MEREN, 1),
];

/** Creatures listed Zurgo → Meren → Anafenza, so the `add` group must sort them A/M/Z. */
const TARGET: DeckCard[] = [
  held(MOUNTAIN, 5),
  held(ISLAND_TARGET, 10),
  held(SOL_RING, 1),
  held(ZURGO, 1),
  held(MEREN, 3),
  held(ANAFENZA, 1),
  held(BRAINSTORM, 3),
  held(RHYSTIC_STUDY, 1),
];

describe("diffDecks golden output", () => {
  it("pins the whole UpgradePlan for the fixture pair", () => {
    expect(diffDecks(BASE, TARGET)).toMatchSnapshot();
  });

  it("keeps the target's card object in `add` and the base's in `shared`", () => {
    const plan = diffDecks(BASE, TARGET);

    // The one claim in the golden a reviewer is most likely to misread as a bug.
    const addedIsland = plan.add.find((group) => group.category === "land")?.cards[0];
    const sharedIsland = plan.shared.find((group) => group.category === "land")?.cards[0];
    expect(addedIsland?.card.priceUsd).toBe(0.5);
    expect(sharedIsland?.card.priceUsd).toBe(0.25);
  });
});

describe("planAddCost golden output", () => {
  it("pins the cost of that plan's add partition", () => {
    expect(planAddCost(diffDecks(BASE, TARGET).add)).toMatchSnapshot();
  });

  it("totals the hand-computed sum exactly, with Zurgo counted as missing", () => {
    const cost = planAddCost(diffDecks(BASE, TARGET).add);

    // Island 4 × 0.5 = 2, Anafenza 1 × 2.5, Meren 2 × 4.75 = 9.5,
    // Brainstorm 3 × 0.25 = 0.75, Rhystic Study 1 × 12.5 → 27.25 exactly.
    // Stated as a literal so the snapshot cannot quietly become a float artifact.
    expect(cost.total).toBe(27.25);
    expect(cost.pricedCount).toBe(5);
    expect(cost.missingCount).toBe(1);
  });
});
