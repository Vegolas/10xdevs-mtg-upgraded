/**
 * Path-chain math (user-accounts).
 *
 * Computes each step's plan and the path's cumulative cost by *reusing* the
 * existing engine — `diffDecks` and `planAddCost` — against stored snapshots, so
 * a saved path renders with no card-data lookups and is byte-identical to pasting
 * the same lists pairwise into the `/` comparer. Pure; no I/O.
 */

import { diffDecks, groupByCategory, planAddCost } from "@/lib/deck";
import type { CardGroup, PlanCost, UpgradePlan } from "@/lib/deck";
import type { StepSnapshot } from "./types";

/** The base (position-0) step has no diff — it renders as a grouped card list. */
export interface BaseStepPlan {
  base: CardGroup[];
}

/** True when a {@link stepPlan} result is a diff (position ≥ 1), narrowing the union to {@link UpgradePlan}. */
export function isUpgradePlan(plan: UpgradePlan | BaseStepPlan): plan is UpgradePlan {
  return "add" in plan;
}

/**
 * The plan for a step given the previous step's snapshot.
 *
 * Position 0 has no previous step (`prev === null`): the base deck renders as a
 * grouped card list, not an add/remove plan. Every later step diffs against the
 * step before it via {@link diffDecks}.
 */
export function stepPlan(prev: StepSnapshot | null, cur: StepSnapshot): UpgradePlan | BaseStepPlan {
  if (prev === null) {
    return { base: groupByCategory(cur.cards) };
  }
  return diffDecks(prev.cards, cur.cards);
}

/**
 * The total cost of acquiring every addition across a path, summed over the
 * per-step diffs (positions ≥ 1; the base has nothing to acquire). Aggregates
 * each step's {@link planAddCost}, so `total` excludes missing-price cards while
 * `pricedCount` / `missingCount` carry the honest priced/unpriced breakdown.
 */
export function cumulativePathCost(steps: StepSnapshot[]): PlanCost {
  let total = 0;
  let pricedCount = 0;
  let missingCount = 0;

  for (let position = 1; position < steps.length; position += 1) {
    const plan = stepPlan(steps[position - 1], steps[position]);
    if (isUpgradePlan(plan)) {
      const cost = planAddCost(plan.add);
      total += cost.total;
      pricedCount += cost.pricedCount;
      missingCount += cost.missingCount;
    }
  }

  return { total, pricedCount, missingCount };
}
