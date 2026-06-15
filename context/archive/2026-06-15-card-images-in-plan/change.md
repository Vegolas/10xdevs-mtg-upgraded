---
change_id: card-images-in-plan
title: Card images in the upgrade plan
status: archived
created: 2026-06-15
updated: 2026-06-16
archived_at: 2026-06-15T22:07:36Z
---

## Notes

Roadmap slice S-02 (PRD FR-005, US-01): show a card image for each card in the upgrade plan. Pure rendering over the already-resolved `Card.imageUrl` — no card-data-layer changes. Decisions: inline thumbnail + hover/focus enlarge; derive Scryfall `small` URL + native lazy loading; placeholder tile when no image; shared cards get the same treatment; front-face only for DFCs. See `plan.md` / `plan-brief.md`.
