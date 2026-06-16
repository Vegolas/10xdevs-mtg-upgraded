/**
 * Public entry point for the on-device history module (roadmap S-04 / FR-009).
 * Consumers import from `@/lib/history`. Mirrors `deck/index.ts`.
 */

export type { SavedComparison, ComparisonSummary } from "./types";
export { HISTORY_CAP } from "./types";
export {
  historyKey,
  summarizePlan,
  makeComparison,
  addComparison,
  deleteComparison,
  clearComparisons,
} from "./history";
export { loadHistory, saveHistory, parseHistory, serializeHistory, STORAGE_KEY } from "./storage";
