# DeckDelta Dark v3 — UI Upgrade — Plan Brief

> Full plan: `context/changes/ui-upgrade/plan.md`
> Research: `context/changes/ui-upgrade/research.md`

## What & Why

Apply the **DeckDelta Dark v3** design handoff across all 5 screens of the existing app. The design was
generated from a single prompt against an earlier version, so the goal is to **adapt the design to the
real code** — a coherent dark/parchment/gold visual language — not to rebuild the product around the
mock's assumptions.

## Starting Point

DeckDelta is a built, feature-complete Astro 6 + React 19 + Tailwind 4 + shadcn app (MVP + accounts all
shipped). It currently runs the default **light** shadcn theme with components that hardcode blue/purple
colors, no custom fonts, no sidebar (a top auth bar instead), an always-visible debounced comparer (no
Setup/Merged states), and a title-only saved-paths list. The theme is Tailwind-4 CSS-first, so all color
tokens live in one file (`src/styles/global.css`).

## Desired End State

The whole app renders in the v3 dark theme with Cinzel/Spectral fonts and a persistent left sidebar. The
main comparison page has a Setup→collapse flow with a gold Calculate CTA, red/green Remove/Add columns,
and a working Columns⇄Merged toggle. Sign-in/up are split-hero cards. The saved-decks page is a card
grid showing real computed "~$cost · in/out · 🔒" per path. Deferred affordances (share/fork/social/
search) are styled but inert.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Design vs code framing | Adapt design → code; keep multi-step paths | Mock was one-prompt off an old build; code model wins | Research |
| Layout | Persistent left sidebar replacing top auth bar | User-directed; design-central chrome | Research |
| Saved-deck metadata | Compute it (base→final net diff) | Maps multi-step path onto the mock's single-number metaphor | Plan |
| Theme model | Single dark theme, replace light (delete `.dark`) | Design intent is one dark look; no toggle needed | Research |
| Deferred features | Restyle-as-static (no wiring) | Share/fork/social/visitor aren't built and are out of scope | Research |
| Input flow (State A) | Collapse + gold CTA, keep 700ms debounce | Faithful to v3 without dropping working auto-calc | Plan |
| Merged view (State C) | Build functional toggle | Data layer already supports it; only presentational additions | Plan |
| Auth structure | Two pages, tab-styled links (not SPA tabs) | Preserves working server auth/errors/redirects | Plan |
| Hero art | Scryfall art crop + gradient fallback | On-brand, consistent with existing Scryfall image use | Plan |
| Verification | Existing gates + manual + unit-test new pure logic | Matches the project's no-component-test convention | Plan |

## Scope

**In scope:** single dark-theme token swap + fonts; sidebar shell; restyle of all deck/auth/path
components; functional Setup→collapse flow + Calculate CTA; functional Columns⇄Merged view; signed-price
formatter; computed saved-deck grid metadata (base→final).

**Out of scope:** any new behavior for share/public/fork/export, OAuth/Google/Discord, password reset,
Shared-with-me/History routes, functional search, public/visitor route; DB/API/engine/contract changes;
theme toggle; component-test tooling.

## Architecture / Approach

Two-tier restyle: (1) overwrite `:root` tokens in `global.css` once so the dark base cascades through
the semantic shadcn utilities; (2) sweep each component to replace hardcoded colors with palette
utilities. Build the sidebar shell second, then restyle screen by screen. The only non-restyle work —
`overallPathSummary` (base→final diff) — is a pure function over already-stored snapshots plus a list
query that embeds `path_steps`; it's unit-tested. Gold is reserved for one primary action per screen +
active nav + hairlines.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Theme & fonts | Dark palette + tokens + fonts; app goes dark via cascade | Off-token hardcodes not yet swept look wrong until later phases |
| 2. App shell | Sidebar + logo replacing top auth bar | Sign-out/auth state must survive the header removal |
| 3. Main A/B | Setup/collapse + Calculate CTA + Columns restyle | Preserving debounce + request-token guard while adding the CTA |
| 4. Merged C | Functional Columns⇄Merged toggle + signed prices | Sort consistency across both views |
| 5. Auth | Split-hero + tab links + Scryfall art | Not regressing the critical server auth flow |
| 6. Detail/visitor | PathEditor restyle + static share/fork chrome | Visitor screen has no real route — keep it honestly static |
| 7. Grid | Card grid + computed base→final metadata | Correct counts/cost for multi-step paths; one query per page |

**Prerequisites:** none beyond the current repo; design handoff already extracted under the change folder.
**Estimated effort:** ~6–8 focused sessions across 7 phases (Phase 3 is the heaviest).

## Open Risks & Assumptions

- Restyle-as-static means several visible controls do nothing — must be clearly static so `/10x-impl-review`
  doesn't read them as regressions and they aren't accidentally wired.
- Sidebar responsive behavior (narrow viewports) is design-underspecified — settled during manual verify.
- Scryfall art hero depends on an external image; gradient fallback is required.
- "Base→final" is the chosen metadata semantic — a 3+ step path shows start→end delta, not cumulative.

## Success Criteria (Summary)

- All 5 screens match the v3 dark look; build + lint + tests stay green; new pure logic is unit-tested.
- The Setup→collapse flow, Columns⇄Merged toggle, and email/password auth all work; debounce/sort/RLS
  behavior is unregressed.
- Saved-deck cards show correct computed cost + in/out counts cross-checked against the opened path.
