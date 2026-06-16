---
change_id: did-you-mean-accept
title: "Did you mean …?" inline accept
status: impl_reviewed
created: 2026-06-16
updated: 2026-06-16
---

## Notes

Roadmap slice S-05 (PRD Guardrails §graceful input handling, US-01 AC): one-click
accept for the resolver's "did you mean …?" suggestion on an unresolved card name.
Shaped 2026-06-16 (`shape-notes.md`): D1 — edit the paste text in place (rides the
existing 700ms debounce + history save/restore unchanged); D2 — per-card accept +
an "accept all" action.

Plan decisions (2026-06-16): write-back via a **pure `applySuggestion` helper**
(`src/lib/deck/accept.ts`) that re-extracts each line's name with the parser's own
rule and matches by `resolutionKey` — touches no contract-surface type and fixes
all deduped duplicate lines; chosen over the shape-notes' line-index threading
because the resolver dedups unresolved names (one entry ↔ many lines). "Accept all"
shows only when 2+ suggestions exist. See `plan.md` / `plan-brief.md`.
