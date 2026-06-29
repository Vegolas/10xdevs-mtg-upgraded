/**
 * Public entry point for the path module (user-accounts).
 * Consumers import from `@/lib/path`. Mirrors `card-data/index.ts` and `deck/index.ts`.
 */

export type { StepSnapshot, UnresolvedLite, PathStep, UpgradePath } from "./types";
export { serializeSnapshot, parseSnapshot } from "./snapshot";
export { stepPlan, cumulativePathCost, isUpgradePlan, overallPathSummary } from "./chain";
export type { BaseStepPlan, PathSummary } from "./chain";
export { parseTitleInput, parseStepInput } from "./request";
export type { StepInput } from "./request";
export { parseDeltaList } from "./delta";
export type { DeltaEntry, ParsedDelta } from "./delta";
export { deriveSnapshot } from "./derive";
export type { DeriveResult, DeriveSummary, DeltaWarning } from "./derive";
