/**
 * The app's one definition of "is this async run still the newest?".
 *
 * Every island that awaits and then writes state needs the same guard: a run
 * that was superseded while it was in flight must not land. Before this module
 * that guard was hand-copied across five flows and missing from three more, and
 * `context/foundation/lessons.md` ("Treat the stale-response guard as five hand
 * copies, not one pattern") records four verified ways the copies had already
 * drifted — different checkpoint counts per flow, two counters unevenly shared,
 * the error path guarded by different means in each component, and writes
 * landing on an atom the flow's own counter did not own.
 *
 * Deliberately React-free and DOM-free so the semantics can be unit-tested at
 * the `node` layer — the pattern `sortStorage.ts` / `useSortMode.ts` already
 * establishes. `useLatestRun.ts` is the only intended consumer; components go
 * through the hook, never through this. See
 * context/changes/shared-stale-response-guard/plan.md.
 */

/**
 * A run's claim on its lane, issued by {@link LatestRun.begin}.
 *
 * Opaque and identity-compared: a fresh symbol per run rather than a counter
 * value. That is what makes lane isolation structural rather than conventional
 * — a token minted by one lane can never read as current in another, so
 * handing the wrong lane's token to `isCurrent` cannot silently guard nothing.
 * A caller also cannot fabricate one, which is why the type is exported but
 * never constructed outside this module.
 */
export type RunToken = symbol;

/** One lane's staleness state: which run, if any, is still allowed to write. */
export interface LatestRun {
  /** Start a run and take its token. Supersedes whatever was outstanding. */
  begin(): RunToken;
  /** Is `token` the newest claim this lane issued? */
  isCurrent(token: RunToken): boolean;
  /** Supersede whatever is outstanding without starting a run. */
  invalidate(): void;
}

/**
 * Make an independent lane. One per flow — the two-counters-unevenly-shared
 * divergence above is what happens when lanes are pooled by hand.
 *
 * The initial token belongs to no run, so `isCurrent` answers `false` for
 * every token until `begin` has issued one.
 */
export function createLatestRun(): LatestRun {
  let latest: RunToken = Symbol("latestRun.initial");

  return {
    begin(): RunToken {
      latest = Symbol("latestRun.run");
      return latest;
    },
    isCurrent(token: RunToken): boolean {
      return token === latest;
    },
    invalidate(): void {
      latest = Symbol("latestRun.invalidated");
    },
  };
}
