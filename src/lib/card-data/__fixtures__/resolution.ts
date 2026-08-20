/**
 * `ResolutionResult` builders for tests that mock `resolveCards`
 * (testing-derive-to-persist Phase 1).
 *
 * `matched` is a required field, and a hand-written literal that omits it does not
 * merely fail to compile — the interesting cases are the ones where a *wrong*
 * `matched` would quietly send the join down its fallback path and make a test pass
 * for the wrong reason. So mocks build their result here instead of inline.
 *
 * {@link resolutionOf} is the ordinary case: every card was found under the name it
 * was asked for, so each card is paired with its own key. {@link canonicalizedTo}
 * is the case that motivated the map — the source answering a typed name with a
 * differently-keyed canonical one. {@link unattributed} is the degrade path: cards
 * the resolver returned but declined to attribute to any input.
 *
 * Test-only. Nothing in `src/` outside a `*.test.ts` may import this.
 */

import { resolutionKey } from "../resolve";
import type { Card, ResolutionResult, UnresolvedCard } from "../types";

/**
 * A resolution where each card was found under its own name — the common shape.
 * Every card is paired with `resolutionKey(card.name)`, exactly as a cache hit or
 * a direct match would be.
 */
export function resolutionOf(resolved: Card[], unresolved: UnresolvedCard[] = []): ResolutionResult {
  return {
    resolved,
    unresolved,
    matched: new Map(resolved.map((card) => [resolutionKey(card.name), card])),
  };
}

/**
 * A resolution where the source canonicalized a typed name past `resolutionKey`'s
 * reach: `pairs` maps the name the caller typed to the card that came back under a
 * different key. Additional `resolved` cards pair with themselves as usual.
 */
export function canonicalizedTo(pairs: [typed: string, card: Card][], alsoResolved: Card[] = []): ResolutionResult {
  const base = resolutionOf(alsoResolved);
  const matched = new Map(base.matched);
  for (const [typed, card] of pairs) {
    matched.set(resolutionKey(typed), card);
  }
  return {
    resolved: [...pairs.map(([, card]) => card), ...alsoResolved],
    unresolved: [],
    matched,
  };
}

/**
 * A resolution that returns cards but attributes none of them — the shape
 * `pairBatch` produces when two or more residual cards make the association
 * ambiguous. Callers must fall back to their pre-`matched` rule.
 */
export function unattributed(resolved: Card[], unresolved: UnresolvedCard[] = []): ResolutionResult {
  return { resolved, unresolved, matched: new Map() };
}
