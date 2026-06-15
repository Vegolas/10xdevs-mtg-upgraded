# Card Images in the Upgrade Plan — Implementation Plan

## Overview

Surface a Scryfall card image beside every card in the upgrade plan — Remove, Add, and Shared — so the plan reads like an MTG tool rather than a text diff (PRD FR-005, US-01, roadmap S-02). Each card renders a lazy-loaded thumbnail with a hover/focus enlarge for readability; cards with no resolved image fall back to a neutral placeholder tile. This is a pure rendering slice over the already-resolved `Card.imageUrl` — no card-data-layer, API, or state-model changes.

## Current State Analysis

S-01 (`grouped-upgrade-plan`) ships the upgrade plan as **text-only** card lists. The card-row markup is duplicated verbatim in two components:

- [CardGroupColumn.tsx:33-39](src/components/deck/CardGroupColumn.tsx) — the Remove/Add columns.
- [SharedCardsDisclosure.tsx:39-46](src/components/deck/SharedCardsDisclosure.tsx) — the collapsed Shared section.

Both render `group.cards.map(entry => <li>{quantity-prefixed name}</li>)`. They share label/count helpers in [labels.ts](src/components/deck/labels.ts).

The data needed for images is already present: F-01 resolves `Card.imageUrl: string | null` — the Scryfall **`normal`**-size URL, front face for multi-faced cards ([normalize.ts:14-30](src/lib/card-data/normalize.ts), [types.ts:21-34](src/lib/card-data/types.ts)). Each render unit is a `DeckCard` = `{ card: Card; quantity: number }`.

### Key Discoveries:

- **No data work needed** — `imageUrl` is resolved and flows through `UpgradePlan` → `CardGroup` → `DeckCard` untouched. This slice only reads it.
- **The Cloudflare image-service footgun is already neutralized** — [astro.config.mjs:16](astro.config.mjs) sets `imageService: "passthrough"`, and these are React `<img>` tags rendered at runtime (not Astro `<Image>`), so Astro's image pipeline is never invoked. The roadmap's one watch-item for S-02 is moot — no config change required.
- **Scryfall URL convention** — stored URLs are `https://cards.scryfall.io/normal/<face>/<a>/<b>/<id>.jpg`. Swapping the `/normal/` path segment for `/small/` yields a ~4× lighter thumbnail (146×204, ~15KB vs ~80KB). Stable, widely-used convention; a missing segment degrades gracefully to the original URL.
- **Accessibility lint is enforced** — `eslint-plugin-jsx-a11y` is in the ESLint config ([package.json:45](package.json)); an interactive hover-preview trigger must also be keyboard-operable or `npm run lint` (and the husky pre-commit hook) fails.
- **Convention to follow** — `lucide-react` icons, Tailwind utilities, null-safety throughout, pure logic in tested `.ts` helpers; React components verified manually (no component-test harness exists — the `dfc-name-resolution` slice established this boundary).

## Desired End State

Every card in the upgrade plan (Remove, Add, and the expandable Shared section) shows its front-face card image as a lazy-loaded thumbnail next to the quantity-prefixed name. Hovering or keyboard-focusing a thumbnail reveals a readable full-size card. Cards whose image didn't resolve show a same-sized placeholder tile — never a broken image and never silently dropped. The Remove/Add/Shared sections share one card-row component, so the three stay visually identical.

Verify by pasting a real base/target pair: thumbnails appear throughout, off-screen images defer until scrolled, the Shared section's images load only on expand, and hovering any thumbnail enlarges it.

## What We're NOT Doing

- **No back-face / DFC flip** — front face only, using the existing `imageUrl`. Showing both faces would require expanding the `Card` contract + `normalize.ts` (F-01 scope).
- **No prices or total cost** — that's S-03 (`upgrade-cost-and-prices`), which will extend the same `CardRow`.
- **No history** — S-04 (`on-device-history`).
- **No grid/gallery layout** — the compact 2-column diff stays; images are inline thumbnails.
- **No click-to-modal lightbox** — hover/focus enlarge only.
- **No image caching / service worker / CDN proxy** — native `loading="lazy"` is the only perf mechanism for MVP (small data volume, desktop-first per PRD).
- **No component-test harness** — pure helper gets a unit test; components verified manually.
- **No `Card` contract or card-data-layer changes**, and no `astro.config.mjs` change.

## Implementation Approach

Extract the duplicated card-row markup into one `CardRow` component, then enrich it. Phase 1 adds the thumbnail (with a tested, pure thumbnail-URL helper and a placeholder fallback) and rewires both existing components to use `CardRow` — this alone satisfies FR-005. Phase 2 layers the hover/focus enlarge onto `CardRow`, mounting the full-size image on demand so the bandwidth win from small thumbnails isn't lost. Splitting this way gives a clean manual-verification gate after Phase 1 (images visible) before adding interactivity.

## Critical Implementation Details

- **Thumbnail derivation must be defensive.** Swap the first `/normal/` path segment for `/small/`; if the segment is absent, return the original URL unchanged so the `<img>` `src` is never broken. Null in → null out (the placeholder path). DFCs need no special-casing — only the front-face URL is stored.
- **The enlarge image must be mounted on demand.** Render the full-size (`normal`) `<img>` only after the row is first hovered/focused (React state), not hidden via CSS. A `src`-bearing `<img>` that merely starts hidden can still be fetched eagerly by the browser, which would refetch the heavy image for every card and erase the small-thumbnail savings.
- **Keyboard parity is mandatory.** The preview trigger reacts to focus/blur as well as mouse enter/leave, or `jsx-a11y` fails the build. Give the focusable element an `aria-label` (the card name) and a visible focus affordance.
- **Popover must not be clipped.** The plan section wrappers don't set `overflow: hidden`, so an absolutely-positioned popover can escape them; give it a high `z-index` and verify it doesn't clip at column/viewport edges.

## Phase 1: Inline thumbnails (delivers FR-005)

### Overview

Add a tested thumbnail-URL helper and a shared `CardRow` component that renders a lazy thumbnail (or placeholder) plus the card name, then replace the duplicated list markup in both existing components with it.

### Changes Required:

#### 1. Thumbnail URL helper

**File**: `src/components/deck/cardImage.ts` (new)

**Intent**: Derive the lighter Scryfall `small` image URL from the resolved `normal` URL so thumbnails download ~4× less, with a null-safe, fail-soft contract.

**Contract**: `thumbnailSrc(imageUrl: string | null): string | null`. `null` → `null`; a URL containing `/normal/` → the same URL with the first `/normal/` replaced by `/small/`; any other non-null string → returned unchanged (fallback). The swap is the one non-obvious bit:

```ts
// "https://cards.scryfall.io/normal/front/…/x.jpg" → ".../small/front/…/x.jpg"
return imageUrl === null ? null : imageUrl.replace("/normal/", "/small/");
```

#### 2. Helper unit test

**File**: `src/components/deck/cardImage.test.ts` (new)

**Intent**: Lock the three behaviors so a future refactor can't silently break thumbnails.

**Contract**: vitest cases — `null` → `null`; a representative Scryfall `normal` URL → the `small` URL; a URL without `/normal/` → returned verbatim.

#### 3. Shared card row component

**File**: `src/components/deck/CardRow.tsx` (new)

**Intent**: One render unit for a single `DeckCard` entry, used by Remove/Add/Shared so all three render identically and future slices (S-03 prices) have a single extension point.

**Contract**: `CardRow({ entry }: { entry: DeckCard })` returning an `<li>`. Renders a thumbnail `<img>` (`src={thumbnailSrc(entry.card.imageUrl)}`, `loading="lazy"`, `alt={entry.card.name}`, fixed MTG-ratio dimensions ~5:7) when an image exists; otherwise a same-dimensioned placeholder tile (bordered/muted box, optionally a `lucide-react` icon). Alongside it, the name text reuses the existing rule: `entry.quantity > 1 ? \`${entry.quantity}× ${entry.card.name}\` : entry.card.name`. Lays out as a flex row.

#### 4. Wire into the Remove/Add columns

**File**: `src/components/deck/CardGroupColumn.tsx`

**Intent**: Replace the inline `<li>` mapping with `<CardRow>`.

**Contract**: The per-group `<ul>` maps `group.cards` to `<CardRow key={entry.card.name} entry={entry} />`. Grouping, headings, and count badges are untouched.

#### 5. Wire into the Shared disclosure

**File**: `src/components/deck/SharedCardsDisclosure.tsx`

**Intent**: Same replacement, so expanded shared cards render identically to Remove/Add.

**Contract**: The per-group `<ul>` maps `group.cards` to `<CardRow>`, identical to the column. Disclosure/toggle behavior unchanged; thumbnails load lazily only when expanded.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Linting passes (including `jsx-a11y`): `npm run lint`
- Type checking passes: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Every card in the Remove and Add columns shows a thumbnail; quantities still prefix names correctly (e.g. `2× …`)
- A card with no resolved image shows the placeholder tile with alignment preserved — no broken-image icon, no dropped card
- Expanding "Shared cards" shows thumbnails; the browser network tab shows off-screen/collapsed images are deferred (lazy), not fetched on initial plan build
- No regressions: the plan still auto-builds after edits, and the unresolved-cards notice and identical-lists message still render

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation that the manual testing succeeded before proceeding to Phase 2.

---

## Phase 2: Hover/focus enlarge

### Overview

Layer a readable full-size preview onto `CardRow`, shown on hover and keyboard focus, loading the large image only on demand.

### Changes Required:

#### 1. Enlarge popover in the card row

**File**: `src/components/deck/CardRow.tsx`

**Intent**: Let the user read a card by hovering or focusing its thumbnail, without eagerly fetching full-size images for cards they never inspect.

**Contract**: Wrap the thumbnail in a focusable, relatively-positioned container (`tabIndex={0}`, `aria-label={entry.card.name}`, visible focus ring). Track an "active" flag set on `mouseenter`/`focus` and cleared on `mouseleave`/`blur`; while active, render an absolutely-positioned popover `<img src={entry.card.imageUrl}>` (the full-size `normal` URL) with a high `z-index`, positioned to avoid clipping at column/viewport edges. The popover `<img>` is mounted only when active (so the large image is fetched on first activation, not on render). No effect when `imageUrl` is null (placeholder rows have nothing to enlarge).

### Success Criteria:

#### Automated Verification:

- Linting passes, including `jsx-a11y` keyboard-interaction rules: `npm run lint`
- Type checking passes: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Hovering a thumbnail shows the full-size card and it is readable
- Tabbing with the keyboard focuses a thumbnail and shows the preview; blurring hides it
- The full-size image is fetched only on first hover/focus (network tab), not during initial plan render
- The preview does not clip at the left/right column edges or the viewport, and dismisses cleanly when the pointer leaves / focus moves
- No regression to Phase 1 thumbnails or placeholder behavior

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- `thumbnailSrc`: null passthrough, `normal`→`small` swap, and unchanged-fallback for a non-matching URL.

### Manual Testing Steps:

1. Paste a real base deck and a target deck; confirm thumbnails render across Remove and Add, grouped by type as before.
2. Include a card known to lack an image (or simulate `imageUrl: null`); confirm the placeholder tile renders aligned.
3. Expand "Shared cards"; confirm thumbnails appear and (network tab) were deferred until expand.
4. Scroll a large (100+ card) plan; confirm off-screen thumbnails load lazily rather than all at once.
5. Hover and then keyboard-Tab to a thumbnail; confirm the full-size preview appears, is readable, doesn't clip, and dismisses on leave/blur.
6. Confirm the full-size preview image is only requested on first hover/focus.

## Performance Considerations

Two mechanisms keep an image-heavy plan light: thumbnails request Scryfall's `small` size (~4× smaller than `normal`), and every thumbnail uses native `loading="lazy"` so off-screen and collapsed-Shared images aren't fetched until needed. The full-size preview is fetched only on first hover/focus. Given the PRD's small data volume and desktop-first MVP scope, no further caching or proxying is warranted.

## Migration Notes

None — additive rendering only. No data, schema, or stored-state changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-02 (`card-images-in-plan`)
- PRD: FR-005, US-01 (`context/foundation/prd.md`)
- Resolved image field: [normalize.ts:14-30](src/lib/card-data/normalize.ts), [types.ts:21-34](src/lib/card-data/types.ts)
- Duplicated row markup being replaced: [CardGroupColumn.tsx:33-39](src/components/deck/CardGroupColumn.tsx), [SharedCardsDisclosure.tsx:39-46](src/components/deck/SharedCardsDisclosure.tsx)
- Contract surfaces: `docs/reference/contract-surfaces.md` (`DeckCard`, `CardGroup`). Note: `CardRow` is the extension point S-03 (prices) will build on.
- Image-service config (already mitigated): [astro.config.mjs:16](astro.config.mjs)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Inline thumbnails (delivers FR-005)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — 11b0a06
- [x] 1.2 Linting passes (including `jsx-a11y`): `npm run lint` — 11b0a06
- [x] 1.3 Type checking passes: `npx astro check` — 11b0a06
- [x] 1.4 Production build succeeds: `npm run build` — 11b0a06

#### Manual

- [x] 1.5 Every card in Remove/Add shows a thumbnail; quantities still prefix names correctly — 11b0a06
- [x] 1.6 Null-image card shows the placeholder tile with alignment preserved (no broken image, no dropped card) — 11b0a06
- [x] 1.7 Expanding "Shared cards" shows thumbnails; off-screen/collapsed images are deferred (lazy) — 11b0a06
- [x] 1.8 No regressions: auto-build, unresolved notice, and identical-lists message still render — 11b0a06

### Phase 2: Hover/focus enlarge

#### Automated

- [x] 2.1 Linting passes, including `jsx-a11y` keyboard rules: `npm run lint`
- [x] 2.2 Type checking passes: `npx astro check`
- [x] 2.3 Production build succeeds: `npm run build`

#### Manual

- [x] 2.4 Hovering a thumbnail shows a readable full-size card
- [x] 2.5 Keyboard focus shows the preview; blur hides it
- [x] 2.6 Full-size image fetched only on first hover/focus, not on initial render
- [x] 2.7 Preview doesn't clip at column/viewport edges and dismisses cleanly
