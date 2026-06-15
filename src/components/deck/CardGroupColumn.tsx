import type { CardGroup } from "@/lib/deck";
import { categoryLabel, groupCopies } from "./labels";
import { CardRow } from "./CardRow";

interface CardGroupColumnProps {
  title: string;
  groups: CardGroup[];
}

/**
 * One side of the upgrade plan (Remove or Add): a labeled column with one
 * subsection per card-type group, or a muted "No changes" line when empty.
 */
export function CardGroupColumn({ title, groups }: CardGroupColumnProps) {
  const total = groups.reduce((sum, group) => sum + groupCopies(group), 0);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold tracking-wide text-white uppercase">
        {title}
        <span className="text-xs font-normal text-blue-100/50">{total}</span>
      </h3>

      {groups.length === 0 ? (
        <p className="text-sm text-blue-100/40">No changes</p>
      ) : (
        <div className="space-y-4">
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
      )}
    </section>
  );
}
