import type { CardGroup } from "@/lib/deck";
import { categoryLabel, groupCopies } from "./labels";
import { CardRow } from "./CardRow";
import { flattenAndSort, sortCards } from "./sort";
import type { SortMode } from "./sort";

interface CardGroupColumnProps {
  title: string;
  groups: CardGroup[];
  sortMode: SortMode;
}

/** Header skin per side: red Remove (− glyph) vs green Add (+ glyph). */
const TONES = {
  remove: { glyph: "−", header: "bg-[#2a1714] border-b border-[#45211d]", text: "text-destructive" },
  add: { glyph: "+", header: "bg-[#1c2616] border-b border-[#34471f]", text: "text-add" },
} as const;

/**
 * One side of the upgrade plan (Remove or Add): a v3 dark panel with a
 * color-coded header (sign glyph + title + total) and one subsection per
 * card-type group, or a muted "No changes" line when empty. In flat mode the
 * per-type subsections collapse into one list reordered by the active sort; the
 * title and total are unchanged either way. The `tone` is derived from `title`.
 */
export function CardGroupColumn({ title, groups, sortMode }: CardGroupColumnProps) {
  const total = groups.reduce((sum, group) => sum + groupCopies(group), 0);
  const tone = title.toLowerCase() === "remove" ? TONES.remove : TONES.add;

  return (
    <section className="border-border overflow-hidden rounded-md border bg-[#120e0a]">
      <div className={`flex items-center justify-between px-3 py-[9px] ${tone.header}`}>
        <h3
          className={`font-display flex items-baseline gap-2 text-[12px] font-bold tracking-[0.06em] uppercase ${tone.text}`}
        >
          <span aria-hidden="true">{tone.glyph}</span> {title}
        </h3>
        <span className="text-muted-foreground text-[11px]">{total}</span>
      </div>

      <div className="p-3">
        {groups.length === 0 ? (
          <p className="text-muted-foreground/70 text-[12px]">No changes</p>
        ) : sortMode.layout === "flat" ? (
          <ul className="space-y-2">
            {flattenAndSort(groups, sortMode.key, sortMode.direction).map((entry) => (
              <CardRow key={entry.card.name} entry={entry} />
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.category}>
                <h4 className="font-display text-accent mb-2 flex items-baseline gap-2 text-[11px] font-semibold tracking-[0.05em] uppercase">
                  {categoryLabel(group.category)}
                  <span className="text-muted-foreground text-[11px] font-normal">{groupCopies(group)}</span>
                </h4>
                <ul className="space-y-2">
                  {sortCards(group.cards, sortMode.key, sortMode.direction).map((entry) => (
                    <CardRow key={entry.card.name} entry={entry} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
