import { ChevronDown, ChevronRight } from "lucide-react";
import type { CardGroup } from "@/lib/deck";
import { categoryLabel, groupCopies } from "./labels";
import { CardRow } from "./CardRow";
import { flattenAndSort } from "./sort";
import type { SortMode } from "./sort";

interface SharedCardsDisclosureProps {
  groups: CardGroup[];
  sortMode: SortMode;
  open: boolean;
  onToggle: () => void;
}

/**
 * Collapsed-by-default disclosure for the cards present in both decks. The
 * control shows the total count; expanding reveals the grouped-by-type layout the
 * Remove/Add columns use, or — in flat mode — one list reordered by the active
 * sort. The collapsed control and total are unaffected by the sort.
 */
export function SharedCardsDisclosure({ groups, sortMode, open, onToggle }: SharedCardsDisclosureProps) {
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
        sortMode.layout === "flat" ? (
          <ul className="space-y-1 px-4 pt-1 pb-4">
            {flattenAndSort(groups, sortMode.key, sortMode.direction).map((entry) => (
              <CardRow key={entry.card.name} entry={entry} />
            ))}
          </ul>
        ) : (
          <div className="grid gap-4 px-4 pt-1 pb-4 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.category}>
                <h4 className="mb-1 flex items-baseline gap-2 text-xs font-medium tracking-wide text-purple-300 uppercase">
                  {categoryLabel(group.category)}
                  <span className="text-xs font-normal text-blue-100/50">{groupCopies(group)}</span>
                </h4>
                <ul className="space-y-1">
                  {group.cards.map((entry) => (
                    <CardRow key={entry.card.name} entry={entry} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
