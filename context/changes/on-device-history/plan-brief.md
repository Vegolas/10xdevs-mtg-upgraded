# On-Device Comparison History — Plan Brief

> Full plan: `context/changes/on-device-history/plan.md`

## What & Why

DeckDelta lets a user compare two Commander decks into a grouped upgrade plan, but every comparison is lost on reload. This change adds an on-device history (roadmap S-04 / FR-009, the Secondary success criterion) so a user can save a comparison and revisit it later **without re-pasting the lists**.

## Starting Point

The comparison surface is one `client:load` React island (`DeckComparer.tsx`) holding `baseText`, `targetText`, and a `view` union; the plan auto-builds ~700ms after both textareas settle. There is **no persistence anywhere** in `src/` today, and Vitest runs node-only (pure lib functions are unit-tested; React components are verified manually).

## Desired End State

A **Save this comparison** button captures the current comparison. A **History (N)** button opens a slide-over **drawer** listing saved comparisons newest-first, each auto-labeled with its save time and a `+adds / −removes` summary. Clicking an entry refills both textareas and the plan rebuilds automatically. Entries can be deleted individually or via Clear all; re-saving the same lists updates the entry in place; history survives reloads (lost only if the user clears browser data).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| What to persist | Inputs only, re-derive on revisit | Smallest storage, always-fresh prices, reuses the whole pipeline, avoids the restore-vs-debounce race | Plan |
| Save trigger | Explicit Save button | Curated history of comparisons the user cares about, no keystroke noise | Plan |
| History UI surface | Slide-over drawer | Keeps the main view clean with room for a longer list | Plan |
| Entry labeling | Auto-derived (time + `+adds / −removes`) | Zero friction, enough to recognize an entry | Plan |
| Dedup & size | Dedup identical lists, cap newest ~30 | No clutter from repeat saves, bounded storage | Plan |
| Management | Per-entry delete + confirmed Clear all | Full user control, simple to build | Plan |

## Scope

**In scope:** pure history module (types, dedup/cap/delete/clear transforms, label summary, versioned + defensively-parsed localStorage bridge); `HistoryDrawer` component; `useDeckHistory` hook; Save/History/restore wiring in `DeckComparer`; unit tests for all pure logic.

**Out of scope:** full-result snapshot, offline/instant revisit, backend/cross-device sync, cross-tab sync, user-named/renameable entries, `/history` route, export/import, auto-save, any change to the diff/resolve/cost pipeline.

## Architecture / Approach

A pure, node-testable `src/lib/history/` module owns the data model, list transforms, and the localStorage bridge (everything verifiable by unit test). The React layer — `HistoryDrawer` + a thin `useDeckHistory` hook — wires into the existing island. **Revisit is just "set the two texts":** the restore handler sets `baseText`/`targetText` and closes the drawer; the existing debounce `useEffect` is the single rebuild path (the handler must not call `runPlan` or inject a `ready` view). localStorage is touched only inside effects/handlers for SSR/hydration safety.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. History store (pure lib + persistence) | `src/lib/history/` types, transforms, versioned localStorage bridge, full unit tests | Defensive parsing must cover corrupt/old-schema data without crashing |
| 2. Drawer UI + Save/Restore wiring | `HistoryDrawer`, `useDeckHistory`, Save/History/restore in `DeckComparer` | Restore must not double-build or clobber the view; no hydration mismatch |

**Prerequisites:** S-01 (grouped upgrade plan) — done.
**Estimated effort:** ~1–2 after-hours sessions across 2 phases.

## Open Risks & Assumptions

- Revisit performs a fresh Scryfall lookup; not offline-capable and prices may differ from save time (accepted — prices are explicitly approximate).
- No cross-tab sync — other tabs see new entries only after their own reload (accepted for MVP).
- Component layer has no automated tests (repo has no jsdom/RTL); the drawer + wiring rely on the manual checklist.

## Success Criteria (Summary)

- User can save a comparison and revisit it later without re-pasting the lists.
- Saved history persists across reloads; dedup, cap, delete, and Clear all behave as specified.
- `npm run test`, `npm run lint`, and `npm run build` all pass; no console or hydration warnings.
