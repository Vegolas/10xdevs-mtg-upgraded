# Test-Plan Refresh 2026-08-25 Implementation Plan

## Overview

Execute the test-plan refresh that `/10x-test-plan --refresh` staged in §8 of
`context/foundation/test-plan.md`, and correct the three grounding claims in that
staged note which do not survive contact with the repo. The refresh re-scopes the
strategy sections for the post-rollout world: the comparer's browser-only failure
surface becomes two new §2 risks, §3 gains a fourth rollout phase to defend them,
§4 stops describing a browser layer that has no tool named, §6.5's permanent TBD
closes, and §7 flips browser E2E from excluded to scoped-in.

This is a documentation change to a single file. No source, config, or CI change.

## Current State Analysis

`context/foundation/test-plan.md` (736 lines) describes a completed rollout. §3
Phases 1–3 are all `complete`; §5 records seven wired gates; §6.1–§6.4 are filled
and §6.6 carries four phase retrospectives. The working tree already contains an
uncommitted 12-line addition to §8 — the "Refresh in flight" note — which stages
the intended edits. That note is the input to this change, not its output.

The rollout's completion is itself the trigger §7 names for re-evaluating its E2E
and component-render exclusions, and §6.6's closing paragraph says that
re-evaluation is "a decision to take deliberately, not a fourth phase that follows
automatically". This change is that decision.

Three of the staged note's claims are wrong, and one is redundant with existing
coverage:

- **"astro 6→7 drift"** — `package.json` declares `astro: ^6.3.1`; the installed
  tree resolves 6.4.8. §4's only Astro mention ("can ground current Vitest 4 /
  Astro 6 / Supabase SSR") is accurate. There is no drift to re-stamp.
- **"`src/components/deck` 55 commits"** — the directory carries 19 commits
  all-time, 18 in 90 days excluding merges, and **1** in 30 days (last touch
  2026-08-18). `55` matches the sum of per-file touch counts in that directory,
  which is a different measurement from the `N commits/30d` every existing §2
  Source cell uses.
- **"path builder dormant"** — `src/components/path` carries 9 commits/90d and
  **2**/30d, against `src/components/deck`'s 1/30d. The path builder is the more
  recently touched of the two.
- **Proposed risk #8 (cost total under-reports)** — the cost function is
  unit-tested across all four cases including the all-missing one, and
  golden-pinned. The rendering component already reports the gap: it prints an
  em-dash rather than a zero total when nothing is priced, plus a count of cards
  without price data. The only uncovered slice is the render of that state, which
  §7 excludes as component rendering.

### Key Discoveries:

- The comparer's React wiring has **no coverage at any layer**: no test file in
  `src/` or `tests/` references `DeckComparer`, and §4 records no browser or
  component-render layer. `src/lib/deck/plan.test.ts:87-125` covers the
  orchestration function's three outcomes, so the gap is specifically the step
  from outcome to rendered surface.
- The stale-response guard (a monotonic request token) entered the file in its
  first commit, `105566c`, and none of the eight subsequent commits to that file
  touched it. It is stable code that has never been a bug source — which fixes its
  likelihood at Low, not Medium.
- `.claude/skills/10x-test-plan/references/test-plan-schema.md` forbids file or
  `file:line` citations in §2 Source cells (allowed: PRD/roadmap lines, archived
  slice plans, interview question numbers, hot-spot **directories** with churn
  counts, tech-stack constraints). Both new rows must stand on interview plus
  directory churn plus the documented absence of a layer.
- The same schema budgets §2 at 5–7 rows **and** mandates "append new risks at the
  bottom; never renumber". Rows #1–#6 are referenced by §3 Phases 1–3, so none can
  be merged away. Two additions take the map to 8 rows — a deliberate overflow that
  must be recorded with its reason.
- §5's `e2e on critical flows` row currently reads "deferred — see §7", which
  violates the schema's "do not list gates with no rollout phase pointing at them".
  Opening Phase 4 resolves a pre-existing schema violation rather than creating one.
- `lint-staged` runs `prettier --write` on `*.md` through husky, so
  `npx prettier --check` on this file is a real gate, not a nicety.
- `.claude/skills/10x-e2e/` reads `context/foundation/test-plan.md` risks directly
  (`references/e2e-quality-rules.md`: "Start from `test-plan.md`: pick the risk").
  The new rows are consumed by a real skill, so their wording is an interface.

## Desired End State

`context/foundation/test-plan.md` describes the project as it now stands: eight
risks of which six are protected by completed phases and two await Phase 4; a
fourth rollout phase open at `not started`; a §4 that names Playwright as the
planned browser tool while stating it is not yet a dependency; a §6 with no TBD
stubs; a §7 that excludes component rendering, pixel tests, pure-logic re-testing
and the path-builder UI, but no longer excludes browser E2E; and a §8 whose
"Refresh in flight" entry has become a record of what the refresh changed,
including the three corrections.

Verified by: `prettier --check` clean; the schema invariants greppable and holding
(section order, frozen status literals, contiguous risk numbering, every §3 risk
reference resolving, no gate without a phase pointer); and no occurrence of the
three corrected claims anywhere in the file.

## What We're NOT Doing

- **Not adding Playwright as a dependency.** No `package.json` change, no
  `playwright.config.*`, no `e2e/` directory. §4 names the tool at version `—`
  with an explicit not-yet-installed note; installing it is a Phase 4 deliverable
  decided by that phase's research.
- **Not writing any browser test.** Phase 4 opens at `not started` with an empty
  change-folder cell. This change does not run `/10x-new` for it.
- **Not adding a §6 e2e cookbook recipe.** §6 fills incrementally as phases ship;
  the e2e recipe is Phase 4's final sub-phase to write.
- **Not promoting the cost-disclosure risk.** It goes to §2's not-promoted
  paragraph with its coverage citation.
- **Not renumbering or rewording risks #1–#6**, and not touching their Risk
  Response Guidance rows. §3 references those numbers and the schema freezes them.
- **Not reversing §7's component-render or pixel-test exclusions.** Only the
  browser-E2E bullet changes status.
- **Not editing §1.** The three principles and the hot-spot scope stand unchanged.
- **Not touching `context/archive/`.** Phase 2's superseded "byte-equivalent" doc
  claim stays superseded-in-place per the existing §6.6 note.

## Implementation Approach

Three phases, ordered so that nothing depends on an unsettled decision. Phase 1
fixes the risk framing, because §3, §5 and §7 all reference it. Phase 2 opens the
rollout phase and re-stamps the stack, which is where the risk framing becomes a
commitment. Phase 3 closes the guidance sections and writes the record of what
changed, which can only be accurate once the first two have landed.

Each phase is one commit and one review pass over a contiguous span of the file.

## Critical Implementation Details

**State sequencing.** §8's "Refresh in flight" note is the input to this change and
must survive until Phase 3, where it is rewritten into a completed-refresh record.
Do not delete it in Phase 1 or 2 — while phases are landing it is the only thing
telling a reader why §2 and §3 disagree with §7.

**Debug & observability.** The schema invariants this change must not break are
mechanically checkable, and the Success Criteria below name the checks rather than
asking for a careful read. The one that matters most is the §3 status literal: the
`/10x-test-plan` orchestrator parses that column, so `not started` must be written
exactly, in lower case, with no decoration.

---

## Phase 1: Risk map re-scope

### Overview

Append two risks to §2 with their Risk Response Guidance rows, move the
cost-disclosure scenario into the not-promoted paragraph, and record the schema's
row-budget overflow with its reason. After this phase the risk framing is settled
and everything downstream can reference it.

### Changes Required:

#### 1. Risk map table

**File**: `context/foundation/test-plan.md`

**Intent**: Append rows #7 and #8 for the comparer's two browser-only failure
scenarios. #7 is the surfacing wiring — a partial resolution or a card-data
transport failure reaching the user as a plan that looks complete, because the
unresolved notice or the retryable error banner never renders. #8 is the
stale-response clobber — a slow earlier resolution completing after a newer one, so
the user reads a plan built from deck text they already replaced. Rows #1–#6 are
untouched.

**Contract**: The `## 2. Risk Map` table, appended after row 6, same five columns
(`#`, Risk, Impact, Likelihood, Source). Ratings: #7 High impact × Medium
likelihood; #8 Medium impact × Low likelihood. Source cells cite the 2026-08-25
interview, hot-spot dir `src/components/deck` with **both** windows stated
(1 commit/30d, 18 commits/90d), and the absence of a browser or render layer per
§4 — no file names, no `file:line`, no symbol names, per the schema's forbidden
list. #8's cell additionally records that the guard has been stable since the
surface's first commit, which is what justifies Low rather than Medium.

#### 2. Rubric paragraph and row-budget note

**File**: `context/foundation/test-plan.md`

**Intent**: Extend the paragraph under the risk table so a reader understands why
the map now has eight rows and why #8 is last. State that the schema budgets 5–7
rows, that #1–#6 are retained because §3 Phases 1–3 cite those numbers and the
schema forbids renumbering, and that #8 is the weakest row — promoted because it
rides Phase 4's harness at near-zero marginal cost and is deterministically
reproducible in a browser, not because anything suggests a live defect.

**Contract**: The prose block immediately following the §2 table, after the existing
"Impact × Likelihood rubric" sentences and before the "Not promoted" paragraph. The
existing statement that risk #1 is the only High × High stays true and must not be
contradicted — #7 is High × Medium.

#### 3. Not-promoted paragraph

**File**: `context/foundation/test-plan.md`

**Intent**: Add the cost-disclosure scenario as a third not-promoted item,
recording that the computation is already covered at unit and golden layers and
that the residual slice is the render of the disclosure, which §7 excludes. This is
the honest record of a risk considered and declined, so a future refresh does not
re-propose it.

**Contract**: The existing "Not promoted to the map (recorded so the rollout doesn't
silently widen)" paragraph in §2. Cite the covering layers by their §4 row names and
§6 recipe numbers, not by test file paths — the schema's file-citation ban applies
to this paragraph as much as to the table.

#### 4. Risk Response Guidance rows

**File**: `context/foundation/test-plan.md`

**Intent**: Add one row each for #7 and #8. The schema requires every top risk to
have a response row and says a risk that cannot produce one "is not actionable
enough for this rollout and must be reframed or dropped".

**Contract**: The `### Risk Response Guidance` table, same six columns. For #7 the
cheapest layer is browser E2E and the must-challenge is "a plan rendered means a
plan complete"; the anti-pattern is a happy-path browser test that never induces a
partial resolution or a transport failure. For #8 the must-challenge is "the token
guard exists, so ordering is safe"; the anti-pattern is a test that passes because
it never actually overlaps two runs. Both rows name what `/10x-research` must ground
without anchoring it to a component.

### Success Criteria:

#### Automated Verification:

- Formatting gate passes: `npx prettier --check context/foundation/test-plan.md`
- §2 table has exactly 8 data rows, numbered 1 through 8 with no gaps
- Rows #1–#6 are byte-identical to HEAD: `git diff` reports no changes within the
  first six data rows of the §2 table
- Risk Response Guidance has one row per risk number, #1 through #8
- The new §2 Source cells and the not-promoted paragraph contain no `.ts`, `.tsx`,
  or `file:line` citation
- No emoji and no fenced code block introduced anywhere in §2
- Section order §1 through §8 is unchanged

#### Manual Verification:

- Risk #7's wording names only the wiring gap, and a reader can tell that the
  resolver-level outcomes remain owned by the existing unit layer
- Risk #8's Low likelihood reads as honest rather than as padding, and the reason it
  is promoted anyway is stated
- The 8-row overflow reads as a recorded decision with a reason, not an oversight
- The not-promoted cost entry would stop a future refresh from re-proposing it

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing
was successful before proceeding to the next phase.

---

## Phase 2: Rollout row and stack re-stamp

### Overview

Open §3 Phase 4 against the two new risks, repoint §5's e2e gate at it, and bring §4
back in line with what the repo and the session actually provide — including
dropping the false astro-drift premise.

### Changes Required:

#### 1. Rollout table

**File**: `context/foundation/test-plan.md`

**Intent**: Add Phase 4 covering #7 and #8, goal being to prove the comparer
surfaces its own failures and never renders a superseded plan. Status opens at
`not started` with an empty change-folder cell, so the decision is visible without
committing work.

**Contract**: The `## 3. Phased Rollout` table, appended as row 4, same seven
columns. Test types cell reads browser E2E. The Status cell must be the exact parser
literal `not started`; the change-folder cell is an em-dash, matching the schema's
example for an unopened phase. The "Status vocabulary (fixed — parser literals)"
line below the table is not edited — no new status value is introduced.

#### 2. Order rationale paragraph

**File**: `context/foundation/test-plan.md`

**Intent**: Extend the rationale below the §3 table so the sequencing argument still
reads correctly. Its current last sentence declares E2E and frontend testing
deliberately out of the rollout — that is now half true, so it must be split:
browser E2E enters scope for the comparer because the logic boundary the sequencing
depended on is now locked by Phases 1–3, while component-render and pixel testing
stay out per §7.

**Contract**: The paragraph beginning "Order rationale:" in §3. The existing
Phase 1–3 sentences stay; only the closing E2E sentence is rewritten.

#### 3. Quality-gate row for e2e

**File**: `context/foundation/test-plan.md`

**Intent**: Change the e2e gate's Required? cell from "deferred — see §7" to planned
against §3 Phase 4, so no gate row lacks a rollout phase pointing at it. Note in the
Catches cell what the gate will catch once Phase 4 lands.

**Contract**: The `e2e on critical flows` row of the §5 table. Phrasing follows the
existing convention in that table — the wired rows read "required (wired §3 Phase
N)", so this one reads as planned for §3 Phase 4. Do not mark it required: nothing
is wired, and §5's own closing paragraph insists a row is aspirational until its job
name is in the branch's required-check list.

#### 4. Stack table e2e row

**File**: `context/foundation/test-plan.md`

**Intent**: Name Playwright as the intended browser tool while stating plainly that
it is not a dependency. The row currently reads "none / — / deliberately deferred",
which will contradict §3 once Phase 4 exists.

**Contract**: The `e2e` row of the §4 table. Tool cell names Playwright; Version
cell is an em-dash; Notes cell states that it is planned for §3 Phase 4 and is not
yet in `package.json`, and points at §7 for the scope boundary. The
`component render` row is not touched — it stays deferred.

#### 5. Stack grounding bullets

**File**: `context/foundation/test-plan.md`

**Intent**: Correct the Runtime/browser bullet, which says E2E is out of scope for
this rollout and cites the absence of a Playwright MCP as the reason. Browser-test
tooling now exists in-session as skills (a dedicated E2E workflow skill in this
repo, plus a Playwright-driven web-app testing skill), while no Playwright MCP
server is exposed — both halves need saying, because the second is why the tool
choice is still Phase 4's to make. Re-stamp all four `checked:` dates to 2026-08-25,
and confirm rather than change the Docs bullet's framework versions: declared
`astro ^6.3.1` resolving to 6.4.8, `vitest ^4.1.9` resolving to 4.1.9.

**Contract**: The four bullets under "**Stack grounding tools (current session):**"
in §4. Every bullet's `checked:` date becomes 2026-08-25. The Docs bullet keeps
"Astro 6" — the staged note's 6→7 claim is dropped, not implemented. Per the
schema's forbidden-content list, no MCP install command appears.

#### 6. Freshness ledger version lines

**File**: `context/foundation/test-plan.md`

**Intent**: Move the two verification dates in §8 that this phase re-verified, so
the ledger does not still claim a 2026-06-29 check.

**Contract**: The "Stack versions last verified" and "AI-native tool references last
verified" lines in §8 become 2026-08-25. The "Refresh in flight" note is left in
place for Phase 3.

### Success Criteria:

#### Automated Verification:

- Formatting gate passes: `npx prettier --check context/foundation/test-plan.md`
- §3 table has exactly 4 data rows, and row 4's Status cell is exactly `not started`
- The six status literals still appear verbatim in the Status vocabulary line
- Every risk number in §3's "Risks covered" column resolves to a §2 row that exists
- No §5 row's Required? cell reads "deferred"; the e2e row names §3 Phase 4
- §4's e2e row names Playwright and its Notes cell states it is not yet a dependency
- `grep -ci "astro 7\|6→7\|6->7" context/foundation/test-plan.md` returns 0
- All four §4 grounding bullets and both §8 version lines read 2026-08-25
- `package.json` and `playwright.config.*` are unchanged: `git status --porcelain`
  reports only `context/` paths modified

#### Manual Verification:

- The order rationale still reads as a coherent sequencing argument, not as a
  reversal bolted onto the old text
- §4's e2e row cannot be misread as "Playwright is installed"
- The Runtime/browser bullet distinguishes skill-level tooling from an MCP server,
  so a reader understands why the tool choice is still open
- §3 and §7 no longer contradict each other on whether browser E2E is in scope

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing
was successful before proceeding to the next phase.

---

## Phase 3: Guidance sections and the refresh record

### Overview

Close §6.5's permanent TBD, rewrite §7 for the post-rollout scope, and convert the
staged "Refresh in flight" note into a record of what the refresh actually changed —
including the three claims it corrected.

### Changes Required:

#### 1. Cookbook §6.5

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the TBD stub with a composition checklist that sequences the
existing recipes for someone adding a route, rather than restating them. The two
genuinely endpoint-specific traps are the ones the rollout learned the hard way: a
new table needs its privileges granted explicitly in the migration, because
privileges are checked before RLS and a green local run cannot see the gap; and a
mutating request without an `Origin` header is rejected before the handler runs, so
a hand-rolled request pins a CSRF rejection instead of the route. Close with the
pointer to §3 Phase 4 for when the failure mode genuinely needs a browser.

**Contract**: The `### 6.5 Adding a test for a new API endpoint` sub-section. Keeps
the bullet-then-numbered-recipe shape of §6.2–§6.4, but each numbered item
cross-references the owning recipe rather than duplicating it. Heading text and
number are unchanged, so §6 stays at six sub-sections and §8's cookbook line can
stop calling it a stub. No test code block, per the schema's forbidden list.

#### 2. Negative space §7

**File**: `context/foundation/test-plan.md`

**Intent**: Rewrite the browser-E2E bullet from an exclusion into a scoped inclusion
pointing at §3 Phase 4, narrowed to the comparer's failure-surfacing. Add the
path-builder and diff-mode UI as a new explicit exclusion, justified on coverage
rather than dormancy: its load-bearing behavior is already defended at the
integration and contract layers by Phases 1–3, which makes its UI the thinnest
remaining slice. State both churn figures so the reasoning survives the surface
becoming active again. Leave the component-render, pure-logic and pixel-test bullets
intact.

**Contract**: The `## 7. What We Deliberately Don't Test` bullet list. Ends at four
bullets — component/render, pure-logic re-testing, pixel/snapshot, path-builder UI —
plus the scoped-in statement for browser E2E, staying inside the schema's 5–6 bullet
cap. The Source annotations follow the existing `(Source: …)` convention; the
path-builder bullet cites the completed phases and the measured churn, not the
interview's dormancy claim.

#### 3. Freshness ledger

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "Refresh in flight" entry with a completed-refresh record:
what the refresh changed, and the three staged claims it corrected instead of
implementing — the absent astro 6→7 drift, the 55-commit figure that was a
file-touch count, and the dormancy claim that churn contradicts. Update the strategy
and cookbook review lines, and note that §6.5 is no longer a stub. Add the
churn-citation convention so a future refresh measures the same way.

**Contract**: The `## 8. Freshness Ledger` bullet list. The "Refresh in flight"
bullet is replaced, not appended to. The "Strategy (§1–§5) last reviewed" line gains
2026-08-25 with the sections this change touched; the cookbook line drops its "§6.5
is still a TBD stub" clause. The refresh-trigger list at the end of §8 is unchanged —
its four triggers still hold.

#### 4. Header date

**File**: `context/foundation/test-plan.md`

**Intent**: Bump the "Last updated" line, which the schema makes mandatory, and
replace its parenthetical so it describes the current state: the rollout's three
phases complete, a fourth open for the comparer, and browser E2E now in scope.

**Contract**: The `> Last updated:` line in the file header blockquote. The two-line
tagline and the refresh pointer above it are fixed by the schema and are not edited.

### Success Criteria:

#### Automated Verification:

- Formatting gate passes: `npx prettier --check context/foundation/test-plan.md`
- §6.5 contains no "TBD", and §6 still has exactly six `### 6.N` sub-headings
- §7 has at most 6 bullets, contains a path-builder bullet, and no longer lists
  browser E2E as an exclusion
- §8 contains no "Refresh in flight"
- The header `> Last updated:` line reads 2026-08-25
- Section order §1 through §8 is unchanged and all eight headings are present
- No emoji, no fenced code block, and no CI YAML anywhere in the file
- Repo still green: `npm run lint`, `npm run typecheck`, and `npm test` all pass
- `git status --porcelain` reports only `context/` paths modified

#### Manual Verification:

- §6.5 reads as a sequencing checklist that adds the two endpoint-specific traps,
  and does not duplicate §6.2 or §6.3
- §7's path-builder exclusion would still be defensible if that directory became the
  most-churned surface next month
- The §8 record makes the three corrections findable by someone who reads only §8
- §3, §4, §5 and §7 agree with each other on the status of browser E2E
- The header parenthetical describes the file a reader is about to read

**Implementation Note**: This is the final phase. After automated verification
passes, confirm the manual items before closing the change.

---

## Testing Strategy

### Unit Tests:

None. This change touches no source file, so no unit test is added or modified.
`npm test` is run in Phase 3 purely as a guard that nothing outside `context/` was
touched.

### Integration Tests:

None. No handler, schema, or query path changes.

### Manual Testing Steps:

1. Read §2 top-to-bottom and confirm the eight rows still read as an ordered risk
   map rather than a coverage ledger, with #1 still the only High × High.
2. Read §3, §5 and §7 in sequence and confirm they agree on whether browser E2E is
   in scope, and that §4 agrees Playwright is not yet installed.
3. Re-derive the two churn figures with `git log --since` on `src/components/deck`
   and `src/components/path` and confirm the §2 and §7 cells match what the commands
   report.
4. Read §6.5 as if adding a new route, and confirm the checklist is followable
   without opening any file other than §6.2 and §6.3.
5. Confirm §8's record would let a future reader reconstruct why the staged note's
   three claims were not implemented.

## Performance Considerations

None — documentation only.

## Migration Notes

None. The file is read by `/10x-test-plan` (which parses §3's Status and
Change-folder cells) and by `/10x-e2e` (which reads §2 risk rows). Both read the
current shape: no column is renamed, no status literal is introduced, and risk
numbering stays contiguous and append-only, so neither consumer needs a change.

## References

- Refresh input: the "Refresh in flight" entry in `context/foundation/test-plan.md` §8
- Schema: `.claude/skills/10x-test-plan/references/test-plan-schema.md`
- Downstream consumer of §2 risks: `.claude/skills/10x-e2e/references/e2e-quality-rules.md`
- Prior rollout phases: `context/archive/2026-06-29-testing-server-boundary-auth/`,
  `context/archive/2026-08-11-testing-api-contract-pinning/`,
  `context/archive/2026-08-19-testing-derive-to-persist/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Risk map re-scope

#### Automated

- [x] 1.1 Formatting gate passes: `npx prettier --check context/foundation/test-plan.md` — 5a0be20
- [x] 1.2 §2 table has exactly 8 data rows, numbered 1 through 8 with no gaps — 5a0be20
- [x] 1.3 Rows #1–#6 are byte-identical to HEAD — 5a0be20
- [x] 1.4 Risk Response Guidance has one row per risk number, #1 through #8 — 5a0be20
- [x] 1.5 New Source cells and not-promoted paragraph carry no file or `file:line` citation — 5a0be20
- [x] 1.6 No emoji and no fenced code block introduced anywhere in §2 — 5a0be20
- [x] 1.7 Section order §1 through §8 is unchanged — 5a0be20

#### Manual

- [x] 1.8 Risk #7 names only the wiring gap; unit-layer ownership stays legible — 5a0be20
- [x] 1.9 Risk #8's Low likelihood reads as honest, with its promotion reason stated — 5a0be20
- [x] 1.10 The 8-row overflow reads as a recorded decision with a reason — 5a0be20
- [x] 1.11 The not-promoted cost entry would stop a future re-proposal — 5a0be20

### Phase 2: Rollout row and stack re-stamp

#### Automated

- [x] 2.1 Formatting gate passes: `npx prettier --check context/foundation/test-plan.md`
- [x] 2.2 §3 table has exactly 4 data rows; row 4 Status is exactly `not started`
- [x] 2.3 The six status literals still appear verbatim in the Status vocabulary line
- [x] 2.4 Every §3 "Risks covered" number resolves to an existing §2 row
- [x] 2.5 No §5 Required? cell reads "deferred"; the e2e row names §3 Phase 4
- [x] 2.6 §4's e2e row names Playwright and states it is not yet a dependency
- [x] 2.7 No astro-7 or 6→7 claim remains in the file
- [x] 2.8 All four §4 grounding bullets and both §8 version lines read 2026-08-25
- [x] 2.9 `git status --porcelain` reports only `context/` paths modified

#### Manual

- [x] 2.10 The order rationale reads as a coherent sequencing argument
- [x] 2.11 §4's e2e row cannot be misread as "Playwright is installed"
- [x] 2.12 The Runtime/browser bullet distinguishes skill tooling from an MCP server
- [ ] 2.13 §3 and §7 no longer contradict each other on browser E2E scope

### Phase 3: Guidance sections and the refresh record

#### Automated

- [ ] 3.1 Formatting gate passes: `npx prettier --check context/foundation/test-plan.md`
- [ ] 3.2 §6.5 contains no "TBD"; §6 still has exactly six `### 6.N` sub-headings
- [ ] 3.3 §7 has at most 6 bullets, includes a path-builder bullet, and no longer excludes browser E2E
- [ ] 3.4 §8 contains no "Refresh in flight"
- [ ] 3.5 The header `> Last updated:` line reads 2026-08-25
- [ ] 3.6 Section order §1 through §8 unchanged; all eight headings present
- [ ] 3.7 No emoji, no fenced code block, and no CI YAML anywhere in the file
- [ ] 3.8 Repo still green: `npm run lint`, `npm run typecheck`, `npm test`
- [ ] 3.9 `git status --porcelain` reports only `context/` paths modified

#### Manual

- [ ] 3.10 §6.5 sequences the existing recipes and adds the two endpoint traps without duplication
- [ ] 3.11 §7's path-builder exclusion survives that directory becoming hot
- [ ] 3.12 The §8 record makes the three corrections findable from §8 alone
- [ ] 3.13 §3, §4, §5 and §7 agree on the status of browser E2E
- [ ] 3.14 The header parenthetical describes the file as it now reads
