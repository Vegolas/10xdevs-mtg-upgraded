import type { ReactNode } from "react";
import type { SortMode } from "./sort";

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

/**
 * The v3 3-chip sort: `[Grouped | Flat | Price ↓]`. Each chip emits a complete
 * {@link SortMode} — Grouped keeps the retained key/direction, Flat resets to
 * name A→Z, Price ↓ to price high→low. Purely presentational; persistence lives
 * in {@link DeckComparer}.
 */
export function SortControl({ value, onChange }: SortControlProps) {
  const { layout, key } = value;
  const flat = layout === "flat";

  return (
    <div className="text-muted-foreground flex items-center gap-[6px] text-[11px]">
      <span>Sort</span>
      <Chip
        active={!flat}
        onClick={() => {
          onChange({ ...value, layout: "grouped" });
        }}
      >
        Grouped
      </Chip>
      <Chip
        active={flat && key === "name"}
        onClick={() => {
          onChange({ layout: "flat", key: "name", direction: "asc" });
        }}
      >
        Flat
      </Chip>
      <Chip
        active={flat && key === "price"}
        onClick={() => {
          onChange({ layout: "flat", key: "price", direction: "desc" });
        }}
      >
        Price ↓
      </Chip>
    </div>
  );
}
