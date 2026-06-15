/**
 * Public entry point for the card-data resolution module (roadmap F-01).
 * Consumers import from `@/lib/card-data`.
 */

export type { Card, CardCategory, ResolutionResult, UnresolvedCard, UnresolvedReason } from "./types";
export { classifyType } from "./classify";
export { resolveCards } from "./resolve";
