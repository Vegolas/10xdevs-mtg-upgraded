# Prices and Total Upgrade Cost (S-03) — Plan Brief

> Full plan: `context/changes/upgrade-cost-and-prices/plan.md`

## What & Why

Add money to the upgrade plan: an approximate **per-card USD price** on every card row (FR-006) and an **approximate total upgrade cost** for the cards to add (FR-007). This is the third enricher over S-01's grouped plan and completes the PRD's primary success criterion ("…with card images and approximate prices, plus the total upgrade cost"). Prices the swaps so a player can prioritize purchases.

## Starting Point

S-01 ships the grouped plan and S-02 added images, both rendered through a shared `CardRow`. F-01 already resolves `Card.priceUsd` (and `priceEur`), and the `deck-diff-quantities` change made the diff quantity-aware — so `UpgradePlan.add` carries copy-deltas. The price data is fully present and flowing to the render layer untouched; nothing displays it yet.

## Desired End State

Every Remove/Add/Shared row shows `~$X.XX` (or `—` when no price resolved). Atop the results, a cost summary reads **Total upgrade cost: ~$X**, summing `price × copies` over the additions, noting how many add-cards had no price, with a one-line "approximate, varies by vendor/region" disclaimer. No additions priced → total reads `—` (not `$0.00`); identical lists → no summary.

## Key Decisions Made

| Decision                    | Choice                                            | Why (1 sentence)                                                              | Source |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| What the total sums         | Additions only, quantity-weighted (`price × qty`) | PRD §Business Logic: "the sum of addition prices"; diff carries copy-deltas.   | Plan (PRD) |
| Currency                    | USD only                                          | Broadest Scryfall coverage and simplest; `priceEur` stays unused.             | Plan   |
| Missing prices              | Show `—`, sum the rest, count the gap             | Graceful degradation (roadmap risk); an honest, partial total.                | Plan   |
| No-price total              | Show `—`, not `~$0.00`                             | A zero total on unpriced cards reads as "free" and fights the accuracy Guardrail. | Plan |
| Total placement             | Summary banner atop the results                   | The total is the slice's payoff (FR-007) — seen first.                        | Plan   |
| Per-card price scope        | Every row; row shows **unit** price               | FR-006 says "each card"; unit price avoids being misread as a line total.     | Plan   |
| Approximate framing         | `~` prefix + one disclaimer line                  | PRD stresses prices are indicative (EU/US, vendor variance).                  | Plan   |

## Scope

**In scope:** `formatUsd` helper (tested); `planAddCost` aggregator (tested); per-card price in `CardRow`; a `CostSummary` banner in `DeckComparer`; contract-surface registration.

**Out of scope:** EUR display / currency toggle; net-cost or removal-value math; per-line `price × qty` on rows; price caching/refresh/staleness; any card-data, diff, or state-model change; component/jsdom test harness.

## Architecture / Approach

Pure functions first, then read-only rendering — the S-02 template. `formatUsd(value)` (in `labels.ts`) and `planAddCost(add): { total, pricedCount, missingCount }` (new `lib/deck/cost.ts`) carry the only real logic and are unit-tested in the node Vitest env. `CardRow` prints `formatUsd(card.priceUsd)` (appears in all three sections via the shared row); a new `CostSummary` renders the headline from `planAddCost`, mounted as the first child of `DeckComparer`'s ready view when there are additions. No new network calls; prices come from F-01's already-completed resolution.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Per-card prices + total cost (FR-006, FR-007) | `~$X.XX` on every row + a `CostSummary` total banner, both off `priceUsd` via two tested helpers | Low — missing-price degradation must read honestly (`—`, not `$0.00`) and the total must weight by quantity |

**Prerequisites:** S-01 (done) and F-01 (done); `Card.priceUsd` resolved and quantity-aware diff in place — both present.
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- **Scryfall USD price coverage varies** — some cards return `null`; handled by `—` + the "N without price data" note, so the total is honestly partial rather than wrong. (This was the roadmap's one open S-03 question; the degradation design resolves it.)
- Prices are point-in-time from the session's resolution; the approximate framing covers volatility (no refresh by design).

## Success Criteria (Summary)

- A USD price shows on every card in the plan; unresolved-price cards show `—`, never blank or broken.
- A total upgrade cost appears atop the results, equals the additions' `price × copies`, and degrades gracefully (sums the known, counts the unknown; `—` when none priced).
- Prices read as approximate (tilde + disclaimer); no regressions to images, grouping, shared disclosure, or error/retry behavior.
