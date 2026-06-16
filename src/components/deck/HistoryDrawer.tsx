import { useEffect, useRef, useState } from "react";
import { History, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedComparison } from "@/lib/history";

interface HistoryDrawerProps {
  open: boolean;
  items: SavedComparison[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

/** Format a saved-at epoch as a short, locale-aware date + time label. */
function formatSavedAt(savedAt: number): string {
  return new Date(savedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Right-side slide-over listing saved comparisons. Clicking a row restores it
 * (the parent refills the textareas and the debounce rebuilds the plan); each
 * row can be deleted, and Clear all empties the list behind a two-click confirm.
 * Escape and a backdrop click close the drawer; focus moves to the close button
 * on open and returns to the opener on close.
 */
export function HistoryDrawer({ open, items, onClose, onRestore, onDelete, onClearAll }: HistoryDrawerProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close history" className="absolute inset-0 bg-black/60" onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Saved comparisons"
        className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-900 shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <History className="size-4" />
            Saved comparisons ({items.length})
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </header>

        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-blue-100/50">
            No saved comparisons yet. Build a plan, then use Save this comparison.
          </p>
        ) : (
          <ul className="flex-1 space-y-1 overflow-y-auto p-3">
            {items.map((item) => (
              <li key={item.id}>
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 transition-colors hover:border-purple-400/40 hover:bg-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      onRestore(item.id);
                    }}
                    className="flex-1 px-3 py-2 text-left"
                  >
                    <span className="block text-sm font-medium text-white">{formatSavedAt(item.savedAt)}</span>
                    <span className="block text-xs text-blue-100/60">
                      +{item.summary.addCount} / −{item.summary.removeCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete saved comparison"
                    onClick={() => {
                      onDelete(item.id);
                    }}
                    className="mr-2 rounded-md p-1.5 text-blue-100/50 transition-colors hover:bg-red-500/20 hover:text-red-200"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 ? (
          <footer className="border-t border-white/10 p-3">
            {confirmingClear ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onClearAll();
                    setConfirmingClear(false);
                  }}
                >
                  Confirm clear all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setConfirmingClear(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setConfirmingClear(true);
                }}
              >
                <Trash2 className="size-4" />
                Clear all
              </Button>
            )}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
