<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test-Plan Refresh 2026-09-01

- **Plan**: `context/changes/test-plan-refresh-2026-09-01/plan.md`
- **Scope**: Full plan — all 4 phases (35/35 Progress rows)
- **Date**: 2026-09-04
- **Verdict**: NEEDS ATTENTION (F1–F4 fixed the same day; see Decisions)
- **Findings**: 0 critical, 4 warnings, 6 observations
- **Commits reviewed**: `4da1098` (p1), `d128f9e` (p2), `4ff20bd` (p3), `3c4fa5e` (p4), `3cff09a` (epilogue)

## Verdicts

| Dimension           | Verdict                         |
| ------------------- | ------------------------------- |
| Plan Adherence      | PASS                            |
| Scope Discipline    | WARNING                         |
| Safety & Quality    | PASS                            |
| Architecture        | PASS (no architectural surface) |
| Pattern Consistency | PASS                            |
| Success Criteria    | FAIL                            |

### What passed, and how it was verified

All 13 planned changes matched their Contracts at intent level. Every hard constraint the
plan named was independently verified, not taken on trust:

- **Append-only risk numbers** — #1–#9 each appear once; #1–#6 byte-identical to
  `4da1098^`; #7/#8 differ only in the authorized churn re-stamp.
- **No file anchor in §2 Source cells** — regex sweep of risk #9's row and its guidance
  row for `\.tsx?` / `:\d+` returns nothing.
- **Single `## 2. Risk Map` heading** — no §2.1/§2.2 invented.
- **§3 Status vocabulary** — 4× `complete`, 1× `not started`.
- **§5 byte-identical** to pre-change across the whole section span.
- **No renumbering** of any §6 sub-section; §1–§8 and §6.1–§6.7 in order.
- **No CI / workflow / branch-protection / spec / archive edits** — the change spans 5
  files total.
- **Every figure re-derives** from the command its cell implies, re-checked 2026-09-04:
  `src/components/path` 2/30d 9/90d; `src/components/deck` 2/30d 19/90d; 23 files under
  `src/**/*.test.ts` (22 run, 223 collected); declared→installed `astro ^6.3.1`→6.4.8,
  `vitest ^4.1.9`→4.1.9, `@playwright/test ^1.62.1`→1.62.1; branch protection
  `contexts:["ci","integration","e2e"]`, `enforce_admins:true`, `strict:false`.
- **The `.dev.vars` correction is factually right** — `Object.assign(process.env, parsed)`
  at `@astrojs/cloudflare/dist/index.js:297` (adapter 13.5.0), and `getPlatformProxy`
  appears **nowhere** in the shipped adapter, so the old comment named a helper the adapter
  does not use.
- **The source diff is genuinely comment-only** — 4 lines inside a `/** */` block;
  signature, snapshot/restore body and crash-recovery logic byte-identical.

### Automated success criteria at HEAD

| Criterion                               | Result                               |
| --------------------------------------- | ------------------------------------ |
| Prettier (P1.1 / 2.1 / 3.1 / 4.1)       | PASS                                 |
| P1.2 §2 tables consistent columns       | PASS (all 9 tables in file)          |
| P1.3 no file anchor in #9 cells         | PASS                                 |
| P1.4 risks 1–9 once; #1–#8 unchanged    | PASS                                 |
| P2.2 §3 Status vocabulary               | PASS                                 |
| P2.3 `grep -c '20-file'` → 0            | **FAIL at review time** → fixed (F3) |
| P2.4 churn re-derives                   | PASS                                 |
| P2.5 declared vs installed              | PASS                                 |
| P3.2 `no runner installed` → 0          | PASS                                 |
| P3.3 §7 has 5 bullets                   | PASS                                 |
| P3.4 lessons.md in §1 + §6 preamble     | PASS                                 |
| P3.5 / P3.6 order + cross-refs          | PASS (176 refs, 0 misses)            |
| P4.2 eslint                             | PASS                                 |
| P4.3 typecheck                          | PASS (0 errors, 0 warnings)          |
| P4.4 `getPlatformProxy` in neither file | PASS                                 |
| P4.5 integration suite                  | PASS (10 files, 73 tests)            |

## Findings

### F1 — The refresh's core goal is unmet: four sites still carry the pre-Phase-4 framing

- **Severity**: WARNING
- **Impact**: HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md:80`, `:81`, `:234`, `:974`
- **Detail**: The plan's Desired End State reads "No section asserts a Playwright-shaped
  gap that Phase 4 closed." Phase 3 removed that claim from §7 bullet 5, but four sites
  outside the plan's change list still carried it in the present tense: risk #7's Source
  ("§4 records no browser or render layer, so this wiring is covered at no layer"), risk
  #8's Source ("§4 lists no browser or render layer"), §4's own `e2e` Notes cell ("Scope
  is held by §7: the comparer's failure surfacing"), and §6.7's preamble ("§7 scopes
  browser E2E to the comparer's failure surfacing"). §4:234 itself carries Playwright
  `^1.62.1`, so :80/:81 contradicted the very section they cite; :234 and :974 contradicted
  §7 bullet 5 and §3 Phase 5, both written by this change. For #8 the clause sat inside the
  Likelihood reasoning.
- **Root cause**: not implementation drift. Phase 1's verbatim-move rule froze #7/#8's
  cells and Phase 2 change 5 authorized only the churn edit. Phase 4's criterion 4.4 caught
  one such omission mechanically (§6.6's Phase 1 note); nothing forced a check on these
  four. The plan's manual step 3 ("Confirm no section contradicts another on Playwright's
  presence") was checked green but was not run against §2, §4's Notes cell, or §6.7.
- **Fix A (applied)**: Sweep all four sites. #7/#8's clauses now read as the state when the
  risk was surfaced; §4's Notes cell and §6.7's preamble now name both browser phases. A
  note in §2's "Why two tables" paragraph records this as the second and only other
  authorized edit to a frozen cell, with the reason.
  - Strength: Small and mechanical; delivers the end state the change was opened for, and
    neither #7's nor #8's rating moves (both are Phase-4 protected).
  - Tradeoff: Edits Source cells Phase 1 froze as verbatim — hence the recorded exception.
  - Confidence: HIGH — all four verified present tense against §4's actual `e2e` row.
  - Blind spot: §6.7's "these do not ride an existing job" (`:981`) and its
    `comparer-<risk>.spec.ts` naming rule are stale the same way. Left open — see Deferred.
- **Decision**: FIXED via Fix A

### F2 — §8 falsely claimed lessons.md agrees with the correction

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md:1235-1236`, `context/foundation/lessons.md:43-48`
- **Detail**: §8 closed with "`lessons.md` — which recorded the divergence in the first
  place — now agrees with both." It did not. `lessons.md` was touched by none of the five
  commits (last edited in `808da1a`) and still reads, present tense, that
  `global-setup.ts:47-48` and §6.2 rule 4 "both attribute `.dev.vars`' precedence to
  `getPlatformProxy`". That `:47-48` pointer now lands on the **corrected** text, so a
  reader following it saw accurate code labelled as wrong. Manual criterion 4.7 ("Both
  places agree with each other and with `lessons.md`") was confirmed green; this is the
  half that did not hold.
- **Fix A (applied)**: Append a dated correction bullet to `lessons.md` naming all three
  corrected sites and warning that the `:47-48` anchor above it now points at corrected
  text; soften §8 to say the register is append-only, still carries its original wording,
  and carries a landed-note to read instead.
  - Strength: Honors `lessons.md`'s declared append-only contract rather than rewriting a
    recorded lesson.
  - Tradeoff: The original present-tense bullet stays above the new one; a skimmer could
    still read the old one first — mitigated by the new bullet's opening clause.
  - Confidence: HIGH — append-only is stated in the file's own header.
  - Blind spot: `lessons.md` is a required read for six skills; not verified whether any
    parses its structure rather than reading it as prose.
- **Decision**: FIXED via Fix A

### F3 — Phase 2's criterion 2.3 no longer held at HEAD

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md:1265`
- **Detail**: `grep -c '20-file'` returned 1, not 0. By commit: `4da1098`=2 → `d128f9e`=0 →
  `4ff20bd`=1. Phase 2 genuinely passed; Phase 3's §8 refresh record reintroduced the
  string by quoting it — the identical mistake caught for `no runner installed` in the same
  edit and fixed there but not here, because Phase 3's checks do not include `20-file` and
  Phase 2's were not re-run. Substantively harmless (§8 correctly describes history), but
  Phase 2 change 4's stated Intent was "stop it recurring".
- **Fix (applied)**: `:1265` now describes the retired figure instead of quoting it.
- **Decision**: FIXED

### F4 — §8 debt entry said "two"/"Both" for three corrected sites

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `context/foundation/test-plan.md:1225-1236`
- **Detail**: Titled "A correction **two** earlier artifacts owed", then enumerated three
  and closed "**Both** now state that". `3c4fa5e`'s own commit message opens "Three
  artifacts attributed…", and `:1278` correctly calls §6.6's note "a third site".
- **Fix (applied)**: "three earlier artifacts owed" / "All three now state that".
- **Decision**: FIXED

### F5 — Date stamps read 2026-09-02; the edits landed 2026-09-03/04

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: `:9`, `:1165`, `:1225`, `:1296`, `:1300`
- **Detail**: The header and §8's three ledger lines stamp 2026-09-02, but `d128f9e`,
  `4ff20bd` and `3c4fa5e` all landed 2026-09-03. §8 _is_ the staleness oracle the refresh
  workflow reads, and the repo has an established restamp practice (`f1fbbb8`). Chosen
  deliberately during implementation for internal consistency — the whole refresh is dated
  2026-09-02 throughout. Alternative: state 2026-09-02 explicitly as the refresh's as-of
  date.
- **Decision**: SKIPPED

### F6 — §6.2 rule 4's new sentence is slightly overbroad

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Pattern Consistency
- **Location**: `:426`
- **Detail**: "overriding the file is the only override that holds" — `Object.assign` only
  overwrites keys _present in_ `.dev.vars`, so a spawn-env var for a key absent from the
  file does hold. Correct for the `SUPABASE_*` keys this harness sets, but this bullet's
  whole purpose is mechanism precision, so "for any key the file declares" would be tighter.
- **Decision**: SKIPPED

### F7 — §1's pointer over-credits which skills read lessons.md automatically

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `:49-58`
- **Detail**: The pointer lists `/10x-e2e` among skills that "read it automatically at
  start". `lessons.md:3` names six skills and excludes it; the file's own body says
  `/10x-e2e` reads it "if present". (The plan's Current State said "four skills", which
  matches neither.)
- **Decision**: SKIPPED

### F8 — Pre-existing harness gaps; the certified comment's "Crash-safe" claim has a hole

- **Severity**: OBSERVATION
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: `tests/integration/global-setup.ts:55-74`, `:109-120`, `:96-98`, `:35-42`,
  `:127-135`
- **Detail**: **Not introduced by this change** — the diff is comment-only. But the comment
  this change certified claims "Crash-safe:" and one branch is not covered: recovery keys
  off sidecar existence, so when the contributor has no `.dev.vars`, no `.intbak` is
  written; a run killed before the restore thunk leaves harness test values, which the next
  run adopts as "the original", copies to `.intbak`, and restores at teardown — making the
  leftover permanent. The contributor's own `astro dev` then silently points at local
  Supabase with no config banner to warn them (keys are present). Their _real_ file is never
  destroyed, so the snapshot claim holds. Also: no `child.on("error")`, so a spawn-level
  failure bypasses `restoreDevVars()`; the 5s teardown net never escalates to `SIGKILL` and
  its timer is not cleared on `exit`; the health probe never inspects `res.ok`; the log
  buffer accumulates for the whole run but is read only in the boot-failure branch.
- **Suggested fix if taken up**: write a sentinel first line into the harness-generated
  `.dev.vars` and treat a file bearing it as absent during recovery (or always create the
  sidecar, empty when there was no original).
- **Decision**: SKIPPED — worth its own change; out of scope for a doc refresh.

### F9 — Verbosity against the Contracts' own scale

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: §1, §3, §6, §8
- **Detail**: Change 3.4 asked for "one line" and got 10; change 2.2 asked for "two to
  three sentences" and got ~5. The file grew 1116 → 1311 lines on a refresh whose §2
  rationale is that the reader's actionable load should shrink to one row. Content-faithful,
  but the plan's sizing language was not respected.
- **Decision**: SKIPPED

### F10 — Risk #9's Source mis-counts the divergences it cites

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Plan Adherence
- **Location**: `:87`
- **Detail**: Says "four verified divergences… two of them still live", but
  `lessons.md:60-81` numbers four _and then_ adds "A fifth divergence sits next to it" —
  one of the two live ones is that fifth. Inherited verbatim from the plan's Key
  Discoveries. The document elsewhere consistently says "five hand copies" (`:53`, `:363`),
  matching `lessons.md`'s headline.
- **Decision**: SKIPPED

## Deferred (surfaced during F1, not part of the applied sweep)

- `context/foundation/test-plan.md:981` — §6.7 says these specs "do **not** ride an
  existing job". True when Phase 4 created the `e2e` job; §3's Phase 5 order rationale now
  cites riding that existing job as the evidence for Phase 5 being cheap. The sentence's
  local purpose (explaining the absent `.int.` infix) still reads correctly.
- `context/foundation/test-plan.md:980` — §6.7's naming rule `comparer-<risk>.spec.ts` will
  mis-name Phase 5's spec, which is a path-builder spec. Worth settling before
  `/10x-e2e` runs Phase 5.
- `context/foundation/test-plan.md:683` — §6.5 closes "That is §3 Phase 4's scope", now one
  of two browser phases.
