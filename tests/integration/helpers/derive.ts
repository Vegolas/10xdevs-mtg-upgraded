import { resolutionKey } from "@/lib/card-data";
import type { Card, ResolutionResult, UnresolvedCard } from "@/lib/card-data";
import { canonicalizedTo } from "@/lib/card-data/__fixtures__/resolution";
import type { DeckCard } from "@/lib/deck";
import type { StepSnapshot, UnresolvedLite } from "@/lib/path";

/**
 * Derive-to-persist fixtures: the priors, the deltas, and the hand-written
 * expectations that go with them (testing-derive-to-persist, test-plan §3 Phase 3).
 *
 * Everything the `derive-persist.int.test.ts` scenarios need lives here so each
 * test reads as a scenario rather than as setup — and, more importantly, so a delta
 * and its expected result cannot drift apart. Each delta below is published
 * alongside **two** independent statements of what it produces: a hand-written
 * holdings record, and the full-paste deck-list text that yields the same holdings.
 * Neither is obtained by calling `deriveSnapshot`; that would make the function
 * under test its own oracle, which is the anti-pattern this phase's risk response
 * names explicitly (`change.md`, risk #4).
 *
 * **The card-data mock shape.** {@link resolveFromCatalog} is the whole card-data
 * edge the suite fakes, in the test process only — the app server never resolves a
 * card in a request path, so there is nothing to fake across the process boundary.
 * It is deliberately built through `canonicalizedTo` rather than as an inline
 * literal: `ResolutionResult.matched` is the association the quantity join runs
 * through, and a *wrong* `matched` sends that join down its `?? 1` fallback and
 * makes a canonicalization test pass for the wrong reason (see the registry row for
 * `resolutionOf` / `canonicalizedTo`).
 *
 * Factories return fresh objects per call (the `realisticSnapshot()` precedent), so
 * a scenario that edits its copy of a snapshot cannot leak into another's
 * expectation. Prices are exact binary fractions, so a cost recomputed downstream
 * reads cleanly rather than as a float artifact.
 *
 * Identity note: the phase's equality is a multiset over `resolutionKey` (test-plan
 * §6.6), but {@link holdingsOf} keys on the card's *name* because a failure message
 * reading `Llanowar Elves` beats one reading `llanowar elves`. Every catalog card
 * below is spelled canonically and no two collapse to one key, so the two keyings
 * agree here — a new fixture card must keep that true.
 */

// ---------------------------------------------------------------------------
// The catalog — the only cards this suite's fake card-data source knows about.
// ---------------------------------------------------------------------------

const FOREST: Card = {
  name: "Forest",
  typeLine: "Basic Land - Forest",
  category: "land",
  imageUrl: "https://cards.test.local/forest.png",
  priceUsd: 0.25,
  priceEur: 0.25,
};

const LLANOWAR_ELVES: Card = {
  name: "Llanowar Elves",
  typeLine: "Creature - Elf Druid",
  category: "creature",
  imageUrl: "https://cards.test.local/llanowar-elves.png",
  priceUsd: 1.5,
  priceEur: 0.75,
};

/** The unpriced, image-less seam, carried over from `realisticSnapshot`'s reasoning. */
const SOL_RING: Card = {
  name: "Sol Ring",
  typeLine: "Artifact",
  category: "artifact",
  imageUrl: null,
  priceUsd: null,
  priceEur: null,
};

const CULTIVATE: Card = {
  name: "Cultivate",
  typeLine: "Sorcery",
  category: "sorcery",
  imageUrl: "https://cards.test.local/cultivate.png",
  priceUsd: 0.5,
  priceEur: 0.25,
};

const COMMAND_TOWER: Card = {
  name: "Command Tower",
  typeLine: "Land",
  category: "land",
  imageUrl: "https://cards.test.local/command-tower.png",
  priceUsd: 1.25,
  priceEur: 0.75,
};

/**
 * The canonicalization case, and the reason `matched` exists: a user types
 * `Jace the Mind Sculptor` and the source answers with `Jace, the Mind Sculptor`,
 * whose `resolutionKey` is a different string. Joining the typed copy count on the
 * canonical key misses, and the old `?? 1` fallback then persisted one copy of a
 * `+3` line with nothing surfaced.
 */
const JACE: Card = {
  name: "Jace, the Mind Sculptor",
  typeLine: "Legendary Planeswalker - Jace",
  category: "planeswalker",
  imageUrl: "https://cards.test.local/jace.png",
  priceUsd: 96.5,
  priceEur: 88.25,
};

/** The name a caller may type, paired with the card the source answers with. */
const CATALOG: readonly (readonly [typed: string, card: Card])[] = [
  ["Forest", FOREST],
  ["Llanowar Elves", LLANOWAR_ELVES],
  ["Sol Ring", SOL_RING],
  ["Cultivate", CULTIVATE],
  ["Command Tower", COMMAND_TOWER],
  // Typed without the comma; answered with it. The only differently-keyed row.
  ["Jace the Mind Sculptor", JACE],
];

/** Catalog lookup by the caller's `resolutionKey`, or `undefined` for a miss. */
function findByTypedKey(key: string): Card | undefined {
  return CATALOG.find(([typed]) => resolutionKey(typed) === key)?.[1];
}

/** Catalog lookup by canonical name — the vocabulary the fixtures below are written in. */
function cardNamed(name: string): Card {
  const row = CATALOG.find(([, card]) => card.name === name);
  if (row === undefined) {
    throw new Error(`derive fixtures: no catalog card named "${name}"`);
  }
  return { ...row[1] };
}

/**
 * Stand-in for `resolveCards`, for `vi.mock("@/lib/card-data", importOriginal)`
 * with `resolutionKey` kept real (the `add-flow.golden.test.ts` pattern).
 *
 * Mirrors the real resolver's observable contract rather than its transport: inputs
 * dedup on `resolutionKey`, an unknown name comes back in `unresolved` instead of
 * throwing, and a canonicalized name is attributed through `matched` to the key the
 * *caller* asked under. Not `async`, so the shape stays a plain value; the returned
 * promise is what `mockImplementation` wants.
 */
export function resolveFromCatalog(names: string[]): Promise<ResolutionResult> {
  const canonicalized: [typed: string, card: Card][] = [];
  const direct: Card[] = [];
  const unresolved: UnresolvedCard[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const key = resolutionKey(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const card = findByTypedKey(key);
    if (card === undefined) {
      unresolved.push({ name, reason: "not-found", suggestion: null });
      continue;
    }
    if (resolutionKey(card.name) === key) {
      direct.push({ ...card });
    } else {
      canonicalized.push([name, { ...card }]);
    }
  }

  return Promise.resolve({ ...canonicalizedTo(canonicalized, direct), unresolved });
}

// ---------------------------------------------------------------------------
// Snapshot construction
// ---------------------------------------------------------------------------

/** A card name paired with how many copies a snapshot holds. */
export type Holding = readonly [name: string, quantity: number];

/**
 * Build a {@link StepSnapshot} from catalog cards by canonical name, so a
 * scenario's prior — or its deliberately contradicting submission — is one readable
 * line rather than a page of card literals. Fresh objects per call; an unknown name
 * throws rather than silently producing an empty snapshot.
 */
export function snapshotOf(holdings: readonly Holding[], unresolved: readonly UnresolvedLite[] = []): StepSnapshot {
  return {
    cards: holdings.map(([name, quantity]) => ({ quantity, card: cardNamed(name) })),
    unresolved: unresolved.map((entry) => ({ ...entry })),
  };
}

/**
 * Copies per card name, summed across entries — the multiset every "same holdings"
 * assertion compares on.
 *
 * A record rather than an array because `toEqual` over a record is
 * order-insensitive, which is exactly the guarantee: `jsonb` does not preserve
 * array order, and `deriveSnapshot` emits its cards in a different order from full
 * paste by design (`derive.ts`'s docstring, test-plan §6.6). Never `toEqual` two
 * `cards` arrays directly.
 */
export function holdingsOf(cards: readonly DeckCard[]): Record<string, number> {
  const byName: Record<string, number> = {};
  for (const entry of cards) {
    byName[entry.card.name] = (byName[entry.card.name] ?? 0) + entry.quantity;
  }
  return byName;
}

// ---------------------------------------------------------------------------
// The base checkpoint every scenario starts from
// ---------------------------------------------------------------------------

/** The full-paste text of the base checkpoint. */
export const BASE_LIST_TEXT = "4 Forest\n2 Llanowar Elves\n1 Sol Ring";

/** The base checkpoint's holdings, hand-written. */
export const BASE_HOLDINGS: Record<string, number> = { Forest: 4, "Llanowar Elves": 2, "Sol Ring": 1 };

/** The base checkpoint's snapshot. Fresh objects per call. */
export function baseSnapshot(): StepSnapshot {
  return snapshotOf([
    ["Forest", 4],
    ["Llanowar Elves", 2],
    ["Sol Ring", 1],
  ]);
}

// ---------------------------------------------------------------------------
// Scenario 1: the swap — one delta covering every applicable branch
// ---------------------------------------------------------------------------

/**
 * `-1 Forest` partially reduces, `- Sol Ring` empties and drops, `+1 Llanowar
 * Elves` bumps a held card, `+2 Cultivate` adds a new one that resolves.
 */
export const SWAP_DELTA = "-1 Forest\n- Sol Ring\n+1 Llanowar Elves\n+2 Cultivate";

/** `BASE ± SWAP_DELTA`, hand-written — oracle #1. */
export const SWAP_HOLDINGS: Record<string, number> = { Forest: 3, "Llanowar Elves": 3, Cultivate: 2 };

/**
 * The same holdings as a full-paste deck list — oracle #2, and the independent one:
 * it enters through `resolveDeck` → `attachQuantities`, a different code path from
 * `deriveSnapshot`, so agreement between the two is a real cross-check rather than a
 * restatement.
 */
export const SWAP_FULL_PASTE_TEXT = "3 Forest\n3 Llanowar Elves\n2 Cultivate";

// ---------------------------------------------------------------------------
// Scenario 2: the chain — a second derive on top of the first
// ---------------------------------------------------------------------------

/** Applied to `SWAP_HOLDINGS`: `-2 Llanowar Elves` reduces, `+3 Command Tower` adds. */
export const CHAIN_DELTA = "-2 Llanowar Elves\n+3 Command Tower";

/** `BASE ± SWAP_DELTA ± CHAIN_DELTA`, hand-written — the composed result. */
export const CHAIN_HOLDINGS: Record<string, number> = {
  Forest: 3,
  "Llanowar Elves": 1,
  Cultivate: 2,
  "Command Tower": 3,
};

/** The composed result as one full-paste list — the "applied once" form of the chain. */
export const CHAIN_FULL_PASTE_TEXT = "3 Forest\n1 Llanowar Elves\n2 Cultivate\n3 Command Tower";

// ---------------------------------------------------------------------------
// Scenario 3: canonicalization — the class the full-paste oracle cannot see
// ---------------------------------------------------------------------------

/**
 * A `+3` line whose name the source answers with a differently-keyed canonical one.
 * Hand-authored expectation only: before the Phase 1 join fix **both** add flows
 * fell back to one copy here, so the full-paste oracle shares the defect and cannot
 * detect this class.
 */
export const CANONICAL_DELTA = "+3 Jace the Mind Sculptor";

/** `BASE + CANONICAL_DELTA`, hand-written. The load-bearing number is the 3. */
export const CANONICAL_HOLDINGS: Record<string, number> = {
  Forest: 4,
  "Llanowar Elves": 2,
  "Sol Ring": 1,
  "Jace, the Mind Sculptor": 3,
};

// ---------------------------------------------------------------------------
// Scenario 4: unresolved carry-forward
// ---------------------------------------------------------------------------

/** The miss a partially-resolved prior checkpoint already carries. */
export const PRIOR_MISS: UnresolvedLite = {
  name: "Sword of Feast",
  reason: "ambiguous",
  suggestion: "Sword of Feast and Famine",
};

/** The base checkpoint's text when it was pasted with a name that did not resolve. */
export const PARTIAL_BASE_LIST_TEXT = "4 Forest\n2 Llanowar Elves\nSword of Feast";

/** A prior that already carries one unresolved miss. Fresh objects per call. */
export function partialBaseSnapshot(): StepSnapshot {
  return snapshotOf(
    [
      ["Forest", 4],
      ["Llanowar Elves", 2],
    ],
    [PRIOR_MISS],
  );
}

/** `-1 Forest` applies; `+ Forbidden Orchrd` is a name the catalog does not know. */
export const CARRY_DELTA = "-1 Forest\n+ Forbidden Orchrd";

/** `PARTIAL_BASE ± CARRY_DELTA`, hand-written — the unresolved `+` adds no card. */
export const CARRY_HOLDINGS: Record<string, number> = { Forest: 3, "Llanowar Elves": 2 };

/** The prior's miss verbatim and first, then the new one — the ordering nothing checked before. */
export const CARRY_UNRESOLVED: readonly UnresolvedLite[] = [
  { name: "Sword of Feast", reason: "ambiguous", suggestion: "Sword of Feast and Famine" },
  { name: "Forbidden Orchrd", reason: "not-found", suggestion: null },
];
