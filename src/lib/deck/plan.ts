/**
 * Upgrade-plan orchestration (roadmap S-01).
 *
 * The single async entry point the UI calls: parse both deck texts, resolve both
 * decks against the card-data source, diff the resolved cards, and merge every
 * input that did not become a real card (parser-level malformed lines + the
 * resolver's unresolved misses) into one deck-tagged list.
 *
 * The resolver throws only on a transient transport failure (network / non-2xx);
 * unknown *names* never throw — they return in `unresolved`. So the only failure
 * this function surfaces as `error` is that transient path; everything else is a
 * partial-but-renderable success. See
 * context/changes/grouped-upgrade-plan/plan.md.
 */

import { resolveCards } from "@/lib/card-data";
import type { UnresolvedCard, UnresolvedReason } from "@/lib/card-data";
import { parseDeckList } from "./parse";
import { diffDecks } from "./diff";
import type { DeckCard, UpgradePlan } from "./diff";
import { attachQuantities } from "./quantity";

/** Which side of the comparison an input name came from. */
export type DeckSide = "base" | "target";

/** An input that did not resolve to a card, tagged with the deck it came from. */
export interface UnresolvedEntry {
  name: string;
  reason: UnresolvedReason;
  suggestion: string | null;
  deck: DeckSide;
}

/** A single deck's resolution: its quantity-tagged cards plus every input that did not become a card. */
export interface ResolvedDeck {
  deck: DeckCard[];
  unresolved: UnresolvedCard[];
}

/**
 * The outcome of building an upgrade plan:
 *   - `ok`    — a renderable plan plus any unresolved inputs to flag.
 *   - `empty` — at least one deck has no parsed entries; no lookup was made.
 *   - `error` — the card-data source could not be reached (retryable).
 *
 * `empty` carries `sides` because there are two boxes and an unattributed "no
 * cards" message is barely better than the silence it replaces: the user cannot
 * tell which paste was the problem. Always in base-then-target order, so a
 * consumer can render it without sorting.
 */
export type PlanOutcome =
  | { status: "ok"; plan: UpgradePlan; unresolved: UnresolvedEntry[] }
  | { status: "empty"; sides: DeckSide[] }
  | { status: "error"; message: string };

/**
 * Resolve one raw deck-list text into quantity-tagged cards plus its unresolved inputs.
 *
 * Parses the text, resolves the entry names against the card-data source, and
 * attaches the parsed quantities. The returned `unresolved` merges the parser's
 * malformed lines (first) with the resolver's misses (second), each as an
 * untagged {@link UnresolvedCard}; callers that compare two decks tag these with
 * a {@link DeckSide}. The resolver throws only on a transient transport failure,
 * which propagates to the caller — unknown names never throw.
 */
export async function resolveDeck(text: string): Promise<ResolvedDeck> {
  const parsed = parseDeckList(text);
  const names = parsed.entries.map((entry) => entry.name);

  const resolution = await resolveCards(names);
  const deck = attachQuantities(resolution, parsed.entries);

  const unresolved: UnresolvedCard[] = [
    ...parsed.malformed.map((name) => ({ name, reason: "malformed" as const, suggestion: null })),
    ...resolution.unresolved,
  ];

  return { deck, unresolved };
}

/**
 * Build the upgrade plan from two raw deck-list texts.
 *
 * Parses first and short-circuits to `empty` when either deck has zero entries,
 * so no Scryfall request fires until both sides have real content. Otherwise it
 * resolves the two decks *sequentially* (warms the resolver's in-session cache
 * and stays Scryfall-polite), diffs the resolved cards, and merges each deck's
 * malformed + unresolved inputs, tagging each with its {@link DeckSide}. A
 * transient resolver throw becomes `error`.
 *
 * Zero entries is NOT the same as empty text: comments, section headers and
 * blank lines all parse away to nothing (F-6), so this branch is the one that
 * fires for a box the user has visibly filled. Both sides are collected rather
 * than short-circuiting on the first, because naming only one of two offending
 * boxes sends the user back for a second round trip.
 */
export async function generateUpgradePlan(baseText: string, targetText: string): Promise<PlanOutcome> {
  const baseParsed = parseDeckList(baseText);
  const targetParsed = parseDeckList(targetText);

  const emptySides: DeckSide[] = [];
  if (baseParsed.entries.length === 0) {
    emptySides.push("base");
  }
  if (targetParsed.entries.length === 0) {
    emptySides.push("target");
  }
  if (emptySides.length > 0) {
    return { status: "empty", sides: emptySides };
  }

  try {
    const base = await resolveDeck(baseText);
    const target = await resolveDeck(targetText);

    const plan = diffDecks(base.deck, target.deck);

    const unresolved: UnresolvedEntry[] = [
      ...base.unresolved.map((card) => ({ ...card, deck: "base" as const })),
      ...target.unresolved.map((card) => ({ ...card, deck: "target" as const })),
    ];

    return { status: "ok", plan, unresolved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach the card database.";
    return { status: "error", message };
  }
}
