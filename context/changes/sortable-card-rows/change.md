---
change_id: sortable-card-rows
title: Sortable card rows
status: implementing
created: 2026-06-16
updated: 2026-06-16
archived_at: null
---

## Notes

Roadmap slice S-06 (US-01; FR-004 grouped display, FR-008 display — a display
enhancement beyond the MVP FRs): let the user sort the cards in the upgrade plan
by name, type, or price instead of the fixed category-bucket-then-name order.

Shaped 2026-06-16 (`shape-notes.md`): D1 — an **opt-in flat-list toggle** on top
of the preserved grouped default (FR-004's grouping stays the default; a toggle
flattens Remove/Add/Shared into one sorted list). D2 — keys: name (A→Z/Z→A),
price (high→low/low→high, nulls last), type (flat). D3 — the chosen sort persists
across sessions (local storage, like history; a global view pref, not part of a
saved comparison). D4 — one global control for Remove/Add/Shared.

Render-layer only — keep `src/lib/deck/diff.ts` pure (flatten + re-sort in the
components). Sort is display-only: cost total, `CardRow`, and history save/restore
must not regress. Open for `/10x-plan`: whether "Flat · Type" is worth a distinct
option vs. treating the grouped default as the "by type" sort. See `shape-notes.md`.
