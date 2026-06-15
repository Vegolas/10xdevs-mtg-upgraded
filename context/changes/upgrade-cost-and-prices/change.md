---
change_id: upgrade-cost-and-prices
title: Show per-card prices and total upgrade cost
status: implementing
created: 2026-06-16
updated: 2026-06-16
archived_at: null
---

## Notes

Roadmap slice **S-03** (`context/foundation/roadmap.md`). Thin enrichment over S-01's grouped upgrade plan: surface an approximate per-card price (from F-01's card-data lookup) and a summed total upgrade cost. PRD refs: US-01, FR-006, FR-007. Prereq S-01 is done.

Open question carried from roadmap: does the selected card-data source expose per-card prices with adequate coverage? Pricing is explicitly *approximate/indicative* per the PRD (EU vs US differ), so coverage gaps should degrade gracefully rather than block.
