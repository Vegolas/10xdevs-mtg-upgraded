/**
 * Derive-to-persist verification (test-plan §3 Phase 3 · risks #4 and #5).
 *
 * Answers exactly one question, with no I/O: **is this submitted snapshot the
 * prior snapshot plus the delta text that claims to have produced it?**
 *
 * It exists because the server never derives. `deriveSnapshot` runs in the browser
 * and the route stores whatever snapshot comes back, so "the checkpoint equals
 * `prior ± delta`" was a client-side promise nothing checked — any structurally
 * valid snapshot was accepted alongside any `deltaText`. This module turns that
 * promise into a server-enforced invariant, and turns an unapplicable `-` line from
 * a warning the UI may discard into a rejection with a name.
 *
 * **Pure by construction.** The only runtime imports are `parseDeltaList` /
 * {@link formatDeltaLine} and {@link resolutionKey}; nothing here touches Astro,
 * Supabase, or the card-data source, and no code path awaits anything — which is
 * what lets a route handler call it inside a request without adding a lookup. (The
 * `@/lib/card-data` barrel does pull the resolver's module graph in transitively,
 * exactly as `./delta` already did before this file existed; the distinction that
 * matters is that no *call* made from here performs I/O.)
 *
 * **Resolution-free, and therefore deliberately asymmetric.** Keys the prior list
 * already holds are fully checkable: their expected copy count is
 * `prior + Σ(+n) − Σ(−n)`, and a prior card with no delta line naming it must come
 * back untouched. A genuinely new `+` line is not: the card-data source
 * canonicalizes names past `resolutionKey`'s reach ("Jace the Mind Sculptor" →
 * "Jace, the Mind Sculptor"), so the server cannot know which key a new `+` line
 * will resolve into without resolving it — which is the one thing a request path
 * must not do. New keys are therefore bounded by **count** only, and proving that a
 * new `+` card carries its listed quantity stays the unit layer's job
 * (`derive.test.ts`). Stated plainly rather than papered over: this verifier makes
 * silent corruption of the *carried-forward* list impossible, and makes corruption
 * of a *newly added* card merely count-bounded.
 *
 * **Holdings, not entries.** Both snapshots are folded to copies-per-key before
 * comparison, so the check inherits the multiset semantics the whole phase asserts
 * (test-plan §6.6): `jsonb` does not preserve array order, and `deriveSnapshot`'s
 * emit order differs from full paste's by design.
 *
 * **Sequential simulation, because derive is order-sensitive.** The delta is
 * replayed line by line against a working copy of the prior holdings, mirroring
 * `deriveSnapshot`'s loop: a `-` that empties a card drops it, and a later `+` for
 * that same card is then a *new* card that goes through the resolver — so it lands
 * in the count-bounded bucket, not the exact-quantity one. Aggregating the delta
 * into net sums instead would reject that legitimate sequence.
 *
 * **The reason set is closed and the first violation wins**, in a fixed order:
 * every `-` line as it is replayed, then the prior's cards in `prior.cards` order,
 * then the new-card count bound, then the `unresolved` prefix. Phase 3 maps each
 * reason to its own 400 body, and Phase 4 pins which rule a given break reports —
 * so a test that wants a specific reason named must break narrowly enough to leave
 * the earlier rules satisfied.
 *
 * **What this does not prove**, on purpose:
 *   - Card *data* on a card the delta names. Prices and images in a snapshot are
 *     client-authored at-save values on every path, including full paste; the
 *     server has never validated them and does not start here.
 *   - The quantity of a new `+` card (above).
 *   - Extra entries appended to `unresolved` past the prior's prefix. They are
 *     informational misses, not holdings, and padding one's own list harms nobody.
 */

import { resolutionKey } from "@/lib/card-data";
import type { Card } from "@/lib/card-data";
import type { DeckCard } from "@/lib/deck";
import { formatDeltaLine, parseDeltaList } from "./delta";
import type { StepSnapshot, UnresolvedLite } from "./types";

/**
 * Which rule a submitted snapshot broke. **Closed set** — Phase 3 maps each member
 * to its own wire message, so adding one is a contract change, not an internal edit.
 */
export type DerivedViolation =
  /** A `-` line for a key the prior list does not hold (risk #5's silent no-op). */
  | "unapplicable-removal"
  /** A prior-held key's copy count is not `prior + adds − removes`. */
  | "quantity-mismatch"
  /** A prior key with no delta line naming it came back altered or dropped. */
  | "untouched-card-changed"
  /** `submitted.unresolved` does not begin with `prior.unresolved`, entry for entry. */
  | "unresolved-prefix"
  /** More keys absent from the prior list than the delta has distinct new `+` keys. */
  | "excess-new-cards";

/** The verdict: accepted, or refused with the rule that broke and the card/line at fault. */
export type DerivedVerdict = { ok: true } | { ok: false; reason: DerivedViolation; detail: string };

/** Copies of one key, summed across entries; the first spelling's card is kept. */
interface Holding {
  card: Card;
  quantity: number;
}

/** Build a rejection — one place, so `detail` is never forgotten. */
function refuse(reason: DerivedViolation, detail: string): DerivedVerdict {
  return { ok: false, reason, detail };
}

/**
 * Field-by-field {@link Card} equality — the "came back untouched" test for a card
 * the delta never named.
 *
 * Explicit rather than structural, matching `parseSnapshot`'s guard, and it carries
 * the same obligation: **a new field on `Card` must be added here too**, or a
 * change to it slips past this check.
 */
function sameCard(left: Card, right: Card): boolean {
  return (
    left.name === right.name &&
    left.typeLine === right.typeLine &&
    left.category === right.category &&
    left.imageUrl === right.imageUrl &&
    left.priceUsd === right.priceUsd &&
    left.priceEur === right.priceEur
  );
}

/** Field-by-field {@link UnresolvedLite} equality — same obligation as {@link sameCard}. */
function sameMiss(left: UnresolvedLite, right: UnresolvedLite): boolean {
  return left.name === right.name && left.reason === right.reason && left.suggestion === right.suggestion;
}

/**
 * Fold a card list into copies per {@link resolutionKey}. Duplicate keys sum (a
 * split submission is compared on holdings, not on array shape) and the first
 * entry's card is the one an identity check compares against.
 */
function holdingsByKey(cards: DeckCard[]): Map<string, Holding> {
  const byKey = new Map<string, Holding>();

  for (const entry of cards) {
    const key = resolutionKey(entry.card.name);
    const seen = byKey.get(key);
    byKey.set(key, { card: seen?.card ?? entry.card, quantity: (seen?.quantity ?? 0) + entry.quantity });
  }

  return byKey;
}

/**
 * Verify that `submitted` is `prior` plus `deltaText`, or name the rule it breaks.
 *
 * Malformed delta lines are **not** violations: `parseDeltaList` buckets them out
 * of `entries` and `deriveSnapshot` treats them as no-ops, so a snapshot that
 * ignored one is correct. Nor is a `-` that clamps a card to zero, a `+` that
 * failed to resolve and landed in `unresolved`, or two delta lines naming one card.
 *
 * With no readable delta lines at all the submitted snapshot must simply equal the
 * prior — which is why a **full-paste** checkpoint must never be routed here. That
 * exclusion lives in the route (`deltaText === null` skips the whole check), not in
 * this function.
 */
export function verifyDerived(prior: StepSnapshot, submitted: StepSnapshot, deltaText: string): DerivedVerdict {
  const { entries } = parseDeltaList(deltaText);

  // Replayed line by line into the expected holdings, exactly as `deriveSnapshot`
  // walks its `working` map (derive.ts's loop) — see the docstring on ordering.
  const expected = holdingsByKey(prior.cards);
  /** Prior keys a delta line named, so their count is checked against the sum, not against identity. */
  const named = new Set<string>();
  /** `+` keys the prior list did not hold when their line ran — these went to the resolver. */
  const resolverBound = new Set<string>();

  for (const entry of entries) {
    const key = resolutionKey(entry.name);
    const held = expected.get(key);

    if (entry.op === "-") {
      if (held === undefined) {
        // Risk #5: the UI's `not-in-prior` warning, promoted from optional preview
        // text to a refusal. The delta claims a removal that never happened.
        return refuse("unapplicable-removal", formatDeltaLine(entry));
      }
      named.add(key);
      const quantity = held.quantity - entry.quantity;
      if (quantity > 0) {
        expected.set(key, { card: held.card, quantity });
      } else {
        expected.delete(key);
      }
      continue;
    }

    if (held === undefined) {
      // Either a genuinely new card or one an earlier `-` emptied: `deriveSnapshot`
      // sends both to the resolver, so the key it comes back under is unknowable here.
      resolverBound.add(key);
      continue;
    }
    named.add(key);
    expected.set(key, { card: held.card, quantity: held.quantity + entry.quantity });
  }

  const holdings = holdingsByKey(submitted.cards);

  // Prior cards in their stored order, so a multi-violation snapshot always reports
  // the same rule (Phase 4 asserts on which one).
  for (const entry of prior.cards) {
    const key = resolutionKey(entry.card.name);
    const want = expected.get(key);
    const got = holdings.get(key);

    if (want === undefined) {
      if (got !== undefined && !resolverBound.has(key)) {
        return refuse(
          "quantity-mismatch",
          `${entry.card.name}: the delta removes every copy, but ${got.quantity} remain`,
        );
      }
      continue;
    }

    if (!named.has(key)) {
      if (got === undefined) {
        return refuse("untouched-card-changed", `${entry.card.name}: dropped, with no delta line naming it`);
      }
      if (got.quantity !== want.quantity) {
        return refuse(
          "untouched-card-changed",
          `${entry.card.name}: ${want.quantity} copies became ${got.quantity}, with no delta line naming it`,
        );
      }
      if (!sameCard(got.card, want.card)) {
        return refuse("untouched-card-changed", `${entry.card.name}: card data changed, with no delta line naming it`);
      }
      continue;
    }

    if (got === undefined) {
      return refuse("quantity-mismatch", `${entry.card.name}: expected ${want.quantity} copies, found none`);
    }
    if (got.quantity !== want.quantity) {
      return refuse("quantity-mismatch", `${entry.card.name}: expected ${want.quantity} copies, found ${got.quantity}`);
    }
  }

  // New keys cannot be matched to the `+` lines that produced them (canonicalization),
  // so they are bounded by count: no more distinct new keys than distinct new `+` keys.
  const newNames = [...holdings.entries()]
    .filter(([key]) => !expected.has(key))
    .map(([, holding]) => holding.card.name);
  if (newNames.length > resolverBound.size) {
    return refuse(
      "excess-new-cards",
      `${newNames.length} cards absent from the previous step (${newNames.join(", ")}) for ${resolverBound.size} added lines`,
    );
  }

  // `deriveSnapshot` carries the prior's misses forward verbatim and appends its own
  // after them (derive.ts's `unresolved` seed). A dropped or reordered prefix means a
  // prior miss was silently lost.
  if (submitted.unresolved.length < prior.unresolved.length) {
    return refuse(
      "unresolved-prefix",
      `the previous step's ${prior.unresolved.length} unresolved entries must lead; found ${submitted.unresolved.length} in total`,
    );
  }
  for (const [index, miss] of prior.unresolved.entries()) {
    const got = submitted.unresolved[index];
    if (!sameMiss(got, miss)) {
      return refuse("unresolved-prefix", `unresolved entry ${index + 1} is "${got.name}", expected "${miss.name}"`);
    }
  }

  return { ok: true };
}
