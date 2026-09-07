import { useCallback, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { resolveDeck, applySuggestion, applyAllSuggestions, deckCardsToText } from "@/lib/deck";
import type { UnresolvedEntry } from "@/lib/deck";
import type { UnresolvedCard } from "@/lib/card-data";
import {
  applyAllDeltaSuggestions,
  applyDeltaSuggestion,
  cumulativePathCost,
  deriveSnapshot,
  isUpgradePlan,
  overallPathSummary,
  stepPlan,
} from "@/lib/path";
import type { DeriveResult, PathStep, StepSnapshot, UnresolvedLite, UpgradePath } from "@/lib/path";
import { requestJson } from "@/lib/api/client";
import type { PathTitleRequest, StepCreateRequest } from "@/lib/api/contract";
import { useLatestRun } from "@/lib/async/useLatestRun";
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

/** The diff-mode "Check" lifecycle: derive the next snapshot from the prior step to preview the change. */
type DiffPreview = { status: "idle" } | { status: "checking" } | { status: "checked"; result: DeriveResult };

/** How the shared textarea is interpreted: a full pasted list, or `+`/`-` delta lines. */
type AddMode = "full" | "diff";

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
        {step.deltaText !== null ? (
          <span
            className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.05em] uppercase"
            title="Entered as + / − changes"
          >
            diff
          </span>
        ) : null}
      </header>

      {step.deltaText !== null ? (
        <details className="border-border bg-input rounded-md border p-3 text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
            Entered changes
          </summary>
          <pre className="text-foreground mt-2 font-mono text-xs whitespace-pre-wrap">{step.deltaText}</pre>
        </details>
      ) : null}

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
 * client-side, builds a {@link StepSnapshot}, and POSTs it; views never
 * re-resolve. Every async-then-setState flow here runs on a {@link useLatestRun}
 * lane — one lane per set of atoms — so a slow earlier run can never write over
 * a newer one, an edited box, a switched mode, or the checkpoint that replaced it.
 */
export default function PathEditor({ path, initialSteps }: PathEditorProps) {
  const [steps, setSteps] = useState<PathStep[]>(initialSteps);
  const [title, setTitle] = useState(path.title);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(path.title);

  const [name, setName] = useState("");
  const [listText, setListText] = useState("");
  const [mode, setMode] = useState<AddMode>("full");
  const [addState, setAddState] = useState<AddState>({ status: "idle" });
  const [mutationError, setMutationError] = useState<string | null>(null);
  // The Check flows' own error atom. Both catches used to write `addState` — the
  // add flow's atom, guarded by the add flow's counter — so a message about a
  // failed Check could land over a checkpoint that saved cleanly (F-3). One atom
  // for both Check flows, because they share the `preview` lane.
  const [checkError, setCheckError] = useState<string | null>(null);

  const { mode: sortMode, setMode: handleSortChange } = useSortMode();

  const [checkState, setCheckState] = useState<CheckState>({ status: "idle" });
  const [diffPreview, setDiffPreview] = useState<DiffPreview>({ status: "idle" });

  // Two lanes, split by the atoms they own rather than by flow. `preview` covers
  // both Check flows, which own `checkState`, `diffPreview` and `checkError`;
  // `add` covers `handleAddStep`, which owns `addState` and `steps`. Ownership is
  // the split that matters: F-2 and F-3 were both a write guarded by a counter
  // that did not own its target, and that is no longer expressible.
  const [, preview] = useLatestRun();
  // `addInFlight` drives the entry-mode toggle's `disabled`. The toggle is the one
  // control that can clear `addState` under an add in flight, and disabling it is
  // the right half of F-4's repair — a mode switch must never invalidate a POST.
  const [addInFlight, add] = useLatestRun();

  // Three mutation lanes, one per route, with TWO disciplines between them — because
  // the routes do not want one. F-5 recommends a latest-wins token for all three; on
  // `handleDeleteLast` that would be strictly WORSE than today's absent guard.
  // `DELETE /api/paths/[id]/steps` removes the highest-position step per CALL
  // (`src/pages/api/paths/[id]/steps.ts:214-236`), so under latest-wins two overlapping
  // deletes drop the first one's successful 204 as superseded — no pop — and let the
  // second's 404 "No steps to delete" set the error, leaving a step rendered against a
  // server holding zero. That is the rendered-list-disagrees-with-the-server failure the
  // guard is meant to prevent, manufactured by the guard.
  //
  // So both deletes run AT-MOST-ONE: their trigger carries the lane's committed
  // `inFlight` as `disabled`, so a second request is never issued and no superseded
  // response can exist. Only the rename is LATEST-WINS — a newer title genuinely
  // supersedes an older one — and its Save button deliberately does not disable.
  //
  // All three still write the one `mutationError` atom, and that is safe here in a way
  // F-3 was not: no lane invalidates another's, and neither delete can be superseded
  // within its own lane, so every write to it is guarded by the lane of the flow that
  // produced it. Split the atom if that ever stops being true.
  const [deleteLastInFlight, deleteLast] = useLatestRun();
  const [, rename] = useLatestRun();
  const [deletePathInFlight, deletePath] = useLatestRun();

  // Every event that makes a preview stale routes through here. The lane is
  // invalidated so a resolve already in flight cannot land (F-1, F-2, F-4) AND the
  // atoms it would have written are reset in the same breath: dropping the write
  // alone would leave `checkState` stuck on "checking" and the Check CTA disabled
  // with nothing outstanding left to finish it.
  const invalidatePreview = useCallback(() => {
    preview.invalidate();
    setCheckState({ status: "idle" });
    setDiffPreview({ status: "idle" });
    setCheckError(null);
  }, [preview]);

  // Diff-mode needs a predecessor to derive from; a fresh path is full-paste only.
  const canDiff = steps.length >= 1;
  const activeMode: AddMode = canDiff ? mode : "full";

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
      const message =
        activeMode === "diff"
          ? "Give the checkpoint a name and enter some + / − changes."
          : "Give the checkpoint a name and paste a deck list.";
      setAddState({ status: "error", message });
      return;
    }

    // Outside the run: the spinner is immediate feedback for the click that started
    // it, not a result the guard may drop. It is also what disables the Add CTA and
    // the entry-mode toggle, so it has to commit before the first await rather than
    // arrive with one.
    setAddState({ status: "resolving" });

    await add.run(async () => {
      // Build the snapshot per mode. Full-paste resolves the list as-is; diff-mode
      // derives it from the prior step's frozen snapshot, and the POSTed `listText`
      // becomes the *derived* full list so the stored column stays meaningful.
      let snapshot: StepSnapshot;
      let postListText: string;
      // Diff-mode persists the raw delta as provenance; full paste sends none.
      let postDeltaText: string | null = null;
      // …and names the step it derived from, so the server can refuse a raced append.
      let postPriorStepId: string | null = null;
      try {
        if (activeMode === "diff") {
          const priorStep = steps.at(-1);
          if (!priorStep) {
            return () => {
              setAddState({ status: "error", message: "Diff mode needs a previous checkpoint to build on." });
            };
          }
          const result = await deriveSnapshot(priorStep.snapshot, listText);
          snapshot = result.snapshot;
          postListText = deckCardsToText(result.snapshot.cards);
          postDeltaText = listText;
          // The server re-checks `prior ± delta` against *this* step, and answers 409
          // if another tab appended in the meantime — see the 409 branch below.
          postPriorStepId = priorStep.id;
        } else {
          const resolved = await resolveDeck(listText);
          snapshot = {
            cards: resolved.deck,
            unresolved: resolved.unresolved.map((entry) => ({
              name: entry.name,
              reason: entry.reason,
              suggestion: entry.suggestion,
            })),
          };
          postListText = listText;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not reach the card database.";
        return () => {
          setAddState({ status: "error", message });
        };
      }

      const request: StepCreateRequest = {
        name: trimmedName,
        listText: postListText,
        snapshot,
        deltaText: postDeltaText,
        priorStepId: postPriorStepId,
      };
      const result = await requestJson<PathStep>(`/api/paths/${path.id}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!result.ok) {
        // A 409 is the only failure the server's own words don't help with: it means
        // another tab appended after this one read `prior`, so the derive is stale and
        // the fix is a reload, not an edit. Everything else — including the verifier's
        // "prior ± delta" refusals — carries a message written for this form.
        const message =
          result.kind === "transport"
            ? "Couldn't save the checkpoint. Check your connection and retry."
            : result.status === 409
              ? "This path changed somewhere else. Reload the page, then re-enter your changes."
              : result.fromBody
                ? result.error
                : `Couldn't save the checkpoint (${result.status}).`;
        return () => {
          setAddState({ status: "error", message });
        };
      }
      const created = result.data;
      return () => {
        setSteps((prev) => [...prev, created]);
        setName("");
        setListText("");
        setAddState({ status: "idle" });
        // F-2: the add SUPERSEDES a Check in flight rather than only clearing the
        // atoms that Check writes. Clearing them under the add's own counter is
        // exactly what let a slower Check re-populate them a moment later — and
        // `setListText("")` above is programmatic, so the textarea's own
        // invalidation never fires for it.
        invalidatePreview();
      };
    });
  }, [name, listText, path.id, activeMode, steps, add, invalidatePreview]);

  // Pre-save Check: resolve the pasted list (no POST) so unresolved cards surface
  // with a one-click Accept before the immutable snapshot is written. Runs on the
  // `preview` lane, so a slow resolve cannot write over a newer Check, an edit to
  // the box, a mode switch, or the checkpoint that replaced it.
  const runCheck = useCallback(
    async (text: string) => {
      if (text.trim() === "") {
        setCheckState({ status: "idle" });
        return;
      }
      // Immediate feedback for the click and what disables the Check CTA, so it
      // commits outside the guard — same reason as the add flow's "resolving".
      setCheckState({ status: "checking" });
      setCheckError(null);
      await preview.run(async () => {
        try {
          const resolved = await resolveDeck(text);
          return () => {
            setCheckState({ status: "checked", unresolved: resolved.unresolved });
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not reach the card database.";
          // F-3: the Check's OWN atom. This used to be `setAddState`, which the add
          // flow owns and this lane does not guard.
          return () => {
            setCheckError(message);
            setCheckState({ status: "idle" });
          };
        }
      });
    },
    [preview],
  );

  // Diff-mode pre-save Check: derive the next snapshot from the prior step (no
  // POST) so the summary, full derived list, and unapplicable-line warnings
  // preview before save. Shares the `preview` lane with `runCheck`: the two are
  // alternate readings of the same box, so either supersedes the other.
  const runDiffCheck = useCallback(
    async (text: string) => {
      const prior = steps.at(-1)?.snapshot;
      if (!prior || text.trim() === "") {
        setDiffPreview({ status: "idle" });
        return;
      }
      setDiffPreview({ status: "checking" });
      setCheckError(null);
      await preview.run(async () => {
        try {
          const result = await deriveSnapshot(prior, text);
          return () => {
            setDiffPreview({ status: "checked", result });
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not reach the card database.";
          // F-3, diff twin: the Check's own atom, not the add flow's.
          return () => {
            setCheckError(message);
            setDiffPreview({ status: "idle" });
          };
        }
      });
    },
    [steps, preview],
  );

  // Switching entry mode clears the field and every preview/error so the two
  // surfaces never bleed into each other. F-4: it now INVALIDATES the preview lane
  // too, because clearing the atoms is not the same as stopping the run that is
  // about to write them. It deliberately leaves the `add` lane alone — a mode
  // switch must never drop a POST already in flight, which would save a checkpoint
  // the UI never renders; the toggle is disabled during an add instead.
  const switchMode = useCallback(
    (next: AddMode) => {
      setMode(next);
      setListText("");
      invalidatePreview();
      setAddState({ status: "idle" });
    },
    [invalidatePreview],
  );

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

  // Diff-mode accept: same one-click fuzzy correction as full paste, but the
  // rewrite preserves the `+`/`-` sign (see `applyDeltaSuggestion`) and re-runs
  // the derive-based preview.
  const handleDiffAccept = useCallback(
    (entry: UnresolvedEntry) => {
      if (entry.suggestion === null) {
        return;
      }
      const next = applyDeltaSuggestion(listText, entry.name, entry.suggestion);
      setListText(next);
      void runDiffCheck(next);
    },
    [listText, runDiffCheck],
  );

  const handleDiffAcceptAll = useCallback(() => {
    if (diffPreview.status !== "checked") {
      return;
    }
    const next = applyAllDeltaSuggestions(listText, diffPreview.result.snapshot.unresolved);
    setListText(next);
    void runDiffCheck(next);
  }, [diffPreview, listText, runDiffCheck]);

  const handleDeleteLast = useCallback(async () => {
    if (steps.length === 0) {
      return;
    }
    // Outside the run: clearing the banner is immediate feedback for the click that
    // started this, not a result the guard may drop.
    setMutationError(null);
    await deleteLast.run(async () => {
      // 204 on success — no body to read, so success alone is the signal.
      const result = await requestJson<null>(`/api/paths/${path.id}/steps`, { method: "DELETE" });
      if (result.ok) {
        return () => {
          setSteps((prev) => prev.slice(0, -1));
        };
      }
      return () => {
        setMutationError("Couldn't delete the last checkpoint.");
      };
    });
  }, [steps.length, path.id, deleteLast]);

  const handleRename = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (trimmed === "") {
      return;
    }
    setMutationError(null);
    await rename.run(async () => {
      const request: PathTitleRequest = { title: trimmed };
      // The PATCH response body is load-bearing: the new title comes from the server,
      // not from the draft, so a server-side transform (trimming) shows immediately.
      const result = await requestJson<UpgradePath>(`/api/paths/${path.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (result.ok) {
        const renamedTo = result.data.title;
        return () => {
          setTitle(renamedTo);
          setRenaming(false);
        };
      }
      return () => {
        setMutationError("Couldn't rename the path.");
      };
    });
  }, [titleDraft, path.id, rename]);

  const handleDeletePath = useCallback(async () => {
    // Stays ahead of the run: the confirm is the user's decision to start one at all,
    // and a dismissed dialog must not mint a token or hold the trigger down.
    if (!window.confirm("Delete this path and all of its checkpoints? This can't be undone.")) {
      return;
    }
    await deletePath.run(async () => {
      // 204 on success — no body to read, so success alone is the signal.
      const result = await requestJson<null>(`/api/paths/${path.id}`, { method: "DELETE" });
      if (result.ok) {
        return () => {
          window.location.href = "/paths";
        };
      }
      return () => {
        setMutationError("Couldn't delete the path.");
      };
    });
  }, [path.id, deletePath]);

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
            // At-most-one, enforced by a COMMITTED attribute rather than by a flag the
            // handler reads: `inFlight` lands in the DOM before the request is issued, so
            // the browser refuses the second click instead of the handler having to
            // recognise it from a closure it was already holding.
            disabled={deletePathInFlight}
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
        // `role="alert"` announces the failure to assistive technology, and the `aria-label`
        // gives the banner an addressable NAME — the checkpoint-error and check-error banners
        // further down each render a `<p>` with a byte-identical class string, so without a
        // name the three are indistinguishable to any query. Naming all of them, rather than
        // only the one a spec happened to need, is what kept this surface spec-able when the
        // third banner landed with F-3's repair. See test-plan §6.7 items 1 and 27.
        <p
          role="alert"
          aria-label="Path error"
          className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-3 text-sm text-[#e0867d]"
        >
          {mutationError}
        </p>
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
            // Same at-most-one gate as "Delete path", and here it is the whole repair: a
            // second DELETE would answer 404 on a path the first one just emptied and write
            // that over a delete that succeeded. `path-builder-mutation-ordering.spec.ts`
            // is what keeps this attribute here.
            disabled={deleteLastInFlight}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-foreground text-lg font-semibold">
            {steps.length === 0 ? "Add base deck" : "Add checkpoint"}
          </h2>
          {canDiff ? (
            <div
              className="border-border bg-input inline-flex rounded-[5px] border p-0.5"
              role="group"
              aria-label="Entry mode"
            >
              <button
                type="button"
                aria-pressed={activeMode === "full"}
                // F-4: `switchMode` clears `addState`, which the `add` lane owns, so the
                // toggle is the one uncontrolled control that can wipe an add's own state
                // mid-flight. Disabling it beats invalidating the add — dropping a POST
                // already in flight would save a checkpoint the UI never renders. Gated on
                // the add ALONE: a Check in flight must leave the toggle live.
                disabled={addInFlight}
                onClick={() => {
                  switchMode("full");
                }}
                className={`font-display rounded-[3px] px-3 py-1 text-[11px] tracking-[0.05em] uppercase transition-colors ${
                  activeMode === "full"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Full list
              </button>
              <button
                type="button"
                aria-pressed={activeMode === "diff"}
                // Same gate as its twin above, for the same reason.
                disabled={addInFlight}
                onClick={() => {
                  switchMode("diff");
                }}
                className={`font-display rounded-[3px] px-3 py-1 text-[11px] tracking-[0.05em] uppercase transition-colors ${
                  activeMode === "diff"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Changes
              </button>
            </div>
          ) : null}
        </div>
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
            {activeMode === "diff" ? "Changes (+ to add, − to remove)" : "Deck list"}
          </label>
          <textarea
            id="step-list"
            value={listText}
            onChange={(event) => {
              setListText(event.target.value);
              // F-1: invalidate from the handler that OBSERVES the edit. A branch inside
              // the async worker is downstream of the event — and for the empty-text case
              // unreachable — so this is the only place the invalidation can live. It
              // covers every edit, not just an emptying one. See `lessons.md`, "Clearing
              // an input is not an invalidation event".
              invalidatePreview();
            }}
            placeholder={
              activeMode === "diff"
                ? "+ Black Lotus\n- Sol Ring\n+2 Island\n-1 Forest\n…"
                : "1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…"
            }
            className={textareaClasses}
            spellCheck={false}
          />
        </div>

        {activeMode === "full" && checkState.status === "checked" ? (
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

        {activeMode === "diff" && diffPreview.status === "checked" ? (
          <div className="space-y-3">
            <p className="border-border bg-input text-foreground rounded-md border p-3 text-sm">
              <span className="text-add font-medium">+{diffPreview.result.summary.added} added</span>
              {", "}
              <span className="text-destructive font-medium">−{diffPreview.result.summary.removed} removed</span>
              {", "}
              {diffPreview.result.summary.unchanged} unchanged → {diffPreview.result.summary.total} cards
            </p>
            <details className="border-border bg-input rounded-md border p-3 text-sm">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">
                Derived list ({diffPreview.result.summary.total} cards)
              </summary>
              <pre className="text-foreground mt-2 max-h-60 overflow-auto font-mono text-xs whitespace-pre-wrap">
                {deckCardsToText(diffPreview.result.snapshot.cards)}
              </pre>
            </details>
            <UnresolvedNotice
              entries={toEditableEntries(diffPreview.result.snapshot.unresolved)}
              onAccept={handleDiffAccept}
              onAcceptAll={handleDiffAcceptAll}
              deltaWarnings={diffPreview.result.warnings}
            />
          </div>
        ) : null}

        {checkError !== null ? (
          // The third `role="alert"` banner on this surface, and the reason all three carry
          // an `aria-label`: the class string below matches the other two byte for byte, so
          // the accessible NAME is the only thing that tells a query which banner it found
          // (test-plan §6.7 items 1 and 27). Owned by the Check flows — F-3's repair is
          // exactly that a failed Check no longer writes `addState` below.
          <p
            role="alert"
            aria-label="Check error"
            className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-3 text-sm text-[#e0867d]"
          >
            {checkError}
          </p>
        ) : null}

        {addState.status === "error" ? (
          // Named for the same reason as the two banners it shares a class string with. The
          // distinction is load-bearing beyond locators: both Check flows used to write THIS
          // atom from inside a `checkToken`-guarded catch even though `addToken` was what
          // guarded it, so a message about a failed Check could land here over a checkpoint
          // that saved cleanly (F-3). They write `checkError` above instead, and S3 in
          // `tests/e2e/path-builder-stale-ordering.spec.ts` is what keeps them there.
          <p
            role="alert"
            aria-label="Checkpoint error"
            className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-3 text-sm text-[#e0867d]"
          >
            {addState.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={btnDClass}
            disabled={
              listText.trim() === "" ||
              checkState.status === "checking" ||
              diffPreview.status === "checking" ||
              addState.status === "resolving"
            }
            onClick={() => {
              void (activeMode === "diff" ? runDiffCheck(listText) : runCheck(listText));
            }}
          >
            {(activeMode === "diff" ? diffPreview.status === "checking" : checkState.status === "checking")
              ? "Checking…"
              : "Check"}
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
