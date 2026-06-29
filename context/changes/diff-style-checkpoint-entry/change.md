---
change_id: diff-style-checkpoint-entry
title: Diff-mode checkpoint entry for the path builder (+/- card deltas)
status: planned
created: 2026-06-29
updated: 2026-06-29
archived_at: null
---

## Notes

Path-builder QOL: let a brewer add a checkpoint by typing only `+ <card>` / `- <card>`
delta lines instead of re-pasting the full ~80-card list. The new list is derived from
the prior step's frozen snapshot, resolved, and persisted as a normal immutable snapshot.

Source artifacts:
- Shape: context/foundation/shape-notes.md (diff-style-checkpoint-entry, quality_check_status: accepted)
- PRD: context/foundation/prd-diff-checkpoint.md (brownfield, feature-scoped)

Open questions carried to /10x-plan: diff-mode affordance (toggle/tab/field); prior-snapshot
already carrying unresolved cards; persisted-delta storage shape & display; delta quantity
semantics (`+2 Island` / `-1 Forest`).
