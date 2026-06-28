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

/** Accept-button styling tuned to the v3 red notice palette (`btnR`). */
const acceptButtonClasses =
  "font-display h-6 border-[#6e3a33] bg-[#2a1714] px-2 text-[10px] uppercase tracking-[0.05em] text-[#e0867d] hover:bg-[#3a201b] hover:text-[#f0a89f]";

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
    <div className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-4 text-sm text-[#b5847e]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-destructive flex items-center gap-2 font-semibold">
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
            <span className="font-medium text-[#e8b0a8]">{entry.name}</span>
            <span className="text-[#8a6058]">
              {" "}
              ({entry.deck}, {REASON_LABELS[entry.reason]})
            </span>
            {entry.suggestion ? (
              <>
                <span className="text-[#b5847e]">
                  {" "}
                  — did you mean <strong className="text-[#e8b0a8]">{entry.suggestion}</strong>?
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
