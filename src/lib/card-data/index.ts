/**
 * Public entry point for the card-data resolution module (roadmap F-01).
 * Consumers import from `@/lib/card-data`.
 */

export type { Card, CardCategory, ResolutionResult, UnresolvedCard, UnresolvedReason } from "./types";
export { classifyType } from "./classify";

// Added in Phase 2:
// export { resolveCards } from "./resolve";
