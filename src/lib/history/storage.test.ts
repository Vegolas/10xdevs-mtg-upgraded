import { describe, it, expect } from "vitest";
import { parseHistory, serializeHistory } from "./storage";
import { HISTORY_CAP, HISTORY_VERSION } from "./types";
import type { SavedComparison } from "./types";

/** Build a well-formed saved entry. */
function saved(id: string): SavedComparison {
  return { id, baseText: "1 Sol Ring", targetText: "1 Island", savedAt: 1, summary: { addCount: 1, removeCount: 0 } };
}

describe("parseHistory", () => {
  it("returns [] for null or empty input", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory("")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseHistory("{not json")).toEqual([]);
  });

  it("returns [] when the version does not match", () => {
    const raw = JSON.stringify({ version: HISTORY_VERSION + 1, items: [saved("a")] });

    expect(parseHistory(raw)).toEqual([]);
  });

  it("returns [] when items is missing or not an array", () => {
    expect(parseHistory(JSON.stringify({ version: HISTORY_VERSION }))).toEqual([]);
    expect(parseHistory(JSON.stringify({ version: HISTORY_VERSION, items: "nope" }))).toEqual([]);
  });

  it("keeps only well-formed items", () => {
    const raw = JSON.stringify({
      version: HISTORY_VERSION,
      items: [saved("good"), { id: "missing-fields" }, { ...saved("bad-type"), savedAt: "not-a-number" }],
    });

    expect(parseHistory(raw).map((item) => item.id)).toEqual(["good"]);
  });

  it("truncates to HISTORY_CAP", () => {
    const items = Array.from({ length: HISTORY_CAP + 5 }, (_, i) => saved(`id-${i}`));
    const raw = JSON.stringify({ version: HISTORY_VERSION, items });

    expect(parseHistory(raw)).toHaveLength(HISTORY_CAP);
  });
});

describe("serializeHistory", () => {
  it("round-trips through parseHistory", () => {
    const items = [saved("a"), saved("b")];

    expect(parseHistory(serializeHistory(items))).toEqual(items);
  });

  it("writes the current version", () => {
    const parsed = JSON.parse(serializeHistory([])) as { version: number };

    expect(parsed.version).toBe(HISTORY_VERSION);
  });
});
