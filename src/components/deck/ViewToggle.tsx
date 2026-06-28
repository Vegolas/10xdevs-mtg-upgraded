export type ViewMode = "columns" | "merged";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

const OPTIONS: { key: ViewMode; label: string }[] = [
  { key: "columns", label: "▥ Columns" },
  { key: "merged", label: "≡ Merged" },
];

/**
 * The `[Columns | Merged]` segmented control for the result region — a
 * presentational toggle (active = gold) mirroring the sort chips. State lives in
 * {@link DeckComparer}; this only reads `value` and emits the next mode.
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="border-border inline-flex overflow-hidden rounded-md border bg-[#19140d]">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => {
            onChange(option.key);
          }}
          className={`font-display px-[14px] py-[7px] text-[11px] tracking-[0.06em] uppercase transition-colors ${
            value === option.key
              ? "bg-primary text-primary-foreground font-bold"
              : "text-secondary-foreground hover:text-foreground font-medium"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
