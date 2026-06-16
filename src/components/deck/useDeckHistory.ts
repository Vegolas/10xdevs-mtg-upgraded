import { useCallback, useSyncExternalStore } from "react";
import type { UpgradePlan } from "@/lib/deck";
import {
  addComparison,
  clearComparisons,
  deleteComparison,
  loadHistory,
  makeComparison,
  saveHistory,
} from "@/lib/history";
import type { SavedComparison } from "@/lib/history";

/** Saved-history state plus the mutators the DeckComparer island drives. */
export interface DeckHistory {
  items: SavedComparison[];
  save: (baseText: string, targetText: string, plan: UpgradePlan) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * Module-level external store backing the on-device history, read via
 * useSyncExternalStore. Modeling it as a store keeps localStorage out of render
 * and out of effects: the server/hydration snapshot is always empty, and the
 * real localStorage value is read lazily on the client after mount, so there is
 * no hydration mismatch. The cached `snapshot` reference is stable between
 * mutations so the store never loops. See
 * context/changes/on-device-history/plan.md.
 */
const SERVER_SNAPSHOT: SavedComparison[] = [];
let snapshot: SavedComparison[] | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): SavedComparison[] {
  snapshot ??= loadHistory();
  return snapshot;
}

function getServerSnapshot(): SavedComparison[] {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace the snapshot, persist it, and notify subscribers. */
function setSnapshot(next: SavedComparison[]): void {
  snapshot = next;
  saveHistory(next);
  for (const listener of listeners) {
    listener();
  }
}

export function useDeckHistory(): DeckHistory {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const save = useCallback((baseText: string, targetText: string, plan: UpgradePlan) => {
    const entry = makeComparison(baseText, targetText, plan, crypto.randomUUID(), Date.now());
    setSnapshot(addComparison(getSnapshot(), entry));
  }, []);

  const remove = useCallback((id: string) => {
    setSnapshot(deleteComparison(getSnapshot(), id));
  }, []);

  const clear = useCallback(() => {
    setSnapshot(clearComparisons());
  }, []);

  return { items, save, remove, clear };
}
