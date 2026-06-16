import { CircleAlert } from "lucide-react";
import type { UnresolvedEntry } from "@/lib/deck";
import type { UnresolvedReason } from "@/lib/card-data";
import { Button } from "@/components/ui/button";

interface UnresolvedNoticeProps {
  entries: UnresolvedEntry[];
  /** Accept one entry's fuzzy suggestion, rewriting its source line(s). */
  onAccept: (entry: UnresolvedEntry) => void;
  /** Accept every suggestion-bearing entry at once. */
  onAcceptAll: () => void;
}

/** Short human phrasing for each reason an input failed to resolve. */
const REASON_LABELS: Record<UnresolvedReason, string> = {
  "not-found": "not found",
  ambiguous: "ambiguous name",
  malformed: "couldn't read",
};

/** Accept-button styling tuned to the red notice palette (mirrors Retry). */
const acceptButtonClasses =
  "h-6 border-red-400/40 bg-transparent px-2 text-red-100 hover:bg-red-500/10 hover:text-white";

/**
 * Lists the inputs that did not become real cards (typos, malformed lines,
 * ambiguous names) so the partial plan never silently drops them. When the
 * resolver offered a fuzzy match, it surfaces as a "did you mean …?" hint with a
 * one-click **Accept** that rewrites the source line; an **Accept all (N)**
 * control appears when two or more entries carry a suggestion. Entries with no
 * suggestion stay inert.
 */
export function UnresolvedNotice({ entries, onAccept, onAcceptAll }: UnresolvedNoticeProps) {
  const suggestionCount = entries.filter((entry) => entry.suggestion).length;

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-200">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium text-red-300">
          <CircleAlert className="size-4 shrink-0" />
          {entries.length === 1 ? "1 card couldn't be matched" : `${entries.length} cards couldn't be matched`}
        </p>
        {suggestionCount >= 2 ? (
          <Button type="button" variant="outline" size="sm" className={acceptButtonClasses} onClick={onAcceptAll}>
            Accept all ({suggestionCount})
          </Button>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1">
        {entries.map((entry, index) => (
          <li key={`${entry.deck}-${entry.name}-${index}`}>
            <span className="font-medium text-red-100">{entry.name}</span>
            <span className="text-red-200/70">
              {" "}
              ({entry.deck}, {REASON_LABELS[entry.reason]})
            </span>
            {entry.suggestion ? (
              <>
                <span className="text-red-200/90">
                  {" "}
                  — did you mean <strong className="text-red-100">{entry.suggestion}</strong>?
                </span>{" "}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={acceptButtonClasses}
                  aria-label={`Accept ${entry.suggestion} for ${entry.name}`}
                  onClick={() => {
                    onAccept(entry);
                  }}
                >
                  Accept
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
