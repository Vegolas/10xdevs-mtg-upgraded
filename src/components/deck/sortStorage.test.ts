import { describe, it, expect } from "vitest";
import { DEFAULT_SORT_MODE } from "./sort";
import type { SortMode } from "./sort";
import { parseSortMode, serializeSortMode, SORT_VERSION } from "./sortStorage";

/** A well-formed, non-default preference, so round-trips prove real values survive. */
const validMode: SortMode = { layout: "flat", key: "price", direction: "desc" };

describe("parseSortMode", () => {
  it("returns the default for null or empty input", () => {
    expect(parseSortMode(null)).toEqual(DEFAULT_SORT_MODE);
    expect(parseSortMode("")).toEqual(DEFAULT_SORT_MODE);
  });

  it("returns the default for corrupt JSON", () => {
    expect(parseSortMode("{not json")).toEqual(DEFAULT_SORT_MODE);
  });

  it("returns the default when the version does not match", () => {
    const raw = JSON.stringify({ version: SORT_VERSION + 1, mode: validMode });

    expect(parseSortMode(raw)).toEqual(DEFAULT_SORT_MODE);
  });

  it("returns the default for out-of-range field values", () => {
    const badLayout = JSON.stringify({ version: SORT_VERSION, mode: { ...validMode, layout: "sideways" } });
    const badKey = JSON.stringify({ version: SORT_VERSION, mode: { ...validMode, key: "color" } });
    const badDirection = JSON.stringify({ version: SORT_VERSION, mode: { ...validMode, direction: "up" } });

    expect(parseSortMode(badLayout)).toEqual(DEFAULT_SORT_MODE);
    expect(parseSortMode(badKey)).toEqual(DEFAULT_SORT_MODE);
    expect(parseSortMode(badDirection)).toEqual(DEFAULT_SORT_MODE);
  });

  it("returns the default when mode is missing or not an object", () => {
    expect(parseSortMode(JSON.stringify({ version: SORT_VERSION }))).toEqual(DEFAULT_SORT_MODE);
    expect(parseSortMode(JSON.stringify({ version: SORT_VERSION, mode: "nope" }))).toEqual(DEFAULT_SORT_MODE);
  });

  it("round-trips a valid envelope, stripping extra fields", () => {
    const raw = serializeSortMode(validMode);

    expect(parseSortMode(raw)).toEqual(validMode);
  });
});

describe("serializeSortMode", () => {
  it("writes the current version", () => {
    const parsed = JSON.parse(serializeSortMode(DEFAULT_SORT_MODE)) as { version: number };

    expect(parsed.version).toBe(SORT_VERSION);
  });
});
