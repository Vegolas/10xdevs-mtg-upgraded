/**
 * Diff-mode delta parsing (diff-style-checkpoint-entry).
 *
 * Turns diff-mode text — signed `+ <card>` / `- <card>` lines — into structured,
 * quantity-tagged {@link DeltaEntry} entries. The sign is stripped and the
 * remainder handed to {@link splitCardLine} (the SAME line splitter the full-paste
 * parser and the accept-rewrite share), so count parsing — bare → 1, `2`/`2x` → 2
 * — can never drift from `parseDeckList`. Blank and comment lines are skipped; a
 * line with no leading sign, or a sign with no card name, is recorded in
 * `malformed`. See context/changes/diff-style-checkpoint-entry/plan.md.
 */

import { resolutionKey } from "@/lib/card-data";
import { splitCardLine } from "@/lib/deck/parse";

/** Leading sign + the whitespace gap after it on a delta line, e.g. `+`, `+ `, `-`. */
const DELTA_SIGN = /^([+-])(\s*)(.*)$/;

/** One parsed diff line: an add/remove op, a card name, and a copy count. */
export interface DeltaEntry {
  op: "+" | "-";
  name: string;
  quantity: number;
}

/** Result of parsing diff-mode text: structured entries plus unreadable lines. */
export interface ParsedDelta {
  /** Signed entries in first-seen order; duplicate lines are kept separate. */
  entries: DeltaEntry[];
  /** Non-blank, non-comment lines that carried no sign, or a sign with no name. */
  malformed: string[];
}

/** True when a trimmed line is a comment (`#…` or `//…`) — mirrors parse.ts. */
function isComment(line: string): boolean {
  return line.startsWith("#") || line.startsWith("//");
}

/**
 * Parse diff-mode text into signed, quantity-tagged {@link DeltaEntry} entries.
 *
 * Blank and comment lines are skipped. Every other line must start with `+` or
 * `-`; the sign is stripped and the remainder delegated to {@link splitCardLine},
 * which yields the verbatim count prefix and trimmed name. Quantity is derived
 * from the prefix exactly as `parseDeckList` does (bare → 1, `2`/`2x` → 2). A line
 * with no leading sign, or a sign whose remainder is not a card name (sign alone,
 * a count with no name), is recorded in `malformed`.
 */
export function parseDeltaList(text: string): ParsedDelta {
  const entries: DeltaEntry[] = [];
  const malformed: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || isComment(line)) {
      continue;
    }

    const sign = line[0];
    if (sign !== "+" && sign !== "-") {
      malformed.push(line);
      continue;
    }

    const split = splitCardLine(line.slice(1));
    if (split === null) {
      malformed.push(line);
      continue;
    }

    const quantity = Number.parseInt(split.prefix, 10);
    entries.push({ op: sign, name: split.name, quantity: quantity > 0 ? quantity : 1 });
  }

  return { entries, malformed };
}

/**
 * Rewrite every diff line whose card name matches `targetName` (by
 * {@link resolutionKey}) to its accepted `suggestion`, preserving the leading
 * sign, the gap after it, and the verbatim count prefix — the diff-mode sibling
 * of `@/lib/deck`'s `applySuggestion`, which can't be reused because it matches
 * the sign as part of the card name. So `+ Blck Lotus` → `+ Black Lotus` and
 * `-2 Forrest` → `-2 Forest`. Blank, comment, and non-delta lines, and lines
 * whose name does not match, are returned verbatim. Line endings normalize to
 * `\n`.
 */
export function applyDeltaSuggestion(text: string, targetName: string, suggestion: string): string {
  const targetKey = resolutionKey(targetName);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const signed = DELTA_SIGN.exec(line.trim());
      if (signed === null) {
        return line;
      }
      const [, sign, gap, rest] = signed;
      const split = splitCardLine(rest);
      if (split === null || resolutionKey(split.name) !== targetKey) {
        return line;
      }
      return `${sign}${gap}${split.prefix}${suggestion}`;
    })
    .join("\n");
}

/**
 * Apply every suggestion-bearing entry to a diff-mode text in one pass — the
 * diff-mode sibling of `@/lib/deck`'s `applyAllSuggestions`. Folds
 * {@link applyDeltaSuggestion} over each entry whose `suggestion` is non-null
 * (skipping ambiguous/malformed entries with no near match). Pure.
 */
export function applyAllDeltaSuggestions(text: string, entries: { name: string; suggestion: string | null }[]): string {
  let next = text;

  for (const entry of entries) {
    if (entry.suggestion === null) {
      continue;
    }
    next = applyDeltaSuggestion(next, entry.name, entry.suggestion);
  }

  return next;
}
