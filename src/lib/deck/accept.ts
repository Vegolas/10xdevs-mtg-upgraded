/**
 * "Did you mean …?" inline accept (roadmap S-05).
 *
 * Pure text rewrite behind the one-click accept: when the resolver offered a
 * fuzzy `suggestion` for an unresolved name, substitute the canonical suggestion
 * back into the deck-list text the user pasted. The paste text is the single
 * source of truth — the plan auto-rebuilds ~700ms after it settles — so an
 * in-place rewrite rides every existing data path (debounce, history
 * save/restore) for free, with no new orchestration.
 *
 * Lines are matched by {@link resolutionKey} — the SAME identity key the resolver
 * dedups misses on — not by raw substring. Two consequences fall out for free:
 * the resolver collapses a repeated typo (even across letter case) into one
 * unresolved entry, and matching on the key rewrites *every* source line that
 * entry stood for; and `Forest` never mis-hits inside `Snow-Covered Forest`. The
 * verbatim count prefix is preserved via {@link splitCardLine} (so `4x Sol Rng`
 * → `4x Sol Ring`, not `4 Sol Ring`), and non-card lines (blank, comment,
 * section header, count-only) are left untouched.
 */

import { resolutionKey } from "@/lib/card-data";
import { splitCardLine } from "./parse";
import type { UnresolvedEntry } from "./plan";

/**
 * Rewrite every deck-list line whose card name matches `targetName` (by
 * {@link resolutionKey}) to `<verbatim count prefix><suggestion>`.
 *
 * Non-card lines and lines whose name does not match are returned verbatim. The
 * accepted `suggestion` is Scryfall's canonical name, so the rewritten line
 * resolves cleanly on the next rebuild; if it still doesn't, it simply reappears
 * in the notice — no loop, no special handling. Line endings are normalized to
 * `\n` on output.
 */
export function applySuggestion(text: string, targetName: string, suggestion: string): string {
  const targetKey = resolutionKey(targetName);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const split = splitCardLine(line);
      if (split === null) {
        return line;
      }
      if (resolutionKey(split.name) !== targetKey) {
        return line;
      }
      return `${split.prefix}${suggestion}`;
    })
    .join("\n");
}

/**
 * Apply every suggestion-bearing unresolved entry to its own deck's text in one
 * pass: base entries fold over `baseText`, target entries over `targetText`.
 *
 * Entries with `suggestion: null` (ambiguous / malformed, no near match) are
 * skipped. Returns both rewritten texts so the caller can set them together and
 * trigger a single rebuild.
 */
export function acceptAllSuggestions(
  baseText: string,
  targetText: string,
  entries: UnresolvedEntry[],
): { baseText: string; targetText: string } {
  let nextBase = baseText;
  let nextTarget = targetText;

  for (const entry of entries) {
    if (entry.suggestion === null) {
      continue;
    }
    if (entry.deck === "base") {
      nextBase = applySuggestion(nextBase, entry.name, entry.suggestion);
    } else {
      nextTarget = applySuggestion(nextTarget, entry.name, entry.suggestion);
    }
  }

  return { baseText: nextBase, targetText: nextTarget };
}
