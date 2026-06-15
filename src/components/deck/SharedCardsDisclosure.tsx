import { ChevronDown, ChevronRight } from "lucide-react";
import type { CardGroup } from "@/lib/deck";
import { categoryLabel, groupCopies } from "./labels";

interface SharedCardsDisclosureProps {
  groups: CardGroup[];
  open: boolean;
  onToggle: () => void;
}

/**
 * Collapsed-by-default disclosure for the cards present in both decks. The
 * control shows the total count; expanding reveals the same grouped-by-type
 * layout the Remove/Add columns use.
 */
export function SharedCardsDisclosure({ groups, open, onToggle }: SharedCardsDisclosureProps) {
  const total = groups.reduce((sum, group) => sum + groupCopies(group), 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/5"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Shared cards ({total}) — {open ? "hide" : "show"}
      </button>

      {open ? (
        <div className="grid gap-4 px-4 pt-1 pb-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.category}>
              <h4 className="mb-1 flex items-baseline gap-2 text-xs font-medium tracking-wide text-purple-300 uppercase">
                {categoryLabel(group.category)}
                <span className="text-xs font-normal text-blue-100/50">{groupCopies(group)}</span>
              </h4>
              <ul className="space-y-0.5">
                {group.cards.map((entry) => (
                  <li key={entry.card.name} className="text-sm text-blue-100/80">
                    {entry.quantity > 1 ? `${entry.quantity}× ${entry.card.name}` : entry.card.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
