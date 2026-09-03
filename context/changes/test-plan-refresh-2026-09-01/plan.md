# Test-Plan Refresh 2026-09-01 Implementation Plan

## Overview

`context/foundation/test-plan.md` describes a rollout that is finished. All four §3
phases are `complete`, so the document has nothing pointing forward — while the repo
has, since the last refresh, produced verified evidence of an **uncovered ordering
risk in the path builder** that §7 currently excludes on a rationale the evidence
contradicts.

This refresh re-grounds the document: it splits §2 into protected and open sets,
promotes the path-builder stale-response ordering as risk #9, opens §3 Phase 5 to
answer it, and corrects five claims that rollout Phase 4 outdated but did not sweep.
One source-file comment is corrected alongside its §6 recipe, closing a debt §8 has
carried since 2026-08-31.

## Current State Analysis

A 1116-line strategy document, last substantively edited 2026-08-31 when rollout
Phase 4 landed:

- **§2** carries 8 risk rows against the schema's 5–7, with a recorded note that
  "a future refresh may prefer to split §2 into protected and open sets rather than
  let the map keep growing." Every one of the 8 is protected by a `complete` phase.
- **§3** has 4 phases, all `complete`. The schema's sweet spot is 3–5, so one more
  phase fits without argument.
- **§4**'s table is accurate (Playwright `^1.62.1`, Vitest `^4.1.9`, Astro `^6.3.1`
  → 6.4.8, all re-verified 2026-09-02), but its four _grounding bullets_ still
  describe Phase 4 in the future tense — "why §3 Phase 4 is openable at all", "the
  runner and harness choice is still that phase's research to make", "Playwright's
  when Phase 4 plans". Phase 4 made those choices a week ago.
- **§5** is correct and needs no change. `main`'s required-check list re-read
  2026-09-02: `["ci","integration","e2e"]`, `enforce_admins: true`, `strict: false`.
- **§6** has 7 sub-sections against the schema's 3–6, and §6.7 sits _after_ §6.6
  "Per-rollout-phase notes", which the schema places last. §6.2 rule 4 mis-attributes
  a mechanism §8 already records as owed.
- **§7** carries the two claims this refresh exists to fix: the path-builder bullet's
  "what is left is the rendering of an already-verified result", and bullet 5's
  "§4 still records no runner installed".
- **`lessons.md`** was created 2026-08-31 and is a required read for four skills, but
  a human reading §1–§7 never learns it exists. It documents the evidence behind
  risk #9.

The working tree is clean; unlike the 2026-08-25 refresh there is no staged §8 note
to apply. The agenda below was derived by re-running the refresh's own triggers
(hot-spots plus what the repo now knows) rather than read off a staged note.

## Desired End State

The document describes a project whose rollout has one open front:

- §2 reads as two tables — eight risks each naming the phase that protects it, and
  one open risk that names the phase that will. The row-budget argument is retired
  by structure rather than excused for a third time.
- §3 carries a Phase 5 at `not started` whose order rationale states, with a dated
  branch-protection read behind it, that it is the first phase to ride an existing
  job end to end.
- No section asserts a Playwright-shaped gap that Phase 4 closed, and no number in
  §1, §2, §4 or §7 disagrees with what the repo returns for the command the cell
  implies.
- §7 draws the browser-E2E-versus-component-render line explicitly, so a reader
  cannot mistake two browser phases for a general licence, and excludes the path
  builder's _render_ without excluding its _ordering_.
- `lessons.md` is discoverable from §1 and §6 rather than from §8 prose only.
- §6.2 rule 4 and `tests/integration/global-setup.ts` agree with the adapter's actual
  behavior, and §8 records the debt as closed rather than carried.

### Key Discoveries:

- **The path-builder exclusion's premise is false for one slice.**
  `context/foundation/lessons.md` documents four verified divergences across
  `PathEditor`'s four hand-copied stale-response guards. Two read as live defects and
  both still hold in code (file untouched since 2026-08-20): the pre-save Check's
  empty-text branch returns without advancing its counter, so a resolve in flight when
  the box is cleared can still write `checked`; and both Check flows write the _add_
  error state from inside a catch guarded by the _check_ counter. That is uncovered
  client-side ordering logic, not "the rendering of an already-verified result".
- **The evidence cannot be cited the way lessons.md states it.** §2's schema permits
  PRD/roadmap lines, archived slice plans, interview question numbers, hot-spot
  directories with churn, and tech-stack constraints — and explicitly forbids files,
  `file:line`, and symbol names. Risk #9's Source must therefore cite the archived
  Phase 4 slice and `src/components/path` churn; the anchors stay in `lessons.md` and
  in Phase 5's future `/10x-research`.
- **Phase 5 is the cheap shape, and that is checkable.** A new spec under
  `tests/e2e/` rides the already-required `e2e` job: no runner to add, no CI job, no
  branch-protection PATCH. Confirmed 2026-09-02 —
  `gh api repos/Vegolas/10xdevs-mtg-upgraded/branches/main/protection` returns
  `contexts: ["ci","integration","e2e"]`. This is the inverse of Phase 4, which needed
  all three.
- **"20-file Vitest suite" is stale in two places.** `src/**/*.test.ts` is 23 files;
  `npm test` reports 22 passed + 1 skipped (223 tests) — the skip is
  `scryfall.live.test.ts`, gated by `describe.skipIf(!RUN_LIVE)` and listed separately
  in §4 as the `live (external)` layer. Rollout Phase 4 fixed this same class of error
  in §6.7 (`100+` → `33`) via commit `f5db231` and left §1 and §7 untouched.
- **The deck churn moved, and it is legitimate.** `src/components/deck` is now
  2 commits/30d and 19/90d (was 1 and 18). Both 30d commits touched _shipped_ code —
  `DeckComparer.tsx` gained `role="alert"`, `UnresolvedNotice.tsx` a named region,
  `sort.ts` explicit collation — so this is real product churn that the rollout
  happened to drive, not test-only noise. No convention change is needed; the numbers
  need re-stamping.
- **§6.6 cannot be renumbered cheaply.** It is cited from four shipped source files
  (`src/lib/path/verify.ts`, `verify.test.ts`, `tests/integration/helpers/derive.ts`,
  `derive-persist.int.test.ts`) plus `docs/reference/contract-surfaces.md`, on top of
  ~12 in-document references. Swapping §6.6/§6.7 to satisfy the schema's ordering
  would mean editing shipped comments for a cosmetic gain.
- **`src/components/path` churn is unchanged**: 2 commits/30d, 9/90d, re-measured
  2026-09-02 — the same figures §7 already cites, so that bullet's churn sentence
  survives its rewrite intact.

## What We're NOT Doing

- **Not writing any browser test, fixture, or spec.** Phase 5 opens at `not started`
  with no change folder; its research and plan are its own work.
- **Not changing §5.** Every gate row is accurate. Appending `#9` to the `e2e` row's
  "Catches" cell would claim coverage that does not exist — the row describes what is
  wired, and Phase 5 is not.
- **Not touching CI, branch protection, or any workflow file.** The protection read
  is evidence for a claim, not a change to make.
- **Not renumbering any risk (#1–#8) or any §6 sub-section.**
- **Not fixing the `PathEditor` duplication.** `lessons.md` says the real fix is a
  shared helper; that is a product change, not a test-plan refresh, and Phase 5's
  scope is behavioral so it stays correct either way.
- **Not promoting the silent quantity degradation** to a risk row (decided: it stays
  in the not-promoted set with a sharper note).
- **Not touching §1's three principles, the schema-fixed header tagline, or
  `context/archive/`.**
- **Not adding a §6 recipe for Phase 5**, and not adding a
  `docs/reference/contract-surfaces.md` entry — neither has a surface to register yet.

## Implementation Approach

Four phases over one file plus one source comment, ordered so nothing depends on an
unsettled decision — the same ordering discipline the 2026-08-25 refresh used.

Phase 1 settles the risk framing, because §3's new row, §7's rewrite and §8's record
all describe it. Phase 2 turns that framing into a rollout commitment and sweeps the
figures and grounding bullets that Phase 4 outdated, which is safe to do only once
risk #9 exists to be pointed at. Phase 3 rewrites the guidance and negative-space
sections and writes the record of what changed — accurate only after 1 and 2 land.
Phase 4 is isolated because it is the only phase that touches source: it fires a
different gate stack (lint-staged eslint, the pre-commit typecheck, the per-edit
vitest hook) and its honest verification needs a local Supabase, so it must be able
to slip without blocking the document work.

## Critical Implementation Details

**Schema constraints that silently break the obvious edit.** Three rules bite in
Phase 1: risk numbers are append-only and never renumbered (§3 Phases 1–4 cite
#1–#8); §2 Source cells may not name a file, `file:line`, or symbol, so risk #9's
evidence is the archived Phase 4 slice plus directory churn, never `PathEditor.tsx`;
and the Risk Response Guidance table is referenced as one table, so it gains a #9 row
rather than being split alongside the map.

**Ordering between Phase 2 and Phase 3.** §7's path-builder bullet must not be
narrowed before §3 carries the Phase 5 row it will point at, or the document spends a
commit asserting an ordering gap with nothing scheduled against it — the same reason
the 2026-08-25 refresh left its staged §8 note in place until its final phase.

**Churn figures are re-derived, not copied.** Per the convention §8 adopted
2026-08-25: `git log --oneline --no-merges --since=<window> -- <dir>`, counting
commits touching a directory, never summing per-file touch counts; state the window
next to the number, and state both windows when they disagree.

**Phase 4's gate stack differs.** Editing `tests/integration/global-setup.ts` puts a
`.ts` file through `lint-staged`'s `eslint --fix` and the `.husky/pre-commit`
typecheck, and the per-edit `PostToolUse` hook is scoped to
`src/lib/{path,card-data,deck}` plus `src/components/deck` so it will _not_ fire on a
`tests/` path. The file is the integration harness, so the only verification that
means anything is that the suite still boots — which needs `npx supabase start` and a
filled `.env.test`.

---

## Phase 1: §2 restructure and risk #9

### Overview

Split the risk map into protected and open sets, promote the path-builder
stale-response ordering as risk #9, and answer the quantity-degradation question the
last refresh deferred to this one.

### Changes Required:

#### 1. §2 risk map — split into two tables

**File**: `context/foundation/test-plan.md`

**Intent**: Retire the row-budget problem structurally instead of excusing it a third
time. A reader's actionable list is the open set; keeping it separate means the map can
grow without the actionable list growing.

**Contract**: §2 keeps its single `## 2. Risk Map` heading (no new §2.1/§2.2 numbers —
nothing cites them and inventing them creates references to maintain). Two tables under
bold lead-ins: a protected table carrying rows #1–#8 with their existing columns plus a
new trailing column naming the `complete` phase that protects each; and an open table
with the same column shape carrying #9, whose phase column names §3 Phase 5. Risk
numbers, wording, Impact, Likelihood and Source cells for #1–#8 are copied verbatim —
this is a move, not a rewrite. The 8-row overflow paragraph is replaced by a short note
recording that the split supersedes it and why (the schema's budget is about how many
risks a reader must weigh, which is now one).

#### 2. §2 — risk #9

**File**: `context/foundation/test-plan.md`

**Intent**: Record the path builder's uncovered stale-response ordering as a failure
scenario in user terms, rated so it does not inflate the map.

**Contract**: One row in the open table. The scenario reads as what the user sees — a
pre-save Check, diff preview, or error banner in the path builder describing deck text
the user has already changed or cleared — not as a description of the guards. Impact
**Medium**, Likelihood **Medium**, with the rubric reasoning stated in the surrounding
prose: Medium impact because Phase 3 already defends the persist boundary, so the blast
radius stops at what the user is shown _before_ saving; Medium likelihood because the
divergence is verified present in code rather than hypothesized, but has produced no
incident, and `src/components/path` churn is occasional (2 commits/30d, 9/90d, measured
2026-09-02). #1 remains the only High × High. Source cites the archived Phase 4 slice
`context/archive/2026-08-27-testing-comparer-failure-surfacing/` and its lessons
register, plus the directory churn — **no file, `file:line`, or symbol name**.

#### 3. §2 — Risk Response Guidance row for #9

**File**: `context/foundation/test-plan.md`

**Intent**: Make risk #9 actionable for the `/10x-research` and `/10x-plan` runs Phase 5
will trigger, and pre-load the two anti-patterns `lessons.md` already proved.

**Contract**: One row appended to the existing guidance table, same six columns, no file
anchors. "What would prove protection" is stated as rendered-content-matches-current-input
across the Check, diff-preview and error surfaces, with the superseded run leaving no
trace. "Must challenge" names the two assumptions `lessons.md` records as false — that a
flow is safe because it mirrors another, and that clearing an input cannot race. "Context
research must ground" names each flow's own guard checkpoints, which counter each
advances, whether the empty-input path invalidates in-flight work, and which state atom
each guarded write targets versus which counter guards it. "Likely cheapest layer" is
browser E2E (§3 Phase 5), justified by the drop path being silent and never reaching the
DOM. "Anti-pattern to avoid" names driving overlap by typing — the debounce coalesces
keystrokes into one run, so the test proves nothing.

#### 4. §2 — sharpen the not-promoted quantity note

**File**: `context/foundation/test-plan.md`

**Intent**: Answer the question the last refresh deferred ("a future refresh weighing
#7's family should weigh this with it") with a decision instead of a third deferral.

**Contract**: The existing paragraph on the silent quantity degradation keeps its
grounding and gains a closing decision: it stays unpromoted, naming the layer it would
actually need (a crafted collection response at the integration or unit layer, not a
browser) and stating that the deferral is now resolved rather than open, so a future
refresh does not re-litigate it. The `resolve.ts` / `quantity.ts` / `plan.test.ts`
anchors already in that paragraph are prose about a _not-promoted_ candidate, not a
Source cell, and stay as they are.

### Success Criteria:

#### Automated Verification:

- Prettier passes: `npx prettier --check context/foundation/test-plan.md`
- Both §2 tables parse as well-formed GFM tables with a consistent column count
- No file anchor entered a Source cell: the new rows contain no `.ts`, `.tsx`, or
  `:<digits>` pattern
- Risk numbers 1–9 each appear exactly once and #1–#8 are unchanged

#### Manual Verification:

- A reader scanning §2 can tell in one pass which risks are answered and which is not
- Risk #9's wording describes a user-visible failure, not the token guards
- The Medium × Medium rating reads as justified rather than hedged, and #1 is still
  visibly the only High × High
- The not-promoted quantity paragraph now closes with a decision a future refresh can
  cite instead of re-opening

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding to the next
phase. Phase blocks use plain bullets — the corresponding checkboxes live in the
`## Progress` section at the bottom of the plan.

---

## Phase 2: §3 Phase 5, §4 re-stamp, and the stale figures

### Overview

Turn risk #9 into a rollout commitment and sweep every figure and grounding claim that
rollout Phase 4 outdated.

### Changes Required:

#### 1. §3 — the Phase 5 row

**File**: `context/foundation/test-plan.md`

**Intent**: Give risk #9 a phase, so the open set names its answer and §7's narrowed
exclusion has something to point at.

**Contract**: One row appended to the §3 table. `#` = 5; phase name names the path
builder's stale-response ordering; Goal is one line stating that a resolve landing after
the input changed or was cleared is dropped rather than rendered; Risks covered = `#9`;
Test types = `browser E2E`; Status = `not started` (a fixed parser literal — the
orchestrator reads this cell); Change folder = `—`.

#### 2. §3 — order rationale for Phase 5

**File**: `context/foundation/test-plan.md`

**Intent**: Record why Phase 5 is last and why it is cheap, with the evidence behind the
cheapness claim, since §5's standing rule is that a claim about a CI gate is aspirational
until the required-check list has been read.

**Contract**: Two to three sentences appended to the existing order-rationale paragraph.
States that Phase 5 is the first phase to ride an existing job end to end — a new spec
under `tests/e2e/` needs no runner, no CI job and no branch-protection change, the cheap
shape Phases 2 and 3 took, now available on the browser side because Phase 4 paid the
setup cost. Cites the read: `contexts: ["ci","integration","e2e"]`,
`enforce_admins: true`, `strict: false`, read 2026-09-02.

#### 3. §4 — re-stamp the four grounding bullets

**File**: `context/foundation/test-plan.md`

**Intent**: Stop describing Phase 4 as pending. The bullets currently tell a reader the
runner choice is still open, which is the single most misleading thing left in §4.

**Contract**: All four `Stack grounding tools` bullets re-stamped `checked: 2026-09-02`
and rewritten in the past tense where they describe Phase 4. The Docs bullet drops
"Playwright's when Phase 4 plans" and records that the versions were re-confirmed
unchanged (Astro declared `^6.3.1` → 6.4.8, Vitest `^4.1.9` → 4.1.9, Playwright
`^1.62.1` → 1.62.1). The Runtime/browser bullet drops "why §3 Phase 4 is openable at
all" and "the runner and harness choice is still that phase's research to make", and
instead records that Phase 4 made that choice — Playwright, Chromium-only, Scryfall
fully intercepted — while keeping the still-true half: no Playwright MCP server is
exposed, so nothing in-session drives a browser on its own, which is why Phase 5's
harness work is `/10x-e2e`'s and not an MCP's. The Search and Provider/platform bullets
are re-read and re-stamped; the Provider bullet adds that `gh` carried this refresh's
protection read.

#### 4. §1 and §7 — the stale suite figure

**File**: `context/foundation/test-plan.md`

**Intent**: Retire a number that has now gone stale twice in two sections, and stop it
recurring by removing the count from the places where it is not load-bearing.

**Contract**: §1 principle 1 and §7's "re-testing the pure-logic engine" bullet stop
carrying a hard file count — in both, the count is rhetorical ("already covered, do not
duplicate"), so the phrasing becomes the existing Vitest logic suite without a figure.
The one dated, derivable count stays in §4's `unit (logic)` Notes cell: 23 files under
`src/**/*.test.ts`, of which `npm test` runs 22 (223 tests; `scryfall.live.test.ts` is
`describe.skipIf(!RUN_LIVE)` and is §4's own `live (external)` row), measured 2026-09-02.

#### 5. §2 — re-stamp the deck churn

**File**: `context/foundation/test-plan.md`

**Intent**: Bring risks #7 and #8's Source cells in line with what `git log` returns
today, and note that the recent movement is rollout-driven so a future reader does not
mistake it for feature churn.

**Contract**: Both Source cells change `1 commit/30d, 18 commits/90d` to
`2 commits/30d, 19 commits/90d` (re-derived 2026-09-02 by the convention's command).
A half-sentence in the surrounding prose records that both 30d commits touched shipped
code in service of testability — accessibility roles and explicit collation — so the
figure is genuine product churn, and that the churn convention needs no amendment.

### Success Criteria:

#### Automated Verification:

- Prettier passes: `npx prettier --check context/foundation/test-plan.md`
- §3's table still parses and every Status cell matches one of
  `not started|change opened|researched|planned|implementing|complete`
- The stale figure is gone: `grep -c '20-file' context/foundation/test-plan.md` returns 0
- Every churn figure in §2 and §7 re-derives from
  `git log --oneline --no-merges --since=<window> -- <dir>`
- Declared-versus-installed versions still match what §4 claims for Astro, Vitest and
  Playwright

#### Manual Verification:

- §3 reads as a rollout with one open front, not as a finished rollout with an
  afterthought appended
- The Phase 5 cheapness claim reads as evidenced rather than asserted
- No §4 bullet leaves a reader thinking a browser runner still needs choosing
- The re-stamped churn cells do not change either risk's rating or reasoning

**Implementation Note**: Pause here for manual confirmation from the human before
proceeding to the next phase.

---

## Phase 3: §7 rewrite, lessons.md pointers, and the §8 record

### Overview

Rewrite the negative-space section against what the repo now knows, make `lessons.md`
discoverable from the strategy and cookbook sections, and record what this refresh
changed.

### Changes Required:

#### 1. §7 — the frontend / component-rendering bullet

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the exclusion but stop leaving its trigger ambiguous, and settle the
question two browser phases now raise — why browser E2E is in while component render
stays out.

**Contract**: The first bullet keeps its Phase 2 interview Q5 source and gains a precise
statement of its own trigger: of the two conditions ("the logic boundary is locked" and
"the UI is being finalized") the first is met and the second is not — the roadmap carries
no open UI slice and S-07 is parked — so the exclusion stands on the unmet half, not on
inertia. It then states the boundary explicitly: a browser phase is admissible only for a
failure that exists _nowhere but the rendered result_ and that no cheaper layer can see —
a notice that only exists once rendered, an ordering that only manifests across two real
in-flight requests. Rendering itself — layout, styling, a component's markup given props
— stays out. Two phases on the browser side is not a general licence, and §1 principle 1
still rules.

#### 2. §7 — the path-builder bullet

**File**: `context/foundation/test-plan.md`

**Intent**: Remove the claim this refresh exists to correct, without over-correcting into
excluding nothing.

**Contract**: The bullet stops asserting that "what is left is the rendering of an
already-verified result" for the whole surface. It now excludes the path builder's
**render** — its layout and the display of an already-verified result, still defended
underneath by Phase 3's derive→persist pinning and Phases 1–2's route pinning — and
states plainly that its **client-side ordering is not excluded**: that is risk #9,
answered by §3 Phase 5. The churn sentence is retained with its figures re-verified
unchanged (`src/components/path`: 2 commits/30d, 9/90d, measured 2026-09-02), because the
point it makes — this is not a dormancy argument and does not expire when the directory
heats up — still holds for the render half. Source is updated to add the archived Phase 4
lessons register alongside the existing citations.

#### 3. §7 — the browser-E2E bullet

**File**: `context/foundation/test-plan.md`

**Intent**: Drop a false claim and widen the bullet to the two phases that now live on
the browser side.

**Contract**: "§4 still records no runner installed" is removed — §4 carries Playwright
`^1.62.1`. The bullet's scope statement covers Phase 4 (the comparer's failure surfacing,
risks #7–#8) and Phase 5 (the path builder's ordering, risk #9), and points at the
boundary statement in the first bullet rather than restating it.

#### 4. §1 — the lessons.md pointer

**File**: `context/foundation/test-plan.md`

**Intent**: Make the file discoverable to a human reading the strategy, since it is
already a required read for four skills and documents risk #9's evidence.

**Contract**: One line appended after §1's three principles and its hot-spot scope note
(the three principles themselves are untouched): `context/foundation/lessons.md` is a
required companion read, what it holds (verified, recurring traps, several with named
anti-patterns this document's §2 rows reference), and that the skills read it
automatically while a human must not skip it. The schema-fixed header tagline is not
touched.

#### 5. §6 — preamble pointer and the recorded deviation

**File**: `context/foundation/test-plan.md`

**Intent**: Put the pointer at the point of use, and record the two schema deviations as
deliberate with the reason, so the next refresh does not re-open a settled trade.

**Contract**: §6's preamble keeps its existing two sentences and gains: a line pointing
at `lessons.md` before writing any test; and a short note that §6 runs to seven
sub-sections against the schema's three-to-six, and that §6.6 (the per-phase notes log)
precedes §6.7 rather than trailing it, both left deliberately — §6.6 is cited from four
shipped source files plus `docs/reference/contract-surfaces.md`, so renumbering would
mean editing shipped comments for a cosmetic gain, and §6.5 carries content (the
grant-before-RLS trap, the `Origin` trap) that neither §6.2 nor §6.3 owns.

#### 6. §8 — the refresh record and dates

**File**: `context/foundation/test-plan.md`

**Intent**: Leave §8 alone sufficient to reconstruct this refresh, including the two
questions it answered by declining to act.

**Contract**: A `**Refresh completed 2026-09-02**` entry naming this change folder and
listing what changed per section (§2 split plus risk #9; §3 Phase 5; §4 grounding
bullets re-stamped; §1/§7 suite figure retired; §2 deck churn re-stamped; §7's three
bullets; §1/§6 lessons pointers; §6 deviation recorded; §6.2 rule 4 and the harness
comment corrected). It records the two deliberate non-actions with their reasons — §5
unchanged because appending #9 to a wired gate row would claim coverage that does not
exist, and the silent quantity degradation left unpromoted with the layer it would need
named. The three date lines are re-stamped: strategy reviewed 2026-09-02, stack versions
verified 2026-09-02, AI-native tool references verified 2026-09-02. The rollout line
records that four phases are `complete` and Phase 5 is open.

#### 7. Header — the "Last updated" line

**File**: `context/foundation/test-plan.md`

**Intent**: Re-stamp the one part of the header that is not schema-fixed.

**Contract**: `Last updated: 2026-09-02` with a parenthetical naming the substantive
change: §2 split into protected and open sets, risk #9 promoted, §3 Phase 5 opened at
`not started`, §7's path-builder exclusion narrowed to render. The two-line tagline and
the refresh pointer are fixed by the schema and are not touched.

### Success Criteria:

#### Automated Verification:

- Prettier passes: `npx prettier --check context/foundation/test-plan.md`
- The false claim is gone: `grep -c 'no runner installed'` returns 0
- §7 still has 5 bullets (the schema warns past 5–6)
- `lessons.md` is referenced from §1 and §6's preamble, not only from §6.6/§6.7/§8 prose
- Section order §1 → §8 is unchanged and no §6 sub-section number moved
- Every internal `§N.N` reference still resolves to an existing heading

#### Manual Verification:

- The §7 boundary statement is concrete enough that a contributor could apply it to a
  new proposal without asking
- The path-builder bullet no longer over-claims and no longer under-claims — render out,
  ordering in
- §8 alone is enough to reconstruct this refresh, including the two non-actions
- The header parenthetical names the change a returning reader most needs to know

**Implementation Note**: Pause here for manual confirmation from the human before
proceeding to the next phase.

---

## Phase 4: the `.dev.vars` mechanism correction

### Overview

Close the debt §8 has carried since 2026-08-31 by correcting the mechanism attribution in
both places that state it. The only phase that touches source.

### Changes Required:

#### 1. §6.2 rule 4

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the load-bearing precedence claim and fix the mechanism, so the recipe
says where to look when the override stops working.

**Contract**: Rule 4 keeps its title and its two operational sentences (the `.intbak`
sidecar snapshot and the crash recovery). The middle sentence stops attributing
precedence to `getPlatformProxy` and instead states that the Cloudflare adapter parses
`.dev.vars` and assigns the parsed values over `process.env`, which is _why_ the file
wins over the env injected at spawn — the precedence claim is unchanged, only its cause.
`lessons.md` holds the verified adapter line reference; the rule names the adapter, not a
`file:line`.

#### 2. The harness comment

**File**: `tests/integration/global-setup.ts`

**Intent**: Fix the attribution in the file a debugger actually opens.

**Contract**: The `overrideDevVars` doc comment keeps its precedence statement and its
crash-safety paragraph; the parenthetical `(via getPlatformProxy)` is replaced by the
adapter's actual behavior — it parses the file and assigns over `process.env`. Comment
only; no behavior change, no signature change.

#### 3. §8 — mark the debt closed

**File**: `context/foundation/test-plan.md`

**Intent**: Stop the entry reading as owed.

**Contract**: The "A correction Phase 4 owes two earlier artifacts" entry is rewritten to
record that the correction landed on 2026-09-02 through this change, keeping the
explanation of why it matters (it says where to look when the override stops working) and
dropping the "left in place rather than rewritten" rationale.

### Success Criteria:

#### Automated Verification:

- Prettier passes: `npx prettier --check context/foundation/test-plan.md`
- Lint passes on the edited file: `npx eslint tests/integration/global-setup.ts`
- Type checking passes: `npm run typecheck`
- The stale attribution is gone from both files: `grep -c 'getPlatformProxy'` returns 0
  for `tests/integration/global-setup.ts` and `context/foundation/test-plan.md`
- The integration harness still boots: `npm run test:integration` passes with local
  Supabase up

#### Manual Verification:

- The corrected sentence reads as an explanation, not as a hedge
- Both places now say the same thing, and `lessons.md` agrees with both
- Nothing about the override behavior changed — only its stated cause

**Implementation Note**: This phase requires `npx supabase start` and a filled
`.env.test`. If the local stack is unavailable, the phase may be deferred; in that case
Phase 3 leaves the §8 debt entry as carried rather than closed, and this phase is the
only outstanding item.

---

## Testing Strategy

This change adds no tests. It is a strategy document plus one source comment, so
verification is about claim accuracy rather than behavior.

### Unit Tests:

- None added. The only source edit is a comment in the integration harness; Phase 4's
  meaningful check is that the suite still boots, not a new assertion.

### Integration Tests:

- None added. `npm run test:integration` is run in Phase 4 as a regression check on the
  harness file, not as new coverage.

### Claim re-derivation (per phase):

- Every churn figure re-derived with
  `git log --oneline --no-merges --since=<window> -- <dir>`, both windows stated
- File and test counts re-derived with `find src -name '*.test.ts' | wc -l` and `npm test`
- Version claims re-derived from `package.json` plus the installed tree
- Branch-protection claims re-derived from
  `gh api repos/Vegolas/10xdevs-mtg-upgraded/branches/main/protection`

### Manual Testing Steps:

1. Read §2 cold and name which risks are answered and which is not, without consulting
   §3.
2. Read §7 and decide whether a proposed component render test is admissible; the answer
   should be unambiguous.
3. Confirm no section contradicts another on Playwright's presence or on what the path
   builder excludes.
4. Run the schema's smoke test — a fresh agent session asked "read the project rules and
   `context/foundation/test-plan.md`; what should I test first for the path builder's
   pre-save Check, and why?" should name risk #9, §3 Phase 5, browser E2E, and the
   typing anti-pattern.

## Performance Considerations

None. No code path changes.

## Migration Notes

None. `context/foundation/test-plan.md` has no consumers that parse it beyond
`/10x-test-plan`'s reading of §3's Status column, whose vocabulary this change preserves.

## References

- Prior refresh: `context/archive/2026-08-25-test-plan-refresh-2026-08-25/plan.md`
- Rollout Phase 4 (the harness and lessons this plan leans on):
  `context/archive/2026-08-27-testing-comparer-failure-surfacing/`
- Risk #9's evidence: `context/foundation/lessons.md`, third entry
- Schema: `~/.claude/skills/10x-test-plan/references/test-plan-schema.md`
- Target: `context/foundation/test-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles. See `references/progress-format.md`.

### Phase 1: §2 restructure and risk #9

#### Automated

- [x] 1.1 Prettier passes on test-plan.md — 4da1098
- [x] 1.2 Both §2 tables parse as well-formed GFM with a consistent column count — 4da1098
- [x] 1.3 No file anchor entered a Source cell — 4da1098
- [x] 1.4 Risk numbers 1–9 each appear exactly once and #1–#8 are unchanged — 4da1098

#### Manual

- [x] 1.5 A reader can tell in one pass which risks are answered and which is not — 4da1098
- [x] 1.6 Risk #9 describes a user-visible failure, not the token guards — 4da1098
- [x] 1.7 Medium × Medium reads as justified; #1 still the only High × High — 4da1098
- [x] 1.8 The not-promoted quantity paragraph closes with a citable decision — 4da1098

### Phase 2: §3 Phase 5, §4 re-stamp, and the stale figures

#### Automated

- [x] 2.1 Prettier passes on test-plan.md — d128f9e
- [x] 2.2 §3 parses and every Status cell is within the fixed vocabulary — d128f9e
- [x] 2.3 `grep -c '20-file'` returns 0 — d128f9e
- [x] 2.4 Every §2/§7 churn figure re-derives from the convention's command — d128f9e
- [x] 2.5 Declared-versus-installed versions match §4 for Astro, Vitest, Playwright — d128f9e

#### Manual

- [x] 2.6 §3 reads as a rollout with one open front — d128f9e
- [x] 2.7 The Phase 5 cheapness claim reads as evidenced, not asserted — d128f9e
- [x] 2.8 No §4 bullet implies a browser runner still needs choosing — d128f9e
- [x] 2.9 Re-stamped churn changes neither risk's rating nor reasoning — d128f9e

### Phase 3: §7 rewrite, lessons.md pointers, and the §8 record

#### Automated

- [x] 3.1 Prettier passes on test-plan.md — 4ff20bd
- [x] 3.2 `grep -c 'no runner installed'` returns 0 — 4ff20bd
- [x] 3.3 §7 still has 5 bullets — 4ff20bd
- [x] 3.4 `lessons.md` referenced from §1 and §6's preamble — 4ff20bd
- [x] 3.5 Section order §1 → §8 unchanged; no §6 sub-section number moved — 4ff20bd
- [x] 3.6 Every internal `§N.N` reference resolves to an existing heading — 4ff20bd

#### Manual

- [x] 3.7 The §7 boundary statement is applicable to a new proposal without asking — 4ff20bd
- [x] 3.8 The path-builder bullet neither over-claims nor under-claims — 4ff20bd
- [x] 3.9 §8 alone reconstructs this refresh, including the two non-actions — 4ff20bd
- [x] 3.10 The header parenthetical names what a returning reader most needs — 4ff20bd

### Phase 4: the `.dev.vars` mechanism correction

#### Automated

- [x] 4.1 Prettier passes on test-plan.md
- [x] 4.2 `npx eslint tests/integration/global-setup.ts` passes
- [x] 4.3 `npm run typecheck` passes
- [x] 4.4 `getPlatformProxy` appears in neither file
- [x] 4.5 `npm run test:integration` passes with local Supabase up

#### Manual

- [x] 4.6 The corrected sentence reads as an explanation, not a hedge
- [x] 4.7 Both places agree with each other and with `lessons.md`
- [x] 4.8 Override behavior unchanged — only its stated cause
