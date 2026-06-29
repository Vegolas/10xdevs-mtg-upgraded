import { CircleAlert } from "lucide-react";
import type { UnresolvedEntry } from "@/lib/deck";
import type { UnresolvedReason } from "@/lib/card-data";
import { Button } from "@/components/ui/button";

/**
 * A diff-mode line that couldn't be applied — display-only provenance for the
 * path builder's preview. Decoupled from `@/lib/path`'s `DeltaWarning` on purpose
 * (this shared notice stays free of path-module types); the two shapes match, so
 * a caller passes its warnings straight through.
 */
export interface DeltaWarningDisplay {
  line: string;
  reason: "not-in-prior" | "malformed";
}

interface UnresolvedNoticeProps {
  entries: UnresolvedEntry[];
  /** Accept one entry's fuzzy suggestion, rewriting its source line(s). */
  onAccept: (entry: UnresolvedEntry) => void;
  /** Accept every suggestion-bearing entry at once. */
  onAcceptAll: () => void;
  /** Diff-mode lines that couldn't be applied (no-op `-`/malformed); display-only. */
  deltaWarnings?: DeltaWarningDisplay[];
}

/** Short human phrasing for each reason an input failed to resolve. */
const REASON_LABELS: Record<UnresolvedReason, string> = {
  "not-found": "not found",
  ambiguous: "ambiguous name",
  malformed: "couldn't read",
};

/** Short human phrasing for each reason a diff line couldn't be applied. */
const DELTA_REASON_LABELS: Record<DeltaWarningDisplay["reason"], string> = {
  "not-in-prior": "not in previous list",
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
export function UnresolvedNotice({ entries, onAccept, onAcceptAll, deltaWarnings = [] }: UnresolvedNoticeProps) {
  const suggestionCount = entries.filter((entry) => entry.suggestion).length;
  const hasEntries = entries.length > 0;
  const hasWarnings = deltaWarnings.length > 0;

  if (!hasEntries && !hasWarnings) {
    return null;
  }

  return (
    <div className="rounded-md border border-[#6e3a33] bg-[#2a1714] p-4 text-sm text-[#b5847e]">
      {hasEntries ? (
        <>
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
        </>
      ) : null}

      {hasWarnings ? (
        <div className={hasEntries ? "mt-3 border-t border-[#6e3a33] pt-3" : ""}>
          <p className="text-destructive flex items-center gap-2 font-semibold">
            <CircleAlert className="size-4 shrink-0" />
            {deltaWarnings.length === 1
              ? "1 change couldn't be applied"
              : `${deltaWarnings.length} changes couldn't be applied`}
          </p>
          <ul className="mt-2 space-y-1">
            {deltaWarnings.map((warning, index) => (
              <li key={`${warning.line}-${index}`}>
                <span className="font-mono font-medium text-[#e8b0a8]">{warning.line}</span>
                <span className="text-[#8a6058]"> ({DELTA_REASON_LABELS[warning.reason]})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
