---
change_id: fuzzy-fix-on-save
title: Fuzzy-fix unresolved cards during path checkpoint creation
status: implemented
created: 2026-06-28
updated: 2026-06-28
archived_at: null
---

## Notes

Path-builder QOL (deferred from the `user-accounts` cycle; memory `path-builder-qol`).
Bring `PathEditor`'s add-checkpoint flow to parity with the `/` comparer's S-05
"did you mean…?" accept, applied **before** the immutable snapshot is saved.

Shaped: `context/foundation/shape-notes.md` (brownfield, accepted).
