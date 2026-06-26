/**
 * Public entry point for the path module (user-accounts).
 * Consumers import from `@/lib/path`. Mirrors `card-data/index.ts` and `deck/index.ts`.
 */

export type { StepSnapshot, UnresolvedLite, PathStep, UpgradePath } from "./types";
export { serializeSnapshot, parseSnapshot } from "./snapshot";
export { stepPlan, cumulativePathCost, isUpgradePlan } from "./chain";
export type { BaseStepPlan } from "./chain";
