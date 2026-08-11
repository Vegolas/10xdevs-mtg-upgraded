# DFC Name Resolution + Per-Group Counts — Plan Brief

> Full plan: `context/changes/dfc-name-resolution/plan.md`

## What & Why

Double-faced / split / adventure / MDFC cards never resolve in the upgrade plan: the resolver sends the full `Front // Back` name to Scryfall's `/cards/collection`, which matches only the front face, so the full name returns `not_found` and the fuzzy fallback echoes the same `//` name back as a useless "did you mean". Since most exporters emit the full `//` form, every DFC misses — and when two decks list the same DFC in different forms, one side resolves and the other doesn't, inflating remove/add counts and pushing shared cards out of "Shared". This fixes resolution and bundles a small UI polish (per-group count badges).

## Starting Point

The resolver in `src/lib/card-data/` already dedups input, keeps a per-key original-name map, caches by canonical name, and runs a fuzzy fallback per miss. The upgrade-plan components (`CardGroupColumn.tsx`, `SharedCardsDisclosure.tsx`) render one labeled subsection per card-type group and already show a column-level total in a muted style.

## Desired End State

DFCs resolve regardless of whether the exporter wrote the front-only or full `//` name; `Card.name` stays canonical so the diff keys correctly and mixed-form DFCs land in "Shared". Genuine misses report the spelling the user pasted, with suggestions derived from the front face. Each card-type group in Remove / Add / Shared shows a distinct-card count next to its label.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where front-face reduction lives | Orchestrator (`resolve.ts`), with dedup AND cache keyed on the front face | One source of truth; collapses the two forms of a DFC and reuses the existing original-name map | Plan |
| Cache-key consistency | Store AND look up the cache on `frontFace(card.name)` | Otherwise a later front-only lookup of a cached DFC misses the cache | Plan |
| Miss reporting | Report the original pasted name; run fuzzy on the front face | User sees their spelling; suggestion is sharper and avoids re-echoing the `//` name | Plan |
| Empty front face (`// Back`) | Treat as malformed, no API call | Mirrors the existing blank-name guard | Plan |
| Test coverage | Resolver unit tests only (front-only-sent, original-echoed-on-miss) | Matches change.md; reuses the harness + DFC fixture; badges are trivial cosmetic | Plan |
| Count badge | Muted trailing span, distinct-card count (`group.cards.length`) | Visually consistent with the existing column total; quantity isn't in the model | Plan |
| Symptom-#2 follow-up | Manual verification step only; secondary causes stay parked | Proves the fix without open-ended scope creep | Plan |

## Scope

**In scope:** front-face reduction in the resolver (dedup + cache + fetch identifiers), original-name preservation on misses, two resolver unit tests, per-group count badges in the two components.

**Out of scope:** parser / suffix handling, images, prices, quantity in the data model, component-test harness, transport-layer signature changes.

## Architecture / Approach

Add one pure `frontFace(name)` helper in `resolve.ts` (substring before the first `//`, trimmed; no-op for non-DFC names) and route every name-keyed operation through it — dedup key, cache lookup, cache store, and the identifiers sent to Scryfall — while keeping the dedup map's value as the original input. Map each `not_found` echo (a front-face name) back to its original via that map; fuzzy-query the front face but build the `UnresolvedCard` with the original name. The transport layer is untouched. UI: append a muted `group.cards.length` span to each per-group `<h4>` in both components.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Resolver front-face resolution | DFCs resolve from either name form; misses report the typed spelling; 2 unit tests | Cache store key must match the lookup key (`frontFace`), or DFC cache hits silently break |
| 2. Per-group count badges | Distinct-card count next to each label in Remove/Add/Shared | Purely cosmetic; matching the existing muted style |

**Prerequisites:** `card-data-resolution` (F-01) and `grouped-upgrade-plan` (S-01) are done (they are).
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Assumes Scryfall continues to match `name` identifiers against the front face and to return the canonical full name in `data` (confirmed via direct API probe on 2026-06-15).
- If remove/add still looks off after the fix, a secondary cause (set-code / collector suffixes) may exist — handled as a separate follow-up, not here.
- Count badges show distinct cards, not summed quantities (the model carries no quantity).

## Success Criteria (Summary)

- A decklist with full `//` DFC names resolves every DFC; mixed-form DFCs across two decks land in "Shared".
- A real base/target pair produces plausible remove/add counts (no DFC-driven inflation).
- Each card-type group shows a count matching the cards listed under it.
