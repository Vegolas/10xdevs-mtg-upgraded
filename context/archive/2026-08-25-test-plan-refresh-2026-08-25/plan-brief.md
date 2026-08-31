# Test-Plan Refresh 2026-08-25 — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-08-25/plan.md`

## What & Why

`/10x-test-plan --refresh` staged a set of edits in §8 of
`context/foundation/test-plan.md` but did not apply them. This change applies them —
and corrects three of the staged note's grounding claims that do not survive contact
with the repo. The rollout the plan describes is finished, so the document now
describes a world that no longer exists: it excludes browser E2E on the grounds that
the logic boundary is uncovered, when Phases 1–3 covered it.

## Starting Point

A 736-line strategy document with §3 Phases 1–3 all `complete`, seven wired quality
gates, and §6.1–§6.4 filled. §7 still excludes browser E2E and component rendering;
§6.5 has been a TBD stub since the file was written; §4's browser-tooling note dates
from 2026-06-29. The working tree carries an uncommitted 12-line §8 note staging the
refresh — that note is this change's input, not its output.

## Desired End State

The document describes the project as it stands: eight risks, six protected by
completed phases and two awaiting a newly-opened Phase 4; Playwright named as the
planned browser tool with an explicit note that it is not yet a dependency; no TBD
stubs in the cookbook; browser E2E scoped in for the comparer while component
rendering, pixel tests and the path-builder UI stay out; and a §8 entry that records
what changed, including the three corrections.

## Key Decisions Made

| Decision                  | Choice                                             | Why (1 sentence)                                                                                          |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Risk #7 framing           | Re-anchor on the wiring gap only                   | The resolver-level outcomes are already unit-tested; only the outcome-to-render step is uncovered.        |
| Staged risk #8 (cost)     | Dropped, recorded as not-promoted                  | Unit-tested and golden-pinned already; the residue is render, which §7 excludes.                          |
| Replacement risk #8       | The stale-response clobber, at Medium × Low        | A documented invariant with no coverage at any layer, rated Low because it has never been a bug source.   |
| §3 Phase 4                | Opened at `not started`, no change folder          | Makes the E2E decision visible without committing work, and gives §5's orphaned e2e gate a phase to cite. |
| Playwright in §4          | Named, version `—`, "not yet a dependency"         | Honest about the gap while leaving the tool choice to Phase 4's research.                                 |
| "astro 6→7 drift"         | Dropped as false                                   | `package.json` declares `^6.3.1`, installed resolves 6.4.8; §4's "Astro 6" was already correct.           |
| "55 commits" churn figure | Corrected to 1/30d and 18/90d, both windows stated | 55 was a file-touch count; every existing §2 Source cell uses `N commits/30d`.                            |
| Path-builder UI exclusion | Justified on coverage, not dormancy                | Churn contradicts dormancy (2/30d vs deck's 1/30d); Phases 1–3 already defend it at integration/contract. |
| §6.5 stub                 | Filled as a composition checklist over §6.2/§6.3   | Closes the stub without duplicating two sections that are already the authority.                          |
| §2 row budget             | Overflow to 8 rows, recorded with its reason       | Schema says 5–7 rows but also forbids renumbering, and §3 cites #1–#6.                                    |

## Scope

**In scope:** §2 (two new risks, two response rows, not-promoted entry, row-budget
note), §3 (Phase 4 row, order rationale), §4 (e2e row, four grounding bullets), §5
(e2e gate row), §6.5, §7, §8, and the header date. One file.

**Out of scope:** installing Playwright or adding any config; writing any browser
test; opening Phase 4's change folder; adding a §6 e2e recipe; touching §1, risks
#1–#6, or `context/archive/`.

## Architecture / Approach

Three phases over one file, ordered so nothing depends on an unsettled decision.
Phase 1 settles the risk framing that §3, §5 and §7 all reference. Phase 2 turns
that framing into a commitment (the rollout row) and re-stamps the stack. Phase 3
closes the guidance sections and writes the record of what changed — which can only
be accurate once the first two have landed. The staged §8 note deliberately survives
until Phase 3, because while phases are landing it is the only thing explaining why
§2 and §7 disagree.

## Phases at a Glance

| Phase                                   | What it delivers                                              | Key risk                                                                                    |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Risk map re-scope                    | Risks #7/#8, their response rows, the not-promoted cost entry | Wording #7 too broadly re-claims coverage the unit layer already owns                       |
| 2. Rollout row and stack re-stamp       | §3 Phase 4, §5 gate repointed, §4 corrected and re-dated      | §4 reading as though Playwright is installed                                                |
| 3. Guidance sections and refresh record | §6.5 filled, §7 rewritten, §8 record, header date             | §7's new exclusion resting on an argument that expires when the path builder becomes active |

**Prerequisites:** None beyond the repo itself. `npx prettier` must be runnable
(it is a devDependency and already runs on `*.md` via lint-staged).
**Estimated effort:** One session; three small commits to a single file.

## Open Risks & Assumptions

- **The §2 row budget is deliberately exceeded.** Eight rows against the schema's
  5–7. The alternative — merging or dropping an earlier row — would break §3's risk
  references and the schema's own no-renumbering rule, so the overflow is recorded
  rather than avoided. A future refresh may want to split §2 into protected and
  open sets instead.
- **Risk #8 is the weakest row in the map.** Medium × Low, with no interview or
  incident behind it. It is promoted because it rides Phase 4's harness at near-zero
  marginal cost, not because anything suggests a live defect. If Phase 4 slips, this
  row ages into noise.
- **Phase 4 will push §6 to seven sub-sections** when it writes its e2e recipe,
  against the schema's six-entry guidance. Not this change's problem, but the next
  refresh will meet it.
- **The 2026-08-25 interview is cited but not on disk.** Risk #7's Source leans on
  it, and unlike the Phase 2 interview it has no archived change folder behind it. If
  that conversation is not recorded anywhere, #7's evidence is weaker than its row
  suggests.
- **Assumption:** naming Playwright in §4 without installing it is preferable to
  leaving the row as "none". If the team would rather §4 only ever describe what
  exists, the row should revert and Phase 4 should own the tool choice entirely.

## Success Criteria (Summary)

- A contributor reading the document can tell what is protected, what is not, and
  which phase will protect it — with no section contradicting another on browser E2E.
- Every number and version claim in §2, §4 and §7 can be re-derived from the repo by
  the command the cell implies.
- §8 alone is enough to reconstruct what this refresh changed and which three staged
  claims it declined to implement.
