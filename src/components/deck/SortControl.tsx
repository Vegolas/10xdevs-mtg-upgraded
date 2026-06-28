import type { ReactNode } from "react";
import type { SortDirection, SortKey, SortMode } from "./sort";

interface SortControlProps {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}

/** One sort chip — gold when active, muted `btnD`-style otherwise. */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`font-display rounded-[5px] border px-[9px] py-[5px] text-[10px] tracking-[0.05em] uppercase transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-[#a9863f] font-semibold"
          : "border-border bg-secondary text-secondary-foreground hover:text-foreground font-medium"
      }`}
    >
      {children}
    </button>
  );
}

/** The four ordering choices; each sets the flat list's (or in-group) key+direction. */
const ORDERS: { label: string; key: SortKey; direction: SortDirection }[] = [
  { label: "A→Z", key: "name", direction: "asc" },
  { label: "Z→A", key: "name", direction: "desc" },
  { label: "Price ↑", key: "price", direction: "asc" },
  { label: "Price ↓", key: "price", direction: "desc" },
];

/**
 * The v3 sort row: a standalone `Grouped` toggle (by-type subsections) plus four
 * order chips — `[A→Z | Z→A | Price ↑ | Price ↓]`. Grouped is independent of the
 * order, so it composes with it: Grouped + Price ↓ groups by type and sorts each
 * group price high→low, while toggling Grouped off flattens to one ordered list.
 * Every chip emits a complete {@link SortMode} preserving the other axis. Purely
 * presentational; persistence lives in {@link DeckComparer}.
 */
export function SortControl({ value, onChange }: SortControlProps) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-[6px] text-[11px]">
      <span>Sort</span>
      <Chip
        active={value.layout === "grouped"}
        onClick={() => {
          onChange({ ...value, layout: value.layout === "grouped" ? "flat" : "grouped" });
        }}
      >
        Grouped
      </Chip>
      {ORDERS.map((order) => (
        <Chip
          key={order.label}
          active={value.key === order.key && value.direction === order.direction}
          onClick={() => {
            onChange({ ...value, key: order.key, direction: order.direction });
          }}
        >
          {order.label}
        </Chip>
      ))}
    </div>
  );
}
