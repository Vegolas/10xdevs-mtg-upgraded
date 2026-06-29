/**
 * Public entry point for the deck module (roadmap S-01).
 * Consumers import from `@/lib/deck`. Mirrors `card-data/index.ts`.
 */

export { parseDeckList } from "./parse";
export type { DeckEntry, ParsedDeck } from "./parse";
export { deckCardsToText } from "./serialize";
export { diffDecks, CATEGORY_ORDER, groupByCategory } from "./diff";
export type { CardGroup, UpgradePlan, DeckCard } from "./diff";
export { generateUpgradePlan, resolveDeck } from "./plan";
export type { PlanOutcome, UnresolvedEntry, DeckSide, ResolvedDeck } from "./plan";
export { attachQuantities } from "./quantity";
export { planAddCost } from "./cost";
export type { PlanCost } from "./cost";
export { applySuggestion, acceptAllSuggestions, applyAllSuggestions } from "./accept";
