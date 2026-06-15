import { describe, it, expect } from "vitest";
import { thumbnailSrc } from "./cardImage";

describe("thumbnailSrc", () => {
  it("returns null when no image resolved", () => {
    expect(thumbnailSrc(null)).toBeNull();
  });

  it("swaps the /normal/ path segment for /small/", () => {
    expect(thumbnailSrc("https://cards.scryfall.io/normal/front/a/b/abc123.jpg?1559")).toBe(
      "https://cards.scryfall.io/small/front/a/b/abc123.jpg?1559",
    );
  });

  it("only rewrites the first /normal/ segment", () => {
    expect(thumbnailSrc("https://cards.scryfall.io/normal/front/n/normal.jpg")).toBe(
      "https://cards.scryfall.io/small/front/n/normal.jpg",
    );
  });

  it("returns the original url unchanged when no /normal/ segment is present", () => {
    const url = "https://cards.scryfall.io/large/front/a/b/abc123.jpg";
    expect(thumbnailSrc(url)).toBe(url);
  });
});
