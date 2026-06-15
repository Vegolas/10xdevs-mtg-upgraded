---
change_id: deck-diff-quantities
title: Quantity-aware deck diff so basic-land count deltas surface
status: implementing
created: 2026-06-15
updated: 2026-06-15
archived_at: null
---

## Notes

Follow-up surfaced during manual testing of **dfc-name-resolution**, whose plan explicitly parked quantity handling as a separate change.

### Problem

The upgrade-plan diff is **quantity-blind**. `diffDecks` (`src/lib/deck/diff.ts`) indexes each deck with a `byName` Map keyed on the canonical card name, and the `Card` type (`src/lib/card-data/types.ts`) carries no quantity field. So a base deck with `8 Mountain` and a target with `6 Mountain` both collapse to a single `Mountain` entry on each side → it lands in **Shared** and the `-2` delta never surfaces. Singleton non-basics are unaffected; this matters mainly for basic lands (and any deck that legitimately runs multiples).

### Goal

Make the diff quantity-aware so a quantity delta produces a visible remove/add (e.g. "remove 2 Mountain"). This threads multiplicity through **parser → resolve → diff → group**:

- The deck-list parser already reads the leading quantity (e.g. `8 Mountain`); confirm where it currently drops it (`resolveCards` dedups by name; `diffDecks` uses a `byName` Map).
- Decide where quantity lives — likely a `{ card, quantity }` entry at the deck layer, **not** on `Card` (which is shared identity data).
- `diffDecks` computes per-name quantity deltas: removals = `max(0, baseQty − targetQty)`, additions = `max(0, targetQty − baseQty)`, shared = `min(baseQty, targetQty)`.
- Update the group count badges (`CardGroupColumn.tsx` / `SharedCardsDisclosure.tsx`) and any totals — decide and document whether counts reflect summed quantities or distinct cards.
- Add `src/lib/deck/diff.test.ts` cases: 8 vs 6 Mountain → remove 2; 4 vs 4 → shared; 0 vs 3 → add 3.

### Scope decision to make first

**Basic-lands-only vs full multiplicity.** Start by reading `src/lib/deck/diff.ts`, `src/lib/card-data/resolve.ts`, the deck-list parser, and `src/lib/card-data/types.ts`.

See [[dfc-name-resolution]] for the parked-follow-up provenance.
