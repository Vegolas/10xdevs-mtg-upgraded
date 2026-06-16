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

/**
 * Leading-count card line: "1 Sol Ring", "4x Forest". Captures the *verbatim*
 * count prefix (group 1, e.g. "4x ") and the name (group 2), so a rewrite can
 * restore the exact prefix the user typed. See {@link splitCardLine}.
 */
const COUNTED_LINE = /^(\d+\s*x?\s+)(.+)$/i;

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
 * Classify one deck-list line and, for card lines, split it into the verbatim
 * leading count prefix and the trimmed card name.
 *
 * Returns `null` for every line {@link parseDeckList} drops or rejects — blank,
 * comment, section header, or count-only — and `{ prefix, name }` for a card
 * line, where `prefix` is the literal count prefix exactly as written ("1 ",
 * "4x ", or "" for a bare name) and `name` is the trimmed card name. This is the
 * single definition of "what is a card line and where does the name start",
 * shared by the parser and the accept rewrite (`@/lib/deck`'s `applySuggestion`)
 * so the two can never drift. Rewriting a matched line as `prefix + <new name>`
 * preserves the user's exact count prefix.
 */
export function splitCardLine(line: string): { prefix: string; name: string } | null {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }
  if (isComment(trimmed)) {
    return null;
  }
  if (isSectionHeader(trimmed)) {
    return null;
  }
  if (COUNT_ONLY_LINE.test(trimmed)) {
    return null;
  }

  const counted = COUNTED_LINE.exec(trimmed);
  if (counted) {
    const [, prefix, namePart] = counted;
    return { prefix, name: namePart.trim() };
  }

  return { prefix: "", name: trimmed };
}

/**
 * Parse pasted deck-list text into structured entries.
 *
 * Blank lines, comments, and section headers are skipped. Each remaining line
 * becomes a {@link DeckEntry}: a leading count ("3 Llanowar Elves", "3x ...") is
 * split into quantity + name, and a bare "Sol Ring" defaults to quantity 1. A
 * line that carries a count but no name ("4", "4x") is recorded in `malformed`.
 * Card-line classification and name extraction are delegated to
 * {@link splitCardLine}; the count-only → `malformed` routing stays here because
 * it is the parser's own concern (the rewrite simply leaves such lines alone).
 */
export function parseDeckList(text: string): ParsedDeck {
  const entries: DeckEntry[] = [];
  const malformed: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line !== "" && COUNT_ONLY_LINE.test(line)) {
      malformed.push(line);
      continue;
    }

    const split = splitCardLine(line);
    if (split === null) {
      continue; // blank, comment, or section header
    }

    const quantity = Number.parseInt(split.prefix, 10);
    entries.push({ name: split.name, quantity: quantity > 0 ? quantity : 1 });
  }

  return { entries, malformed };
}
