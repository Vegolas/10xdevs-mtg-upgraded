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
    <div className="border-accent/60 rounded-md border bg-gradient-to-b from-[#221c12] to-[#1a150e] p-4">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.5px] uppercase">Total upgrade cost</p>
      <p className="font-display text-foreground text-2xl font-bold">
        {pricedCount > 0 ? formatUsd(total) : "—"}
        {missingCount > 0 ? (
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            · {missingCount} {missingCount === 1 ? "card" : "cards"} without price data
          </span>
        ) : null}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Approximate prices from Scryfall; actual cost varies by vendor and region.
      </p>
    </div>
  );
}
