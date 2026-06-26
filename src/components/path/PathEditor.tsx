import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { resolveDeck } from "@/lib/deck";
import type { UnresolvedEntry } from "@/lib/deck";
import { cumulativePathCost, isUpgradePlan, stepPlan } from "@/lib/path";
import type { PathStep, StepSnapshot, UnresolvedLite, UpgradePath } from "@/lib/path";
import { Button } from "@/components/ui/button";
import { CardGroupColumn } from "@/components/deck/CardGroupColumn";
import { CostSummary } from "@/components/deck/CostSummary";
import { UnresolvedNotice } from "@/components/deck/UnresolvedNotice";
import { SharedCardsDisclosure } from "@/components/deck/SharedCardsDisclosure";
import { SortControl } from "@/components/deck/SortControl";
import { useSortMode } from "@/components/deck/useSortMode";
import { formatUsd } from "@/components/deck/labels";
import type { SortMode } from "@/components/deck/sort";

interface PathEditorProps {
  path: UpgradePath;
  initialSteps: PathStep[];
}

/** The "add checkpoint" lifecycle: resolving a pasted list, then persisting it. */
type AddState = { status: "idle" } | { status: "resolving" } | { status: "error"; message: string };

const textareaClasses =
  "h-40 w-full resize-y rounded-lg border border-white/20 bg-white/10 p-3 font-mono text-sm text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none";

const textInputClasses =
  "rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none";

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
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <header className="flex items-baseline gap-2">
        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-200">
          {step.position === 0 ? "Base" : `Step ${step.position}`}
        </span>
        <h2 className="text-lg font-semibold text-white">{step.name}</h2>
      </header>

      {unresolvedEntries.length > 0 ? (
        <UnresolvedNotice entries={unresolvedEntries} onAccept={noop} onAcceptAll={noop} />
      ) : null}

      {isUpgradePlan(plan) ? (
        <>
          {plan.add.length > 0 ? <CostSummary add={plan.add} /> : null}

          {plan.remove.length === 0 && plan.add.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-blue-100/70">
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

  const cumulative = cumulativePathCost(steps.map((step) => step.snapshot));

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
    } catch {
      if (token !== addToken.current) {
        return;
      }
      setAddState({ status: "error", message: "Couldn't save the checkpoint. Check your connection and retry." });
    }
  }, [name, listText, path.id]);

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href="/paths" className="inline-flex items-center gap-1 text-sm text-blue-100/70 hover:text-white">
          <ArrowLeft className="size-4" />
          My Paths
        </a>
        <SortControl value={sortMode} onChange={handleSortChange} />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
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
              className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
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
              className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
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
            <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent sm:text-3xl">
              {title}
            </h1>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-red-400/40 bg-transparent text-red-100 hover:bg-red-500/10 hover:text-white"
          onClick={() => {
            void handleDeletePath();
          }}
        >
          <Trash2 className="size-4" />
          Delete path
        </Button>
      </header>

      {mutationError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-200">{mutationError}</p>
      ) : null}

      {steps.length > 1 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-base font-semibold text-white">
            Cumulative upgrade cost: {cumulative.pricedCount > 0 ? formatUsd(cumulative.total) : "—"}
            {cumulative.missingCount > 0 ? (
              <span className="ml-1 text-sm font-normal text-blue-100/50">
                · {cumulative.missingCount} {cumulative.missingCount === 1 ? "card" : "cards"} without price data
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-blue-100/50">Sum of every checkpoint&apos;s additions across the path.</p>
        </div>
      ) : null}

      {steps.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-blue-100/70">
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
            className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
            onClick={() => {
              void handleDeleteLast();
            }}
          >
            <Trash2 className="size-4" />
            Delete last checkpoint
          </Button>
        </div>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">{steps.length === 0 ? "Add base deck" : "Add checkpoint"}</h2>
        <div>
          <label htmlFor="step-name" className="mb-1 block text-sm font-medium text-blue-100/80">
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
          <label htmlFor="step-list" className="mb-1 block text-sm font-medium text-blue-100/80">
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

        {addState.status === "error" ? (
          <p className="rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-200">
            {addState.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-purple-400/50 bg-purple-500/20 text-white hover:bg-purple-500/30"
            disabled={addState.status === "resolving"}
            onClick={() => {
              void handleAddStep();
            }}
          >
            {addState.status === "resolving" ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
