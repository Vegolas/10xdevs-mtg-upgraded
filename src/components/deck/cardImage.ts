/**
 * Thumbnail-URL derivation for the upgrade-plan card images (roadmap S-02).
 *
 * The card-data layer resolves the Scryfall *normal*-size image URL
 * (`Card.imageUrl`), which looks like `https://cards.scryfall.io/normal/<face>/…/x.jpg`.
 * Swapping the `/normal/` path segment for `/small/` yields a ~4× lighter image
 * (146×204, ~15KB) — the right size for an inline thumbnail. The swap is fail-soft:
 * a URL without that segment is returned unchanged so the `<img>` src is never
 * broken, and null (no resolved image) passes straight through to the placeholder.
 */
export function thumbnailSrc(imageUrl: string | null): string | null {
  if (imageUrl === null) {
    return null;
  }

  // String.replace swaps only the first occurrence; an absent segment is a no-op.
  return imageUrl.replace("/normal/", "/small/");
}
