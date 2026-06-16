import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SortDirection, SortKey, SortMode } from "./sort";

interface SortControlProps {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}

/** Phrase the direction toggle for the active key (price reads as a range). */
function directionLabel(key: SortKey, direction: SortDirection): string {
  if (key === "price") {
    return direction === "asc" ? "Low → High" : "High → Low";
  }
  return direction === "asc" ? "A → Z" : "Z → A";
}

/** A small segmented toggle button — purple-accented when active. */
function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      className={
        active
          ? "border-purple-400/50 bg-purple-500/20 text-white"
          : "border-white/20 bg-transparent text-blue-100/70 hover:bg-white/10 hover:text-white"
      }
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * The single global sort control: a Grouped ↔ Flat toggle, and — only in flat
 * mode — a Name/Price key picker plus a direction toggle. Purely presentational:
 * it reads `value` and emits a complete {@link SortMode} on every change. The
 * `key`/`direction` are preserved while grouped so toggling back to flat restores
 * the last flat sort. Persistence lives in {@link DeckComparer}, not here.
 */
export function SortControl({ value, onChange }: SortControlProps) {
  const { layout, key, direction } = value;
  const flat = layout === "flat";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-blue-100/60">Sort</span>
      <ToggleButton
        active={!flat}
        onClick={() => {
          onChange({ ...value, layout: "grouped" });
        }}
      >
        Grouped
      </ToggleButton>
      <ToggleButton
        active={flat}
        onClick={() => {
          onChange({ ...value, layout: "flat" });
        }}
      >
        Flat
      </ToggleButton>

      {flat ? (
        <>
          <span className="ml-1 text-blue-100/40">by</span>
          <ToggleButton
            active={key === "name"}
            onClick={() => {
              onChange({ ...value, key: "name" });
            }}
          >
            Name
          </ToggleButton>
          <ToggleButton
            active={key === "price"}
            onClick={() => {
              onChange({ ...value, key: "price" });
            }}
          >
            Price
          </ToggleButton>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Direction: ${directionLabel(key, direction)}`}
            className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
            onClick={() => {
              onChange({ ...value, direction: direction === "asc" ? "desc" : "asc" });
            }}
          >
            {direction === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
            {directionLabel(key, direction)}
          </Button>
        </>
      ) : null}
    </div>
  );
}
