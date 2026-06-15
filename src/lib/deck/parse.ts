/**
 * Deck-list text parsing (roadmap S-01).
 *
 * Turns pasted deck-list text into clean {name, quantity} entries, dropping the
 * blank lines, comments, and section headers common to Moxfield / Archidekt /
 * plain-text exports so they never become bogus "unrecognized card" errors.
 *
 * Scope is the common core: `N Name`, `Nx Name`, and bare `Name`. Set-code /
 * collector-number suffixes (Arena / MTGO, e.g. "Sol Ring (LTC) 280") are left
 * on the name on purpose — they surface downstream as unresolved cards rather
 * than being silently rewritten. See
 * context/changes/grouped-upgrade-plan/plan.md.
 */

/** One parsed deck-list line: a card name and how many copies were listed. */
export interface DeckEntry {
  name: string;
  quantity: number;
}

/** Result of parsing a deck list: clean entries plus lines we could not read. */
export interface ParsedDeck {
  /** Card entries in first-seen order; duplicate lines are kept separate. */
  entries: DeckEntry[];
  /** Non-empty, non-comment lines that yielded no card name. */
  malformed: string[];
}

/**
 * Section-header keywords (case-insensitive) that appear as standalone lines in
 * deck-site exports. A header may carry a parenthesized count, e.g. "Deck (99)".
 */
const SECTION_HEADERS: ReadonlySet<string> = new Set(["commander", "deck", "sideboard", "maybeboard", "companion"]);

/** Leading-count card line: "1 Sol Ring", "4x Forest". Captures count + name. */
const COUNTED_LINE = /^(\d+)\s*x?\s+(.+)$/i;

/** A line that is only a count ("4", "4x") — a malformed card entry. */
const COUNT_ONLY_LINE = /^\d+\s*x?$/i;

/** Trailing " (123)" count attached to a section header. */
const HEADER_COUNT_SUFFIX = /\s*\(\d+\)\s*$/;

/** True when a trimmed line is a comment (`#…` or `//…`). */
function isComment(line: string): boolean {
  return line.startsWith("#") || line.startsWith("//");
}

/** True when a trimmed line is a section header, with optional "(N)" suffix. */
function isSectionHeader(line: string): boolean {
  const withoutCount = line.replace(HEADER_COUNT_SUFFIX, "").trim();
  return SECTION_HEADERS.has(withoutCount.toLowerCase());
}

/**
 * Parse pasted deck-list text into structured entries.
 *
 * Blank lines, comments, and section headers are skipped. Each remaining line
 * becomes a {@link DeckEntry}: a leading count ("3 Llanowar Elves", "3x ...") is
 * split into quantity + name, and a bare "Sol Ring" defaults to quantity 1. A
 * line that carries a count but no name ("4", "4x") is recorded in `malformed`.
 */
export function parseDeckList(text: string): ParsedDeck {
  const entries: DeckEntry[] = [];
  const malformed: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    if (isComment(line)) {
      continue;
    }
    if (isSectionHeader(line)) {
      continue;
    }
    if (COUNT_ONLY_LINE.test(line)) {
      malformed.push(line);
      continue;
    }

    const counted = COUNTED_LINE.exec(line);
    if (counted) {
      const [, countText, namePart] = counted;
      const quantity = Number.parseInt(countText, 10);
      entries.push({ name: namePart.trim(), quantity: quantity > 0 ? quantity : 1 });
      continue;
    }

    entries.push({ name: line, quantity: 1 });
  }

  return { entries, malformed };
}
