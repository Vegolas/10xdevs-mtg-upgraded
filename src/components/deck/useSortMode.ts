import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SORT_MODE } from "./sort";
import type { SortMode } from "./sort";
import { loadSortMode, saveSortMode } from "./sortStorage";

/** The live sort preference plus its setter, as the DeckComparer island consumes it. */
export interface SortModeStore {
  mode: SortMode;
  setMode: (mode: SortMode) => void;
}

/**
 * Module-level external store backing the global sort preference, read via
 * useSyncExternalStore. Modeling it as a store (mirroring useDeckHistory) keeps
 * localStorage out of render and out of effects: the server/hydration snapshot is
 * always the grouped default, and the real stored value is read lazily on the
 * client after mount — so there is no hydration mismatch and no setState-in-effect.
 * The cached `snapshot` reference is stable between mutations so the store never
 * loops. See context/changes/sortable-card-rows/plan.md.
 */
let snapshot: SortMode | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): SortMode {
  snapshot ??= loadSortMode();
  return snapshot;
}

function getServerSnapshot(): SortMode {
  return DEFAULT_SORT_MODE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace the snapshot, persist it, and notify subscribers. */
function setSnapshot(next: SortMode): void {
  snapshot = next;
  saveSortMode(next);
  for (const listener of listeners) {
    listener();
  }
}

export function useSortMode(): SortModeStore {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback((next: SortMode) => {
    setSnapshot(next);
  }, []);

  return { mode, setMode };
}
