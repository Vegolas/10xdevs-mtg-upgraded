import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { generateUpgradePlan, applySuggestion, acceptAllSuggestions } from "@/lib/deck";
import type { UpgradePlan, UnresolvedEntry, DeckSide } from "@/lib/deck";
import { useLatestRun } from "@/lib/async/useLatestRun";
import { Button } from "@/components/ui/button";
import { NotchButton } from "@/components/ui/NotchButton";
import { CardGroupColumn } from "./CardGroupColumn";
import { CostSummary } from "./CostSummary";
import { UnresolvedNotice } from "./UnresolvedNotice";
import { SharedCardsDisclosure } from "./SharedCardsDisclosure";
import { SortControl } from "./SortControl";
import { MergedView } from "./MergedView";
import { ViewToggle, type ViewMode } from "./ViewToggle";
import { useSortMode } from "./useSortMode";

/** Delay after the last keystroke before a plan auto-builds (FR-003 trigger). */
const DEBOUNCE_MS = 700;

/** Outcome of the latest run; `idle` is also the initial state. */
type View =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; plan: UpgradePlan; unresolved: UnresolvedEntry[] }
  | { status: "no-cards"; sides: DeckSide[] }
  | { status: "error"; message: string };

const textareaClasses =
  "h-48 w-full resize-y rounded-md border border-border bg-input p-3 font-mono text-sm text-foreground placeholder-muted-foreground/50 transition-colors focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none";

const labelClasses = "mb-[6px] block text-[11px] font-bold tracking-[0.4px] text-accent/80 uppercase";

/** Non-empty lines — the base/target tallies shown in the collapsed strip. */
function countCardLines(text: string): number {
  return text.split("\n").filter((line) => line.trim() !== "").length;
}

/**
 * Name the box (or boxes) that parsed to nothing, using the wording of the visible
 * `<label>` above each textarea so the sentence points at something the user can see.
 *
 * The verb belongs to the subject rather than to a shared template: "Neither deck" needs
 * "has any", the single-side rows need "has no", and gluing one verb onto all three
 * produces a double negative for the case hit most often — both boxes pasted from the
 * same source. The trailing clause is the one the path builder uses verbatim, so the two
 * surfaces explain the same rule the same way.
 */
function noCardsMessage(sides: DeckSide[]): string {
  const subject =
    sides.length === 2
      ? "Neither deck has any card lines"
      : sides[0] === "base"
        ? "Base deck has no card lines"
        : "Target deck has no card lines";

  return `${subject} — comments, headers and blank lines aren't cards.`;
}

/**
 * DeckDelta's anonymous, stateless comparer: two deck-list text areas that
 * auto-build the grouped upgrade plan ~700ms after edits settle. A gold Calculate
 * CTA triggers an immediate (guarded) run; once a plan is ready the inputs
 * collapse to a one-line strip that "Edit decklists ▾" reopens. Runs go through a
 * {@link useLatestRun} lane so a slow earlier resolution can never clobber a newer
 * plan, and the resolver's transient failure surfaces as a retryable error banner.
 * Account-backed persistence lives in the path builder (`/paths`); this surface
 * keeps nothing.
 */
export default function DeckComparer() {
  const [baseText, setBaseText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const [sharedOpen, setSharedOpen] = useState(false);
  // The user explicitly reopened the inputs after a result; keeps them open
  // even though `view` is `ready`.
  const [editing, setEditing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("columns");

  // External store keeps the preference out of render/effects: grouped on SSR and
  // first paint, the stored value adopted after mount (hydration-safe).
  const { mode: sortMode, setMode: handleSortChange } = useSortMode();

  // The plan lane: only the latest run is allowed to write the view. `inFlight`
  // is unread here — this lane is latest-wins, and nothing about the comparer is
  // gated on a run being outstanding.
  const [, planLane] = useLatestRun();

  const bothFilled = baseText.trim() !== "" && targetText.trim() !== "";

  // Inputs collapse to the strip once a plan is ready, unless reopened for edit.
  const inputsCollapsed = view.status === "ready" && !editing;

  const runPlan = useCallback(
    async (base: string, target: string) => {
      // Outside the run: the spinner is immediate feedback for the click that
      // started it, not a result the guard may drop.
      setView({ status: "loading" });

      await planLane.run(async () => {
        const outcome = await generateUpgradePlan(base, target);

        // Returned, not written. A newer run started while this one was in
        // flight means the lane never invokes this — the drop stays as silent
        // as the token comparison it replaces.
        if (outcome.status === "ok") {
          return () => {
            setView({ status: "ready", plan: outcome.plan, unresolved: outcome.unresolved });
          };
        }
        if (outcome.status === "error") {
          return () => {
            setView({ status: "error", message: outcome.message });
          };
        }
        // `empty` used to map to `idle`, which reprints "Paste a deck list into each box."
        // over two boxes the user can see are full: the outcome was computed and then
        // thrown away (F-6). `generateUpgradePlan` already knows which side is at fault,
        // and now says so — this branch renders what it knows.
        return () => {
          setView({ status: "no-cards", sides: outcome.sides });
        };
      });
    },
    [planLane],
  );

  useEffect(() => {
    if (!bothFilled) {
      // Invalidate any in-flight run so its late result can't land. The idle
      // view is derived from `bothFilled` at render time, so no setState here.
      planLane.invalidate();
      return;
    }

    const handle = setTimeout(() => {
      void runPlan(baseText, targetText);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
    };
  }, [baseText, targetText, bothFilled, runPlan, planLane]);

  // The Calculate CTA: collapse the inputs and build immediately (guarded). The
  // debounce remains the fallback trigger; firing both is safe (the later run
  // wins via the request token).
  const handleCalculate = useCallback(() => {
    setEditing(false);
    void runPlan(baseText, targetText);
  }, [runPlan, baseText, targetText]);

  // Accept one fuzzy suggestion: rewrite the matching line(s) in the right deck's
  // text and let the debounce effect rebuild the plan. Mirrors "set text, let the
  // effect rebuild" — no runPlan, no setView.
  const handleAccept = useCallback(
    (entry: UnresolvedEntry) => {
      if (entry.suggestion === null) {
        return;
      }
      if (entry.deck === "base") {
        setBaseText(applySuggestion(baseText, entry.name, entry.suggestion));
      } else {
        setTargetText(applySuggestion(targetText, entry.name, entry.suggestion));
      }
    },
    [baseText, targetText],
  );

  // Accept every suggestion at once. The two setState calls batch (React 19
  // automatic batching) into a single debounce run → one rebuild, no flicker.
  const handleAcceptAll = useCallback(() => {
    if (view.status !== "ready") {
      return;
    }
    const next = acceptAllSuggestions(baseText, targetText, view.unresolved);
    setBaseText(next.baseText);
    setTargetText(next.targetText);
  }, [view, baseText, targetText]);

  return (
    <div className="space-y-6">
      {inputsCollapsed ? (
        <button
          type="button"
          onClick={() => {
            setEditing(true);
          }}
          className="border-border hover:border-accent/50 flex w-full items-center gap-3 rounded-md border bg-[#1c1710] px-[13px] py-[10px] text-left transition-colors"
        >
          <span className="text-accent text-[13px]" aria-hidden="true">
            ▸
          </span>
          <span className="text-secondary-foreground flex-1 text-[12px]">
            <b className="text-foreground">Decklists</b> · base{" "}
            <b className="text-foreground">{countCardLines(baseText)}</b> · target{" "}
            <b className="text-foreground">{countCardLines(targetText)}</b>{" "}
            <span className="text-muted-foreground">— collapsed</span>
          </span>
          <span className="font-display text-accent text-[11px] font-semibold tracking-[0.05em]">Edit decklists ▾</span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="base-deck" className={labelClasses}>
                Base deck — what you have now
              </label>
              <textarea
                id="base-deck"
                value={baseText}
                onChange={(e) => {
                  setBaseText(e.target.value);
                }}
                placeholder={"1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…"}
                className={textareaClasses}
                spellCheck={false}
              />
            </div>
            <div>
              <label htmlFor="target-deck" className={labelClasses}>
                Target deck — what you want
              </label>
              <textarea
                id="target-deck"
                value={targetText}
                onChange={(e) => {
                  setTargetText(e.target.value);
                }}
                placeholder={"1 Sol Ring\n1 Smothering Tithe\n1 Cyclonic Rift\n…"}
                className={textareaClasses}
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex justify-center">
            <NotchButton type="button" onClick={handleCalculate} disabled={!bothFilled}>
              ◆&nbsp;&nbsp;Calculate the Delta&nbsp;&nbsp;→
            </NotchButton>
          </div>
        </div>
      )}

      <div>
        {!bothFilled || view.status === "idle" ? (
          <p className="text-muted-foreground text-sm">
            Paste a deck list into each box. Your upgrade plan builds automatically once both sides have cards.
          </p>
        ) : null}

        {bothFilled && view.status === "loading" ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <span className="border-muted-foreground/30 border-t-foreground size-4 animate-spin rounded-full border-2" />
            Building plan…
          </p>
        ) : null}

        {bothFilled && view.status === "no-cards" ? (
          // INFORMATIONAL, not destructive: nothing failed. The text reached the parser and
          // parsed cleanly to no cards, so the transport banner below — hardcoded to
          // "Couldn't reach the card database." with a Retry CTA — would be actively wrong
          // advice here, and re-running identical text would answer identically anyway.
          // `role="alert"` announces the verdict; the `aria-label` is what tells a query
          // which of this surface's two alerts it found (test-plan §6.7 items 1 and 27),
          // because role and class string cannot.
          <p
            role="alert"
            aria-label="No card lines"
            className="border-border bg-card text-muted-foreground rounded-md border p-3 text-sm"
          >
            {noCardsMessage(view.sides)}
          </p>
        ) : null}

        {bothFilled && view.status === "error" ? (
          // `role="alert"` announces the retryable failure to assistive technology, and
          // gives the container an addressable role — UnresolvedNotice renders a div with
          // a byte-identical class string, so without this the two are indistinguishable.
          <div role="alert" className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-4 text-sm text-[#b5847e]">
            <p className="text-destructive font-semibold">Couldn&apos;t reach the card database.</p>
            <p className="mt-1 text-[#b5847e]">{view.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-[#6e3a33] bg-transparent text-[#e0867d] hover:bg-[#3a201b] hover:text-[#f0a89f]"
              onClick={() => {
                void runPlan(baseText, targetText);
              }}
            >
              <RotateCw className="size-4" />
              Retry
            </Button>
          </div>
        ) : null}

        {bothFilled && view.status === "ready" ? (
          <div className="space-y-5">
            {view.unresolved.length > 0 ? (
              <UnresolvedNotice entries={view.unresolved} onAccept={handleAccept} onAcceptAll={handleAcceptAll} />
            ) : null}

            {view.plan.add.length > 0 ? <CostSummary add={view.plan.add} /> : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px]">View</span>
                <ViewToggle value={viewMode} onChange={setViewMode} />
              </div>
              <SortControl value={sortMode} onChange={handleSortChange} />
            </div>

            {view.plan.remove.length === 0 && view.plan.add.length === 0 ? (
              <p className="border-border bg-card text-muted-foreground rounded-md border p-3 text-sm">
                These lists are identical — nothing to add or remove. Every card is shared below.
              </p>
            ) : viewMode === "merged" ? (
              <MergedView plan={view.plan} sortMode={sortMode} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <CardGroupColumn title="Remove" groups={view.plan.remove} sortMode={sortMode} />
                <CardGroupColumn title="Add" groups={view.plan.add} sortMode={sortMode} />
              </div>
            )}

            <SharedCardsDisclosure
              groups={view.plan.shared}
              sortMode={sortMode}
              open={sharedOpen}
              onToggle={() => {
                setSharedOpen((prev) => !prev);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
