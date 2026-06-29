/**
 * Diff-mode snapshot derivation (diff-style-checkpoint-entry).
 *
 * Apply a parsed `+`/`-` delta to the prior checkpoint's frozen, resolved cards
 * and produce a new {@link StepSnapshot} that is exactly `prior ± delta` —
 * byte-equivalent to the snapshot the same list entered via full paste would
 * build. Only genuinely new `+` cards (absent from the prior list) hit the
 * card-data source; existing cards are re-quantified from the frozen snapshot, so
 * a derive is as cheap as the number of new cards.
 *
 * Identity is {@link resolutionKey} everywhere — the same front-face, lowercased
 * key the resolver and deck layer join on — so DFC spellings and casing collapse
 * consistently with the rest of the app.
 *
 * Two clean separations of concern:
 *   - A `+` card that fails to resolve is a real missing card → it lands in
 *     `snapshot.unresolved`, exactly like full paste.
 *   - A `-` card not in the prior list, or a malformed line, is a no-op → it is
 *     surfaced as a preview-only {@link DeltaWarning}, never written into the
 *     snapshot.
 *
 * `prior.unresolved` is carried forward verbatim so a diff on a partially-resolved
 * checkpoint never silently drops its prior misses. See
 * context/changes/diff-style-checkpoint-entry/plan.md.
 */

import { resolveCards, resolutionKey } from "@/lib/card-data";
import type { DeckCard } from "@/lib/deck";
import type { StepSnapshot, UnresolvedLite } from "./types";
import { parseDeltaList } from "./delta";
import type { DeltaEntry } from "./delta";

/** A delta line that could not be applied — surfaced in the preview, never persisted. */
export interface DeltaWarning {
  /** The offending line, reconstructed for display. */
  line: string;
  /** `not-in-prior`: a `-` for a card the prior list doesn't hold. `malformed`: an unreadable line. */
  reason: "not-in-prior" | "malformed";
}

/** Headline counts for the derive preview ("+N added, −M removed, K unchanged → T cards"). */
export interface DeriveSummary {
  /** Net copies added relative to the prior list. */
  added: number;
  /** Net copies removed relative to the prior list. */
  removed: number;
  /** Copies present in both the prior and derived lists. */
  unchanged: number;
  /** Total copies in the derived list. */
  total: number;
}

/** The outcome of a derive: the new snapshot plus preview metadata. */
export interface DeriveResult {
  snapshot: StepSnapshot;
  warnings: DeltaWarning[];
  summary: DeriveSummary;
}

/** Reconstruct a delta line for a warning, e.g. `- Sol Ring`, `+2 Island`. */
function formatDeltaLine(entry: DeltaEntry): string {
  const count = entry.quantity > 1 ? `${entry.quantity} ` : " ";
  return `${entry.op}${count}${entry.name}`;
}

/** Sum copies per {@link resolutionKey} across a deck (defensive: prior is already unique). */
function quantitiesByKey(cards: DeckCard[]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const { card, quantity } of cards) {
    const key = resolutionKey(card.name);
    byKey.set(key, (byKey.get(key) ?? 0) + quantity);
  }
  return byKey;
}

/** Diff prior vs derived copy-counts into the headline {@link DeriveSummary}. */
function summarize(prior: DeckCard[], next: DeckCard[]): DeriveSummary {
  const priorQty = quantitiesByKey(prior);
  const nextQty = quantitiesByKey(next);

  let added = 0;
  let removed = 0;
  let unchanged = 0;
  let total = 0;
  for (const key of new Set([...priorQty.keys(), ...nextQty.keys()])) {
    const before = priorQty.get(key) ?? 0;
    const after = nextQty.get(key) ?? 0;
    unchanged += Math.min(before, after);
    added += Math.max(0, after - before);
    removed += Math.max(0, before - after);
    total += after;
  }

  return { added, removed, unchanged, total };
}

/**
 * Derive a new {@link StepSnapshot} from the prior snapshot plus diff-mode text.
 *
 * `-` entries subtract from the prior copy count and drop the card at ≤0; a `-`
 * for an absent card becomes a `not-in-prior` warning. `+` entries for cards
 * already in the list bump their quantity; `+` entries for new cards are resolved
 * once against the card-data source, added at their listed quantity, and any that
 * fail to resolve land in `snapshot.unresolved`. Malformed lines become
 * `malformed` warnings. `prior.unresolved` is carried forward verbatim. The
 * resolver throws only on a transient transport failure, which propagates.
 */
export async function deriveSnapshot(prior: StepSnapshot, deltaText: string): Promise<DeriveResult> {
  const { entries, malformed } = parseDeltaList(deltaText);

  // Working set, keyed by resolutionKey, seeded from the frozen prior cards.
  const working = new Map<string, DeckCard>();
  for (const entry of prior.cards) {
    working.set(resolutionKey(entry.card.name), entry);
  }

  const warnings: DeltaWarning[] = [];
  // New `+` cards (absent from the prior list), summed per key for one resolve pass.
  const newByKey = new Map<string, { name: string; quantity: number }>();

  for (const entry of entries) {
    const key = resolutionKey(entry.name);
    if (entry.op === "-") {
      const existing = working.get(key);
      if (!existing) {
        warnings.push({ line: formatDeltaLine(entry), reason: "not-in-prior" });
        continue;
      }
      const quantity = existing.quantity - entry.quantity;
      if (quantity > 0) {
        working.set(key, { card: existing.card, quantity });
      } else {
        working.delete(key);
      }
      continue;
    }

    // op === "+"
    const existing = working.get(key);
    if (existing) {
      working.set(key, { card: existing.card, quantity: existing.quantity + entry.quantity });
      continue;
    }
    const pending = newByKey.get(key);
    newByKey.set(key, { name: entry.name, quantity: (pending?.quantity ?? 0) + entry.quantity });
  }

  // Carry prior misses forward; new `+` resolve-failures append after them.
  const unresolved: UnresolvedLite[] = [...prior.unresolved];

  if (newByKey.size > 0) {
    const resolution = await resolveCards([...newByKey.values()].map((pending) => pending.name));
    for (const card of resolution.resolved) {
      const key = resolutionKey(card.name);
      working.set(key, { card, quantity: newByKey.get(key)?.quantity ?? 1 });
    }
    for (const miss of resolution.unresolved) {
      unresolved.push({ name: miss.name, reason: miss.reason, suggestion: miss.suggestion });
    }
  }

  for (const line of malformed) {
    warnings.push({ line, reason: "malformed" });
  }

  const cards = [...working.values()];
  return {
    snapshot: { cards, unresolved },
    warnings,
    summary: summarize(prior.cards, cards),
  };
}
