import type { CardGroup } from "@/lib/deck";
import { planAddCost } from "@/lib/deck";
import { formatUsd } from "./labels";

interface CostSummaryProps {
  add: CardGroup[];
}

/**
 * The FR-007 headline: an approximate total cost for the cards to add, summing
 * `priceUsd × quantity` over the add partition (roadmap S-03). Coverage gaps are
 * reported honestly — the total sums only the priced additions and a muted suffix
 * counts the ones without price data. When *no* addition is priced the total reads
 * `—`, not `~$0.00`, so an unpriced plan never looks free. A one-line disclaimer
 * keeps the figure framed as indicative (PRD accuracy Guardrail).
 */
export function CostSummary({ add }: CostSummaryProps) {
  const { total, pricedCount, missingCount } = planAddCost(add);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-base font-semibold text-white">
        Total upgrade cost: {pricedCount > 0 ? formatUsd(total) : "—"}
        {missingCount > 0 ? (
          <span className="ml-1 text-sm font-normal text-blue-100/50">
            · {missingCount} {missingCount === 1 ? "card" : "cards"} without price data
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-blue-100/50">
        Approximate prices from Scryfall; actual cost varies by vendor and region.
      </p>
    </div>
  );
}
