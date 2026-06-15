# Grouped Upgrade Plan (types only) — Plan Brief

> Full plan: `context/changes/grouped-upgrade-plan/plan.md`

## What & Why

DeckDelta's north star (roadmap **S-01**): paste a base deck list and a target deck list as plain MTG text and automatically get an **upgrade plan** — cards to remove, cards to add, and shared cards, each grouped by card type. This proves the product's core bet that grouping-by-function beats a raw diff. It's the smallest end-to-end slice that delivers user-visible value on top of F-01's card-data resolver.

## Starting Point

F-01 (`card-data-resolution`) is implemented and exposes `resolveCards(names) → { resolved: Card[], unresolved: UnresolvedCard[] }` from `@/lib/card-data`, where each `Card` already carries a `category`. The app is Astro-on-Cloudflare with an established React-island pattern (`.astro` mounts `.tsx` via `client:load`) and a node-env Vitest setup. The home page is still the starter `Welcome.astro`. There is no deck parser, diff, or comparison UI yet.

## Desired End State

Visiting `/` shows the tool: two text areas that, ~0.7s after editing stops, auto-build a two-column **Remove | Add** view grouped by card type, with a collapsed **Shared cards** disclosure, an inline loading indicator, a notice listing unrecognized cards (with "did you mean" suggestions) while the rest of the plan still renders, and a retry-able banner if the card database can't be reached.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Page placement | Replace the home page | The north-star feature is the front door; retire the placeholder starter | Plan |
| Diff semantics | Set difference by card identity (no quantities) | Matches the PRD's "set difference" language and sidesteps the canonical-name↔quantity join gap | Plan |
| Parser scope | Common core (`N`/`Nx`/plain, skip comments/headers) | Covers dominant Moxfield/Archidekt/plain-text exports without Arena/MTGO regex sprawl | Plan |
| Auto-compute | Debounced ~700ms after edits settle | Honors "automatic, no button" without hammering Scryfall per keystroke | Plan |
| Loading UX | Inline indicator, inputs stay editable, ignore stale | Simple, non-blocking, correct under rapid re-edits | Plan |
| Unresolved UX | Notice above plan; plan still renders (partial success) | Realizes F-01's design + the "no silent omission" Guardrail | Plan |
| Shared cards | Collapsed disclosure with count | Implements FR-008 so unchanged cards don't bury the diff | Plan |
| Layout | Two columns (Remove \| Add), typed subsections, fixed order | The classic before/after upgrade mental model | Plan |
| Network failure | Catch → retry-able error banner | Gracefully handles the one path the resolver throws on | Plan |
| Testing | Unit-test parser + diff/grouping only (orchestrator manual) | Highest-value coverage of the bug-prone pure logic; keeps heavy Phase 2 manageable; no jsdom in repo | Plan |

## Scope

**In scope:** deck-list parser, pure diff/grouping engine over resolved cards, async orchestrator (`generateUpgradePlan`), React island on the home page (debounced auto-compute, loading/unresolved/error/shared UX), unit tests, contract-surfaces registry update.

**Out of scope:** images (S-02), prices/totals (S-03), history (S-04), Arena/MTGO suffix stripping, quantity-aware diff, component/jsdom tests, any change to the F-01 card-data module.

## Architecture / Approach

Bottom-up client-side pipeline. `src/lib/deck/parse.ts` (`text → {name, quantity}[]`) → `src/lib/deck/diff.ts` (resolved `Card[] × Card[] → grouped UpgradePlan`, keyed on canonical `Card.name`) → `src/lib/deck/plan.ts` orchestrator (`parse → resolveCards → diff`, returns a typed `ok`/`empty`/`error` outcome). The `DeckComparer.tsx` island owns debounce, a stale-response request-token guard, and view state, calling the orchestrator and rendering thin presentational children.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Deck-list parser | `parseDeckList` + tests | Format tolerance across paste variants (the roadmap's flagged unknown) |
| 2. Diff, grouping & orchestration | `diffDecks` + `generateUpgradePlan` + diff tests, registry update | Canonical-name join correctness; throw-handling in the orchestrator (verified manually) |
| 3. UI: home page + island | `DeckComparer` + children, home rewrite, starter cleanup | Debounce/stale-guard correctness; loading/error/unresolved UX |

**Prerequisites:** F-01 implemented (done). No new dependencies.
**Estimated effort:** ~2–3 focused after-hours sessions across 3 phases.

## Open Risks & Assumptions

- Common-core parser won't strip Arena/MTGO `(SET) collector` suffixes — such lines surface as unresolved cards by design (accepted for MVP).
- Diff-by-identity treats a copy-count change (1→4) as "shared", not a partial add — accepted; quantity-aware diff is deferred.
- `resolveCards` returns canonical names (DFCs differ from input), so the diff runs over resolved cards, not raw strings — the central implementation invariant.
- The resolver throttles, so a fresh full deck takes a few seconds; covered by the inline indicator and F-01's in-session cache.

## Success Criteria (Summary)

- Pasting two lists auto-produces a correct add/remove/shared plan grouped by card type, with shared cards collapsed by default.
- Unrecognized cards are clearly surfaced (with suggestions) without hiding the rest of the plan; a lookup failure is recoverable via retry.
- `npm run test`, `astro check`, `npm run lint`, and `npm run build` all pass.
