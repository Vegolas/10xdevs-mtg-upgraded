---
change_id: dfc-name-resolution
title: Fix double-faced card resolution and add per-group counts to the upgrade plan
status: implementing
created: 2026-06-15
updated: 2026-06-15
archived_at: null
---

## Notes

Follow-up to **grouped-upgrade-plan** (S-01) and **card-data-resolution** (F-01), surfaced during S-01 manual testing.

### Root cause (confirmed via direct Scryfall API probe, 2026-06-15)

`GET/POST /cards/collection` matches a `name` identifier **only against the front-face name** of double-faced / split / adventure / MDFC cards. The combined `Front // Back` name returns `not_found`.

Evidence (real API):
- Sent front-only `Spiked Corridor`, `Fire`, `Delver of Secrets` → **all found** (each resolves to its full canonical `A // B` name in `data`).
- Sent full `Spiked Corridor // Torture Pit`, `Fire // Ice`, `Delver of Secrets // Insectile Aberration` → **all `not_found`**.

Most exporters (MTGGoldfish, etc.) emit the **full** `//` name, so every DFC currently misses the batch collection lookup. The fuzzy fallback (`/cards/named?fuzzy=`) *does* match the full name, which is why the UI shows the unhelpful "did you mean `Spiked Corridor // Torture Pit`?" — a suggestion identical to the input.

### Symptoms reported

1. DFC names from MTGGoldfish never resolve; retyping the canonical `//` name doesn't help.
2. Upgrade plan shows implausible "remove 18 / add 20": DFCs drop out of the diff, and when the two decks list a DFC in different forms (front-only vs full `//`), one side resolves and the other lands in "unresolved" — inflating remove/add and pushing genuinely-shared cards out of "Shared".

### Intended fix

- In the card-data resolver (`src/lib/card-data/`), reduce any `Front // Back` input to its **front face** before the `/cards/collection` request (split on `//`, trim). Scryfall still returns the canonical full `name`, so `Card.name` (the diff key) stays canonical and consistent regardless of which form the exporter used.
- Preserve the **original input** spelling for `unresolved` / "did you mean" reporting (don't report the truncated front-only name).
- Add a unit test mirroring `resolve.test.ts` (front-only sent for `//` input; original name echoed on a genuine miss).

### Bundled UI polish (per user request)

- Add per-group count badges (e.g. `Lands (3)`) next to each card-type label in `CardGroupColumn.tsx` and `SharedCardsDisclosure.tsx`.

### Open follow-up

- Re-verify symptom #2 with a real pair of decklists after the resolver fix; if "remove/add" still looks off, check for secondary causes (e.g. set-code/collector suffixes, which the S-01 parser deliberately leaves on the name).
