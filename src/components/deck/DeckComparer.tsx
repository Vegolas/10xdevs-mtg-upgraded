import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { generateUpgradePlan, applySuggestion, acceptAllSuggestions } from "@/lib/deck";
import type { UpgradePlan, UnresolvedEntry } from "@/lib/deck";
import { Button } from "@/components/ui/button";
import { CardGroupColumn } from "./CardGroupColumn";
import { CostSummary } from "./CostSummary";
import { UnresolvedNotice } from "./UnresolvedNotice";
import { SharedCardsDisclosure } from "./SharedCardsDisclosure";
import { SortControl } from "./SortControl";
import { useSortMode } from "./useSortMode";

/** Delay after the last keystroke before a plan auto-builds (FR-003 trigger). */
const DEBOUNCE_MS = 700;

/** Outcome of the latest run; `idle` is also the initial state. */
type View =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; plan: UpgradePlan; unresolved: UnresolvedEntry[] }
  | { status: "error"; message: string };

const textareaClasses =
  "h-48 w-full resize-y rounded-lg border border-white/20 bg-white/10 p-3 font-mono text-sm text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none";

/**
 * DeckDelta's anonymous, stateless comparer: two deck-list text areas that
 * auto-build the grouped upgrade plan ~700ms after edits settle. Runs are guarded
 * by a request token so a slow earlier resolution can never clobber a newer plan,
 * and the resolver's transient failure surfaces as a retryable error banner.
 * Account-backed persistence lives in the path builder (`/paths`); this surface
 * keeps nothing.
 */
export default function DeckComparer() {
  const [baseText, setBaseText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const [sharedOpen, setSharedOpen] = useState(false);

  // External store keeps the preference out of render/effects: grouped on SSR and
  // first paint, the stored value adopted after mount (hydration-safe).
  const { mode: sortMode, setMode: handleSortChange } = useSortMode();

  // Monotonic token: only the latest run is allowed to write the view.
  const requestToken = useRef(0);

  const bothFilled = baseText.trim() !== "" && targetText.trim() !== "";

  const runPlan = useCallback(async (base: string, target: string) => {
    const token = ++requestToken.current;
    setView({ status: "loading" });

    const outcome = await generateUpgradePlan(base, target);
    if (token !== requestToken.current) {
      return; // a newer run started while this one was in flight — drop it.
    }

    if (outcome.status === "ok") {
      setView({ status: "ready", plan: outcome.plan, unresolved: outcome.unresolved });
    } else if (outcome.status === "error") {
      setView({ status: "error", message: outcome.message });
    } else {
      setView({ status: "idle" });
    }
  }, []);

  useEffect(() => {
    if (!bothFilled) {
      // Invalidate any in-flight run so its late result can't land. The idle
      // view is derived from `bothFilled` at render time, so no setState here.
      requestToken.current++;
      return;
    }

    const handle = setTimeout(() => {
      void runPlan(baseText, targetText);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
    };
  }, [baseText, targetText, bothFilled, runPlan]);

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
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="base-deck" className="mb-1 block text-sm font-medium text-blue-100/80">
            Base deck (what you have now)
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
          <label htmlFor="target-deck" className="mb-1 block text-sm font-medium text-blue-100/80">
            Target deck (what you want)
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

      <div className="mt-6">
        {!bothFilled || view.status === "idle" ? (
          <p className="text-sm text-blue-100/50">
            Paste a deck list into each box. Your upgrade plan builds automatically once both sides have cards.
          </p>
        ) : null}

        {bothFilled && view.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-blue-100/70">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Building plan…
          </p>
        ) : null}

        {bothFilled && view.status === "error" ? (
          <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-200">
            <p className="font-medium text-red-300">Couldn&apos;t reach the card database.</p>
            <p className="mt-1 text-red-200/80">{view.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-red-400/40 bg-transparent text-red-100 hover:bg-red-500/10 hover:text-white"
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
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <SortControl value={sortMode} onChange={handleSortChange} />
            </div>

            {view.plan.add.length > 0 ? <CostSummary add={view.plan.add} /> : null}

            {view.unresolved.length > 0 ? (
              <UnresolvedNotice entries={view.unresolved} onAccept={handleAccept} onAcceptAll={handleAcceptAll} />
            ) : null}

            {view.plan.remove.length === 0 && view.plan.add.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-blue-100/70">
                These lists are identical — nothing to add or remove. Every card is shared below.
              </p>
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
