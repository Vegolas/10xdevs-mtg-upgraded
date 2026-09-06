import { useCallback, useMemo, useState } from "react";
import { createLatestRun } from "./latestRun";
import type { LatestRun } from "./latestRun";

/**
 * One lane's guarded-async runner, as an island consumes it.
 *
 * The shape is deliberately not "call this, then re-check a token yourself".
 * `context/foundation/lessons.md` records that the hand-copied guards drifted
 * first on **checkpoint count** — one flow re-checked once, another four times,
 * and adding an `await` to any of them silently opened an unguarded window.
 * Here the work returns the writes it wants applied and the hook decides
 * whether to apply them, so a flow has no checkpoint count to get wrong: it
 * does not write state at all.
 *
 * See context/changes/shared-stale-response-guard/plan.md.
 */

/**
 * The writes a run wants applied once it is known to be current, or `null` for
 * "this run has nothing to say". `null` is the ordinary outcome for a flow that
 * bailed early — it is not an error signal.
 */
export type Commit = (() => void) | null;

/**
 * A lane's two controls, stable for the component's lifetime.
 *
 * Separate from the `inFlight` flag on purpose, and the separation is
 * load-bearing rather than cosmetic. `inFlight` is state, so anything holding
 * it is a fresh reference on every render — and a dep array holding that
 * reference re-runs its effect on every render. The comparer's debounce effect
 * (`DeckComparer.tsx:86-101`) depends on its runner, so bundling the two would
 * make it re-register a 700ms timer on each render, including the renders
 * `inFlight` itself causes: plan resolves → render → new timer → plan runs
 * again, forever. Handing the controls back separately makes that
 * unrepresentable instead of leaving it to a convention at eight call sites.
 */
export interface RunControls {
  /**
   * Run `work` on this lane and apply its commit only if the run is still the
   * newest one here.
   *
   * `work` **must not reject**: convert failures into a commit that writes the
   * error state, the way every call site already does with its own `try` /
   * `catch`. The hook clears the in-flight flag in a `finally` but does not
   * swallow, so an unexpected rejection surfaces exactly as it does without the
   * hook rather than becoming a silently wedged trigger.
   */
  run(work: () => Promise<Commit>): Promise<void>;
  /**
   * Supersede whatever is outstanding. Call this from the event that made the
   * run stale — the handler that *observes* the change, never a branch inside
   * the async worker downstream of it (`lessons.md`, "Clearing an input is not
   * an invalidation event").
   */
  invalidate(): void;
}

/**
 * `[inFlight, controls]` for one lane. One instance per flow, never shared:
 * pooling lanes by hand is the divergence `lessons.md` records as "two
 * counters, unevenly shared".
 *
 * `inFlight` is true while a run started here has not settled. Drive a
 * trigger's `disabled` from it to get the at-most-one-in-flight discipline;
 * ignore it for latest-wins.
 */
export type GuardedRun = readonly [inFlight: boolean, controls: RunControls];

export function useLatestRun(): GuardedRun {
  // Lazily initialised through useState rather than a ref: the lane has to
  // outlive every render and be created exactly once, and reading or writing a
  // ref during render is what `react-hooks/refs` forbids. The setter is
  // deliberately dropped — this value is never replaced.
  const [lane] = useState<LatestRun>(createLatestRun);
  const [inFlight, setInFlight] = useState(false);

  const run = useCallback(
    async (work: () => Promise<Commit>): Promise<void> => {
      const token = lane.begin();
      setInFlight(true);
      try {
        const commit = await work();
        if (!lane.isCurrent(token)) {
          return;
        }
        commit?.();
      } finally {
        // Only the newest run may clear the flag. A superseded run that
        // finishes later must not re-enable a trigger the run that replaced it
        // is still holding down.
        if (lane.isCurrent(token)) {
          setInFlight(false);
        }
      }
    },
    [lane],
  );

  const invalidate = useCallback(() => {
    lane.invalidate();
    // Nothing outstanding may write, so nothing outstanding is holding the
    // trigger either.
    setInFlight(false);
  }, [lane]);

  // `lane` never changes, so both callbacks are stable and this object is too.
  const controls = useMemo<RunControls>(() => ({ run, invalidate }), [run, invalidate]);

  return [inFlight, controls];
}
