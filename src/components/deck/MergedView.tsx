import type { DeckCard, UpgradePlan } from "@/lib/deck";
import { MergedRow, type MergedKind } from "./MergedRow";
import { flattenAndSort } from "./sort";
import type { SortMode } from "./sort";

interface MergedViewProps {
  plan: UpgradePlan;
  sortMode: SortMode;
}

/**
 * The merged ledger: the Remove/Add/(shared "stays") partitions interleaved into
 * one list, ordered by the active sort. Derived purely from the existing
 * {@link UpgradePlan} — no engine recompute. Each card's `kind` is recorded
 * against its (unique) entry object before flattening, so the shared
 * {@link flattenAndSort} can reorder every partition together while the row still
 * knows which side it came from. Honors the same `key`/`direction` as the columns
 * view, so toggling Columns⇄Merged keeps a consistent order.
 */
export function MergedView({ plan, sortMode }: MergedViewProps) {
  const kindOf = new Map<DeckCard, MergedKind>();
  for (const group of plan.remove) {
    for (const entry of group.cards) {
      kindOf.set(entry, "remove");
    }
  }
  for (const group of plan.add) {
    for (const entry of group.cards) {
      kindOf.set(entry, "add");
    }
  }
  for (const group of plan.shared) {
    for (const entry of group.cards) {
      kindOf.set(entry, "stay");
    }
  }

  const allGroups = [...plan.remove, ...plan.add, ...plan.shared];
  const ordered = flattenAndSort(allGroups, sortMode.key, sortMode.direction);

  return (
    <ul className="border-border overflow-hidden rounded-md border bg-[#120e0a]">
      {ordered.map((entry) => {
        const kind = kindOf.get(entry) ?? "stay";
        return <MergedRow key={`${kind}:${entry.card.name}`} entry={entry} kind={kind} />;
      })}
    </ul>
  );
}
