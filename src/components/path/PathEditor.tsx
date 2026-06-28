import { useCallback, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { resolveDeck, applySuggestion, applyAllSuggestions } from "@/lib/deck";
import type { UnresolvedEntry } from "@/lib/deck";
import type { UnresolvedCard } from "@/lib/card-data";
import { cumulativePathCost, isUpgradePlan, overallPathSummary, stepPlan } from "@/lib/path";
import type { PathStep, StepSnapshot, UnresolvedLite, UpgradePath } from "@/lib/path";
import { Button } from "@/components/ui/button";
import { CardGroupColumn } from "@/components/deck/CardGroupColumn";
import { CostSummary } from "@/components/deck/CostSummary";
import { UnresolvedNotice } from "@/components/deck/UnresolvedNotice";
import { SharedCardsDisclosure } from "@/components/deck/SharedCardsDisclosure";
import { SortControl } from "@/components/deck/SortControl";
import { useSortMode } from "@/components/deck/useSortMode";
import { formatUsd } from "@/components/deck/labels";
import { formatSavedDate, visibilityLabel } from "@/components/path/metadata";
import type { SortMode } from "@/components/deck/sort";

interface PathEditorProps {
  path: UpgradePath;
  initialSteps: PathStep[];
}

/** The "add checkpoint" lifecycle: resolving a pasted list, then persisting it. */
type AddState = { status: "idle" } | { status: "resolving" } | { status: "error"; message: string };

/** The pre-save "Check" lifecycle: resolve the pasted list to surface unresolved cards before save. */
type CheckState = { status: "idle" } | { status: "checking" } | { status: "checked"; unresolved: UnresolvedCard[] };

const textareaClasses =
  "h-40 w-full resize-y rounded-md border border-border bg-input p-3 font-mono text-sm text-foreground placeholder-muted-foreground/60 transition-colors focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none";

const textInputClasses =
  "rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 transition-colors focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none";

/** A neutral v3 `btnD` action — Cinzel, uppercase, hairline border on the sidebar fill. */
const btnDClass =
  "font-display border-border bg-secondary text-secondary-foreground hover:text-foreground rounded-[5px] border text-[11px] tracking-[0.05em] uppercase transition-colors";

/** The destructive `btnR` skin (delete actions) tuned to the v3 red palette. */
const btnRClass =
  "font-display rounded-[5px] border border-[#6e3a33] bg-[#2a1714] text-[#e0867d] hover:bg-[#3a201b] hover:text-[#f0a89f] text-[11px] tracking-[0.05em] uppercase transition-colors";

/** No accept on a saved snapshot — checkpoints are immutable (FR-006). */
const noop = (): void => {
  /* intentionally empty */
};

/**
 * Re-shape a snapshot's stored unresolved entries for the read-only notice: a
 * saved step can't be edited, so suggestions are dropped (no "Accept" affordance)
 * and the side tag is nominal (a single deck has no base/target side).
 */
function toReadOnlyEntries(unresolved: UnresolvedLite[]): UnresolvedEntry[] {
  return unresolved.map((entry) => ({
    name: entry.name,
    reason: entry.reason,
    suggestion: null,
    deck: "target" as const,
  }));
}

/**
 * Re-shape freshly-resolved unresolved cards for the *editable* pre-save notice:
 * suggestions are KEPT (so Accept works) and the side tag is nominal (a single
 * list has no base/target side). Sibling of {@link toReadOnlyEntries}, which
 * strips suggestions for saved (immutable) steps.
 */
function toEditableEntries(unresolved: UnresolvedCard[]): UnresolvedEntry[] {
  return unresolved.map((entry) => ({
    name: entry.name,
    reason: entry.reason,
    suggestion: entry.suggestion,
    deck: "target" as const,
  }));
}

/**
 * One checkpoint's rendered plan. Position 0 (the base) shows a grouped card list;
 * every later step shows its diff against the prior step — the same Remove/Add
 * columns, shared-cards disclosure, and per-step cost the `/` comparer uses,
 * recomputed from the stored snapshot (no card-data lookups). Holds its own
 * shared-cards toggle so steps expand independently.
 */
function StepCard({ step, prev, sortMode }: { step: PathStep; prev: PathStep | null; sortMode: SortMode }) {
  const [sharedOpen, setSharedOpen] = useState(false);
  const plan = stepPlan(prev ? prev.snapshot : null, step.snapshot);
  const unresolvedEntries = toReadOnlyEntries(step.snapshot.unresolved);

  return (
    <section className="border-border bg-card space-y-4 rounded-md border p-5">
      <header className="flex items-baseline gap-2">
        <span className="bg-secondary text-accent rounded-full px-2 py-0.5 text-xs font-medium">
          {step.position === 0 ? "Base" : `Step ${step.position}`}
        </span>
        <h2 className="font-display text-foreground text-lg font-semibold">{step.name}</h2>
      </header>

      {unresolvedEntries.length > 0 ? (
        <UnresolvedNotice entries={unresolvedEntries} onAccept={noop} onAcceptAll={noop} />
      ) : null}

      {isUpgradePlan(plan) ? (
        <>
          {plan.add.length > 0 ? <CostSummary add={plan.add} /> : null}

          {plan.remove.length === 0 && plan.add.length === 0 ? (
            <p className="border-border bg-input text-muted-foreground rounded-md border p-3 text-sm">
              Identical to the previous step — nothing to add or remove.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <CardGroupColumn title="Remove" groups={plan.remove} sortMode={sortMode} />
              <CardGroupColumn title="Add" groups={plan.add} sortMode={sortMode} />
            </div>
          )}

          <SharedCardsDisclosure
            groups={plan.shared}
            sortMode={sortMode}
            open={sharedOpen}
            onToggle={() => {
              setSharedOpen((open) => !open);
            }}
          />
        </>
      ) : (
        <CardGroupColumn title="Deck" groups={plan.base} sortMode={sortMode} />
      )}
    </section>
  );
}

/**
 * The path editor island: renders a path's checkpoint chain and drives every
 * mutation (add checkpoint, delete last, rename, delete path) against the
 * `/api/paths/*` endpoints. Adding a checkpoint resolves the pasted list
 * client-side — request-token guarded so a slow resolution can't clobber a newer
 * one — builds a {@link StepSnapshot}, and POSTs it; views never re-resolve.
 */
export default function PathEditor({ path, initialSteps }: PathEditorProps) {
  const [steps, setSteps] = useState<PathStep[]>(initialSteps);
  const [title, setTitle] = useState(path.title);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(path.title);

  const [name, setName] = useState("");
  const [listText, setListText] = useState("");
  const [addState, setAddState] = useState<AddState>({ status: "idle" });
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { mode: sortMode, setMode: handleSortChange } = useSortMode();

  // Only the latest add run may write the view (mirrors DeckComparer).
  const addToken = useRef(0);
  // Only the latest Check run may write the check state (same guard, separate counter).
  const checkToken = useRef(0);
  const [checkState, setCheckState] = useState<CheckState>({ status: "idle" });

  const cumulative = cumulativePathCost(steps.map((step) => step.snapshot));
  // Base→final delta for the header subtitle (in/out + cost); zeros for <2 steps.
  const summary = overallPathSummary(steps.map((step) => step.snapshot));
  const hasDelta = steps.length > 1;
  const subtitle = [
    `Saved ${formatSavedDate(path.updatedAt)}`,
    visibilityLabel(path.visibility),
    ...(hasDelta
      ? [
          `${summary.addCount} in / ${summary.removeCount} out`,
          summary.cost.pricedCount > 0 ? formatUsd(summary.cost.total) : "—",
        ]
      : []),
  ].join(" · ");

  const handleAddStep = useCallback(async () => {
    const trimmedName = name.trim();
    if (trimmedName === "" || listText.trim() === "") {
      setAddState({ status: "error", message: "Give the checkpoint a name and paste a deck list." });
      return;
    }

    const token = ++addToken.current;
    setAddState({ status: "resolving" });

    let snapshot: StepSnapshot;
    try {
      const resolved = await resolveDeck(listText);
      snapshot = {
        cards: resolved.deck,
        unresolved: resolved.unresolved.map((entry) => ({
          name: entry.name,
          reason: entry.reason,
          suggestion: entry.suggestion,
        })),
      };
    } catch (error) {
      if (token !== addToken.current) {
        return;
      }
      const message = error instanceof Error ? error.message : "Could not reach the card database.";
      setAddState({ status: "error", message });
      return;
    }

    if (token !== addToken.current) {
      return;
    }

    try {
      const response = await fetch(`/api/paths/${path.id}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, listText, snapshot }),
      });
      if (token !== addToken.current) {
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = body?.error ?? `Couldn't save the checkpoint (${response.status}).`;
        setAddState({ status: "error", message });
        return;
      }
      const created = (await response.json()) as PathStep;
      setSteps((prev) => [...prev, created]);
      setName("");
      setListText("");
      setAddState({ status: "idle" });
      setCheckState({ status: "idle" });
    } catch {
      if (token !== addToken.current) {
        return;
      }
      setAddState({ status: "error", message: "Couldn't save the checkpoint. Check your connection and retry." });
    }
  }, [name, listText, path.id]);

  // Pre-save Check: resolve the pasted list (no POST) so unresolved cards surface
  // with a one-click Accept before the immutable snapshot is written. Token-guarded
  // so a slow resolve can't clobber a newer one (mirrors the add flow).
  const runCheck = useCallback(async (text: string) => {
    if (text.trim() === "") {
      setCheckState({ status: "idle" });
      return;
    }
    const token = ++checkToken.current;
    setCheckState({ status: "checking" });
    try {
      const resolved = await resolveDeck(text);
      if (token !== checkToken.current) {
        return;
      }
      setCheckState({ status: "checked", unresolved: resolved.unresolved });
    } catch (error) {
      if (token !== checkToken.current) {
        return;
      }
      const message = error instanceof Error ? error.message : "Could not reach the card database.";
      setAddState({ status: "error", message });
      setCheckState({ status: "idle" });
    }
  }, []);

  // Accept one fuzzy suggestion: rewrite the matching line(s) in the paste text,
  // then re-check so the notice reflects the correction. Mirrors DeckComparer's
  // accept loop, but explicit — the path builder has no debounce. Reads the
  // rewritten text from `next`, not state, so the re-check isn't stale.
  const handleAccept = useCallback(
    (entry: UnresolvedEntry) => {
      if (entry.suggestion === null) {
        return;
      }
      const next = applySuggestion(listText, entry.name, entry.suggestion);
      setListText(next);
      void runCheck(next);
    },
    [listText, runCheck],
  );

  const handleAcceptAll = useCallback(() => {
    if (checkState.status !== "checked") {
      return;
    }
    const next = applyAllSuggestions(listText, checkState.unresolved);
    setListText(next);
    void runCheck(next);
  }, [checkState, listText, runCheck]);

  const handleDeleteLast = useCallback(async () => {
    if (steps.length === 0) {
      return;
    }
    setMutationError(null);
    const response = await fetch(`/api/paths/${path.id}/steps`, { method: "DELETE" });
    if (response.ok) {
      setSteps((prev) => prev.slice(0, -1));
    } else {
      setMutationError("Couldn't delete the last checkpoint.");
    }
  }, [steps.length, path.id]);

  const handleRename = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (trimmed === "") {
      return;
    }
    setMutationError(null);
    const response = await fetch(`/api/paths/${path.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (response.ok) {
      const updated = (await response.json()) as UpgradePath;
      setTitle(updated.title);
      setRenaming(false);
    } else {
      setMutationError("Couldn't rename the path.");
    }
  }, [titleDraft, path.id]);

  const handleDeletePath = useCallback(async () => {
    if (!window.confirm("Delete this path and all of its checkpoints? This can't be undone.")) {
      return;
    }
    const response = await fetch(`/api/paths/${path.id}`, { method: "DELETE" });
    if (response.ok) {
      window.location.href = "/paths";
    } else {
      setMutationError("Couldn't delete the path.");
    }
  }, [path.id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/paths"
          className="font-display text-muted-foreground hover:text-foreground text-[11px] tracking-[0.05em]"
        >
          Saved decks ›
        </a>
        <SortControl value={sortMode} onChange={handleSortChange} />
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        {renaming ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={titleDraft}
              onChange={(event) => {
                setTitleDraft(event.target.value);
              }}
              className={textInputClasses}
              aria-label="Path title"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={btnDClass}
              onClick={() => {
                void handleRename();
              }}
            >
              <Check className="size-4" />
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={btnDClass}
              onClick={() => {
                setTitleDraft(title);
                setRenaming(false);
              }}
            >
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div>
              <h1 className="font-display text-foreground text-2xl font-semibold sm:text-3xl">{title}</h1>
              <p className="font-body text-muted-foreground mt-1 text-xs italic">{subtitle}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={btnDClass}
              aria-label="Rename path"
              onClick={() => {
                setTitleDraft(title);
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* Static: the v3 owner-detail Edit/Duplicate pair — visual only (Duplicate is unwired). */}
          <span className={`${btnDClass} cursor-default px-3 py-1.5`} aria-disabled="true">
            ✎ Edit
          </span>
          <span className={`${btnDClass} cursor-default px-3 py-1.5`} aria-disabled="true">
            ⎘ Duplicate
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={btnRClass}
            onClick={() => {
              void handleDeletePath();
            }}
          >
            <Trash2 className="size-4" />
            Delete path
          </Button>
        </div>
      </header>

      {/* Static Share row — copy-link field + Copy + Public toggle, all inert (no backing endpoint). */}
      <div className="border-border flex flex-wrap items-center gap-3 rounded-md border bg-[#1c1710] p-3">
        <span className="font-display text-foreground text-[11px] font-semibold tracking-[0.05em] uppercase">
          ⤴ Share
        </span>
        <span className="border-border bg-input text-muted-foreground flex-1 rounded-[5px] border px-3 py-1.5 font-mono text-[11px]">
          deckdelta.app/s/share-link
        </span>
        <span className={`${btnDClass} cursor-default px-3 py-1.5`} aria-disabled="true">
          Copy
        </span>
        <span
          className="font-display bg-primary text-primary-foreground cursor-default rounded-[5px] border border-[#a9863f] px-3 py-1.5 text-[10px] font-semibold tracking-[0.05em] uppercase"
          aria-disabled="true"
        >
          Public ◐
        </span>
      </div>

      {mutationError ? (
        <p className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-3 text-sm text-[#e0867d]">{mutationError}</p>
      ) : null}

      {steps.length > 1 ? (
        <div className="border-border bg-card rounded-md border p-4">
          <p className="text-foreground text-base font-semibold">
            Cumulative upgrade cost: {cumulative.pricedCount > 0 ? formatUsd(cumulative.total) : "—"}
            {cumulative.missingCount > 0 ? (
              <span className="text-muted-foreground ml-1 text-sm font-normal">
                · {cumulative.missingCount} {cumulative.missingCount === 1 ? "card" : "cards"} without price data
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Sum of every checkpoint&apos;s additions across the path.
          </p>
        </div>
      ) : null}

      {steps.length === 0 ? (
        <p className="border-border bg-card text-muted-foreground rounded-md border p-4 text-sm">
          No checkpoints yet. Add a base deck below to start the path.
        </p>
      ) : (
        <div className="space-y-4">
          {steps.map((step, index) => (
            <StepCard key={step.id} step={step} prev={index === 0 ? null : steps[index - 1]} sortMode={sortMode} />
          ))}
        </div>
      )}

      {steps.length > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={btnRClass}
            onClick={() => {
              void handleDeleteLast();
            }}
          >
            <Trash2 className="size-4" />
            Delete last checkpoint
          </Button>
        </div>
      ) : null}

      <section className="border-border bg-card space-y-3 rounded-md border p-5">
        <h2 className="font-display text-foreground text-lg font-semibold">
          {steps.length === 0 ? "Add base deck" : "Add checkpoint"}
        </h2>
        <div>
          <label htmlFor="step-name" className="text-muted-foreground mb-1 block text-sm font-medium">
            Checkpoint name
          </label>
          <input
            id="step-name"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder={steps.length === 0 ? "Precon" : "$50 upgrade"}
            className={`${textInputClasses} w-full`}
          />
        </div>
        <div>
          <label htmlFor="step-list" className="text-muted-foreground mb-1 block text-sm font-medium">
            Deck list
          </label>
          <textarea
            id="step-list"
            value={listText}
            onChange={(event) => {
              setListText(event.target.value);
            }}
            placeholder={"1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…"}
            className={textareaClasses}
            spellCheck={false}
          />
        </div>

        {checkState.status === "checked" ? (
          checkState.unresolved.length > 0 ? (
            <UnresolvedNotice
              entries={toEditableEntries(checkState.unresolved)}
              onAccept={handleAccept}
              onAcceptAll={handleAcceptAll}
            />
          ) : (
            <p className="border-border bg-card text-add rounded-md border p-3 text-sm">✓ All cards resolved.</p>
          )
        ) : null}

        {addState.status === "error" ? (
          <p className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-3 text-sm text-[#e0867d]">
            {addState.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={btnDClass}
            disabled={listText.trim() === "" || checkState.status === "checking" || addState.status === "resolving"}
            onClick={() => {
              void runCheck(listText);
            }}
          >
            {checkState.status === "checking" ? "Checking…" : "Check"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-display bg-primary text-primary-foreground border-[#a9863f] text-[11px] font-semibold tracking-[0.05em] uppercase transition-opacity hover:opacity-90"
            disabled={addState.status === "resolving"}
            onClick={() => {
              void handleAddStep();
            }}
          >
            {addState.status === "resolving" ? (
              <>
                <span className="border-primary-foreground/40 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
                Resolving…
              </>
            ) : (
              <>
                <Plus className="size-4" />
                {steps.length === 0 ? "Add base deck" : "Add checkpoint"}
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
