import { CircleAlert } from "lucide-react";
import type { UnresolvedEntry } from "@/lib/deck";
import type { UnresolvedReason } from "@/lib/card-data";

interface UnresolvedNoticeProps {
  entries: UnresolvedEntry[];
}

/** Short human phrasing for each reason an input failed to resolve. */
const REASON_LABELS: Record<UnresolvedReason, string> = {
  "not-found": "not found",
  ambiguous: "ambiguous name",
  malformed: "couldn't read",
};

/**
 * Lists the inputs that did not become real cards (typos, malformed lines,
 * ambiguous names) so the partial plan never silently drops them. When the
 * resolver offered a fuzzy match, it surfaces as a "did you mean …?" hint.
 */
export function UnresolvedNotice({ entries }: UnresolvedNoticeProps) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-200">
      <p className="flex items-center gap-2 font-medium text-red-300">
        <CircleAlert className="size-4 shrink-0" />
        {entries.length === 1 ? "1 card couldn't be matched" : `${entries.length} cards couldn't be matched`}
      </p>
      <ul className="mt-2 space-y-1">
        {entries.map((entry, index) => (
          <li key={`${entry.deck}-${entry.name}-${index}`}>
            <span className="font-medium text-red-100">{entry.name}</span>
            <span className="text-red-200/70">
              {" "}
              ({entry.deck}, {REASON_LABELS[entry.reason]})
            </span>
            {entry.suggestion ? (
              <span className="text-red-200/90">
                {" "}
                — did you mean <strong className="text-red-100">{entry.suggestion}</strong>?
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
