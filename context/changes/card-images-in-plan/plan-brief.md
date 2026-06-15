# Card Images in the Upgrade Plan — Plan Brief

> Full plan: `context/changes/card-images-in-plan/plan.md`

## What & Why

DeckDelta's upgrade plan currently lists cards as plain text. Roadmap slice **S-02 / PRD FR-005** wants a card image beside every card so the plan reads like an MTG tool, not a text diff. The image data (`Card.imageUrl`) is already resolved by F-01, so this is a pure rendering slice.

## Starting Point

S-01 renders the plan as text-only `<li>` rows, with the **same** card-row markup duplicated in `CardGroupColumn.tsx` (Remove/Add) and `SharedCardsDisclosure.tsx` (Shared). Each row already has `entry.card.imageUrl` (Scryfall `normal`-size, front face) and `entry.quantity` available — nothing in the data layer needs to change.

## Desired End State

Every card in Remove, Add, and the expandable Shared section shows its front-face image as a lazy-loaded thumbnail next to the quantity-prefixed name. Hover or keyboard-focus enlarges a thumbnail to a readable full-size card. Cards with no resolved image show a same-sized placeholder tile — never broken, never dropped.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Display layout | Inline thumbnail + hover/focus enlarge | Shows every card's image at a glance (FR-005) while keeping the compact 2-column diff | Plan |
| Thumbnail size / loading | Derive Scryfall `small` URL + native `loading="lazy"` | ~4× lighter than `normal`; lazy skips off-screen cards — addresses the roadmap's perf unknown | Plan |
| Missing image | Same-sized placeholder tile | Keeps alignment and honors the "no silent omission" guardrail | Plan |
| Shared cards | Same image treatment | Consistent UX + lets one `CardRow` serve all three sections; images defer until expand | Plan |
| Double-faced cards | Front face only | Uses the existing `imageUrl`; both-faces would be F-01 contract creep | Plan |
| Component structure | Extract one shared `CardRow` | Removes the duplicated row markup; single extension point for S-03 (prices) | Plan |

## Scope

**In scope:** a tested `thumbnailSrc` helper (`normal`→`small`, null/fallback-safe), a shared `CardRow` component (lazy thumbnail or placeholder + name), rewiring `CardGroupColumn` and `SharedCardsDisclosure` to use it, and a hover/focus full-size enlarge.

**Out of scope:** prices/total (S-03), history (S-04), DFC back-face/flip, grid layout, click-to-modal, image caching/proxy, `Card` contract or `astro.config` changes, component-test harness, mobile optimization.

## Architecture / Approach

Extract the duplicated `<li>` markup into `CardRow`, then enrich it. `thumbnailSrc` swaps the Scryfall `/normal/` path segment for `/small/` (fail-soft: missing segment → original URL; null → null → placeholder). The full-size preview image is mounted only on first hover/focus so the small-thumbnail bandwidth win isn't lost. The Cloudflare image-service footgun the roadmap flagged is already neutralized (`imageService: "passthrough"` + runtime React `<img>`), so no config change is needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Inline thumbnails | A thumbnail (or placeholder) beside every card across Remove/Add/Shared; `thumbnailSrc` helper + unit test; shared `CardRow` | Scryfall URL-swap brittleness (mitigated by the unchanged-URL fallback) |
| 2. Hover/focus enlarge | Readable full-size card on hover and keyboard focus, fetched on demand | `jsx-a11y` keyboard parity + popover clipping at column edges |

**Prerequisites:** F-01 (`card-data-resolution`) and S-01 (`grouped-upgrade-plan`) are done.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Assumes Scryfall's `/normal/` → `/small/` URL convention stays stable (fallback returns the original URL if it ever doesn't).
- Native `loading="lazy"` is the only perf lever; acceptable given the PRD's small data volume and desktop-first MVP.
- The full-size preview must mount on demand, or per-card large-image fetches would erase the thumbnail savings.

## Success Criteria (Summary)

- Every card in the plan (Remove/Add/Shared) shows a front-face thumbnail; missing images render an aligned placeholder.
- Off-screen and collapsed-Shared images load lazily; the full-size preview loads only on hover/focus.
- Hover and keyboard focus both reveal a readable, non-clipped full-size card.
