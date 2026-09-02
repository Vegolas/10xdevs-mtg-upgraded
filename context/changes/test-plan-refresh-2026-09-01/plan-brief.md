# Test-Plan Refresh 2026-09-01 — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-09-01/plan.md`

## What & Why

`context/foundation/test-plan.md` now describes a rollout that is over — all four §3
phases `complete`, nothing pointing forward. Meanwhile the repo has produced, since the
last refresh, verified evidence of an uncovered ordering risk in the path builder that §7
excludes on a rationale that evidence contradicts. This refresh re-grounds the document
against what the repo actually holds, gives the new risk a phase, and corrects five
claims that rollout Phase 4 outdated but never swept.

## Starting Point

A 1116-line strategy document, last substantively edited 2026-08-31. §2 is at 8 rows
against the schema's 5–7, every one protected by a complete phase. §4's table is accurate
but its four grounding bullets still describe Phase 4 in the future tense. §7 says the
path builder has nothing left but "the rendering of an already-verified result" and that
"§4 still records no runner installed" — both false as of a week ago. `lessons.md` was
created 2026-08-31 and is invisible to anyone reading §1–§7. The working tree is clean:
unlike the 2026-08-25 refresh there is no staged note to apply, so the agenda was derived
by re-running the refresh's own triggers against the repo.

## Desired End State

A reader opens §2 and sees eight risks each naming the phase that protects it, plus one
open risk naming the phase that will. §3 carries a Phase 5 at `not started` whose
cheapness claim rests on a dated branch-protection read. §7 states, in one place, where
browser E2E ends and component render begins — so two browser phases cannot be mistaken
for a general licence — and excludes the path builder's render without excluding its
ordering. No number in §1, §2, §4 or §7 disagrees with what the repo returns for the
command the cell implies.

## Key Decisions Made

| Decision                         | Choice                                                 | Why (1 sentence)                                                                                               | Source |
| -------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------ |
| Path-builder ordering gap        | Risk #9 + open §3 Phase 5 (`not started`)              | Rides Phase 4's harness and lessons at near-zero marginal cost, and fits the schema's 3–5 phase budget.        | Plan   |
| §2 row budget                    | Split into protected (#1–#8) and open (#9) tables      | What the last refresh recommended; keeps numbers stable and keeps the actionable list at one row.              | Plan   |
| Silent quantity degradation      | Stays not-promoted, note sharpened to a decision       | Needs a crafted collection response, so E2E is not its cheapest layer; answering closes a two-refresh loop.    | Plan   |
| Risk #9 rating                   | Medium × Medium                                        | Phase 3 defends the persist boundary so the blast radius stops at pre-save display; verified but no incident.  | Plan   |
| Risk #9 Source citation          | Archived Phase 4 slice + `src/components/path` churn   | §2's schema forbids files, `file:line` and symbols; the anchors stay in `lessons.md` and Phase 5's research.   | Plan   |
| `lessons.md` visibility          | Pointer in §1's closing line and §6's preamble         | Covers both the reader scoping work and the contributor writing a test, without touching the fixed header.     | Plan   |
| §6 seven entries, notes not last | Record the deviation, do not renumber                  | §6.6 is cited from four shipped source files; renumbering means editing shipped comments for cosmetic gain.    | Plan   |
| `.dev.vars` mechanism debt       | Fix both §6.2 rule 4 and the harness comment           | The verified answer is already written in `lessons.md`, and the wrong cause matters where a debugger reads it. | Plan   |
| §7 render exclusion              | Re-affirm, restate the half-met trigger, draw the line | Two browser phases make "why E2E in but render out" the document's biggest live ambiguity; settle it once.     | Plan   |
| §5 quality gates                 | Unchanged, recorded as a deliberate non-change         | Appending #9 to a wired gate row would claim coverage that does not exist.                                     | Plan   |
| Verification depth               | Re-derive all figures + one branch-protection read     | Phase 5 asserts it rides the existing `e2e` job, and the document's own rule makes that aspirational unread.   | Plan   |

## Scope

**In scope:** §2 (split, risk #9, response row, quantity note, deck churn), §3 (Phase 5
row + order rationale), §4 (four grounding bullets, the one dated suite count), §1
(lessons pointer, suite figure), §6 (preamble pointer, recorded deviation, rule 4), §7
(three bullets), §8 (record, dates, closed debt), the header date. One document plus one
comment in `tests/integration/global-setup.ts`.

**Out of scope:** writing any browser test or fixture; opening Phase 5's change folder;
§5; CI, workflows and branch protection; renumbering any risk or §6 sub-section; fixing
the `PathEditor` guard duplication; promoting the quantity degradation; §1's three
principles; the schema-fixed header tagline; `context/archive/`.

## Architecture / Approach

Four phases over one file plus one comment, ordered so nothing depends on an unsettled
decision. Phase 1 settles the risk framing that §3, §7 and §8 all describe. Phase 2 turns
it into a rollout commitment and sweeps the figures Phase 4 outdated — safe only once
risk #9 exists to point at. Phase 3 rewrites the guidance and negative-space sections and
writes the record, which can only be accurate after 1 and 2 land. Phase 4 is isolated
because it is the only phase touching source: different gate stack, and its honest
verification needs a local Supabase, so it must be able to slip alone.

## Phases at a Glance

| Phase                             | What it delivers                                                 | Key risk                                                                 |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. §2 restructure and risk #9     | Protected/open split, risk #9, its response row, quantity note   | Risk #9's Source smuggling in a file anchor, which the schema forbids    |
| 2. Phase 5 row, §4, stale figures | §3 Phase 5, §4 bullets re-stamped, suite and churn figures fixed | The Phase 5 row reading as scheduled work rather than an opened decision |
| 3. §7, lessons pointers, §8       | Narrowed exclusions, the E2E/render boundary, refresh record     | The boundary statement being too abstract to apply to an actual proposal |
| 4. `.dev.vars` correction         | §6.2 rule 4 and the harness comment agree with the adapter       | Needs a local Supabase to verify honestly; may have to slip              |

**Prerequisites:** Phases 1–3 need only the repo and `npx prettier` (already a
devDependency running on `*.md` via lint-staged). Phase 4 additionally needs
`npx supabase start` and a filled `.env.test`.
**Estimated effort:** One session; three small documentation commits plus one
two-file commit.

## Open Risks & Assumptions

- **Risk #9 is promoted off a lessons register, not an incident.** The mechanism is
  verified in code, but nothing says a user has hit it. If Phase 5 slips indefinitely,
  the row ages into the same noise the last refresh worried about for #8 — with the
  difference that the open/protected split now makes an unanswered row visible rather
  than buried in a nine-row table.
- **Phase 5's real fix may be a refactor, not a test.** `lessons.md` says the five
  hand-copied guards want a shared helper. Phase 5's scope is deliberately behavioral
  (rendered content matches current input) so it survives that refactor, but a careless
  Phase 5 could pin the duplication instead.
- **The §7 render exclusion now rests on one unmet condition.** "The UI is being
  finalized" is not scheduled by any roadmap slice, so the bullet could sit unreviewed
  indefinitely. Recorded as a stated condition rather than retired, because S-07
  unparking would make it reachable again.
- **§6's deviations are now documented rather than fixed.** Seven entries and the
  notes-not-last ordering both stand. The next refresh meets them again, with the same
  source-file-reference cost.
- **Assumption:** promoting one risk and opening one phase is preferable to closing the
  rollout and handling the path-builder ordering as an ordinary bug. If the team would
  rather the test plan stop growing, the alternative is to correct §7's wording only and
  file the ordering gap as a product change.

## Success Criteria (Summary)

- A contributor can read §2 alone and name what is protected, what is not, and which
  phase answers the gap.
- No section contradicts another on Playwright's presence, on what the path builder
  excludes, or on whether a browser test is admissible.
- Every number in §1, §2, §4 and §7 re-derives from the command its cell implies, and §8
  alone reconstructs this refresh including the two things it decided not to do.
