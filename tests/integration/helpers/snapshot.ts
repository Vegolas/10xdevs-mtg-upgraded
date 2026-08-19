import type { StepSnapshot } from "@/lib/api/contract";

/**
 * A realistic `StepSnapshot` fixture for the round-trip contract test
 * (testing-api-contract-pinning, test-plan §3 Phase 2).
 *
 * The minimal snapshot the ownership helpers send (`{cards: [], unresolved: []}`)
 * proves a step can be written, but it exercises none of the value-shaped seams
 * the round-trip is supposed to pin: nullable prices, a missing image, and every
 * `unresolved` reason the guard accepts. `serializeSnapshot` rebuilds each entry
 * with a spread and `parseSnapshot` re-validates it on read, so what survives
 * POST → `jsonb` → GET is exactly what this fixture declares.
 *
 * Every value is a literal, and the factory returns a fresh object per call so a
 * test that mutates its copy cannot leak into another's expectation. Prices are
 * exact binary fractions, so a cost recomputed from this snapshot reads cleanly
 * rather than as a float artifact.
 *
 * Note `jsonb` does not preserve key order, so the round-trip assertion must be a
 * deep equality (`toEqual`), never a serialized-string comparison.
 */
export function realisticSnapshot(): StepSnapshot {
  return {
    cards: [
      {
        quantity: 4,
        card: {
          name: "Forest",
          typeLine: "Basic Land - Forest",
          category: "land",
          imageUrl: "https://cards.test.local/forest.png",
          priceUsd: 0.25,
          priceEur: 0.25,
        },
      },
      {
        quantity: 1,
        card: {
          name: "Llanowar Elves",
          typeLine: "Creature - Elf Druid",
          category: "creature",
          imageUrl: "https://cards.test.local/llanowar-elves.png",
          priceUsd: 1.5,
          priceEur: 0.75,
        },
      },
      {
        // The missing-image seam: `imageUrl: null` must survive as null, not "".
        quantity: 2,
        card: {
          name: "Giant Growth",
          typeLine: "Instant",
          category: "instant",
          imageUrl: null,
          priceUsd: 0.5,
          priceEur: 0.25,
        },
      },
      {
        // The `$NaN` seam: an unpriced card must come back with both prices null,
        // never 0 and never absent — a cost sum over it stays a "missing" count.
        quantity: 1,
        card: {
          name: "Sol Ring",
          typeLine: "Artifact",
          category: "artifact",
          imageUrl: "https://cards.test.local/sol-ring.png",
          priceUsd: null,
          priceEur: null,
        },
      },
    ],
    unresolved: [
      // One entry per reason the snapshot guard accepts, with and without a suggestion.
      { name: "Definitely Not A Card", reason: "not-found", suggestion: null },
      { name: "Bolt", reason: "ambiguous", suggestion: "Lightning Bolt" },
      { name: "4 x", reason: "malformed", suggestion: null },
    ],
  };
}
