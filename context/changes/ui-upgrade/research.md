---
date: 2026-06-27T00:00:00+02:00
researcher: Mateusz Tomanek
git_commit: 51b3911eaa747453741fd11eef39e8114ba0b160
branch: main
repository: 10xdevx
topic: "Implement the DeckDelta Dark v3 design handoff (UI upgrade) onto the existing app"
tags: [research, codebase, ui, theming, tailwind4, restyle, deckdelta-dark-v3]
status: complete
last_updated: 2026-06-27
last_updated_by: Mateusz Tomanek
---

# Research: Implement DeckDelta Dark v3 design handoff

**Date**: 2026-06-27T00:00:00+02:00
**Researcher**: Mateusz Tomanek
**Git Commit**: 51b3911eaa747453741fd11eef39e8114ba0b160
**Branch**: main
**Repository**: 10xdevx

## Research Question

Ground the implementation of the `DeckDelta Dark v3.dc.html` design handoff (extracted to
[context/changes/ui-upgrade/handoff/](handoff/mtg-deck-upgrade-tool/project/DeckDelta%20Dark%20v3.dc.html))
against the current codebase: how theming works, which existing pages/components map to each
design screen, and where the design implies behaviour that does not yet exist.

**Scope decisions (confirmed with user before research):**
- **Breadth:** all 5 design screens (main comparison, sign-in, saved-comparison detail, shared/visitor, saved-decks grid).
- **Feature gaps:** **restyle-as-static** — reproduce every design element visually even when the
  underlying behaviour isn't built; do **not** wire new features in this change.
- **Theme model:** **replace** the current light shadcn theme with a single dark v3 theme (no toggle).

## Summary

DeckDelta is a **built, feature-complete** Astro 6 + React 19 + Tailwind 4 + shadcn app (the MVP
F-01/S-01–S-03/S-05–S-06 plus accounts S-08 are all `done` — `context/foundation/roadmap.md:17,33-41`).
v3 is therefore a **visual restyle**, not new product work. The good news and the catch:

- **Theme swap is a single-file change.** Tailwind 4 is configured CSS-first (no `tailwind.config.js`);
  every color token lives in `src/styles/global.css`. Because components consume **semantic** shadcn
  utilities (`bg-background`, `text-foreground`, `border-border`, `bg-primary`…), overwriting the
  `:root` token values propagates the dark palette app-wide automatically.
- **The catch:** the deck/auth/path components mostly **hardcode** colours (`bg-white/5`, `border-white/10`,
  `text-blue-100/80`, `purple-*`, the `bg-cosmic` gradient, `LibBadge`'s blue/purple). Those bypass the
  token system and must be migrated to palette utilities by hand. So "swap tokens" gets us a coherent
  base, but each component still needs a className pass to hit pixel-parity.
- **Fonts don't exist yet** — no Google Fonts, no `--font-*` tokens. v3 needs **Cinzel** (display) and
  **Spectral** (italic body accents); `Caveat` is annotation-only and should be dropped for production.
- **Three big structural pieces are net-new chrome:** a persistent **left sidebar nav**, the
  **Setup → Result collapse flow** (design State A + the collapsed "Edit decklists ▾" strip), and the
  **Columns ⇄ Merged view toggle + the entire Merged renderer** (State C). Under restyle-as-static these
  are built as presentational markup, not wired to new logic.
- **Several v3 elements correspond to deferred features**, not just missing UI: sharing / public toggle /
  fork / visitor view are explicitly **deferred** in the roadmap (S-08 ships a `visibility` column but
  exercises only `private` — `roadmap.md:183`). Restyle-as-static means we render them as static visuals.
- **Data-model divergence to settle in planning:** v3 frames a single deck-A→deck-B **"saved comparison"**;
  the code models a multi-step **"upgrade path"** (Base → Step 1 → Step 2…, each diffed against the prior
  step — `src/lib/path/types.ts`). The two are related but not identical; the restyle must pick how the
  path screens present under v3's single-comparison visual language.

## Detailed Findings

### The design (5 screens, 1 file)

[DeckDelta Dark v3.dc.html](handoff/mtg-deck-upgrade-tool/project/DeckDelta%20Dark%20v3.dc.html) is a
Claude-Design canvas (absolute-positioned mockups + handwritten `.ann` annotations — the annotation text
and crop/registration marks are *not* part of the product UI). It contains:

1. **Main comparison page — 3 states** (`:46-215`): **A · Setup** (sidebar + two decklist inputs +
   gold "Calculate the Delta →" CTA), **B · Result / Columns** (collapsed decklist strip, unresolved-cards
   warning, TOTAL UPGRADE COST box, `[Columns|Merged]` view toggle, `[Grouped|Flat|Price ↓]` sort, two
   Remove/Add columns), **C · Result / Merged** (one interleaved list with −/+/= markers, type pill, signed
   coloured price, coloured left-border per row).
2. **Sign in** (`:217-258`): split card — card-art hero (Valgavoth) left, form right with tabs
   `[Sign in | Create account]`, Email/Password (+ "Forgot?"), gold CTA, "or continue with" + Google/Discord.
3. **Saved comparison — owner detail** (`:263-304`): sidebar + breadcrumb "Saved decks ›", title
   "Rakdos Midrange → Cutthroat", metadata subtitle, `[Edit|Duplicate]`, a Share row (copy-link + Copy +
   "Public ◐" toggle), Remove/Add columns.
4. **Shared link — visitor view + fork** (`:306-343`): top bar with "shared · read-only" pill + Sign in;
   read-only comparison left; right rail with UPGRADE COST, REMOVE/ADD stat tiles, green "⑂ Fork to my
   account" CTA, "Export list".
5. **Saved decks — card grid** (`:345-371`): sidebar + "Saved decks" title, search + "New", responsive
   3-col grid of deck cards (art strip + "~$340.69 · 20/20 · 🔒") + dashed "New comparison" tile.

Design system constants worth lifting verbatim (from the `<style>` block, `:15-32`):
`Cinzel`/`Spectral`/`Caveat` fonts; button classes `.btnG` (gold), `.btnD` (dark), `.btnR` (red);
`.notch`/`.notchIn` clip-path CTA frame; `.stripe` card-thumb placeholder; `.rule` gold hairline.
**v3 deliberately removed** ornamental corners + watermark crests and demoted gold to "active nav,
hairline rules, one primary action" (annotation `:40-43`).

### Theming system → the swap point

- **Mechanism:** Tailwind 4 CSS-first. `astro.config.mjs:6,14` wires `@tailwindcss/vite`; `components.json:7`
  has `"config": ""` (no JS config); `src/styles/global.css:1` is `@import "tailwindcss";`.
- **All tokens live in `src/styles/global.css`:** `:root {}` (`:6-39`, the **rendered** light theme),
  `.dark {}` (`:41-73`, currently **inert** — `<html>`/`<body>` carry no `.dark` class, `Layout.astro:15,22`),
  and `@theme inline {}` (`:75-111`, maps `--background`→`--color-background` etc. — this is what makes the
  semantic utilities resolve).
- **Swap point:** overwrite the **`:root` block (`global.css:6-39`)** with the v3 hex palette. Optionally
  delete `.dark` (`:41-73`) and `@custom-variant dark` (`:4`) for a clean single forced theme. Hex is fine
  in these custom props (current values are `oklch(...)`, but Tailwind 4 forwards hex unchanged).
- **Global wiring that makes the swap cascade:** `@layer base` (`global.css:118-123`) applies
  `* { @apply border-border outline-ring/50 }` and `body { @apply bg-background text-foreground }`.
- **Off-token hardcodes that need manual edits** (will NOT change from a token swap):
  - `bg-cosmic` gradient `@utility` — `global.css:113-115` (`#0a0e1a→#0f1529`), consumed by `Layout.astro:40`
    and the page shells of `index.astro`, `dashboard.astro`, `paths/index.astro`, `auth/*`.
  - `Layout.astro:40-65` header — `text-white`, `border-white/10`, `text-blue-100/80`, `bg-white/10`.
  - `LibBadge.astro:10,12` — `bg-blue-900/50 text-blue-200`, `bg-purple-500/30 text-purple-200`.
  - All deck/auth/path components: `bg-white/5`, `border-white/10`, `bg-white/10 border-white/20`,
    `text-blue-100/*`, `purple-300/400/500/600`.
- **`--radius: 0.625rem`** (`global.css:7`) drives `rounded-sm/md/lg/xl`; single-value edit re-rounds globally.
- **No shadow tokens** exist; components use Tailwind built-ins (`shadow-xs`, `shadow-sm`). v3's richer
  panel shadows would be new `--shadow-*` tokens in `@theme inline` or inline utilities.
- **Fonts:** none today (`Layout.astro` `<head>` `:16-21` has no font links; no `--font-*` token). Plan:
  add `<link>` for `Cinzel` + `Spectral` in `Layout.astro:18`, and `--font-display`/`--font-body` keys in
  `@theme inline` (Tailwind 4 auto-generates `font-display`/`font-body` utilities). Keep `font-mono`
  (system `ui-monospace`) for decklists. **Drop Caveat** (annotation font, not product UI).

### Screen 1 — Main comparison (`src/pages/index.astro` + `src/components/deck/*`)

- **Page shell** `index.astro:1-24`: `Layout` → `div.bg-cosmic` → `main.max-w-5xl` → fixed gradient `<h1>DeckDelta`
  + description → `<DeckComparer client:load />`. **No sidebar, no editable title.**
- **`DeckComparer.tsx:1-216`** is the orchestrator. Its state union is a **result** machine, not a
  setup/result phase machine: `idle | loading | ready | error` (`:17-21`). **Inputs are always visible**
  (two textareas, `:114-145`) and there is **no "Calculate" CTA** — a **700ms debounce** auto-runs
  `generateUpgradePlan` when both fields are filled (`DEBOUNCE_MS = 700`, `:14`; effect `:67-82`).
  - **Gap (State A):** no setup phase, no Calculate button, no collapse-to-strip. The design's "A → B on
    Calculate" flow and the collapsed "Decklists · base 100 · target 100 / Edit decklists ▾" strip are
    net-new presentational structure.
  - **Gap (State C):** **no Columns⇄Merged toggle and no Merged renderer at all** — only the two
    `CardGroupColumn`s exist (`:197-200`). The entire merged/interleaved list is unbuilt.
- **`CardGroupColumn.tsx:1-56`**: one side as `section.rounded-xl.border-white/10.bg-white/5`; title is the
  plain `title` prop ("Remove"/"Add") with no colour. **Gap:** v3 wants a **red** "− Remove" header and a
  **green** "+ Add" header with ± glyphs.
- **`CardRow.tsx:1-76`**: `<img class="h-14 w-10 …">` = **40×56** thumb with hover-zoom `w-80` preview;
  name + right-aligned `formatUsd` price. **Gap:** v3 thumbs are **26×36** (className change); no type pill,
  no signed/coloured price, no −/+/= marker (needs a Merged-row variant).
- **`CostSummary.tsx:1-35`**: modest glass panel, inline "Total upgrade cost: …" + Scryfall disclaimer.
  **Gap:** v3 wants a prominent gold "TOTAL UPGRADE COST" headline box (same data).
- **`SortControl.tsx:1-106`**: nested toggles — Grouped/Flat, then in flat mode Name/Price + asc/desc
  direction; active state `border-purple-400/50 bg-purple-500/20`. **Gap:** v3 collapses this to a 3-chip
  `[Grouped | Flat | Price ↓]` row. Same capability (`SortMode = {layout,key,direction}`, `sort.ts:22-26`;
  "Price ↓" = `{flat,price,desc}`), different control shape. Sort persists in `localStorage`
  (`deckdelta.sort.v1`, `sortStorage.ts`).
- **`UnresolvedNotice.tsx:1-82`**: red box `border-red-500/30 bg-red-900/20` + `CircleAlert`, per-entry
  "did you mean X?" Accept + Accept-all. **Closest match to v3** (State B warning) — mostly restyle.
- **`SharedCardsDisclosure.tsx:1-63`**: collapsible shared-cards panel. **No direct v3 counterpart** —
  in v3, "stays" cards appear as `=` rows inside the Merged view; this likely folds into State C.
- **`labels.ts:formatUsd`** → `null → "—"`, number → `~$X.XX`. **Gap:** no signed form for Merged rows
  (`−$/+$`). `cardImage.ts:thumbnailSrc` swaps `/normal/`→`/small/` (fine for 26×36).

### Screen 2 — Sign in / Create account (`src/pages/auth/*` + `src/components/auth/*`)

- **`signin.astro:9-21` / `signup.astro`**: plain **centered `max-w-sm` card** on `bg-cosmic`. Sign-in and
  sign-up are **separate pages joined by a text link**, not tabs. **Gap:** no split hero, no tabs.
- **`SignInForm.tsx` / `SignUpForm.tsx`**: email + password (+ confirm on signup); client validation.
  **Gaps:** no "Forgot?" link, no "or continue with" divider, no social buttons.
- **Social login — NONE.** `api/auth/signin.ts:13` = `signInWithPassword` (→ `/paths`); `signup.ts:13` =
  `signUp` (→ `/auth/confirm-email`). Zero `oauth/google/discord/signInWithOAuth/provider` references in
  `src/`. Roadmap confirms "email + password only (no OAuth / password-reset)" (`roadmap.md:61`).
  ⇒ **Google/Discord + "Forgot?" are styled static under restyle-as-static.**
- **`SubmitButton.tsx`**: full-width purple `Button` with `useFormStatus` spinner. **Gap:** v3 CTA is gold.
- **`FormField.tsx` / `PasswordToggle.tsx` / `ServerError.tsx`**: left-icon input (`focus:ring-purple-400`),
  Eye/EyeOff toggle, red alert pill. All restyle-only.

### Screens 3–5 — Saved/shared/dashboard (`src/pages/paths/*`, `dashboard.astro`, `src/components/path/*`)

- **What a "path" is** (`src/lib/path/types.ts`): `UpgradePath` (`:50-57`) = `id, ownerId, title,
  visibility: "private"|"unlisted", createdAt, updatedAt`; an **ordered chain** of `PathStep`s (`:38-47`)
  each holding a `listText` + resolved `snapshot`, rendered as a diff vs. the previous step. **This is richer
  than v3's single A→B "saved comparison"** — a planning decision (see Open Questions).
- **Sharing/public/fork — mostly dead/unbuilt.** `visibility` exists in the type + DB
  (`database.types.ts:23,31,39`) but is **never read/written by any UI or API** — `POST /api/paths` inserts
  only `{owner_id, title}` (`api/paths/index.ts:38`). No fork, public-read route, share-link, copy, export,
  or "Public ◐" toggle. Roadmap: "Sharing / fork-to-account also deferred — a `visibility` column ships but
  only `private` is exercised" (`roadmap.md:183`).
- **Screen 3 → `paths/[id].astro` + `PathEditor.tsx:1-433`**: header has back-link, inline **Rename**, and
  **Delete** — **no `[Edit|Duplicate]`, no metadata subtitle, no Share row**. Per-step Remove/Add columns
  exist (`:84-87`) — restyle-only. Everything else on Screen 3 is **static**.
- **Screen 4 (visitor/fork) — 100% absent.** `middleware.ts:7` gates `/dashboard` + `/paths` to authenticated
  owners; there is no public/visitor route. The only "read-only" code is immutable saved checkpoints inside
  the owner's own editor (`PathEditor.tsx:31-48`). ⇒ **Whole screen is static markup** with no endpoints.
- **Screen 5 → `dashboard.astro` is a stub** (welcome + sign-out, `:8-27`); the real list is
  **`paths/index.astro:43-54`** — a **single-column list of titles only** (no thumbnail/cost/counts/
  visibility), plus `NewPathForm.tsx`. **Gaps:** title "My Paths" not "Saved decks", no search, no 3-col
  card grid, no per-card metadata (cost is computed per-step inside the editor, never aggregated onto the
  list), no dashed "New comparison" tile.
- **Sidebar nav / logo / breadcrumb** in Screens 1/3/5 **exist nowhere** — net-new shell. The `--color-sidebar-*`
  tokens are defined (`global.css:103-110`) but unused.

## Code References

- `src/styles/global.css:6-39` — `:root` token block (the **swap point** for the dark palette)
- `src/styles/global.css:41-73` — `.dark` block (inert; delete or ignore)
- `src/styles/global.css:75-111` — `@theme inline` mapping (+ where `--font-*` tokens go; don't touch colors)
- `src/styles/global.css:113-115` — `bg-cosmic` gradient (off-token; update for v3)
- `src/styles/global.css:118-123` — `@layer base` global body/border wiring
- `src/layouts/Layout.astro:15-21` — `<head>` (no fonts yet); `:39-72` header (hardcoded colours)
- `astro.config.mjs:6,14` / `components.json:7` — Tailwind 4 CSS-first, no JS config
- `src/pages/index.astro:1-24` — main page shell (no sidebar, fixed title)
- `src/components/deck/DeckComparer.tsx:14,17-21,67-82,114-145,197-200` — debounce, no setup/merged
- `src/components/deck/CardGroupColumn.tsx:23-52` — uncoloured Remove/Add headers
- `src/components/deck/CardRow.tsx:48-54` — 40×56 thumb (v3 = 26×36)
- `src/components/deck/CostSummary.tsx:21-32` — modest cost panel (v3 = headline box)
- `src/components/deck/SortControl.tsx:53-103` — nested toggles (v3 = 3 chips)
- `src/components/deck/labels.ts` — `formatUsd` (no signed form)
- `src/pages/auth/signin.astro:9-21` — centered card (v3 = split hero)
- `src/components/auth/SignInForm.tsx`, `SubmitButton.tsx` — email/pwd only, purple CTA
- `src/pages/api/auth/signin.ts:13`, `signup.ts:13` — `signInWithPassword`/`signUp`; no OAuth
- `src/lib/path/types.ts:38-57` — `PathStep` / `UpgradePath` (multi-step; `visibility` unused)
- `src/pages/api/paths/index.ts:38` — insert omits `visibility`
- `src/pages/paths/[id].astro` + `src/components/path/PathEditor.tsx:248-336` — owner detail (rename/delete)
- `src/pages/paths/index.astro:43-54` — title-only list (v3 = card grid)
- `src/pages/dashboard.astro:8-27` — stub
- `src/middleware.ts:7` — `/dashboard`,`/paths` gated to owners (no visitor route)

## Architecture Insights

- **Semantic-token discipline is the lever.** The cleanest path is a two-tier restyle: (1) overwrite `:root`
  tokens once for the global dark base; (2) sweep each component to replace hardcoded `white/blue/purple`
  utilities with the new semantic/palette utilities so they actually track the theme. The bigger the move
  toward semantic utilities now, the cheaper future theme work.
- **Data layer already supports the visuals.** `@/lib/deck` (parse/diff/cost/accept), `@/lib/card-data`
  (resolve/classify), sort, and `cardImage` cover everything v3 renders — the only data-shaped gaps are
  **signed price formatting** and **per-row ±/= markers + type pills** for the Merged view (presentational
  derivations, no engine change).
- **Restyle-as-static keeps risk low but adds dead affordances.** Merged toggle, Share row, Public toggle,
  Fork, Export, Google/Discord, Forgot — all rendered, none wired. Plan should mark each as static so a
  later reviewer/`/10x-impl-review` doesn't read them as regressions, and so they aren't accidentally wired.
- **Sidebar is the one genuinely new shared component.** It recurs in Screens 1/3/5 and replaces (or wraps)
  today's top auth bar in `Layout.astro`. Worth building once as a real layout slot, even if its nav items
  ("Shared with me", "History") are static for now.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:17,33-41,183` — MVP + accounts delivered; sharing/fork/`unlisted`
  **deferred**; on-device history (S-04) retired by accounts (S-08).
- `context/foundation/roadmap.md:61` — auth is email/password only, no OAuth / password-reset (confirms
  Screen 2's social + Forgot are design-only).
- `docs/reference/contract-surfaces.md` — load-bearing names the restyle must not break: `@/lib/deck`
  (`diffDecks`/`UpgradePlan`/`CardGroup`/`DeckCard`), `@/lib/card-data` (`Card`/`CardCategory`),
  `planAddCost`/`PlanCost`, `formatUsd`. A restyle should touch presentation, not these signatures.
- `context/archive/2026-06-26-user-accounts/` — the accounts/paths slice (S-08) origin.
- Memory `path-builder-qol` — deferred path UX (deck/path cover art, in-hand upgrade UI) overlaps v3's
  card-art thumbnails on the saved-decks grid; relevant if cover art is later wired.

## Related Research

- None prior for this change. Design source of truth:
  [handoff/.../DeckDelta Dark v3.dc.html](handoff/mtg-deck-upgrade-tool/project/DeckDelta%20Dark%20v3.dc.html);
  sibling mockups (`DeckDelta Dark v2`, `Wireframes`, `Signin Variants`, `Detailed`) are in the same folder
  for cross-reference but v3 is primary (handoff README).

## Open Questions

> **Resolved with user 2026-06-27** — Q1–Q3 below are decided; Q4–Q5 are minor and carry plan defaults.

1. **Path vs "saved comparison" framing.** — **RESOLVED: adapt the design to the code, not the code to the
   design.** v3 was generated from a single prompt against an *earlier* version of the app, so its
   single-comparison framing is approximate/aspirational. The real multi-step **upgrade path** model wins:
   present the existing `PathEditor` / paths list under v3's dark visual language (apply the palette, sidebar,
   panels, headers, gold hairlines), but keep the multi-step Base→Step-N structure and the real
   rename/delete/add-step affordances. Do **not** force the code into a fake A→B shape. Where a v3 element
   has no code counterpart (Edit/Duplicate, Share row, visitor/fork), render it as static per the
   restyle-as-static scope.
2. **Sidebar scope.** — **RESOLVED: change the layout to a persistent left sidebar.** Build it as a real
   shared layout slot (in/near `Layout.astro`) that **replaces today's top auth bar**, used across the
   authed screens (1/3/5). Logo + nav (New comparison / Saved decks / Shared with me / History) + user
   footer. Nav items with no backing route ("Shared with me", "History") are static links for now. Auth
   pages (Screen 2) keep the split-hero, no sidebar.
3. **Saved-decks grid metadata.** — **RESOLVED: compute it.** Aggregate per-path cost + add/remove counts
   (+ visibility) for the saved-decks list so the v3 grid cards show real "~$cost · in/out · 🔒" metadata.
   ⚠ **Scope note:** this is the one piece of genuine (non-restyle) work the user opted into — the cost/counts
   are currently derived per-step inside `PathEditor` and never surfaced on the list. The plan must decide
   *where* to compute (reuse `planAddCost` / diff over stored `path_steps` snapshots, server-side in
   `paths/index.astro` or `@/lib/api/paths`, so the list page needs no card-data lookups). Everything else on
   Screen 5 stays restyle-only.

### Minor — plan defaults (decide in `/10x-plan`)
4. **Single-theme cleanup.** Since the theme is *replaced* (not toggled), default to deleting the dead
   `.dark` block + `@custom-variant dark` (`global.css:4,41-73`) and the inert `dark:` variants in
   `button.tsx`. Cleaner; the swap lives only in `:root`.
5. **CTA frame fidelity.** Default to reproducing v3's `clip-path` notch (`.notch`/`.notchIn`) for the one
   primary CTA, since gold is deliberately reserved for a single primary action — but as a small reusable
   wrapper, not a fork of shadcn `Button`. Approximate if the notch fights the existing `Button` API.
