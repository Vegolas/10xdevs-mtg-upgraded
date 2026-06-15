import type { CardCategory } from "./types";

/**
 * Type keywords checked in precedence order — first match wins. This makes
 * overlapping type lines deterministic:
 *   - "Artifact Creature — Golem" -> creature
 *   - "Artifact Land"             -> land
 *   - "Land Creature — Dryad"     -> land
 *   - "Battle — Siege"            -> other
 * Tune the order here (and the tests) if grouping feedback warrants it.
 */
const CATEGORY_PRECEDENCE: readonly { keyword: string; category: CardCategory }[] = [
  { keyword: "planeswalker", category: "planeswalker" },
  { keyword: "land", category: "land" },
  { keyword: "creature", category: "creature" },
  { keyword: "instant", category: "instant" },
  { keyword: "sorcery", category: "sorcery" },
  { keyword: "artifact", category: "artifact" },
  { keyword: "enchantment", category: "enchantment" },
];

/**
 * Map a card type line (e.g. "Legendary Artifact Creature — Golem") to one of
 * the PRD grouping buckets, or "other". Only the supertype/type portion before
 * the em/en dash is considered; subtypes after it can collide with type words.
 */
export function classifyType(typeLine: string): CardCategory {
  const typesPart = typeLine.split(/[—–]/)[0] ?? "";
  const tokens = new Set(typesPart.toLowerCase().split(/\s+/).filter(Boolean));

  for (const { keyword, category } of CATEGORY_PRECEDENCE) {
    if (tokens.has(keyword)) {
      return category;
    }
  }
  return "other";
}
