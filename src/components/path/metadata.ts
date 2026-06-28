import type { UpgradePath } from "@/lib/path";

/**
 * Presentational helpers for a saved path's metadata line — shared by the detail
 * subtitle (`PathEditor`), the static visitor chrome (`VisitorView`), and the
 * saved-decks grid (Phase 7) so a path reads identically everywhere. Pure display
 * formatting; no engine math (counts/cost come from `overallPathSummary`).
 */

/** Format a stored ISO timestamp as a short calendar date (e.g. `"Mar 14, 2026"`). */
export function formatSavedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Icon + word for a path's visibility — `"🔒 private"` / `"◐ unlisted"`. */
export function visibilityLabel(visibility: UpgradePath["visibility"]): string {
  return visibility === "private" ? "🔒 private" : "◐ unlisted";
}
