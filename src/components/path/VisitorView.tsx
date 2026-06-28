import { diffDecks } from "@/lib/deck";
import type { UpgradePlan } from "@/lib/deck";
import { overallPathSummary } from "@/lib/path";
import type { PathStep, UpgradePath } from "@/lib/path";
import { CardGroupColumn } from "@/components/deck/CardGroupColumn";
import { formatUsd } from "@/components/deck/labels";
import { DEFAULT_SORT_MODE } from "@/components/deck/sort";
import { NotchButton } from "@/components/ui/NotchButton";
import { formatSavedDate } from "@/components/path/metadata";

interface VisitorViewProps {
  path: UpgradePath;
  steps: PathStep[];
}

/** An empty plan stand-in for a path with no start→end pair to compare. */
const EMPTY_PLAN: UpgradePlan = { remove: [], add: [], shared: [] };

/** The brand mark, inlined for the React tree (mirrors `Logo.astro`). */
function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="flex-none" aria-hidden="true">
      <path d="M46 12 A38 38 0 0 1 46 88 Z" fill="#4f9e3f" />
      <g stroke="#c9a35c" strokeWidth="2.2">
        <rect x="-7" y="-22" width="14" height="44" rx="3" fill="#221c12" transform="translate(34,80) rotate(-32)" />
        <rect x="-7" y="-23" width="14" height="46" rx="3" fill="#2c2417" transform="translate(37,80) rotate(-18)" />
        <rect x="-7" y="-24" width="14" height="48" rx="3" fill="#352b1a" transform="translate(40,80) rotate(-5)" />
      </g>
      <path d="M38 70 L60 44" stroke="#0c0a07" strokeWidth="11" strokeLinecap="round" />
      <path d="M38 70 L60 44" stroke="#f3ead2" strokeWidth="7" strokeLinecap="round" />
      <path d="M73 29 L55 31 L67 46 Z" fill="#f3ead2" stroke="#0c0a07" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The v3 "shared link" visitor screen (Screen 4) — **static chrome only**, no
 * public route and no backing endpoint. It reproduces a read-only base→final
 * comparison (the path's first step diffed against its last) framed by a top
 * "shared · read-only" bar and a right fork rail (cost box, remove/add stat
 * tiles, green Fork CTA, Export). Mounted solely behind the owner detail page's
 * `?preview=visitor` host so the design is reviewable; nothing links to it and the
 * Fork/Export/Sign-in affordances carry no behavior.
 */
export default function VisitorView({ path, steps }: VisitorViewProps) {
  const summary = overallPathSummary(steps.map((step) => step.snapshot));
  const plan =
    steps.length > 1 ? diffDecks(steps[0].snapshot.cards, steps[steps.length - 1].snapshot.cards) : EMPTY_PLAN;
  const cost = summary.cost.pricedCount > 0 ? formatUsd(summary.cost.total) : "—";

  return (
    <div className="border-border bg-card overflow-hidden rounded-md border">
      {/* Top bar: brand + read-only badge + inert Sign in */}
      <div className="border-border bg-secondary flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-[9px]">
          <Mark />
          <span className="font-display text-[16px] font-bold tracking-[0.4px]">
            <span className="text-foreground">deck</span>
            <span className="text-brand"> delta</span>
          </span>
          <span className="text-muted-foreground border-border ml-1 rounded-full border px-2 py-0.5 text-[11px]">
            shared · read-only
          </span>
        </div>
        <span
          className="font-display border-border bg-secondary text-secondary-foreground cursor-default rounded-[5px] border px-3 py-1.5 text-[11px] tracking-[0.05em] uppercase"
          aria-disabled="true"
        >
          Sign in
        </span>
      </div>

      <div className="flex flex-col sm:flex-row">
        {/* Read-only comparison */}
        <div className="border-border flex-1 space-y-3 p-5 sm:border-r">
          <h1 className="font-display text-foreground text-xl font-semibold">{path.title}</h1>
          <p className="font-body text-muted-foreground text-[11px] italic">
            shared by <span className="text-secondary-foreground font-semibold">{path.ownerId.slice(0, 8)}</span> ·{" "}
            {formatSavedDate(path.updatedAt)}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CardGroupColumn title="Remove" groups={plan.remove} sortMode={DEFAULT_SORT_MODE} />
            <CardGroupColumn title="Add" groups={plan.add} sortMode={DEFAULT_SORT_MODE} />
          </div>
        </div>

        {/* Fork rail */}
        <div className="bg-secondary flex w-full flex-none flex-col gap-4 p-5 sm:w-[230px]">
          <div className="border-accent/60 rounded-md border bg-gradient-to-b from-[#221c12] to-[#1a150e] p-3">
            <div className="text-muted-foreground text-[10px] tracking-[0.5px] uppercase">Upgrade cost</div>
            <div className="font-display text-foreground text-2xl font-bold">{cost}</div>
          </div>
          <div className="flex gap-[10px]">
            <div className="border-border bg-card flex-1 rounded-md border p-2 text-center">
              <div className="font-display text-destructive text-lg font-bold">{summary.removeCount}</div>
              <div className="text-muted-foreground text-[9px] uppercase">Remove</div>
            </div>
            <div className="border-border bg-card flex-1 rounded-md border p-2 text-center">
              <div className="font-display text-add text-lg font-bold">{summary.addCount}</div>
              <div className="text-muted-foreground text-[9px] uppercase">Add</div>
            </div>
          </div>
          <NotchButton tone="green" disabled aria-disabled="true" className="cursor-default">
            ⑂ Fork to my account
          </NotchButton>
          <span
            className="font-display border-border bg-secondary text-secondary-foreground cursor-default rounded-[5px] border px-3 py-1.5 text-center text-[11px] tracking-[0.05em] uppercase"
            aria-disabled="true"
          >
            ⤓ Export list
          </span>
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Forking copies both decklists into a new editable comparison you own.
          </p>
        </div>
      </div>
    </div>
  );
}
