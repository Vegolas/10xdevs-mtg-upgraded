# DeckDelta Dark v3 — UI Upgrade Implementation Plan

## Overview

Apply the **DeckDelta Dark v3** design across all 5 screens of the existing app as a single dark
theme (replacing the light shadcn theme), a new persistent **sidebar shell**, and a per-component
restyle. The design was generated from a single prompt against an earlier build, so we **adapt the
design to the real code** — the multi-step *upgrade path* model stays; we don't bend the code into
the mock's single-comparison framing. Two v3 behaviors are built **functionally** (the Setup→Result
collapse flow and the Columns⇄Merged view toggle) because the data layer already supports them; one
genuine feature is added (computed saved-deck metadata). Everything else the design implies but the
app doesn't have (share/public/fork, social login, visitor view, search) is **restyled as static**.

## Current State Analysis

- **Theme** is Tailwind 4 CSS-first; **all tokens live in `src/styles/global.css`** — `:root` (`:6-39`,
  the rendered light theme), an inert `.dark` block (`:41-73`, no `.dark` on `<html>`), and `@theme
  inline` (`:75-111`) that maps `--x` → `--color-x`. `@layer base` (`:117-124`) applies
  `bg-background text-foreground` to `<body>` and `border-border` to `*`, so a `:root` token rewrite
  cascades app-wide. `bg-cosmic` (`:113-115`) is a hardcoded blue gradient used by every page shell.
- **No fonts** are loaded (`Layout.astro:16-21`); no `--font-*` token exists.
- **Components hardcode colors** (`bg-white/5`, `border-white/10`, `text-blue-100/*`, `purple-*`) and
  thus bypass the token system — each needs a manual className pass.
- **`Layout.astro:39-72`** is a right-aligned top auth bar (My Paths / email / Sign out); there is no
  sidebar anywhere. `--color-sidebar-*` tokens exist but are unused.
- **`DeckComparer.tsx`** always shows both textareas and auto-builds via a **700ms debounce**
  (`:14,67-82`); no Setup state, no Calculate button, no collapse, **no merged view, no view toggle**.
  Result region branches on `idle|loading|error|ready` (`:147-213`).
- **Paths layer**: a "path" is an ordered chain of checkpoints; `src/lib/path/chain.ts` already reuses
  the engine (`stepPlan`, `cumulativePathCost`, `diffDecks`, `planAddCost`, `groupByCategory`).
  `paths/index.astro` fetches only `upgrade_paths` rows (no steps) and renders a title-only list.
  `dashboard.astro` is a stub.
- **Auth**: two separate Astro pages posting to `/api/auth/signin|signup`; email/password only (no
  OAuth, no password reset). Centered `max-w-sm` cards, purple CTA.
- **Verification convention**: pure-logic vitest + `astro check` + `eslint`; **no component-test
  tooling by design**.

(Full grounding: `context/changes/ui-upgrade/research.md`.)

## Desired End State

The whole app renders in the v3 dark/parchment/gold palette with Cinzel display + Spectral body
fonts. A persistent left sidebar (logo, nav, user footer) frames the authed app screens. The main
comparison page has a Setup state with a gold Calculate CTA that collapses inputs to an "Edit
decklists ▾" strip, red/green Remove/Add columns, a headline cost box, a 3-chip sort, and a working
Columns⇄Merged toggle whose merged list shows signed/colored prices, ±/= markers, and type pills.
Sign-in/up are split-hero cards with a Scryfall art crop. The saved-decks page is a card grid where
each card shows **real** "~$cost · in/out · 🔒" computed from the path's base→final diff. Deferred
affordances (share/public/fork, Google/Discord, Forgot, search) are present and styled but inert.

**Verify**: `npm run build` (`astro check` + lint clean), `npm test` green (incl. new pure-logic
tests), and a manual browser pass over all 5 screens against the v3 mock.

### Key Discoveries:

- Single theme swap point: `src/styles/global.css:6-39` (`:root`); cascade via `@layer base`
  (`:117-124`). Hex is accepted in these custom props (current values are `oklch`).
- `src/lib/path/chain.ts:31-60` already diffs snapshots with the engine — the base→final summary is a
  small new pure fn (`diffDecks(steps[0].cards, steps[last].cards)` + `planAddCost(plan.add)`).
- `src/components/deck/labels.ts` owns `formatUsd` (`null → "—"`, n → `~$N.NN`) — the **single** money
  formatter; a signed variant belongs beside it.
- `DeckComparer.tsx` runs through a request-token guard + debounce (`:44-82`) — the collapse flow must
  preserve that; the Calculate CTA triggers an immediate run, it doesn't replace the debounce.
- `parseSnapshot`/`toPathStep` (`src/lib/api/paths.ts:64-75`) already yield `DeckCard[]` per step — the
  grid metadata needs the list query to also embed `path_steps`.

## What We're NOT Doing

- **No new features wired**: no real sharing/public toggle/fork/export, no OAuth/Google/Discord, no
  password reset, no "Shared with me"/History routes, no functional search. These are styled static.
- **No public/visitor route** — middleware still gates `/paths`,`/dashboard` to owners. Screen 4's
  visitor chrome is static markup layered on the existing read-only step rendering; no anonymous page
  is created.
- **No data-model / DB / API contract changes** — `upgrade_paths`/`path_steps`, RLS, and the
  `@/lib/deck` · `@/lib/card-data` · `formatUsd` · `planAddCost` contract surfaces stay intact.
- **No engine changes** — diff/cost/sort/resolve logic is untouched; only presentational derivations
  (signed price, ±/= markers, base→final summary) are added.
- **No theme toggle** — single forced dark theme; the `.dark` block is removed.
- **No component-test tooling** — we don't introduce jsdom/RTL.

## Implementation Approach

Two-tier restyle: (1) **swap tokens once** so the global dark base cascades; (2) **sweep each
component** to replace hardcoded `white/blue/purple` utilities with semantic/palette utilities so they
track the theme. Build the shell second (everything chrome-level depends on it), then restyle screen by
screen. The only non-restyle work — the base→final metadata summary — is isolated to a pure function +
a query change and is unit-tested. Phases are ordered so each is independently buildable and verifiable
in the browser; gold is reserved for one primary action per screen + active nav + hairlines, per the
v3 annotation.

## Critical Implementation Details

- **Debounce + Calculate coexistence** (Phase 3): the gold Calculate CTA must call the existing
  `runPlan` immediately and the 700ms debounce must remain the fallback trigger; both already route
  through the monotonic `requestToken` guard (`DeckComparer.tsx:44-56`), so firing both is safe (the
  later run wins). The collapse to the strip is driven by `view.status === "ready"`, not by the button.
- **Snapshot prices are at-save values** (Phase 7): the grid summary reuses stored snapshot
  `priceUsd`, so it is byte-identical to what the path detail shows — do not re-resolve.
- **Hero art reliability** (Phase 5): the Scryfall `art_crop` is an external image on the sign-in page;
  it must have a CSS gradient underlay so the screen is coherent if the image fails to load.

---

## Phase 1: Theme & fonts foundation

### Overview

Replace the light shadcn theme with the v3 dark palette in one place, introduce the display/body fonts,
and add the few palette tokens shadcn lacks (add-green, brand-green, success/fork-green). After this
phase the entire app renders dark via cascade, before any component is individually touched.

### Changes Required:

#### 1. Dark palette token swap

**File**: `src/styles/global.css`

**Intent**: Make the v3 dark/parchment/gold palette the single rendered theme and remove the dead
light/dark machinery so the swap lives only in `:root`.

**Contract**: Overwrite the `:root` block (`:6-39`) values with v3 hex. Mapping: `--background` #221e18,
`--foreground` #ecdcb4, `--card` #16120d, `--card-foreground` #ecdcb4, `--popover` #16120d,
`--primary` #cba75c (gold CTA), `--primary-foreground` #2a1d08, `--secondary` #1d1810 (sidebar),
`--secondary-foreground` #d3c5a0, `--muted` #1d1810, `--muted-foreground` #9a8c68, `--accent` #c9a35c,
`--accent-foreground` #2a1d08, `--destructive` #d8736a (remove-red), `--border` #3a3022, `--input`
#0f0c08, `--ring` #c9a35c, `--sidebar` #1d1810, `--sidebar-foreground` #d3c5a0, `--sidebar-accent`
#c9a35c, `--sidebar-border` #3d3320, `--sidebar-primary` #cba75c. Keep `--radius: 0.625rem`. Delete the
`.dark` block (`:41-73`) and the `@custom-variant dark` line (`:4`). Add three new tokens in `:root`
**and** their `@theme inline` color mappings so utilities generate: `--add`/`--color-add` #94c074,
`--brand`/`--color-brand` #5fb04a, `--success`/`--color-success` #4f9e3f (the fork CTA green).

#### 2. Page background utility

**File**: `src/styles/global.css`

**Intent**: Retire the blue `bg-cosmic` gradient so page shells read as the v3 base.

**Contract**: Replace the `bg-cosmic` `@utility` body (`:113-115`) with the v3 page background (flat
`#221e18`, or a subtle dark vertical gradient in the same family). Keep the utility name so existing
`bg-cosmic` consumers need no rename this phase (they get restyled in later phases).

#### 3. Fonts

**File**: `src/layouts/Layout.astro`, `src/styles/global.css`

**Intent**: Load Cinzel (display) + Spectral (body italic accents) and expose them as Tailwind font
utilities; `font-mono` (system) stays for decklists. Caveat is annotation-only — not loaded.

**Contract**: Add `preconnect` + a Google Fonts `<link>` for `Cinzel:wght@500;600;700` and
`Spectral:ital,wght@0,400;0,500;0,600;1,400;1,500` in `Layout.astro` `<head>` (after `:18`). In
`global.css` `@theme inline`, add `--font-display: "Cinzel", ui-serif, serif;` and
`--font-body: "Spectral", Georgia, ui-serif, serif;` (generates `font-display` / `font-body`).

#### 4. Remove dead dark variants + off-palette badge

**File**: `src/components/ui/button.tsx`, `src/components/ui/LibBadge.astro`

**Intent**: Drop the now-inert `dark:` variant classes from the button and re-skin the hardcoded
blue/purple `LibBadge` to the palette so nothing references the deleted dark theme or off-palette hues.

**Contract**: Remove `dark:*` utility fragments in `button.tsx` variants; behavior unchanged. In
`LibBadge.astro` (`:10,12`) swap `bg-blue-900/50 text-blue-200` / `bg-purple-500/30 text-purple-200`
for palette utilities (e.g. `bg-card text-accent border-border`).

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run astro -- check`
- [ ] Lint passes: `npm run lint`
- [ ] Existing tests still pass: `npm test`

#### Manual Verification:

- [ ] Every page renders dark (no white flashes / leftover blue `bg-cosmic`); body text is parchment.
- [ ] Cinzel renders on a probe heading and Spectral on a probe italic line; decklist stays monospace.
- [ ] `bg-add` / `bg-brand` / `bg-success` utilities resolve (spot-check in devtools).

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: App shell — sidebar + logo

### Overview

Build the persistent left sidebar (logo, nav, user footer) and host it as a layout slot for the authed
app screens (`/`, `/paths`, `/paths/[id]`, `/dashboard`), replacing today's top auth bar. Auth pages
keep a minimal (sidebar-less) layout for the split-hero.

### Changes Required:

#### 1. DeckDelta logo + sidebar component

**File**: `src/components/ui/Logo.astro` (new), `src/components/app/Sidebar.astro` (new)

**Intent**: A reusable brand mark (the green-shield + gold "deck delta" wordmark lifted from the v3
SVG) and the sidebar chrome that uses it.

**Contract**: `Logo.astro` renders the inline SVG + `<span class="font-display">deck delta</span>`
(green `--brand` on "delta"), size prop optional. `Sidebar.astro` renders: logo header; nav list with
items — **New comparison** (`href="/"`, active when on `/`), **Saved decks** (`href="/paths"`, active on
`/paths*`), **Shared with me** and **History** rendered **disabled/muted** (no `href`, `aria-disabled`);
active item uses the gold left-border + faint gold gradient (`border-l-2 border-accent`, gradient from
`accent/15`); a footer with the user avatar circle + email/"account ▾" using `Astro.locals.user`.
Accepts a `current` prop (or derives from `Astro.url.pathname`) to mark the active item.

> **Intentional**: "Shared with me" and "History" are kept as **disabled, visible** nav items on
> purpose — they are reminders of planned features, not dead code. Do not remove them; render them
> muted + `aria-disabled` with no `href`.

#### 2. App layout slot

**File**: `src/layouts/AppLayout.astro` (new), `src/layouts/Layout.astro`

**Intent**: Give app pages a sidebar+content shell while keeping `Layout.astro` as the bare HTML
document used by auth pages.

**Contract**: `AppLayout.astro` wraps `Layout.astro` (so global CSS/fonts/Banner load once) and renders
a flex row: `<Sidebar current=… />` + `<main class="flex-1 …"><slot/></main>`. Remove the top auth-bar
`<header>` from `Layout.astro` (`:39-72`) — auth state now lives in the sidebar footer. Keep the
`Banner` (config error) in `Layout.astro`. Sidebar collapses/hides below `sm` (stack or off-canvas);
exact responsive behavior is a manual-verify item.

#### 3. Point app pages at the shell

**File**: `src/pages/index.astro`, `src/pages/paths/index.astro`, `src/pages/paths/[id].astro`, `src/pages/dashboard.astro`

**Intent**: Swap these pages from `Layout` + `bg-cosmic` wrapper to `AppLayout` so they gain the
sidebar. Inner content is restyled in later phases; here, just re-host them.

**Contract**: Replace `<Layout>…<div class="bg-cosmic">` shells with `<AppLayout current=…>`; preserve
each page's data fetching and island mounts. No visual polish of inner content yet beyond inheriting the
dark base.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run astro -- check`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:

- [ ] Sidebar shows on `/`, `/paths`, `/paths/[id]`, `/dashboard` with correct active item per route.
- [ ] "Shared with me" / "History" appear disabled (muted, not clickable); "New comparison"/"Saved
      decks" navigate correctly.
- [ ] Footer shows the signed-in email; signed-out state degrades gracefully (e.g. on `/`).
- [ ] Top auth bar is gone; sign-out still reachable (from sidebar footer account menu or `/dashboard`).
- [ ] Responsive: sidebar collapses sensibly on a narrow viewport.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Main comparison — Setup/collapse + Columns (States A/B)

### Overview

Restyle the main comparer to v3 and add the Setup→Result collapse flow with a gold Calculate CTA, while
preserving the debounce/guard behavior. Restyle the Remove/Add columns (red/green headers + ± glyphs),
the cost summary (headline box), the sort control (3 chips), the unresolved notice, and card rows
(26×36 thumbs). The Columns⇄Merged toggle UI is added here but Merged content lands in Phase 4.

### Changes Required:

#### 1. Collapse flow + Calculate CTA + dark inputs

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Present a Setup state (two solid-field inputs + a gold "Calculate the Delta →" CTA) that,
once a plan is `ready`, collapses to the one-line "Decklists · base N · target N — collapsed / Edit
decklists ▾" strip; the strip reopens the inputs. Keep the 700ms debounce and request-token guard.

**Contract**: Add a derived/explicit `inputsCollapsed` state = (`view.status === "ready"` and the user
hasn't reopened). The Calculate CTA calls the existing `runPlan(baseText, targetText)` immediately
(guarded). "Edit decklists ▾" sets the inputs back open without clearing text. `textareaClasses`
(`:23-24`) change from `border-white/20 bg-white/10 … focus:ring-purple-400` to solid fields
(`bg-input border-border … focus:ring-ring`). Collapsed strip = a `bg-card border-border` row showing
counts (derive base/target line counts) + a gold "Edit decklists ▾" affordance. Preserve `idle/loading/
error/ready` branches and the accept/accept-all handlers unchanged.

#### 2. Calculate CTA notch frame

**File**: `src/components/ui/NotchButton.tsx` (new)

**Intent**: A small reusable wrapper reproducing the v3 `clip-path` notch (gold fill, dark inset) for
the one primary CTA per screen, without forking shadcn `Button`.

**Contract**: A presentational component wrapping children in the `.notch`/`.notchIn` clip-path
(ported into `global.css` as utilities or inline style) with gold `--primary` fill + `--primary-
foreground` text in `font-display`. Used by Calculate (Phase 3) and Sign in (Phase 5). Variant prop for
gold vs green (`--success`) fill (green used by Phase 6 Fork).

#### 3. Remove/Add column headers + rows

**File**: `src/components/deck/CardGroupColumn.tsx`, `src/components/deck/CardRow.tsx`

**Intent**: Color-code the two columns (red "− Remove" / green "+ Add" headers with sign glyph + count)
and restyle rows to the v3 dark card-row (26×36 thumb, parchment name, muted price); keep the
hover-zoom preview.

**Contract**: `CardGroupColumn` gains a `tone: "remove" | "add"` (or derive from `title`) driving header
bg/border/text (`--destructive` vs `--add`) and the ± glyph; panel becomes `bg-card border-border`.
`CardRow` thumb `<img>` changes `h-14 w-10` → ~`h-9 w-[26px]` (26×36), name → `text-card-foreground`,
price → `text-muted-foreground`; hover-zoom popover retained. Subsection H4s use `font-display` gold.

#### 4. Cost summary headline + 3-chip sort + unresolved notice

**File**: `src/components/deck/CostSummary.tsx`, `src/components/deck/SortControl.tsx`, `src/components/deck/UnresolvedNotice.tsx`

**Intent**: Cost becomes the gold-bordered "TOTAL UPGRADE COST" headline box; sort becomes the v3
3-chip row `[Grouped | Flat | Price ↓]`; unresolved notice gets the v3 red-box skin.

**Contract**: `CostSummary` → `border-accent` gradient box, label `text-muted-foreground` uppercase,
amount `font-display text-2xl text-foreground`; same `planAddCost` data. `SortControl` keeps the
existing `SortMode {layout,key,direction}` contract but renders 3 chips mapping to `{grouped}`,
`{flat,name,asc}`, `{flat,price,desc}` (active chip = gold); the existing capability is unchanged, only
the control shape. `UnresolvedNotice` → `bg-[#2a1714] border-[#6e3a33]`-equivalent palette utilities,
`btnR`-style Accept buttons; logic unchanged.

#### 5. View toggle scaffold

**File**: `src/components/deck/DeckComparer.tsx`, `src/components/deck/ViewToggle.tsx` (new)

**Intent**: Add the `[Columns | Merged]` segmented control and a `viewMode` state; wire Columns to the
existing two-column render. Merged branch renders a placeholder until Phase 4.

**Contract**: `viewMode: "columns" | "merged"` state (default `columns`); `ViewToggle` is a presentational
segmented control (active = gold) mirroring the sort chips. Columns branch = today's grid (`:197-200`).

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run astro -- check`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass: `npm test`

#### Manual Verification:

- [ ] Setup state shows two solid inputs + gold Calculate CTA; clicking it builds the plan immediately.
- [ ] After a result, inputs collapse to the counts strip; "Edit decklists ▾" reopens them with text intact.
- [ ] Typing still auto-builds after ~700ms (debounce preserved); stale runs never clobber newer ones.
- [ ] Remove column is red-headed, Add is green-headed, each with ± glyph + count; rows show 26×36 thumbs with working hover-zoom.
- [ ] Cost reads as the gold headline box; sort shows 3 chips and reorders correctly; unresolved notice + Accept/Accept-all still work.
- [ ] View toggle shows `[Columns | Merged]`; Columns renders the plan (Merged placeholder acceptable here).

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Main comparison — Merged view (State C)

### Overview

Make the Columns⇄Merged toggle functional: a single interleaved list with −/+/= row markers, a type
pill, a signed/colored price, and a colored left border per row — derived from the existing
`UpgradePlan` with no engine change.

### Changes Required:

#### 1. Signed price formatter

**File**: `src/components/deck/labels.ts`

**Intent**: Add a signed money formatter beside `formatUsd` for merged rows (`+$94.38` / `−$4.77` / `—`).

**Contract**: `formatSignedUsd(value: number | null, sign: "add" | "remove"): string` — `null → "—"`,
else `+$N.NN` for add / `−$N.NN` for remove (true minus glyph, matching `formatUsd`'s `~$` family but
signed). Pure; unit-tested in `labels.test.ts`. Does not change `formatUsd`.

#### 2. Merged row + renderer

**File**: `src/components/deck/MergedRow.tsx` (new), `src/components/deck/MergedView.tsx` (new)

**Intent**: Render the interleaved Remove/Add/(optional Shared "stays") rows in one list per the v3
merged layout.

**Contract**: `MergedRow` props `{ entry: DeckCard; kind: "remove" | "add" | "stay" }` → row with a
`−/+/=` glyph (red/green/muted), the stripe/thumb, name, a type pill (`entry.card.category` via
`categoryLabel`), and `formatSignedUsd` price; `kind` drives the colored left border + row bg. `MergedView`
takes the `UpgradePlan` (`remove`/`add`/`shared`) + `sortMode`, flattens/sorts (reuse `flattenAndSort`),
and renders `MergedRow`s. Honors the existing sort.

#### 3. Wire the toggle

**File**: `src/components/deck/DeckComparer.tsx`

**Intent**: Render `MergedView` when `viewMode === "merged"`, Columns otherwise — same plan data, no
recompute.

**Contract**: Replace the Phase 3 Merged placeholder with `<MergedView plan={view.plan} sortMode={sortMode} />`.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass incl. new formatter tests: `npm test`

#### Manual Verification:

- [ ] Toggling Merged shows one interleaved list; toggling back to Columns is instant (no recalculation).
- [ ] Rows show correct −/+/= marker, type pill, colored left border, and signed/colored price; missing prices show "—".
- [ ] Sort chips reorder the merged list consistently with the columns view.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Auth — split-hero + tab links (Screen 2)

### Overview

Restyle sign-in and sign-up into the v3 split card (card-art hero left, form right) while keeping them
as two server-rendered pages with their existing form actions and error handling. The tab row renders
as links between the pages; social buttons and "Forgot?" are static.

### Changes Required:

#### 1. Auth split-hero layout

**File**: `src/layouts/AuthLayout.astro` (new) or shared partial; `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: A reusable split card: left hero (Scryfall art crop + dark gradient overlay + logo +
"Every deck has a delta." headline + art caption), right form column on `bg-card`.

**Contract**: Hero `background-image` = a Scryfall `art_crop` URL (a fixed commander, e.g. via
`https://api.scryfall.com/cards/named?exact=…&format=image&version=art_crop`, or a pinned card id),
**with a CSS gradient underlay** so failure is graceful; overlay `linear-gradient(160deg, rgba(10,7,4,.42),
rgba(10,7,4,.84))`; caption `art: <card>` in mono. Tab row = two items, active = parchment + gold
underline, inactive = muted **link** to the other page (`/auth/signin` ⇄ `/auth/signup`). Right column
hosts the existing form island.

#### 2. Restyle auth form components

**File**: `src/components/auth/FormField.tsx`, `PasswordToggle.tsx`, `SubmitButton.tsx`, `ServerError.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`

**Intent**: Solid dark fields, gold primary CTA, palette error styling; add the static "Forgot?" link
(sign-in) and the static "or continue with" + Google/Discord buttons.

**Contract**: `FormField` input → `bg-input border-border focus:ring-ring` (drop purple); `SubmitButton`
→ gold (`NotchButton` or `bg-primary text-primary-foreground`, `font-display`); `ServerError` → palette
red box. In `SignInForm` add a **static** "Forgot?" (`<span>`/non-routing link) by the password label and,
below the submit, a static "or continue with" divider + two static `btnD`-style Google/Discord buttons.
`SignUpForm` keeps confirm-password; same skin. **No OAuth handlers, no reset route** — these elements
carry no behavior.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run astro -- check`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:

- [ ] Sign-in and sign-up render the split card with the art hero (and degrade to gradient if the image fails).
- [ ] Tabs switch between the two pages via links; active tab is gold-underlined.
- [ ] Email/password sign-in and sign-up still submit, redirect, and surface server errors as before.
- [ ] "Forgot?", Google, and Discord are visible but inert (no navigation/handler); password toggle works.

**Implementation Note**: Pause for manual confirmation before Phase 6.

---

## Phase 6: Saved detail + visitor (Screens 3 & 4)

### Overview

Apply the dark skin to the path detail (`/paths/[id]` + `PathEditor`) with a breadcrumb and a real
metadata subtitle, plus static Edit/Duplicate and a static Share row. Add the static visitor/fork
chrome (top "shared · read-only" bar + fork rail) layered on the existing read-only step rendering.

### Changes Required:

#### 1. Path detail restyle + breadcrumb + metadata

**File**: `src/components/path/PathEditor.tsx`, `src/pages/paths/[id].astro`

**Intent**: Dark-skin the editor; add a "Saved decks ›" breadcrumb and a metadata subtitle (saved date,
visibility, in/out counts, cost) computed from the path's steps; keep rename/delete/add-step working.

**Contract**: Header gains a breadcrumb (`font-display` muted) + subtitle line built from real data —
`updatedAt` (saved date), `path.visibility` (🔒 private), and base→final in/out counts + cost via the
Phase 7 `overallPathSummary` (reused here over the loaded steps). Existing rename (Pencil/Save/Cancel) and
delete stay; **add static `[Edit | Duplicate]` buttons** (Duplicate non-functional) styled `btnD`. Add a
**static Share row** (copy-link field + Copy + "Public ◐" toggle) — visual only, no handlers. `StepCard`
columns reuse the Phase 3 `CardGroupColumn` skin. All glass/`bg-white` utilities → palette.

#### 2. Static visitor/fork chrome

**File**: `src/components/path/VisitorView.tsx` (new) or a static block in `PathEditor`

**Intent**: Reproduce Screen 4 visually — a read-only comparison with a top "shared · read-only" bar,
plus a right rail (UPGRADE COST box, REMOVE/ADD stat tiles, green "⑂ Fork to my account" CTA, "Export
list"). Static only; no public route is created.

**Contract**: A presentational component rendering the read-only step entries (reuse `toReadOnlyEntries`
/ the read-only path already in `PathEditor`) with the visitor top bar + fork rail using `NotchButton`
(green `--success`). Mounted only where a host already exists (e.g. behind a non-default prop on the
detail page or a dev-only preview); it is **not** linked from anywhere and has no backing endpoint. If no
clean host exists, render it as a styled static section within the owner detail marked read-only — see
manual verify.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run astro -- check`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:

- [ ] Path detail shows the breadcrumb + real subtitle (date · 🔒 · in/out · ~$cost); rename/delete/add-step still work.
- [ ] Static `[Edit | Duplicate]` and the Share row render in the v3 style and are inert.
- [ ] Visitor/fork chrome renders per the mock (read-only comparison + cost rail + green Fork CTA), clearly static, reachable only via its preview host.

**Implementation Note**: Pause for manual confirmation before Phase 7.

---

## Phase 7: Saved-decks grid + computed metadata (Screen 5)

### Overview

Turn the paths list into the v3 saved-decks card grid where each card shows **real** computed metadata
(base→final cost + in/out counts + visibility), add a dashed "New comparison" tile and a static search
field, and align the dashboard.

### Changes Required:

#### 1. Base→final path summary (pure)

**File**: `src/lib/path/chain.ts`, `src/lib/path/chain.test.ts`

**Intent**: Compute the overall start→end delta of a path (counts + cost) by diffing the first step's
snapshot against the last — the number that means "what this whole path costs".

**Contract**: `overallPathSummary(steps: StepSnapshot[]): { addCount: number; removeCount: number; cost:
PlanCost }`. For `steps.length < 2` → zeros. Else `plan = diffDecks(steps[0].cards, steps[last].cards)`;
`addCount`/`removeCount` = summed quantities across `plan.add`/`plan.remove` groups; `cost =
planAddCost(plan.add)`. Pure; reuses existing engine. Unit-tested (incl. single-step and empty cases).

#### 2. Embed steps in the list query + summary mapping

**File**: `src/pages/paths/index.astro`, `src/lib/api/paths.ts`

**Intent**: Make the list fetch each path's steps (RLS-scoped) so the grid can show real metadata.

**Contract**: Change the `upgrade_paths` select to embed steps (Supabase nested select
`*, path_steps(*)` ordered by `position`), or fetch `path_steps` for the listed ids and group. Map each
path → `{ path: UpgradePath, summary: overallPathSummary(steps.map(s => s.snapshot)) }` using
`toPathStep`/`parseSnapshot`. No new endpoint; no card-data lookups (snapshots only).

#### 3. Card grid UI

**File**: `src/pages/paths/index.astro`, `src/components/path/NewPathForm.tsx`

**Intent**: Render the responsive 3-col grid of deck cards + a dashed "New comparison" tile + a static
search field + "New" affordance, in the v3 skin.

**Contract**: Title "Saved decks"; static search input (visual only); grid `grid-cols-1 sm:2 lg:3` of
cards — each a `bg-card border-border` tile with a stripe/art header, title, and the metadata line
`~$cost · {addCount}/{removeCount} · {🔒 private | ◐ unlisted}` (via `formatUsd` + visibility). Dashed
`New comparison` tile triggers `NewPathForm` (restyled). Empty state restyled.

#### 4. Dashboard alignment

**File**: `src/pages/dashboard.astro`

**Intent**: Bring the stub into the v3 shell (or redirect to `/paths`).

**Contract**: Either restyle the stub inside `AppLayout` (welcome + sign-out, palette) or redirect
`/dashboard` → `/paths`. Implementer's call; keep sign-out reachable.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Type check passes: `npm run astro -- check`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass incl. `overallPathSummary` cases: `npm test`

#### Manual Verification:

- [ ] `/paths` shows the 3-col card grid; each card's cost + in/out + lock icon match the path's base→final diff (cross-check against opening the path).
- [ ] Dashed "New comparison" tile creates a path (NewPathForm still works); empty state renders in v3 style.
- [ ] Static search field renders but is inert; dashboard is coherent (restyled or redirects).
- [ ] Multi-step path (≥3 steps) shows base→final numbers, not cumulative or last-step.

**Implementation Note**: Final phase — confirm the full 5-screen pass against the v3 mock.

---

## Testing Strategy

### Unit Tests (pure logic — vitest, the project convention):

- `formatSignedUsd` — add/remove sign, null → "—", rounding (`labels.test.ts`).
- `overallPathSummary` — 0/1/2/3-step paths, missing-price exclusion, count sums (`chain.test.ts`).
- Existing suites must stay green (no engine/contract changes).

### Integration / Build:

- `npm run build` (Astro check + Cloudflare adapter) and `npm run lint` after every phase.

### Manual Testing Steps:

1. Theme: load each route, confirm dark palette + fonts, no blue/white leftovers.
2. Main: Setup → Calculate → collapse → Edit reopen; debounce auto-build; Columns vs Merged; sort; unresolved Accept.
3. Auth: split-hero render + image-fail fallback; sign-in/up submit + errors; inert social/forgot.
4. Paths: detail breadcrumb/subtitle + rename/delete/add-step; static share/visitor chrome.
5. Grid: metadata correctness vs opened path; New tile; multi-step base→final check.

## Performance Considerations

- Grid metadata adds one diff per listed path over already-loaded snapshots (cheap, server-side, no
  network). If a user has many paths, prefer the single nested `path_steps` embed over N queries.
- Google Fonts: two families, `display=swap`; preconnect added. Acceptable for an edge-served app.
- Hero art is one external image on auth pages only, behind a gradient — non-blocking.

## Migration Notes

No data migration. No DB/schema/RLS changes. `bg-cosmic` keeps its name (re-pointed) so consumers don't
churn mid-restyle. The `.dark` class removal is safe — nothing sets `.dark` on `<html>`.

## References

- Research: `context/changes/ui-upgrade/research.md`
- Design source: `context/changes/ui-upgrade/handoff/mtg-deck-upgrade-tool/project/DeckDelta Dark v3.dc.html`
- Engine reuse: `src/lib/path/chain.ts:31-60`, `src/components/deck/labels.ts`, `src/lib/deck` barrel
- Contract surfaces (must not break): `docs/reference/contract-surfaces.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Theme & fonts foundation

#### Automated

- [x] 1.1 Build passes: `npm run build` — b20cd8a
- [x] 1.2 Type check passes: `npm run astro -- check` — b20cd8a
- [x] 1.3 Lint passes: `npm run lint` — b20cd8a
- [x] 1.4 Existing tests still pass: `npm test` — b20cd8a

#### Manual

- [x] 1.5 Every page renders dark; body text parchment; no blue/white leftovers — b20cd8a
- [x] 1.6 Cinzel + Spectral render on probes; decklist stays monospace — b20cd8a
- [x] 1.7 `bg-add` / `bg-brand` / `bg-success` utilities resolve — b20cd8a

### Phase 2: App shell — sidebar + logo

#### Automated

- [x] 2.1 Build passes: `npm run build` — b61b6b7
- [x] 2.2 Type check passes: `npm run astro -- check` — b61b6b7
- [x] 2.3 Lint passes: `npm run lint` — b61b6b7

#### Manual

- [x] 2.4 Sidebar shows on all app routes with correct active item — b61b6b7
- [x] 2.5 Shared/History disabled; New comparison/Saved decks navigate — b61b6b7
- [x] 2.6 Footer shows signed-in email; signed-out degrades gracefully — b61b6b7
- [x] 2.7 Top auth bar gone; sign-out still reachable — b61b6b7
- [x] 2.8 Sidebar collapses sensibly on narrow viewport — b61b6b7

### Phase 3: Main comparison — Setup/collapse + Columns (States A/B)

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Type check passes: `npm run astro -- check`
- [x] 3.3 Lint passes: `npm run lint`
- [x] 3.4 Tests pass: `npm test`

#### Manual

- [x] 3.5 Setup state: solid inputs + gold Calculate CTA builds immediately
- [x] 3.6 After result, inputs collapse to strip; Edit reopens with text intact
- [x] 3.7 Debounce auto-build preserved; stale runs never clobber newer
- [x] 3.8 Red Remove / green Add headers + glyphs; 26×36 thumbs w/ hover-zoom
- [x] 3.9 Gold cost headline; 3-chip sort reorders; unresolved Accept/Accept-all work
- [x] 3.10 View toggle shows [Columns | Merged]; Columns renders the plan

### Phase 4: Main comparison — Merged view (State C)

#### Automated

- [ ] 4.1 Build passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`
- [ ] 4.3 Tests pass incl. signed formatter: `npm test`

#### Manual

- [ ] 4.4 Merged shows interleaved list; back to Columns instant (no recompute)
- [ ] 4.5 Rows: correct −/+/= marker, type pill, colored border, signed price, "—" for missing
- [ ] 4.6 Sort reorders merged list consistently with columns

### Phase 5: Auth — split-hero + tab links (Screen 2)

#### Automated

- [ ] 5.1 Build passes: `npm run build`
- [ ] 5.2 Type check passes: `npm run astro -- check`
- [ ] 5.3 Lint passes: `npm run lint`

#### Manual

- [ ] 5.4 Split card + art hero renders; degrades to gradient on image fail
- [ ] 5.5 Tabs switch pages via links; active tab gold-underlined
- [ ] 5.6 Email/password sign-in + sign-up submit, redirect, surface server errors
- [ ] 5.7 Forgot/Google/Discord visible but inert; password toggle works

### Phase 6: Saved detail + visitor (Screens 3 & 4)

#### Automated

- [ ] 6.1 Build passes: `npm run build`
- [ ] 6.2 Type check passes: `npm run astro -- check`
- [ ] 6.3 Lint passes: `npm run lint`

#### Manual

- [ ] 6.4 Detail breadcrumb + real subtitle; rename/delete/add-step still work
- [ ] 6.5 Static [Edit | Duplicate] + Share row render and are inert
- [ ] 6.6 Visitor/fork chrome renders per mock, clearly static, only via preview host

### Phase 7: Saved-decks grid + computed metadata (Screen 5)

#### Automated

- [ ] 7.1 Build passes: `npm run build`
- [ ] 7.2 Type check passes: `npm run astro -- check`
- [ ] 7.3 Lint passes: `npm run lint`
- [ ] 7.4 Tests pass incl. `overallPathSummary`: `npm test`

#### Manual

- [ ] 7.5 3-col grid; each card's cost + in/out + lock match base→final diff
- [ ] 7.6 Dashed New tile creates a path; empty state restyled
- [ ] 7.7 Static search inert; dashboard coherent (restyled or redirects)
- [ ] 7.8 Multi-step path shows base→final numbers (not cumulative/last-step)
