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
import type { UnresolvedReason } from "@/lib/card-data";
import { parseDeckList } from "./parse";
import type { ParsedDeck } from "./parse";
import { diffDecks } from "./diff";
import type { UpgradePlan } from "./diff";
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

/**
 * The outcome of building an upgrade plan:
 *   - `ok`    — a renderable plan plus any unresolved inputs to flag.
 *   - `empty` — at least one deck has no parsed entries; no lookup was made.
 *   - `error` — the card-data source could not be reached (retryable).
 */
export type PlanOutcome =
  | { status: "ok"; plan: UpgradePlan; unresolved: UnresolvedEntry[] }
  | { status: "empty" }
  | { status: "error"; message: string };

/** Collect a parsed deck's malformed lines as deck-tagged unresolved entries. */
function malformedEntries(parsed: ParsedDeck, deck: DeckSide): UnresolvedEntry[] {
  return parsed.malformed.map((name) => ({ name, reason: "malformed" as const, suggestion: null, deck }));
}

/**
 * Build the upgrade plan from two raw deck-list texts.
 *
 * Parses first and short-circuits to `empty` when either deck has zero entries,
 * so no Scryfall request fires until both sides have real content. Otherwise it
 * resolves the two decks *sequentially* (warms the resolver's in-session cache
 * and stays Scryfall-polite), diffs the resolved cards, and merges each deck's
 * malformed + unresolved inputs. A transient resolver throw becomes `error`.
 */
export async function generateUpgradePlan(baseText: string, targetText: string): Promise<PlanOutcome> {
  const baseParsed = parseDeckList(baseText);
  const targetParsed = parseDeckList(targetText);

  if (baseParsed.entries.length === 0 || targetParsed.entries.length === 0) {
    return { status: "empty" };
  }

  const baseNames = baseParsed.entries.map((entry) => entry.name);
  const targetNames = targetParsed.entries.map((entry) => entry.name);

  try {
    const baseResolution = await resolveCards(baseNames);
    const targetResolution = await resolveCards(targetNames);

    const baseDeck = attachQuantities(baseResolution.resolved, baseParsed.entries);
    const targetDeck = attachQuantities(targetResolution.resolved, targetParsed.entries);
    const plan = diffDecks(baseDeck, targetDeck);

    const unresolved: UnresolvedEntry[] = [
      ...malformedEntries(baseParsed, "base"),
      ...baseResolution.unresolved.map((card) => ({ ...card, deck: "base" as const })),
      ...malformedEntries(targetParsed, "target"),
      ...targetResolution.unresolved.map((card) => ({ ...card, deck: "target" as const })),
    ];

    return { status: "ok", plan, unresolved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach the card database.";
    return { status: "error", message };
  }
}
