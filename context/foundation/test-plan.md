# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-07 (**§2's open set is empty for the first time.** Risk
> #9 — the path builder reporting on deck text the user has already changed or
> cleared — was **repaired**, not just pinned, and moved to the protected table;
> risk **#10** entered already protected, covering the same surface's
> mutations. Both were carried there by `shared-stale-response-guard`, a repair
> change that opened **no §3 rollout phase**, so the protected table's last
> column now names whatever holds the proof rather than assuming a phase does.
> §6.7 gained items 28–29. Read §2's own note above the empty open table before
> concluding there is nothing left: F-6 is still live and sits in that change's
> `findings.md`, at the unit layer, where it never earned a row. §3 Phases 1–5
> all remain `complete` and the rollout has had no open front since 2026-09-06.
> §7 was re-read and deliberately left unchanged — see §8. Prior baseline
> 2026-09-02, which split §2 into two tables, opened Phase 5, and narrowed §7's
> path-builder exclusion to that surface's **render** while stating outright the
> boundary that makes a browser phase admissible; component render and pixel
> tests stay out. See §8 for the rest.)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression. For DeckDelta this means: defend the server boundary
   (`/api/paths/*`, middleware) and the derive→persist correctness at the
   integration layer; do not re-test the pure-logic engine that the existing
   Vitest logic suite already covers, and do not reach for browser/E2E until
   the logic boundary is locked.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data. The top risk here —
   cross-owner path access — is a lived incident (an RLS policy that looked
   right but a query path bypassed), not a documented requirement.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/components`, `src/lib`,
`src/pages`, `src/middleware.ts` — excluding tests, build output, and the
retired `src/lib/history`.

**Required companion read: `context/foundation/lessons.md`.** It is the
append-only register of verified, recurring traps this project has already paid
for — several of them the named anti-patterns §2's response rows point at,
including the debounce that coalesces two intended runs into one (#8) and the
stale-response guard that exists as five hand copies rather than one pattern
(#9). §2 cites its findings as evidence without restating them, so the two
documents are read together. The skills read it automatically at start
(`/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`,
`/10x-implement`, `/10x-impl-review`, and `/10x-e2e`); a human reading §1–§7
has to open it deliberately, and must not skip it.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3). The map reads as two tables: a
**protected** set, where a passing spec already proves the row's failure
cannot happen, and an **open** set, which is the list a reader still has to
act on. For #1–#8 that proof is a `complete` §3 phase; #9 and #10 were
carried there by a repair change instead, so the protected table's last
column names whatever holds the proof rather than assuming a phase does. The
open set has been empty since 2026-09-07 — read the note above it before
concluding there is nothing left to do.

**Protected — every row below has a passing spec proving the failure cannot happen.** For
#1–#8 that proof came from a `complete` §3 rollout phase. #9 and #10 arrived by a different
route — a **repair change** that opened no §3 phase — so the last column names whatever
carries the proof rather than assuming a phase does. The distinction matters to a reader
acting on this table: a phase is a budgeted slice of the rollout, a repair change is not, and
#9 is the row that proved a risk can leave this list without one.

| #   | Risk (failure scenario)                                                                                                                                                                                                                                                                     | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                                                                                             | Protected by                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A signed-in user reads or mutates **another owner's** upgrade path because a query path bypasses RLS or skips an ownership check on `/api/paths/*`                                                                                                                                          | High   | High       | interview Q1 (top fear) + Q2 (lived incident: RLS looked right, a query path bypassed it, rows leaked cross-tenant); hot-spot dir `src/pages/api` (8 commits/30d); abuse lens (authorization / IDOR)                                                                                                                                                                                                                       | Phase 1 `complete`                                                                                                                                                                                                         |
| 2   | An **unauthenticated or expired-session** request reaches `/api/paths/*`, or a gated route (`/paths`, `/dashboard`) is served while signed-out — or a signed-in owner is wrongly bounced                                                                                                    | High   | Medium     | roadmap baseline (middleware gates `/paths`/`/dashboard`); interview Q4 (server boundary untested); hot-spot dir `src/components/auth` (12 commits/30d); abuse lens (access)                                                                                                                                                                                                                                               | Phase 1 `complete`                                                                                                                                                                                                         |
| 3   | A handler's **request/response contract changes** and a stale caller still references the old shape — a path-builder flow breaks silently                                                                                                                                                   | Medium | Medium     | interview Q3 (changing API handlers, fear of a forgotten reference to the old one); hot-spot dir `src/pages/api` (8 commits/30d)                                                                                                                                                                                                                                                                                           | Phase 2 `complete`                                                                                                                                                                                                         |
| 4   | A diff-mode checkpoint **persists a list that does not equal `prior frozen list ± delta`**, silently corrupting an immutable saved step                                                                                                                                                     | High   | Medium     | prd-v3 §Guardrails (derived-snapshot correctness) + §Success Criteria; hot-spot dir `src/lib/path` (23 commits/30d)                                                                                                                                                                                                                                                                                                        | Phase 3 `complete`                                                                                                                                                                                                         |
| 5   | An **unapplicable delta** (`− card` absent from the prior list) or an **unresolved `+ card`** is silently dropped at persist instead of being flagged before save                                                                                                                           | High   | Medium     | prd-v3 FR-003 / US-02 + PRD §Guardrails (graceful input handling, no silent omission); hot-spot dirs `src/lib/card-data` (23) + `src/lib/path` (23 commits/30d)                                                                                                                                                                                                                                                            | Phase 3 `complete`                                                                                                                                                                                                         |
| 6   | The **preserved full-paste add flow or the resolve/diff/cost engine** regresses behind the additive diff-mode change                                                                                                                                                                        | Medium | Medium     | prd-v3 FR-005 / FR-007 (preserved behavior promise); hot-spot dirs `src/lib/deck` (29) + `src/lib/path` (23 commits/30d)                                                                                                                                                                                                                                                                                                   | Phase 2 `complete`                                                                                                                                                                                                         |
| 7   | A partial resolution or a card-data transport failure reaches the user as a plan that **looks complete**, because the unresolved notice or the retryable error banner never renders                                                                                                         | High   | Medium     | interview 2026-08-25 (comparer is the live surface); hot-spot dir `src/components/deck` (2 commits/30d, 19 commits/90d); §4 recorded no browser or render layer when this risk was surfaced, so the wiring was covered at no layer — Phase 4 closed that (see §4's `e2e` row)                                                                                                                                              | Phase 4 `complete`                                                                                                                                                                                                         |
| 8   | A slow earlier comparison resolves **after** a newer one and clobbers it, so the user reads an upgrade plan built from deck text they have already replaced                                                                                                                                 | Medium | Low        | interview 2026-08-25 (comparer is the live surface); hot-spot dir `src/components/deck` (2 commits/30d, 19 commits/90d); §4 listed no browser or render layer when this risk was surfaced; guard stable since first commit ⇒ Low                                                                                                                                                                                           | Phase 4 `complete`                                                                                                                                                                                                         |
| 9   | In the **path builder**, a pre-save Check verdict, a diff preview, or an error banner describes deck text the user has already edited or cleared — a slow earlier resolve lands after the input moved on, so the user decides whether to save on a verdict about text that no longer exists | Medium | Medium     | archived §3 Phase 4 slice `context/archive/2026-08-27-testing-comparer-failure-surfacing/` and the lessons register it created (four verified divergences across the path builder's hand-copied stale-response guards, two of them still live); hot-spot dir `src/components/path` (2 commits/30d, 9 commits/90d, measured 2026-09-02)                                                                                     | `shared-stale-response-guard` (2026-09-07) — F-1 through F-4 repaired, the four `test.fail()` annotations off, `tests/e2e/path-builder-stale-ordering.spec.ts` green at `retries: 0`. No §3 phase; see the paragraph below |
| 10  | In the **path builder**, a mutation's superseded response leaves the rendered path disagreeing with the server — two overlapping deletes, renames or creates settle in an order the UI did not account for, so the user acts on a checkpoint list or a title the server does not hold       | Medium | Low        | F-5 in `context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md` (three mutation flows verified 2026-09-06 to carry no guard at all), plus the two corrections `shared-stale-response-guard` had to make to that entry before it was testable at all (its `findings.md` C-1, C-2); hot-spot dir `src/components/path` (2 commits/30d, 9 commits/90d, measured 2026-09-02, re-read unchanged 2026-09-07) | `shared-stale-response-guard` (2026-09-07) — enters the map already protected: `tests/e2e/path-builder-mutation-ordering.spec.ts` green at `retries: 0`, both disciplines driven                                           |

**Open — empty as of 2026-09-07, for the first time since this map was written.** Every risk
in the map now carries a passing spec. This is a state to read carefully rather than to
celebrate: it means nothing in the map is waiting on a reader, **not** that nothing is left.
Two things sit outside the table and stay actionable — the not-promoted set below (each with
the layer that already covers it, so a future refresh cites the decision instead of
re-opening it), and `context/changes/shared-stale-response-guard/findings.md`, which carries
F-6 forward as a live validation defect that belongs at the unit layer and therefore never
earned a row here. Keep the heading and this note when the next risk is promoted; an empty
table with no explanation reads as an oversight.

**Impact × Likelihood rubric.** High = user loses access/data/money or failure
is publicly visible / area changes weekly or already burned us. Medium =
feature degrades, workaround exists / touched occasionally, has been a bug
source. Low = cosmetic / stable code. Risk #1 is the only High × High — the
lived cross-tenant incident plus the most-churned untested boundary — so it
is protected first.

**Risk #9's rating against that rubric, as of surfacing.** Read the tense deliberately:
like every protected row, #9's cells record the evidence and rating **as of the day it was
promoted** (2026-09-02) and must not be read as a live claim — the repair has since
falsified the likelihood half, which is the whole point of the row being protected.
**Medium** impact because §3 Phase 3 already defended the persist boundary: the blast radius
stopped at what the user is shown _before_ saving, so a superseded verdict misled a decision
rather than corrupting a saved step. **Medium** likelihood because the divergence was
verified present in code rather than hypothesized — which is what separated #9 from #8's
Low — but it had produced no reported incident and `src/components/path` was touched only
occasionally (2 commits/30d, 9 commits/90d, measured 2026-09-02).
#1 remains the only High × High row in the map, and neither #9 nor #10 changes that.

**Risk #10's rating against that rubric.** **Medium** impact, matching #9's for the same
reason inverted: a mutation's stale response cannot corrupt a saved step either — `path_steps`
rows are immutable and the server's own state is always correct — but unlike #9 it leaves the
**rendered** path disagreeing with the server, which #9's pre-save surfaces cannot. A reload
corrects it and no data is lost, which is what keeps it out of High. **Low** likelihood, not
#9's Medium, and the difference is deliberate: every one of #9's four divergences was verified
reachable through ordinary UI affordances, whereas #10 needs two mutations genuinely in flight
at once on a surface with no debounce and one trigger per action — reachable, driven in a
browser, but requiring a double-click or a second click inside a single request's window. It
enters the map already protected, so the rating is recorded to justify the row rather than to
schedule work.

**Why #9 moved to the protected table on 2026-09-07, and why a change rather than a phase
carried it there.** This row is the one the two-table split was built to handle, and it has now
been through both states, so the sequence is worth stating once in full rather than
reconstructed from three ledger entries. #9 was promoted on a divergence **verified in code**,
not forecast — so unlike #1–#8 it did not arrive already defended, and §3 Phase 5 completing
did not protect it. Phase 5 proved the opposite: the failure did happen. What it left behind
was two `test.fail()`-annotated specs, joined by two more from
`testing-path-builder-error-and-mode` on 2026-09-06 — four inverted specs holding the correct
behavior on record, green against the defect, and written before any fix existed precisely so
they would be the **specification** for one. Through both of those changes the row read
**documented, not protected**, and the reader still had to act on it.

`shared-stale-response-guard` is the fix, landed 2026-09-07. It extracted one guarded-async
primitive (`src/lib/async/latestRun.ts` + `useLatestRun.ts`), routed all eight
async-then-setState flows through it, and repaired F-1 through F-4 in a single commit; all four
specs reported `Expected to fail, but passed.` and their annotations came off with the repair.
The file now carries `retries: 0` and passes as four ordinary regression tests. That is what
this table asks for, so the row moved.

**It opened no §3 rollout phase, and that is not an oversight.** §3 has had no open phase since
Phase 5 closed on 2026-09-06, and this change added no risk, no runner and no CI job — both
spec files live under `tests/e2e/`, which the required `e2e` job already runs. A rollout phase
is a budgeted slice of coverage work; this was repair. So the last column names the change, and
the protected table's preamble was widened to admit that rather than leaving a cell that
disagrees with the prose beneath it — which is the exact defect §8 recorded against this row's
previous cell, and the reason both corrections it owed are superseded rather than carried a
third time: the cell they described no longer exists.

**What replaced the standing obligation.** The duplication behind #9 was a review obligation
recorded in `context/foundation/lessons.md` ("Treat the stale-response guard as five hand
copies, not one pattern") for as long as the row was open. That entry is now superseded by "The
stale-response guard has one definition now — reject a new hand-rolled counter", and the
invariant is mechanical: `grep -rn "useRef(0)\|Token.current" src/` returns nothing. A new
hand-rolled counter is what would re-open this row, and it is cheap enough to check.

**Risk #10 enters already protected, which is a first for this map.** Every earlier row was
promoted before its coverage existed. #10 was promoted **by** the change that covers it, which
is why its Source cell cites a finding rather than an interview or a roadmap line: F-5 named
the failure class, and the same change that repaired it wrote the two green specs. Two things
made this admissible rather than a shortcut. It passes §7's boundary on its own terms — the
divergence exists nowhere but the rendered result, and with no component-render layer in §4
there is no cheaper place to see it. And it is **append-only**: #9's frozen cell was not
widened to cover a failure it never described (#9 is pre-save surfaces; #10 is persists), so
neither row now claims the other's coverage. The alternative — routing the decision to
`/10x-test-plan --refresh` — was considered and declined in the change's plan, on the grounds
that deferring would leave the map wrong in the actionable direction for however long the
refresh took.

**Why two tables, and what that retires.** The map ran to eight rows against the
schema's 5–7, and the 2026-08-25 refresh recorded the overflow while proposing
exactly this split rather than taking it. It is taken here. The schema's budget is
about how many risks a reader must weigh at once, and that number is now **one**:
#1–#8 each name the `complete` phase that answers them, so they read as verifiable
history rather than as work to plan. Nothing was renumbered, merged or dropped —
risk numbers are append-only because §3 Phases 1–4 cite them, so the rows moved
verbatim and gained one column. #8 is still the weakest row in the protected set: it
was promoted because it rode Phase 4's harness at near-zero marginal cost and is
deterministically reproducible in a browser, not because anything suggested a live
defect. Both rows' `src/components/deck` churn was re-derived 2026-09-02 and moved
from 1/30d and 18/90d to 2 and 19 — both 30d commits touched _shipped_ code in
service of testability (an `alert` role on the error banner, a named region on the
unresolved notice, explicit `"en"` collation), so this is genuine product churn the
rollout happened to drive rather than test-only noise; neither rating moves, and the
churn-citation convention in §8 needs no amendment. Both cells also had one clause
corrected on 2026-09-04 — each asserted, in the present tense, that §4 carried no browser
or render layer, which Phase 4 falsified when it installed Playwright. That is the second
and only other authorized edit to a frozen cell: the clause now reads as the state when the
risk was surfaced, because a Source cell records the evidence as of surfacing and must not
read as a live claim the document elsewhere contradicts. Rows #1–#6 keep their figures
**as measured when each risk was surfaced** — they entered with this document on
2026-06-30 and are the evidence behind a rating a `complete` phase has already
answered, not a live signal to re-measure. Today's 30d windows return far less for
all five directories they cite (`src/pages/api` 2, `src/components/auth` 0,
`src/lib/path` 5, `src/lib/card-data` 1, `src/lib/deck` 3, re-derived 2026-09-02),
which is what a closed rollout looks like from the churn side; re-stamping them would
replace the evidence with numbers that contradict the rating it justified. Only a row
in the **open** table, or one this refresh cites as current, is re-derived. This note
supersedes the overflow note it replaces; the protected table can now grow without the
actionable list growing with it.

Not promoted to the map (recorded so the rollout doesn't silently widen):
card misidentification from Scryfall resolution (already unit-tested plus a
live test; external-source drift is better served by the existing live test
and observability than a rollout phase) and secret/PII leakage (small scale,
Supabase anon key is expected-public) — both are folded into Phase 1
research as one-line checks rather than their own rows.

Also considered and not promoted: an upgrade-plan **cost total that
under-reports** because some cards carry no price. The computation is already
covered at §4's `unit (logic)` layer across every case including the
all-unpriced one, and pinned by that layer's engine goldens (recipes §6.1 and
§6.3 rule 9); the surface already discloses the gap rather than showing a
false zero. The only residual slice is the render of that disclosure, which
§7 excludes as component rendering — so there is no layer this row could buy.
Recorded so a future refresh does not re-propose it.

Also considered and not promoted, surfaced by Phase 4 research: an upgrade plan that is
**quantitatively wrong and says nothing about it**. When a `/cards/collection` batch
leaves two or more residual cards, `resolve.ts:99-102` declines to guess the association
and records nothing, so `quantifyResolved` falls back to one copy (`resolve.ts:240`,
again at `quantity.ts:47`) — `3 Jace the Mind Sculptor` renders as a single copy with no
`unresolved` entry and no notice. The degradation is **deliberate** (guessing a pairing
would silently swap copy counts, which is worse) and is documented as such at
`resolve.ts:70-75` and pinned as a case at `src/lib/deck/plan.test.ts:65-78`. It was
**not** promoted, and this refresh closes the question rather than deferring it a third
time. The
row-budget half of the original reasoning is retired by the protected/open split above,
so the layer argument is the one that decides it: the failure is not browser-only — it
needs a crafted `/cards/collection` response, which the integration and unit layers that
already own the resolver can construct and a browser phase cannot cheaply. What it shares
with #7 is the shape — a plan that reads as complete while being wrong — so if it is ever
promoted it belongs with #7's family, at that layer rather than at §3 Phase 5's.
**Decided 2026-09-02: it stays unpromoted.** A future refresh should cite this decision
instead of re-opening it, unless a user-visible incident lands or the resolver's
deliberate degrade path changes.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                       | Must challenge                                                                                                                                                                                                                                                                                                                                                     | Context `/10x-research` must ground                                                                                                                                                                                                                                                                                                                                              | Likely cheapest layer                                                                                                                                                                                   | Anti-pattern to avoid                                                                                                                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Owner A requesting Owner B's `path_id` is denied, and B's rows are never returned through any read/write route                                                                                                                                                                    | "logged in ⇒ authorized for this resource"; "an RLS policy exists ⇒ every query path is actually scoped"                                                                                                                                                                                                                                                           | the real handler→query path for each `/api/paths/*` route; how the cookie-bound Supabase client scopes the owner; what enforces ownership beyond RLS                                                                                                                                                                                                                             | integration against the **real** handler + DB (local Supabase), not a mock that can't reproduce an RLS bypass                                                                                           | happy-path-only (owner reads own path and calling it "auth tested"); asserting the policy SQL instead of exercising the live query path                                                                                                                                                                                          |
| #2   | No-session and expired-session requests get 401/redirect on the API; gated routes redirect when signed-out; a valid owner still gets through                                                                                                                                      | "middleware runs on every protected path"; "build-green ⇒ the gate works"                                                                                                                                                                                                                                                                                          | middleware matcher coverage; session/cookie shape on expiry; the redirect target for signed-out access                                                                                                                                                                                                                                                                           | integration                                                                                                                                                                                             | testing only the signed-in path; mocking away the session check so the gate is never exercised                                                                                                                                                                                                                                   |
| #3   | A change to a handler's shape makes a stale caller's test fail loudly rather than silently breaking the flow                                                                                                                                                                      | "all callers get updated together with the handler"                                                                                                                                                                                                                                                                                                                | the request/response contract of each `/api/paths/*` route and who consumes it                                                                                                                                                                                                                                                                                                   | contract + integration                                                                                                                                                                                  | mirroring the handler's _current_ output as the expected value (oracle problem — pins the bug, not the contract)                                                                                                                                                                                                                 |
| #4   | The persisted list equals an **independently constructed** `prior ± delta`, verified through the POST→persist path, not just the pure function                                                                                                                                    | "the derive logic is unit-tested, so the wired flow must be correct too"                                                                                                                                                                                                                                                                                           | the derive→resolve→persist seam; the frozen prior-snapshot source the delta reads from                                                                                                                                                                                                                                                                                           | integration                                                                                                                                                                                             | building the "expected" list by calling the same derive function under test (tautological oracle)                                                                                                                                                                                                                                |
| #5   | An unapplicable or unresolved line blocks-or-flags the save; the wrong snapshot is never persisted                                                                                                                                                                                | "no error returned ⇒ everything resolved/applied"                                                                                                                                                                                                                                                                                                                  | where the surfacing/rejection happens before persist; how `− not present` vs `+ unresolved` differ                                                                                                                                                                                                                                                                               | integration                                                                                                                                                                                             | happy-path-only; asserting the _absence_ of an error rather than the _presence_ of the flag/rejection                                                                                                                                                                                                                            |
| #6   | The engine's golden output is unchanged and a full-paste add still produces an identical snapshot after the diff-mode change                                                                                                                                                      | "an additive change cannot touch the preserved path"                                                                                                                                                                                                                                                                                                               | the engine's stable output contract; the full-paste add-flow seam                                                                                                                                                                                                                                                                                                                | golden output + integration                                                                                                                                                                             | duplicating the existing strong unit suite instead of pinning the engine output and the add-flow seam                                                                                                                                                                                                                            |
| #7   | A partial resolution and a transport failure each surface their own notice in the rendered plan, instead of a plan that reads as complete                                                                                                                                         | "a plan rendered means a plan complete"; "the resolver returned the outcome ⇒ the user was told"                                                                                                                                                                                                                                                                   | the outcome-to-render seam: which rendered surface owns each resolver outcome, and what the retry affordance does on a transport failure                                                                                                                                                                                                                                         | browser E2E (§3 Phase 4) — the notice exists only once rendered; the outcomes are already unit-owned                                                                                                    | a happy-path browser test that never induces a partial resolution or a transport failure, so no notice is ever exercised                                                                                                                                                                                                         |
| #8   | Two overlapping comparisons resolve out of order and the rendered plan matches the newest input, never the superseded one                                                                                                                                                         | "the token guard exists, so ordering is safe"; "the newer request always resolves last"                                                                                                                                                                                                                                                                            | the ordering guarantee: what marks a resolution stale, and where an out-of-order arrival is dropped before it reaches the rendered plan                                                                                                                                                                                                                                          | browser E2E (§3 Phase 4) — rides Phase 4's harness; needs two real in-flight resolutions to overlap                                                                                                     | a test that passes because it never actually overlaps two runs — sequential awaits cannot reproduce an out-of-order arrival                                                                                                                                                                                                      |
| #9   | Every path-builder surface that reports on deck text — the pre-save Check verdict, the diff preview, the error banner — matches the text currently in the box, and a superseded resolve leaves no trace on any of them, including when the box was cleared while it was in flight | "this flow is safe because it mirrors the one next to it"; "clearing an input cannot race — there is nothing left in flight"                                                                                                                                                                                                                                       | each flow's own guard checkpoints and how many it has; which counter each flow advances and which flows share one; whether the empty-input path invalidates work already in flight; and which state atom each guarded write targets versus which counter guards it                                                                                                               | browser E2E (§3 Phase 5) — the drop is a silent return that never reaches the DOM, so no cheaper layer can observe whether it happened                                                                  | driving the overlap by typing — the debounce coalesces keystrokes into a single run, so the second run never starts and the test passes without overlapping anything                                                                                                                                                             |
| #10  | Two overlapping path-builder mutations settle out of order and the rendered path still agrees with the server: one delete removes exactly one checkpoint and reports **no** error, and a superseded rename never restores the title it asked for                                  | "one discipline fits all three mutations" — a latest-wins token on delete-last is verified to make it **worse** than no guard, because it drops the successful 204 and keeps the 404's error; "the filed symptom is the failure" — F-5's was wrong, and both its symptom and its suggested fix had to be re-derived from the route before anything could be tested | each route's own **per-call** semantics (`DELETE /steps` removes the highest-position step per call, so two overlapping deletes delete two rows and the client's count is not the divergence); which flows share an error atom versus which lane guards each write; and whether the trigger or the run is the right thing to gate — no input event may ever invalidate a persist | browser E2E — the divergence exists nowhere but the rendered result, and §4 carries no component-render layer that could see it; the client-side ordering is not reachable from integration or contract | a spec whose parked mutation never reaches the server, so the second half of the overlap answers success too, no divergence is ever produced, and the spec passes with its guard reverted — and its sibling, signalling "in flight" on the request's arrival rather than the server's answer, which leaves the two halves racing |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                           | Goal (one line)                                                                                                                                                                                           | Risks covered | Test types                      | Status   | Change folder                                                                     |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------- | -------- | --------------------------------------------------------------------------------- |
| 1   | Server-boundary auth & ownership     | Prove cross-owner isolation and the signed-out gate on `/api/paths/*` + middleware, and make CI run the suite                                                                                             | #1, #2        | integration + CI gate           | complete | context/archive/2026-06-29-testing-server-boundary-auth/ (archived 2026-08-11)    |
| 2   | API contract pinning                 | Freeze `/api/paths/*` request/response shapes and the engine golden output so a stale caller or preserved-flow regression fails loudly                                                                    | #3, #6        | contract + integration + golden | complete | context/archive/2026-08-11-testing-api-contract-pinning/ (archived 2026-08-19)    |
| 3   | Derive-to-persist correctness        | Prove the persisted snapshot equals `prior ± delta` and that unapplicable/unresolved lines are flagged, not silently dropped                                                                              | #4, #5        | integration                     | complete | context/archive/2026-08-19-testing-derive-to-persist/ (archived 2026-08-21)       |
| 4   | Comparer failure-surfacing           | Prove the comparer surfaces its own failures — a partial resolution or a card-data transport failure is visible in the rendered plan — and never renders a superseded comparison                          | #7, #8        | browser E2E                     | complete | context/archive/2026-08-27-testing-comparer-failure-surfacing/ (arch. 2026-08-31) |
| 5   | Path-builder stale-response ordering | Prove a resolve that lands after the deck text changed or was cleared is dropped rather than rendered — no pre-save Check verdict, diff preview or error banner describes text the user has moved on from | #9            | browser E2E                     | complete | context/archive/2026-09-05-testing-path-builder-ordering/                         |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened`
→ `researched` → `planned` → `implementing` → `complete`.

Order rationale: Phase 1 defends the only High × High risk (a lived incident
on the most-churned untested boundary) and unlocks signal for everything
after it by wiring `npm test` into CI (health-check Fix #1 — CI currently
runs lint + build but not the tests). Phase 2 hardens the churny API
contract surface the team changes without confidence (interview Q3). Phase 3
closes the correctness guardrail on the newest feature (diff-mode derive).
Phase 4 is that sequencing paying out, not reversing it: interview Q4 gated
browser work behind the logic boundary, Phases 1–3 locked that boundary, so
browser E2E now enters scope — narrowly, for the comparer's failure-surfacing,
where the notice exists only once rendered. Phase 5 is last because it is the
only phase whose risk was found rather than forecast — #9 came out of Phase 4's
own lessons register, so no earlier ordering could have reached it — and it is
also the first phase whose whole cost is the test itself: a new spec under
`tests/e2e/` rides the `e2e` job Phase 4 already made required, so there is no
runner to add, no CI job to write and no branch-protection change to make. That
is the cheap shape Phases 2 and 3 had at the integration layer, now available on
the browser side because Phase 4 paid the setup cost. The cheapness was checked,
not assumed, per §5's standing rule that a claim about a CI gate is aspirational
until the required-check list has been read: `main` returns
`contexts: ["ci","integration","e2e"]` with `enforce_admins: true` and
`strict: false`, read 2026-09-02. Frontend/component render and pixel
testing stay deliberately **out** (see §7): their deferral rested on the UI
being unstable, and Phases 1–4 did not change that.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                        | Tool                          | Version | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit (logic)                 | Vitest                        | ^4.1.9  | `node` env, `src/**/*.test.ts`, `@/*` alias. All pure-logic (`src/lib/{card-data,deck,path}` + deck helpers). `npm test` → `vitest run`. Includes the `*.golden.test.ts` engine goldens with committed `__snapshots__/*.snap` — see §6.3 rule 9. Size, the one dated count in this document: 23 files, of which `npm test` runs 22 — 222 tests passed, 1 skipped of 223 collected; the skip is `scryfall.live.test.ts`, gated by `describe.skipIf(!RUN_LIVE)` and carried as the `live (external)` row below; measured 2026-09-02. |
| integration (API + boundary) | Vitest + local Supabase       | ^4.1.9  | `tests/integration/**/*.int.test.ts` via `vitest.integration.config.ts`; `npm run test:integration`. Real HTTP through a `globalSetup`-spawned `astro dev` against local Supabase with RLS live — never a mock that can't reproduce an RLS bypass. Recipe in §6.2.                                                                                                                                                                                                                                                                 |
| contract                     | Vitest                        | ^4.1.9  | `tests/integration/contract-*.int.test.ts` — rides the `integration` job via the `.int.` infix. Pins request/response shapes of `/api/paths/*` and `signin`'s 302 against the decided-contract table, with the declared types in `src/lib/api/contract.ts` gated by `npm run typecheck`. Recipe in §6.3.                                                                                                                                                                                                                           |
| live (external)              | Vitest                        | ^4.1.9  | `src/lib/card-data/scryfall.live.test.ts` — network-dependent Scryfall check; keep for card-data-accuracy drift signal.                                                                                                                                                                                                                                                                                                                                                                                                            |
| e2e (browser)                | Playwright                    | ^1.62.1 | `tests/e2e/**/*.spec.ts` via `playwright.config.ts`; `npm run test:e2e`. Chromium only, against a Playwright-managed `astro dev` on port 4323, with **all** Scryfall traffic intercepted — no Supabase, no auth, no external network. Rides its own `e2e` CI job (see §5). Scope is held by §7, which admits two phases: the comparer's failure surfacing (§3 Phase 4) and the path builder's stale-response ordering (§3 Phase 5). Component render stays out. Recipe in §6.7.                                                    |
| component render             | none (no jsdom/RTL by design) | —       | **deliberately deferred — see §7** (interview Q5: frontend later).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Stack grounding tools (current session):**

- Docs: **Context7** available — can ground current Vitest 4 / Astro 6 / Supabase SSR / Cloudflare Workers test-setup APIs (e.g. `unstable_dev`, cookie-bound client testing), and Playwright's, which Phase 4 drew on when it stood up the harness. Versions re-confirmed unchanged rather than re-stamped: declared `astro ^6.3.1` resolves to 6.4.8, `vitest ^4.1.9` to 4.1.9 and `@playwright/test ^1.62.1` to 1.62.1, so "Vitest 4 / Astro 6" and the `e2e` row above all still read correctly; checked: 2026-09-02
- Search: **general web search available** — built-in web search/fetch, plus a `web_search` tool on two connected MCP servers; still **no Exa.ai or dedicated docs-search MCP**, so Context7 stays the grounding path for framework APIs; checked: 2026-09-02
- Runtime/browser: browser-test tooling exists **as skills, not as an MCP server** — a dedicated E2E workflow skill in this repo (`/10x-e2e`, which reads §2's risk rows directly) plus a Playwright-driven web-app testing skill in the session; **no Playwright MCP server is exposed**, so nothing in-session drives a browser on its own. Phase 4 made the runner and harness choice off the first half and it is settled, not pending: Playwright, Chromium only, all Scryfall traffic intercepted (see the `e2e` row above). The second half is the part that still bites — Phase 5's harness work belongs to `/10x-e2e` and the fixtures under `tests/e2e/`, because no MCP can drive the browser in its place; checked: 2026-09-02
- Provider/platform: **Supabase** via CLI/skill only (no DB MCP); `gh` CLI available — it carried the CI test-step change in Phase 1, the branch-protection re-reads recorded in §5, and this refresh's read behind §3's Phase 5 order rationale; checked: 2026-09-02

Use docs MCPs for current framework/library APIs and setup details. Do not
use MCP docs/search to infer code failure anchors; those belong in per-phase
`/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout phase
lands; before that, the gate is `planned`.

| Gate                          | Where      | Required?                                                                                                                                                                                                                                               | Catches                                                                                                                                                      |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| lint                          | local + CI | required (already wired)                                                                                                                                                                                                                                | `eslint .` with `strictTypeChecked` — type-aware rules, but **not** assignability errors; see the typecheck row                                              |
| typecheck                     | local + CI | **required (wired §3 Phase 2)** — `npm run typecheck` (`astro check`) in the `ci` job between lint and unit                                                                                                                                             | type drift, and the declared `/api/paths/*` wire contract (`src/lib/api/contract.ts` plus the explicitly parameterized `jsonResponse<T>` / `requestJson<T>`) |
| build                         | local + CI | required (already wired)                                                                                                                                                                                                                                | broken Astro build (`astro build` does **not** typecheck)                                                                                                    |
| unit (logic)                  | local + CI | **required (wired §3 Phase 1)** — `npm test` in the `ci` job between typecheck and build                                                                                                                                                                | logic regressions                                                                                                                                            |
| golden (engine output)        | local + CI | **required (wired §3 Phase 2)** — the `*.golden.test.ts` files ride `npm test` in the `ci` job                                                                                                                                                          | silent drift in the diff/cost engine's rendered output, or in the preserved full-paste add flow                                                              |
| integration (API + ownership) | local + CI | **required (wired §3 Phase 1)** — `npm run test:integration` in the separate `integration` job, against an ephemeral local stack                                                                                                                        | cross-owner leak, signed-out gate failures                                                                                                                   |
| contract (`/api/paths/*`)     | local + CI | **required (wired §3 Phase 2)** — the `contract-*.int.test.ts` files ride `npm run test:integration` in the `integration` job                                                                                                                           | stale-caller / changed-shape breaks                                                                                                                          |
| derive-to-persist integration | local + CI | **required (wired §3 Phase 3)** — `derive-persist.int.test.ts` rides `npm run test:integration` in the `integration` job                                                                                                                                | corrupted or silently-wrong snapshots — a persisted checkpoint that is not `prior ± delta`, or a dropped unapplicable/unresolved line                        |
| e2e on critical flows         | CI on PR   | **required (wired §3 Phase 4)** — `npm run test:e2e` in the separate `e2e` job; `e2e` confirmed present in `main`'s required-check list 2026-08-31, after the workflow merged                                                                           | a comparer failure that still renders as a complete plan (risk #7), and a superseded comparison clobbering a newer one (risk #8)                             |
| related unit tests (per-edit) | local only | **wired 2026-08-31** — `.claude/settings.json` `PostToolUse` on `Write` and `Edit` runs `.claude/hooks/vitest-related.mjs`, scoped to `src/lib/{path,card-data,deck}` + `src/components/deck`; **not** a CI gate and **not** on the required-check list | a logic or golden regression in the churny engine inside the agent's own loop, before the change reaches lint, commit or CI                                  |

The load-bearing gate change **landed in Phase 1**: `.github/workflows/ci.yml`
now runs `npm test` between lint and build, plus a separate `integration` job
that boots an ephemeral local Supabase and runs `npm run test:integration`, so
both suites actually gate PRs. CI green is no longer false confidence on the
server boundary. The integration job sources its keys — including service-role —
from `supabase status` on the running stack, so no long-lived service-role
secret exists in the repo or in Actions secrets.

**Phase 2 added two gates and no jobs.** The contract suites carry the `.int.test.ts`
infix, so `vitest.integration.config.ts` globs them and they ride the already-required
`integration` job; the engine goldens are plain `src/**/*.test.ts` files, so they ride
`npm test` in the already-required `ci` job. No job name was added and no
branch-protection change was needed — the cheap way to add a gate here, and worth
copying in Phase 3.

**Phase 3 copied it: one gate, no jobs, no workflow change.** `derive-persist.int.test.ts`
carries the same `.int.` infix, so it rides `npm run test:integration` in the
`integration` job. The required-check list on `main` was re-read before claiming the
row — `["ci", "integration"]` with `enforce_admins: true` and `strict: false`, verified
2026-08-20 via `gh api repos/…/branches/main/protection` — so `integration` was already
required and no branch-protection change was needed. Stating that explicitly is the
point: per Phase 2's lesson, "the suite will catch it" is a claim about a CI step, so
the row is only honest once the job name has been confirmed present in that list.
Phase 3 also widened what the `ci` job gates without touching it, for the same reason:
`verify.test.ts` and the Phase 1 canonicalization cases are plain `src/**/*.test.ts`
files and ride `npm test`.

The one workflow change Phase 2 did need was `npm run typecheck`. Until it landed,
**nothing in the pipeline typechecked**: `eslint` is type-aware but does not report
assignability errors, and `astro build` does not typecheck at all (`astro check` is a
separate command). So the single row that used to read "lint + typecheck — required
(already wired)" was half aspirational, and the declared wire types would have gated
nothing. The rows above are now split so the distinction stays visible.

**Phase 4 needed all three, and is the first phase that did:** a new suite, a new job, and a
branch-protection change. There was no infix to ride — `tests/e2e/**/*.spec.ts` is a different
runner, not a different glob of an existing one — so the cheap route Phases 2 and 3 took was
not available. The order was load-bearing and is worth copying: the workflow edit merged to
`main` **first** (PR #13), and only then did
`gh api -X PATCH …/branches/main/protection` move `contexts` from `["ci","integration"]` to
`["ci","integration","e2e"]`, preserving `strict: false` and `enforce_admins: true`. Reversed, every
PR would block forever on a context that never reports. No PR carries the PATCH and nothing in
CI verifies it, which is exactly why the row above was flipped only after re-reading the list —
not in the same edit as the workflow change.

**The local stack gained two layers on 2026-08-31, and measurement chose them.**
Warm, on the maintainer's Windows machine: `vitest related <file> --run` **1.9s**
through the local bin (3.2s through `npx`), the full 223-test `npm test` **7.5s**,
`eslint` on **one** file **11.9s** warm and 38s cold, `astro check` **25.7s**. That
inverts the usual advice that lint is the cheap per-edit check and tests are the
expensive one: `eslint.config.js` runs `strictTypeChecked`, so every invocation
builds a TS program, and one file costs more than the entire unit suite. So the
per-edit layer runs the scoped tests **only**; lint stays where it already was
(`lint-staged`), and `npm run typecheck` was added to `.husky/pre-commit` — which is
what makes the typecheck row's "local + CI" true locally for the first time, since
before this the only typechecker anywhere was the CI step Phase 2 added. Both layers
are local: `main`'s required-check list is unchanged at `["ci","integration","e2e"]`,
and per the rule below neither row above should be read as a new branch requirement.

**The per-edit hook was proved by deliberate break the same day**, the same way the
CI gates were. `total += after` → `total += after + 1` in `src/lib/path/derive.ts`:
the hook exited **2** with 193 lines of Vitest report on **stderr** — `derive.test.ts`
5 red plus `add-flow.golden.test.ts` 2 red, the golden catching the drift it exists
for (risk #6) — and the file was restored immediately. Three details are load-bearing
and are recorded because each one silently breaks the obvious config: a `PostToolUse`
hook's **stdout reaches the debug log only**, so the script re-routes the runner's
report to stderr or the agent is blocked with no diagnostics; `jq` is **not installed**
on this machine, so the customary `jq -r .tool_input.file_path` would hand the runner
an empty path (the script parses stdin in Node instead, which also survives PowerShell);
and a hook `timeout` is in **seconds**, not milliseconds. `AI_AGENT=1` is a no-op at
Vitest 4.1.9 — the string appears nowhere in its dist tree — so the script caps its own
stderr at 16k characters rather than relying on a compact reporter that is not there.

**"Required" means required on the branch, not just in the workflow file.**
`main` carries classic branch protection with `ci` + `integration` as required
status checks and `enforce_admins: true`. Verified 2026-08-11 by a PR that
deliberately widened the `path_steps` RLS policy to `using (true)`: `integration`
went red on the step-route DELETE test, `ci` stayed green, and the PR reported
`mergeStateStatus: BLOCKED`. Re-verified 2026-08-19 for the Phase 2 gates by PR #5,
which returned the raw DB row from `POST /api/paths/[id]/steps`: `ci` went red on
`typecheck` in 1m07s, and with the type argument dropped so the break compiled,
`integration` went red alone on `contract-steps.int.test.ts` — both runs `BLOCKED`
with `mergeable: MERGEABLE` (see §6.6). Two consequences for contributors: every change to
`main` — including docs-only ones — goes through a PR, and adding a gate to this
table also means adding its job name to the required-check list, or the row is
aspirational.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section reads "TBD — see
§3 Phase N."

**Read `context/foundation/lessons.md` before writing any test.** It records the
traps that have already cost this project a debugging session — the debounce
that coalesces two intended runs into one, the config banner that makes a single
spec see two different DOMs in CI and locally, the stale-response guard
duplicated by hand across five flows — and none of the recipes below restate
them. §1 names it as a required companion read for the same reason.

**Two deliberate deviations from the schema, recorded so the next refresh does
not re-open a settled trade.** §6 runs to seven sub-sections against the
schema's three-to-six, and §6.6 (the per-rollout-phase notes log) precedes
§6.7 rather than trailing the recipes where the schema places it. Both stand.
§6.6 is cited **by number** from four shipped source files
(`src/lib/path/verify.ts`, `src/lib/path/verify.test.ts`,
`tests/integration/helpers/derive.ts`,
`tests/integration/derive-persist.int.test.ts`) plus
`docs/reference/contract-surfaces.md`, on top of its in-document references, so
renumbering would mean editing shipped comments for a cosmetic gain. And the
seventh sub-section is not padding: §6.5 carries the two traps that belong to
standing up a _new_ route — the `grant` checked before RLS, which no green
local run can see, and the `Origin` header on mutating requests — which
neither §6.2 nor §6.3 owns.

### 6.1 Adding a unit test (logic)

- **Location**: next to the unit under test, e.g. `src/lib/deck/<module>.test.ts`.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/path/derive.test.ts` (derive correctness),
  `src/lib/deck/plan.test.ts` (engine output).
- **Run locally**: `npm test`.

### 6.2 Adding an integration test (API + ownership)

- **Location**: `tests/integration/<risk>.int.test.ts` — outside `src/`, so
  `npm test` (which globs `src/**/*.test.ts`) never picks it up.
- **Naming**: `<risk-or-surface>.int.test.ts`. The `.int.` infix is what
  `vitest.integration.config.ts` globs.
- **Reference tests**: `ownership-steps.int.test.ts` (cross-owner + DB-state
  read-back), `gate-api.int.test.ts` (401 gate), `smoke.int.test.ts` (thinnest
  possible harness proof).
- **Prerequisite**: local Supabase up (`npx supabase start`) and `.env.test`
  filled from `npx supabase status` (copy `.env.test.example`). With Supabase
  down the suite fails fast with that instruction, not a timeout.
- **Run locally**: `npm run test:integration`. CI runs it in a separate
  `integration` job against an ephemeral stack.

The recipe, and why each piece is load-bearing:

1. **Separate Vitest config**, not a second glob in the unit config
   (`vitest.integration.config.ts`): loads `.env.test` into `process.env`,
   forwards only the needed keys to worker forks via `test.env`, and keeps
   `npm test` fast and DB-free. Real env vars win over the file, so CI
   overrides without writing one.
2. **`globalSetup` spawns a real `astro dev`** (`tests/integration/global-setup.ts`)
   and polls until it answers. There is nothing in-process to mock without
   bypassing the thing under test — the session check is one real network call
   in middleware, and RLS only applies to a real query.
3. **The dev server needs the env, not just the test process.** It gets the
   local URL + **anon** key only. The service-role key stays in the test
   process (admin seeding, teardown, DB read-back) and is never handed to the
   server.
4. **`.dev.vars` is overridden, not just the spawn env.** The Cloudflare
   adapter parses `.dev.vars` and assigns the parsed values over `process.env`,
   which is _why_ the file _wins_ over the env injected at spawn — overriding
   the file is the only override that holds. Setup snapshots the contributor's
   real file to a `.intbak` sidecar and restores it on teardown; a leftover
   sidecar from a killed run is recovered before the next snapshot. When the
   override stops working, that assignment is where to look; `lessons.md`
   carries the verified adapter reference.
5. **Seed owners via the admin API, then sign in through the app's own
   `/api/auth/signin`** (`helpers/owners.ts`) with `redirect: "manual"` so the
   302 doesn't swallow `Set-Cookie`. Reassemble every `sb-*` cookie (including
   the chunked `.0`/`.1` parts) into one replayable `Cookie` header. Hand-built
   cookies would test a shape the app doesn't actually emit.
6. **For the invalid-session case use `corruptCookies()`** — keep the real
   cookie _names_, replace the values. A garbage token is the faithful proxy
   for expiry: both collapse to the same observable behavior (302 for pages,
   401 for the API), and no truly time-expired JWT has to be minted.
7. **Denial is `404` (single resource) or a filtered `200` (list), never
   `403`.** RLS makes other owners' rows invisible, so the handler cannot tell
   "absent" from "not yours." Assert 404 + row absence.
8. **Assert DB state, not just status, on any mutating cross-owner test.**
   Read back with the service-role client (`helpers/owners.ts`). A 404 alone
   would still pass if a too-broad policy 404'd the client _and_ wrote the row.
   This is the whole point of the `path_steps` tests — that table has no
   `owner_id` and is protected transitively by an `EXISTS` subquery.
9. **Self-seed and self-clean.** Unique timestamp-suffixed emails; delete
   owners in `afterAll` (`helpers/cleanup.ts`) and let `on delete cascade`
   drop their paths and steps. No `seed.sql` fixtures — the suite must pass
   twice in a row.
10. **Never use service-role for an assertion's subject.** Setup, teardown and
    read-back only; asserting through a privileged client would bypass the
    mechanism under test.

Execution is serialized (`fileParallelism: false`, `pool: "forks"`) because the
suite shares one DB and one dev server, with `testTimeout`/`hookTimeout` raised
to 30s for boot + real network round-trips.

### 6.3 Adding a contract test for `/api/paths/*`

- **Location**: `tests/integration/contract-<surface>.int.test.ts`. Same harness as
  §6.2 — a contract pin is worthless against a mock of the thing it pins, so it
  runs over real HTTP with RLS live. The `contract-` prefix is convention; the
  `.int.` infix is what `vitest.integration.config.ts` globs, and that is what
  makes the suite ride the already-required `integration` job (see §5).
- **Naming**: `contract-<surface>.int.test.ts`.
- **Reference tests**: `contract-paths.int.test.ts` (list / create / read / rename /
  delete, incl. the `{path, steps}` envelope and both `204`s),
  `contract-steps.int.test.ts` (the `PathStep` body, server-owned `position`, the
  `deltaText` rule, and the snapshot round-trip),
  `contract-signin.int.test.ts` (the harness's own foundation: 302 + `Location` +
  chunked `sb-*` cookies), `contract-page-agreement.int.test.ts` (the API and the
  SSR page agree on step order).
- **Prerequisite / run locally**: identical to §6.2 — local Supabase up
  (`npx supabase start`), `.env.test` filled, then `npm run test:integration`.
- **Engine goldens live elsewhere**: `src/lib/<module>/<name>.golden.test.ts`, picked
  up by `npm test` in the `ci` job. Reference: `src/lib/deck/diff.golden.test.ts`,
  `src/lib/path/add-flow.golden.test.ts`.

The recipe, and why each piece is load-bearing:

1. **Write the contract down before writing an assertion, and cite the writing —
   never the handler.** A contract test that expects what the code currently emits
   pins the bug (the oracle problem). The decided-contract table in
   `context/archive/2026-08-11-testing-api-contract-pinning/plan.md` is the oracle: one row per
   route giving status + success body, plus a second table for every error body. Each
   row is marked **`documented`** (an archived design doc specifies it, independently
   of today's code) or **`decided`** (the docs are silent and the plan made the call,
   with the reason). Extend that table before pinning a new route; a `decided` row is
   a real decision, so record why.
2. **Mark each assertion with its oracle in a comment.** Every test in the suites
   carries a one-line `// documented (…)` or `// decided (…)` comment restating the
   row it pins. It is how a reviewer checks the test against the contract instead of
   against the code, and how a future contributor knows that changing an expectation
   means changing a decision.
3. **Key sets are closed, and the expected key lists are literal strings.** Assert
   through `helpers/shape.ts` (`expectUpgradePath`, `expectPathStep`,
   `expectApiError`, or `expectExactKeys` for a one-off envelope): a body must carry
   _exactly_ the contract's keys — no extras, none missing. Two consequences worth
   the strictness: an additive field becomes a deliberate test edit rather than a
   silent pass, and a raw-DB-row regression fails on both halves at once (snake_case
   keys extra, camelCase keys missing). The key arrays are hand-written strings on
   purpose — deriving them from the domain type, or from `Object.keys` of a live
   response, would make a rename rename the expectation too.
4. **Never assert a bare status code** — Phase 1's rule (§6.6) still holds. Route
   every status through `helpers/http.ts#assertStatus`, which puts the body in the
   failure message. Since Phase 2 a 500 body is redacted to `{error, ref}`, so the
   diagnosis is now: `ref` from the failure message, cause from the dev server's
   stderr, which `global-setup.ts` pipes to the parent.
5. **Send `Origin` on every mutating request.** Astro's `security.checkOrigin` answers
   **403 plain text** — before the handler runs — for a cross-origin non-GET that is
   form-like _or carries no `content-type` at all_, which includes both bodyless
   `DELETE` routes. `helpers/paths.ts` and `helpers/owners.ts` already set it; a
   hand-rolled `fetch` in a new test must too, or you will pin a CSRF rejection and
   think you pinned the route.
6. **Declare the shape in `src/lib/api/contract.ts` and let `tsc` gate the cheap
   half.** A test can only catch drift that ships; a type catches it at the keyboard.
   The mechanism is the _explicit_ type argument at each call site —
   `jsonResponse<UpgradePath>(toUpgradePath(row), 201)` server-side,
   `requestJson<PathStep>(…)` in the island. A bare `jsonResponse(…)` infers `T` from
   its argument and checks nothing. This only gates because `ci` runs
   `npm run typecheck`; see §5.
7. **Round-trip anything stored, and compare deeply.** For a body that persists,
   POST a realistic fixture and read it back through the GET route — the seam is the
   column, not the handler. Use `helpers/snapshot.ts#realisticSnapshot()`
   (nullable prices, a null `imageUrl`, one entry per `unresolved` reason) rather than
   the `{cards: [], unresolved: []}` the ownership helpers send, which exercises none
   of the value-shaped seams. `jsonb` does not preserve key order, so the assertion is
   `toEqual`, never a serialized-string comparison.
8. **Self-seed, self-clean, unique names.** Same as §6.2 rules 9–10: a dedicated owner
   per `describe` where the assertion is about a _list_, timestamp-suffixed titles and
   step names, `deleteOwners` in `afterAll`, and service-role only for setup /
   teardown / read-back — never as an assertion's subject.
9. **Goldens: `.snap` files are committed, and never run `-u` blind.** `.gitignore`
   has no `*.snap` / `__snapshots__` entry deliberately — the recorded value _is_ the
   pin, so it belongs in review. Vitest refuses to write new snapshots when `CI` is
   truthy, so a missing, mismatched **or obsolete** snapshot fails the run rather than
   being silently created; GitHub Actions sets `CI=true`, which makes that guard
   structural. When a golden legitimately changes, diff the new recording against the
   fixture's hand-computed expectation _before_ accepting it — `-u` with an unread
   diff converts the gate back into a mirror of the code.
10. **Pick fixture numbers that are exact binary fractions** (`.25` / `.5` / `.75`).
    `planAddCost` accumulates raw floats and `PlanCost.total` is unrounded, so
    arbitrary prices record a reviewer-hostile `27.250000000000004`. The value is
    deterministic either way; this only decides whether a human can check it.
11. **When two code paths serve the same data, pin the agreement, not just each side.**
    `GET /api/paths/[id]` and `src/pages/paths/[id].astro` run the same mappers and
    ordering independently. `contract-page-agreement.int.test.ts` seeds
    distinctively-named steps and compares each name's `indexOf` in the page's raw
    HTML against the API's `steps[].name` order — a divergent `.order()` clause fails,
    with no markup parsing and no component test (§7 stays intact).

### 6.4 Adding a derive-to-persist correctness test

- **Location**: `tests/integration/derive-persist.int.test.ts`, fixtures in
  `tests/integration/helpers/derive.ts`. Same harness as §6.2 — the claim is about the
  `jsonb` column and the route, so a mock of either proves nothing. The `.int.` infix is
  what makes it ride the already-required `integration` job (see §5).
- **Naming**: `<seam>-persist.int.test.ts`.
- **Reference tests**: `derive-persist.int.test.ts` (the whole seam),
  `src/lib/path/verify.test.ts` (the pure rule set the route enforces),
  `src/lib/path/add-flow.golden.test.ts` (the independent full-paste oracle at the unit
  layer).
- **Prerequisite / run locally**: identical to §6.2 — local Supabase up
  (`npx supabase start`), `.env.test` filled, then `npm run test:integration`.

The recipe, and why each piece is load-bearing:

1. **Check who actually derives before writing a single assertion.** The claim reads
   "the persisted snapshot equals `prior ± delta`", which sounds like a test-only task
   and is not: `deriveSnapshot` runs in the **browser**, and until Phase 3 the route
   stored whatever snapshot arrived. Verifying a client-side promise from the client
   side is circular. Find the party that can be held to the invariant — here, a pure
   server-side `verifyDerived` the route calls — then test the wiring.
2. **Test the wiring, not the derivation.** `derive.test.ts`, `add-flow.golden.test.ts`
   and `verify.test.ts` own the branches, the multiset equality and the rule set. What
   only integration can show is that a derive whose prior came back out of `jsonb` still
   lands as the same holdings, that a chain does not drift, and that each refusal
   refuses. Re-deriving unit coverage here is the duplication §1 principle 1 forbids.
3. **Never build an expectation by calling the function under test.** A tautological
   oracle is the named anti-pattern for this risk. `deriveSnapshot` may appear exactly
   once — building the request payload the way `handleAddStep` does — and no persisted
   value may ever be compared against its output.
4. **Publish each delta next to two independent statements of its result**, in the
   fixture module rather than in the test: a hand-written holdings record, and the
   equivalent full-paste deck-list text. Keeping them adjacent is what stops a delta and
   its expectation from drifting; taking the second one through `resolveDeck` →
   `attachQuantities` is what makes it a genuine cross-check rather than a restatement.
5. **Compare holdings, never `cards` arrays.** Fold both sides to copies-per-card
   (`helpers/derive.ts#holdingsOf`) and `toEqual` the records. `jsonb` does not preserve
   array order and the two add flows emit their cards in different orders **by design**
   (see §6.6, Phase 2's third note), so an array comparison fails for a reason nobody
   cares about.
6. **Derive from the _persisted_ prior, not from the literal you posted.** Read the base
   back through the GET route and feed _that_ snapshot to the derive. The whole gap this
   suite exists to close is a chain that re-round-trips the same card objects at every
   step; posting a literal and deriving from the same literal never touches the column.
7. **Mock only the card-data edge, and only in the test process.**
   `vi.mock("@/lib/card-data", importOriginal)` with `resolveCards` replaced and
   `resolutionKey` kept **real**, so quantities join on exactly the key production uses.
   There is no cross-process concern precisely because the server never resolves a card
   in a request path — check that that is still true before relying on it.
8. **Build the mock's `ResolutionResult` through the sanctioned builders**
   (`src/lib/card-data/__fixtures__/resolution.ts`), never as an inline literal.
   `matched` is the association the quantity join runs through, and a _wrong_ `matched`
   quietly sends the join down its `?? 1` fallback — making a canonicalization test pass
   for the wrong reason.
9. **A canonicalizing name needs a hand-authored oracle.** The card-data source answers
   `Jace the Mind Sculptor` with `Jace, the Mind Sculptor`, a different `resolutionKey`.
   Before the join fix **both** add flows fell back to one copy there, so full-paste
   equivalence shares the defect and cannot see the class. Write the expected count out
   by hand.
10. **Assert the rejection _and_ the non-persistence.** A 400 alone would still pass if
    the route answered 400 and wrote the row anyway. Every refusal case checks the status
    through `assertStatus`, the exact body through `expectApiError`, and `countSteps`
    unchanged via the service-role read-back (§6.2 rule 8, same reasoning).
11. **Break narrowly, one rule at a time, and drive the cases from a `Record` over the
    reason set.** The verifier is layered and reports its **outermost** violated rule
    (§6.6, Phase 2's third closing note), so a submission that breaks two rules names the
    earlier one and the expected message is wrong. A `Record<DerivedViolation, …>` makes
    `tsc` demand a case for every new rule, mirroring the route's own message map.
12. **Expected messages are literal strings, transcribed from the decided contract.**
    There is no second implementation of "which rule broke", so the message cannot be
    cross-checked the way holdings can — and reading it back out of the response would
    assert nothing. Same reasoning as §6.3 rule 3's literal key arrays.
13. **A second derived column gets asserted, not enforced.** `list_text` is rendered
    from the derived cards and never re-parsed on read, so a disagreement with `snapshot`
    misleads a human rather than corrupting a plan. Parse it back and compare holdings in
    the suite; do not make it a 400.
14. **Prove the red is load-bearing with a break that reproduces a real seam.** Reverting
    the quantity join to its pre-fix form — one token, lint- and typecheck-clean — reddens
    the unit canonicalization case and the integration one together. Run it as a PR, not
    locally (§6.6, Phase 1's closing note), and keep the earlier gates green by hand or
    you measure the wrong one.

### 6.5 Adding a test for a new API endpoint

- **Test type**: integration (§6.2) plus a contract pin (§6.3). There is no new
  recipe here — this sub-section is the order to run the existing ones in, plus the
  two traps that belong to standing up a _new_ route rather than testing an
  existing one.
- **Location / naming / harness**: identical to §6.2 and §6.3 —
  `tests/integration/<risk>.int.test.ts` and
  `tests/integration/contract-<surface>.int.test.ts`. The `.int.` infix is what makes
  both ride the already-required `integration` job (see §5).
- **Prerequisite / run locally**: identical to §6.2 — local Supabase up
  (`npx supabase start`), `.env.test` filled, then `npm run test:integration`.

The sequence, and which recipe owns each step:

1. **Extend the decided-contract table before writing an assertion** — §6.3 rule 1.
   A new route has no archived design doc behind most of its rows, so most will be
   `decided`; record the reason for each. Skip this and the contract test pins the
   handler's current output instead of a decision.
2. **Declare the wire shape in `src/lib/api/contract.ts`, with the explicit type
   argument at every call site** — §6.3 rule 6. This is the half `tsc` gates, and it
   is free at the keyboard.
3. **If the route reads or writes a new table, assert the `grant` in the migration
   that creates it.** Privileges are checked _before_ RLS, so a table with correct
   policies and no grant answers `permission denied` to a valid JWT — and long-lived
   local volumes carry the `public`-schema defaults that hide it, so no local run can
   see the gap. This is the one trap a green local suite is structurally unable to
   catch; only a fresh stack is an honest verifier (§6.6, Phase 1).
4. **Write the ownership-scoped integration test** — §6.2. Cross-owner denial is 404
   or a filtered 200, never 403 (rule 7), and every mutating route needs the
   service-role read-back proving the row was not written (rule 8).
5. **Send `Origin` on every mutating request** — §6.3 rule 5. `security.checkOrigin`
   answers 403 plain text before the handler runs, including on the bodyless
   `DELETE`s, so a hand-rolled `fetch` that omits it pins a CSRF rejection and looks
   like a passing route test. The existing helpers already set it; a new one must too.
6. **Pin the response with closed key sets and hand-written literal key arrays** —
   §6.3 rule 3 — and round-trip anything the route persists through its own GET
   (rule 7), since the seam is the column, not the handler.
7. **Mock only the external HTTP edge (Scryfall), through the sanctioned builders** —
   §6.4 rules 7–8. Never mock an internal module or the RLS query path: a mock cannot
   reproduce the bypass the suite exists to catch.
8. **Self-seed, self-clean, unique timestamp-suffixed names** — §6.2 rule 9. The
   suite must pass twice in a row.
9. **Prove the red is load-bearing with a PR, not a local revert** — §6.6, Phase 1's
   closing note. A local revert shows the assertion fires; only the PR shows the gate
   blocks.

When the endpoint's failure mode is observable nowhere but the rendered page — a
notice that exists only once it is on screen — this is the wrong layer. That is §3
Phase 4's scope, and §7 holds the boundary.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

**Phase 1 (2026-08-11).** Three things cost real time and are worth knowing
before Phase 2:

- Injecting `SUPABASE_*` into the spawned `astro dev` env is **not enough** —
  the Cloudflare adapter parses `.dev.vars` and assigns the parsed values over
  `process.env`, which silently wins. The harness has to override that file
  (and restore it) or the suite quietly runs against the cloud project. (This
  note originally named the wrong mechanism for that precedence; corrected
  2026-09-02 — see §6.2 rule 4 and §8.)
- Cross-owner denial surfaces as **404 / filtered 200, never 403**, so a
  status-only assertion is nearly worthless on mutating routes. The
  service-role read-back is what actually proves nothing leaked.
- Killing the dev server needs a **process-tree** kill (`taskkill /t` on
  Windows, negative-pid `SIGTERM` elsewhere); `child.kill()` alone orphaned
  the server and the next run collided on the port.

**The phase paid for itself on its first CI run.** Against a freshly created
stack, every authenticated query returned 500 —
`permission denied for table upgrade_paths` — while the 401 gate tests passed.
The first migration had created both tables and their RLS policies but never
granted table-level privileges, leaning on the `public` schema defaults a stack
bootstraps. **Privileges are checked before RLS**, so a valid JWT died before any
policy was consulted, and the policies (which are correct) were never the
problem. Long-lived local volumes and the existing cloud project carry those
defaults, so no local run could see it; any newly provisioned environment would
have had a dead `/api/paths/*`. Two durable rules follow:

- **Migrations must grant explicitly.** Never rely on implicit default
  privileges — assert the grant in the migration that creates the table.
- **A green local suite is not evidence for anything bootstrap- or
  privilege-shaped.** The local DB carries state a fresh one does not; CI on a
  fresh stack is the only honest verifier. This is also why the integration job
  boots its own stack rather than reusing a warm one.

And a harness rule the same failure taught: **never assert a bare status code.**
`expect(res.status).toBe(200)` discarded the `{"error": …}` body that named the
cause, turning a one-line diagnosis into a blind CI round. Route status checks
through `helpers/http.ts#assertStatus`, which puts the body in the message.

**Closing the phase surfaced one more rule: a suite that goes red is not a gate.**
The deliberate-regression PR proved the suite catches a cross-owner leak — and
proved that nothing stopped the merge, because `main` was unprotected. A workflow
file can only _report_; only a required status check _blocks_. So the last step of
wiring any gate is enabling it on the branch and watching a real PR report
`BLOCKED` — see §5. Corollary for the deliberate-break check itself: run it as a
PR, not locally. A local revert proves the assertion fires; only the PR proves the
red is load-bearing.

**Phase 2 (2026-08-18).** Four notes worth carrying into Phase 3 — three lessons this
phase learned the hard way, one correction it had to make to an earlier promise, and one
thing that went right cheaply enough to copy.

- **Nothing typechecked in CI, so "types as a contract gate" was a no-op.** The plan's
  load-bearing decision was to convert the top contract-drift seams into `tsc` errors
  rather than assertions — a declared `src/lib/api/contract.ts` plus an _explicitly_
  parameterized `jsonResponse<T>` / `requestJson<T>`. Both halves were written before
  anyone checked what actually ran the compiler: `eslint` is type-aware but does not
  report assignability errors, and `astro build` does not typecheck at all. The whole
  type layer was decorative until `npm run typecheck` (`astro check`) was wired into
  the `ci` job. Generalization: **"the types will catch it" is a claim about a CI step,
  not about the types.** Check which command enforces an invariant before counting it
  as a gate — the same mistake as Phase 1's "a workflow file can only report."
- **Redacting a 500 body silently destroys Phase 1's diagnosis rule.** The raw
  `PostgrestError.message` leaked table, column and constraint names, so it had to
  stop reaching the wire — but that message was exactly what made `assertStatus`
  useful (Phase 1's whole lesson came from reading
  `permission denied for table upgrade_paths` out of a CI log). `global-setup.ts`
  accumulated the spawned dev server's output into a local string and printed it
  **only** when boot failed, discarding it afterwards, so moving the detail
  server-side would have sent it nowhere. The fix is two changes that must land
  together: `serverError` logs the cause against a fresh `ref` and returns
  `{error: "Internal error", ref}`, and the harness pipes the child's stdout/stderr
  to the parent's stderr. Generalization: **when you redact a diagnostic channel,
  the replacement channel ships in the same commit**, and something has to correlate
  the two ends — here, the `ref`.
- **A doc promise was stronger than the code, and only the live copy was fixable.**
  The archived diff-style-checkpoint-entry plan called a derived snapshot
  "byte-equivalent" to a full-paste one. It is not: `deriveSnapshot` emits `working`
  Map insertion order while full paste emits the resolver's order, so the guarantee is
  **multiset** equality. Nothing verified it in either direction. The goldens now pin
  the real guarantee (and re-run the comparison with the mock's `resolved` array
  permuted, so the equality cannot be an artifact of fixture order), and the live
  docstring at `src/lib/path/derive.ts` was corrected. The two archived copies are
  immutable per CLAUDE.md and **stand superseded** — cite this note, not them.
  Generalization: when a claim spans archive and code, correct the code's copy and
  record the supersession somewhere live; do not weaken a test to match a stale doc.
- **Two gates, no new jobs.** Naming the contract suites `contract-*.int.test.ts` and
  the goldens `*.golden.test.ts` put them inside the already-required `integration`
  and `ci` jobs, so §5 gained two required rows with zero branch-protection work.
  Worth copying in Phase 3: pick the filename that lands the suite in a required job
  before inventing a job.

**Phase 2, the closing gate check (2026-08-19).** The deliberate-break PR (#5, closed unmerged) reproduced
research's #1 seam — `POST /api/paths/[id]/steps` returning the raw DB row instead of the
mapped `PathStep` — and ran it twice, once against each gate layer. The observed order:

| Run                                       | `ci`                                          | `integration`                          |
| ----------------------------------------- | --------------------------------------------- | -------------------------------------- |
| 1 — explicit `jsonResponse<PathStep>`     | **fail 1m07s** — `ts(2345)` at `steps.ts:80`  | fail 3m44s — `contract-steps`, 7 of 17 |
| 2 — bare `jsonResponse`, type arg dropped | pass 1m17s — **0 errors, the break compiles** | **fail 3m24s** — same 7, same message  |

Four things worth carrying:

- **The declared contract is the cheaper gate by ~2.5 minutes, and it is genuinely
  independent of the suite.** Run 1 caught the break at 1m07s without booting a database;
  run 2 proved the suite still blocks alone once the compiler is bypassed. Neither layer is
  redundant: dropping the explicit type argument is a one-token edit that silently disarms
  the first, which is exactly why `jsonResponse<T>`'s docstring insists the argument is
  written, not inferred.
- **A deliberate break has to be lint-clean, or it proves the wrong gate.** Swapping the
  mapper out orphaned the `toPathStep` import, and `@typescript-eslint/no-unused-vars` is an
  error — `ci` runs `lint` _before_ `typecheck`, so the job would have died at the lint step
  and the typecheck observation would never have happened. Generalization: when staging a
  break to test gate N, keep gates 1..N-1 green by hand, or you measure the wrong one.
- **The closed key set fired; the `deltaText` rule never did.** The plan predicted failure
  "on both the closed key set and the `deltaText` rule". All seven failures — including the
  four `deltaText`-named cases — carried the key-set message
  (`missing [pathId, listText, deltaText, createdAt, updatedAt], extra [path_id, …]`),
  because `expectExactKeys` throws before `expectPathStep` reaches its `deltaText` branch.
  The seam is caught, but by the outer guard. Generalization: **a layered asserter reports
  its outermost violated rule, not every violated rule.** A rule you want named in the log
  must either fail first, or be reached by a break narrow enough to leave the outer guards
  satisfied.
- **`BLOCKED` only means something read next to `mergeable`.** Both runs reported
  `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE` — refused by the required checks
  with `enforce_admins` on, not by a merge conflict. `BLOCKED` alone does not distinguish
  the two, and only one of them is evidence about the gate.

Attribution was exact: one failing file of nine, seven failing tests of seventeen, and the
message names the missing and extra key sets in full — diagnosable from the CI log without
reproducing locally. One process note: the plan's Phase 5 success criteria assumed `main` already
carried the plan's Phase 4 commit, but phases 1–4 were still open in draft PR #4 when the phase
started; the change was merged first (`c3fc395`) so the break could fork from a `main` that
actually contains the contract suite.

**Phase 3 (2026-08-20).** The phase's own framing was the first thing that had to change,
and the rest follows from it.

- **"Prove the persisted snapshot equals `prior ± delta`" was not a test task, because
  the server never derived.** `deriveSnapshot` runs in the browser; the route validated
  the snapshot's _shape_ and stored whatever arrived, so any structurally valid snapshot
  was accepted alongside any `deltaText`. Written as planned, the suite would have
  asserted a client-side promise from the client side — a test that passes by
  construction. The phase became production-first: a pure, resolution-free
  `verifyDerived` plus one owner-scoped read of the prior step, and only then a suite over
  the seam. Generalization: **before testing an invariant, find the party that can be held
  to it.** If the only enforcer is the caller, the test is circular and the missing piece
  is production code, not coverage.
- **The verifier is deliberately asymmetric, and saying so beat papering over it.** Keys
  the prior list already holds are fully checkable (`prior + adds − removes`, and an
  unnamed card must come back byte-identical). A genuinely new `+` line is not: the source
  canonicalizes names past `resolutionKey`'s reach, so the server cannot know which key a
  new line resolves into without resolving it — the one thing a request path must not do.
  New keys are therefore bounded by **count** only, and the docstring says which
  corruption remains merely count-bounded. Generalization: a gate that overstates its own
  coverage is worse than a narrower one that names its edge.
- **Research found a live silent-corruption bug, and Phase 2's oracle was structurally
  blind to it.** Both add flows looked a typed copy count up by the _canonical_ key, so
  `+3 Jace the Mind Sculptor` → `Jace, the Mind Sculptor` missed and fell through a
  documented `?? 1` to one copy — no warning, no `unresolved` entry. Full-paste
  equivalence could not see it because **both flows shared the defect**, and the golden's
  mock returned cards whose names matched the typed names exactly. Generalization: an
  equivalence oracle only catches divergence, never a defect the two sides share — and a
  mock that never exercises canonicalization guarantees they share it. Any case that turns
  on identity normalization needs a hand-authored expectation.
- **The resolver had to degrade rather than guess.** Fixing the join needed a query-key →
  card association, but pairing a returned card back to the identifier that fetched it is
  only positional once direct key matches are exhausted. Positional pairing of two or more
  residuals would rest on a response-ordering guarantee this codebase has never depended
  on, and a _mis_-assigned quantity is worse than the missing one being fixed. So
  `pairBatch` pairs directly, then pairs a **sole** residual, and otherwise records
  nothing and lets the old `?? 1` stand. Generalization: when an association is
  ambiguous, absent beats guessed — degrade to the pre-existing behavior, and make the
  degrade path a test case (`unattributed`).
- **One gate, no jobs, no workflow change** — the `.int.` infix again (see §5). Worth
  noting that Phase 2's advice held on the third try, which is when it stops being luck.

**Phase 3, the closing gate check (2026-08-20).** The deliberate-break PR (#11, closed
unmerged) reverted the quantity join to its pre-fix form — one token in
`quantifyResolved`, keying `viaMatched` by the caller's input key instead of the resolved
card's canonical key, so a canonicalized name falls back to one copy exactly as it did
before Phase 1. Forked from a `main` already carrying the suite, because the change PR
(#10) was merged first.

| Job           | Result         | Attribution                                                                                                   |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `ci`          | **fail 1m15s** | 3 files / 4 tests, every one a canonicalization case: `plan.test.ts`, `quantity.test.ts` ×2, `derive.test.ts` |
| `integration` | **fail 3m35s** | 1 file of 10, 1 test of 73 — `derive-persist.int.test.ts` > "persists three copies of a +3 line…"             |

Four things worth carrying:

- **This break could not be narrowed to one layer, and that is the honest result.** Phase
  2 ran its break twice to show each gate blocking alone; here the join is a _single
  shared function_ both add flows call, so the unit cases and the integration case fail
  together by construction. Neither is redundant — the unit cases pin the join's output,
  the integration case pins that the join's output is what reaches the column — but no
  edit disarms one without the other. Do not manufacture an artificial break to produce a
  tidier table.
- **A break must land _downstream_ of the mock seam or it measures nothing.** The obvious
  candidate was `pairBatch`'s sole-residual pairing, which is where the association is
  actually computed. It would have reddened `resolve.test.ts` **only**: the integration
  suite mocks `resolveCards` and builds `matched` itself through the fixture builders, so
  `pairBatch` never executes there. Generalization: when a suite mocks an edge, a
  deliberate break upstream of that mock is invisible to it — pick the break by which
  layer can observe it, not by which code reads as the root cause.
- **Attribution was exact with no local reproduction.** The failure diff read
  `- "Jace, the Mind Sculptor": 3` / `+ "Jace, the Mind Sculptor": 1` — the bug in one
  line. That legibility is a direct payoff of comparing **holdings as a record** rather
  than `cards` arrays (§6.4 rule 5): the array form would have printed two long
  arrays and left the reader to spot the differing entry.
- **`BLOCKED` next to `MERGEABLE` again.** `mergeStateStatus: BLOCKED` with
  `mergeable: MERGEABLE` — refused by the required checks with `enforce_admins` on, not by
  a conflict. Same reading rule as Phase 2's fourth note.

**Written at the close of Phase 3, and superseded:** _"The rollout is complete. §3 Phases
1–3 are all `complete`, which is the condition §7 names for re-evaluating the E2E and
component-render exclusions. That re-evaluation is a decision to take deliberately (via
`/10x-test-plan --refresh`), not a fourth phase that follows automatically."_ That is
exactly what happened — the 2026-08-25 refresh took the decision and opened Phase 4. The
sentence is kept rather than deleted because it records the condition correctly; read it
as of 2026-08-20, not as a standing claim about the rollout.

**Phase 4, the closing gate check (2026-08-31).** The deliberate-break PR (#15, closed
unmerged) broke the comparer's two seams **separately** on one branch, one commit per run,
forked from a `main` that already carried the suite and the required check.

| Run                                                                     | `ci`       | `integration` | `e2e`          | Attribution                                                                                              |
| ----------------------------------------------------------------------- | ---------- | ------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| 1 (`cdb9c66`) — token comparison deleted from `runPlan`                 | pass 1m13s | pass 3m33s    | **fail 1m6s**  | `comparer-stale-response.spec.ts`, 1 test of 4 — `expect(planAEverRendered).toBe(false)` received `true` |
| 2 (`22fefbf`) — guard restored, `view.status === "error"` block removed | pass 1m15s | pass 4m13s    | **fail 1m28s** | `comparer-failure-surfacing.spec.ts`, 1 test of its 2 — `getByRole('main').getByRole('alert')` not found |

Five things worth carrying:

- **Delete the guard; do not invert it.** The plan offered "invert or delete" the token
  comparison at `DeckComparer.tsx:73`. Inverting it (`token === requestToken.current` →
  `return`) drops the **newest** run as well, so no plan ever renders and all four tests go
  red — a break that reddens the whole suite says nothing about which spec owns which seam.
  Deleting the comparison leaves the happy path intact and reddens exactly one spec.
  Generalization: **a break staged to test attribution has to be the narrowest edit that
  reproduces the risk**, not the edit that most visibly damages the code. The same edit also
  had to stay lint-clean — dropping the comparison orphaned the `token` binding, so the
  increment survives as a bare `requestToken.current++`. That is Phase 2's
  keep-gates-1..N-1-green rule applying for the third time, and the second run hit it again:
  removing the banner orphaned `RotateCw` and `Button`, both of which had no other reader.
- **Two runs was the honest shape here, and Phase 3's note is not contradicted.** Phase 3
  recorded that its break could not be narrowed to one layer and warned against manufacturing
  a tidier table. Here the split is real — the request token and the error-banner render share
  no function, so each spec goes red alone with the other green. The rule the two notes agree
  on is **let the code decide how many runs there are**; neither "always run twice" nor "never".
- **`retries: 0` is real, and the job duration is the only place it shows.** Run 1's failure
  did not retry (`comparer-stale-response.spec.ts` sets
  `test.describe.configure({ retries: 0 })`); run 2's did, because `playwright.config.ts:28`
  sets `retries: process.env.CI ? 1 : 0` and the failure-surfacing spec does not override it.
  The retry printed the identical failure twice and accounts for most of the 22 s difference
  between the two jobs. Nothing in the check summary names the retried spec — the only evidence
  the override took effect is a `(retry #1)` line in the run's test list. Read it before
  trusting a green ordering spec.
- **The `e2e` log carries a pre-existing SSR error that is never the failure.** Every run of
  the job — including the all-green one on the change PR (#13, four occurrences) — logs
  `[WebServer] Invalid hook call` followed by
  `TypeError: Cannot read properties of null (reading 'useState')` naming
  `DeckComparer.tsx`, during Vite's cold-start dependency re-optimization and its
  `[vite] program reload`. It is SSR-only noise on the first request; all four tests pass
  through it. Recorded because it sits immediately above the test results and points at
  exactly the file a deliberate break edits, so a future reader debugging a red `e2e` will
  otherwise chase it first.
- **`BLOCKED` next to `MERGEABLE`, third time.** Both runs returned
  `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE` — refused by the required checks
  with `enforce_admins: true`, not by a conflict. Same reading rule as Phase 2's and Phase 3's
  fourth note. §5's `e2e on critical flows` row is now backed by an observation and not by the
  branch-protection PATCH alone.

Attribution was diagnosable from the CI log with no local reproduction: run 1 printed the
failing expectation with its code frame (`Expected: false` / `Received: true` at
`comparer-stale-response.spec.ts:100`), run 2 printed the locator and
`element(s) not found`. Both breaks were nonetheless run locally first — not as a substitute
for the PR (§6.6, Phase 1: only the PR proves the red blocks) but to avoid spending a CI
round discovering that a break was mis-shaped, which is exactly what the invert-vs-delete
choice above would have cost.

### 6.7 Adding a browser E2E test

- **Test type**: Playwright against a real browser. Reach for it **only** when the claim is
  about something that exists once rendered and nowhere else — §1 principle 1 still rules,
  and §7 scopes browser E2E to two phases — the comparer's failure surfacing (§3 Phase 4)
  and the path builder's stale-response ordering (§3 Phase 5) — not to any flow an
  integration or contract test already covers.
- **Location**: `tests/e2e/<risk>.spec.ts`, fixtures in `tests/e2e/fixtures/`. `testDir` is
  pinned to `./tests/e2e` in `playwright.config.ts` — that pin is what stops Playwright's
  default `testMatch` from sweeping the 33 vitest files under `src/` and
  `tests/integration/`.
- **Naming**: `<surface>-<risk>.spec.ts` (`comparer-…`, `path-builder-…`). No `.int.` infix
  here — unlike every other suite in this project these do **not** ride an existing job; §5's
  `e2e` row is a separate CI job and a separate required check.
- **Reference tests**: `seed.spec.ts` (the exemplar — read it first; what you show is what you
  get), `comparer-failure-surfacing.spec.ts` (risk #7, interception + recovery),
  `comparer-stale-response.spec.ts` (risk #8, genuine concurrency),
  `path-builder-stale-ordering.spec.ts` (risk #9, the same concurrency shape **behind auth**;
  it held the suite's only `test.fail()` specs until they were repaired on 2026-09-07 — the
  suite now carries none), `path-builder-mutation-ordering.spec.ts` (risk #10, two overlapping
  **mutations** against the app's own API, and the reference for `parkAppApi` and for a spec
  written green inside the change that repairs its defect).
- **Prerequisite / run locally**: **local Supabase must be running** (`npx supabase start`) and
  `.env.test` must carry `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`; `tests/e2e/global-setup.ts`
  fails fast with those instructions if not. Playwright's `webServer` boots `astro dev` on port
  4323 itself. `npm run test:e2e`. _This bullet read "nothing — no Supabase, no `.env.test`, no
  auth" until 2026-09-06._ That was true of Phase 4, whose surface mounts at `/`; it was never
  true of anything behind `src/middleware.ts`, and Phase 5 had to build the harness. See the
  authenticated-spec subsection below.

The recipe, and why each piece is load-bearing:

1. **Make the surface addressable in production code, not in the test.** Both surfaces risk #7
   covers were unnamed `<div>`s carrying a **byte-identical** class string, so a locator for
   one matched the other. The fix was two one-line production edits — `role="alert"` on the
   error banner (`DeckComparer.tsx:220`) and `role="region"` plus `aria-label="Unresolved
cards"` on the notice (`UnresolvedNotice.tsx:66-67`) — both of which improve the app. This
   repo has **zero** `data-testid` and that is deliberate: the accessibility tree is the test
   surface, so a surface that is hard to locate is usually telling you something. Never reach
   for a CSS selector, an XPath, or DOM structure instead.
2. **Cross the hydration barrier before the first `fill()`, and do it in a helper.**
   `index.astro` mounts the comparer `client:load`. SSR renders both textareas, so `fill()`
   succeeds immediately — but it writes the DOM value without React state, React then hydrates
   with its own empty state, `bothFilled` stays false, and the CTA never enables. **Waiting for
   the CTA to enable does not rescue this**: the fill is already orphaned, and the failure
   surfaces as a timeout blaming the button. _The plan for this phase originally prescribed
   exactly that check; Phase 1 disproved it._ The one trustworthy signal is Astro's island —
   `astro-island` removes its `ssr` attribute only after `await this.hydrator(...)` resolves —
   so `expect(page.locator("astro-island[ssr]")).toHaveCount(0)` means React has committed.
   This is the sole framework-internal selector in the suite, it lives in `gotoComparer()`, and
   it is a **wait**, never an assertion target.
3. **Scope every locator to the `main` landmark.** `gotoComparer()` returns
   `page.getByRole("main")`; chain off it. A contributor's gitignored `.dev.vars` sets the
   Supabase keys locally while CI has none, and `Layout.astro:28-43` renders a config-error
   banner above the `<slot/>` when they are unset — so an unscoped spec sees two different
   DOMs. Do **not** "fix" this by giving CI dummy keys: a non-falsy key makes `supabase.ts:7-9`
   return a real client, and `middleware.ts:12-15` then runs `auth.getUser()` on every
   anonymous request to `/`. See `lessons.md`.
4. **Never `waitForTimeout`, and never `networkidle` either.** The second is not a style
   preference here, it is structural: `Layout.astro:19-24` preconnects and stylesheet-links
   `fonts.googleapis.com` on every page and Vite's HMR websocket stays open, so the network
   never settles. Wait on state — `toBeVisible()`, `waitForURL()`, `waitForRequest()`,
   `waitForResponse()`.
5. **Intercept all card-data traffic, and register a blocking fallback first.** Every helper in
   `fixtures/scryfall.ts` calls `blockUnmockedScryfall()` before its specific handler.
   Playwright matches route handlers **most-recently-registered first**, so the specific handler
   still wins for the URLs it covers and everything else aborts loudly instead of quietly
   reaching the real API. That is what makes "no external network" an enforced property rather
   than an assumption. Note that `cards.scryfall.io` is a **different host** from
   `api.scryfall.com`: mock cards omit `image_uris` to kill that traffic at the source, and the
   fallback glob covers both.
6. **Build mock cards only through `mockCard()`.** `normalize.ts:33,37-38` reads `raw.name` and
   `raw.prices.usd` / `.eur` **unguarded**, so a card literal missing `prices` throws a
   `TypeError` — and that `TypeError` lands in the _same_ catch as a real transport failure
   (`plan.ts:106-109`), producing a passing-looking error banner for entirely the wrong reason.
   `type_line` is the one field that _is_ guarded (`:29`, falling back to `""`), which is worse
   in its own way: omit it and the card silently classifies as uncategorized instead of failing.
   Either way the fixture, not the app, is what the test ends up measuring.
7. **Therefore assert the message, not just the banner.** Because a broken fixture and a real
   failure render the same container, matching on `/cards\/collection failed: 500/` is what
   separates them. Leave `statusText` unasserted — `route.fulfill()` does not reliably populate
   it.
8. **Induce a transport failure with `fulfill({status: 500})`, never `route.abort()`.** The 500
   trips the explicit `!response.ok` guard in `scryfall.ts:96-98` and yields a deterministic
   message naming the endpoint and status; an abort rejects the raw `fetch` with a
   browser-dependent `"Failed to fetch"` you cannot assert on.
9. **The session cache has no test seam — plan around it.** `resolve.ts:15` is a module-level
   `Map` and `clearSessionCache()` is not exported from the barrel, so the only reset is a fresh
   page load. Two consequences, both of which have already bitten: fail the **first**
   `/cards/collection` POST (nothing is cached yet, so Retry re-requests the full set), and give
   any two decks in one spec **disjoint card names** — including a single run's own base and
   target halves, or the target resolution is served from cache, the second POST never fires,
   and the test loses the request it was anchored on.
10. **Drive concurrency through the Calculate CTA, never by typing.** The 700 ms debounce's
    effect cleanup cancels the pending timer on every keystroke, so typing deck A then deck B
    starts **one** run. `compare()` in `fixtures/app.ts` goes through the CTA, which bypasses the
    debounce. (Its accessible name needs a regex — a diamond glyph, an arrow and two `&nbsp;`
    sit inside the button text and are not `aria-hidden`, so an exact-name match fails.) See
    `lessons.md`.
11. **Park selectively, and let the superseded run finish.** `mockScryfallWithParkedCollection`
    holds _one_ matching request and resolves everything else, because `plan.ts:95-96` awaits
    base **then** target: releasing run A's base immediately issues a second POST for A's target,
    and the stale-response guard is only reached once `generateUpgradePlan` **returns**. A
    handler that parked everything would leave that promise unsettled, and the spec would pass
    having never exercised the guard — risk #8's own anti-pattern in a different costume. Await
    `parked.arrived` before starting the second run (otherwise the overlap is asserted, not
    established), and `waitForResponse` on the _target_ request before asserting the drop.
12. **`retries: 0` on any ordering-sensitive spec.** The config retries once in CI to absorb
    ordinary infrastructure flake; `comparer-stale-response.spec.ts` overrides it with
    `test.describe.configure({ retries: 0 })`. A genuine out-of-order bug must never retry its
    way to green when a single test is the only thing covering it.
13. **A negative assertion needs an observation window, not a sample.** "Plan A never rendered"
    cannot be shown by a `toBeHidden()` after the response arrives: that samples a single instant
    and, verified with the guard disabled, stayed **green while plan A rendered a frame later**.
    Start a `waitFor({ state: "visible" })` race that resolves to a boolean _before_ releasing
    the superseded run, and assert the resolved value. Any "X never happens" claim in a browser
    needs the same shape.
14. **Pick the sharpest observable, and check it is reachable by role.** For risk #8 that is the
    collapsed input strip, which counts the **live textarea state** and never the plan — so a
    guard failure renders the exact contradiction the risk names: the strip reports deck B's
    counts above columns showing deck A's cards. Conversely, merged view is **not** assertable:
    `MergedRow.tsx` signals add-vs-remove with an `aria-hidden` glyph plus a CSS colour, so the
    two kinds are identical to accessibility queries (`findings.md` F-3). Assert the columns view.
15. **A phase like this is coverage, not repair.** Both specs pass green on the code as it
    stands. Three live defects surfaced along the way and were filed to
    `context/archive/2026-08-27-testing-comparer-failure-surfacing/findings.md`
    rather than fixed — a spec for any of them would be red today, which would make it a
    different phase. Write the finding down; do not smuggle the fix in.

#### Authenticated browser specs — what §3 Phase 5 added

Items 1–15 were written from two specs that need no session. Everything below is what it
additionally costs to reach a surface behind `src/middleware.ts`, learned building
`tests/e2e/path-builder-stale-ordering.spec.ts`. Read it before promising that a browser
phase's whole cost is the test itself.

16. **`.dev.vars` outranks anything Playwright injects — stash it, do not fight it.**
    `@astrojs/cloudflare` parses the file and calls `Object.assign(process.env, parsed)` at
    `dist/index.js:292-303`, _after_ config resolution, so `webServer.env` loses to a
    contributor's gitignored file every time. `tests/e2e/dev-vars.mjs` moves it aside to
    `.dev.vars.e2ebak` and puts it back; the stash is chained into `webServer.command` because
    Playwright starts `webServer` **before** `globalSetup`, which is too late. Restoration is
    idempotent and also hooked to `process.on("exit")`, so a Ctrl-C leaves the file recoverable.
17. **The two suites share that file, so they cannot run at once.** `npm run test:integration`
    rewrites the same `.dev.vars` with a `.dev.vars.intbak` sidecar. Distinct suffixes stop the
    two snapshots corrupting each other; they do not make concurrent runs safe. Locally
    `reuseExistingServer: !process.env.CI` compounds it — a dev server someone else started on
    4323 is reused with whatever env it has, which surfaces as a sign-in redirecting to
    `/auth/signin?error=…` rather than as an env error. `signIn()` says exactly that in its throw.
18. **One sign-in per run, in a `setup` project, never through the UI.** `auth.setup.ts` creates
    an owner with the service-role admin API, signs in by POSTing the app's **own**
    `/api/auth/signin`, and writes `storageState` to `tests/e2e/.auth/owner.json` (gitignored).
    The cookies therefore come out in the exact `@supabase/ssr` chunked format the real
    middleware expects — nothing is hand-built. The chromium project declares
    `dependencies: ["setup"]` and `use.storageState`. Once per run and not per spec because
    `supabase/config.toml:189-190` (`sign_in_sign_ups = 30`) caps sign-ins at 30 per 5 minutes
    per IP and Playwright
    parallelizes by default. The state is good for **one run only**: `config.toml:158` sets
    `jwt_expiry = 3600` and the server client forces `autoRefreshToken: false`, so it must never
    be cached across jobs.
19. **Seed through the app's API, and always send `Origin`.** `seedPathWithStep()` POSTs
    `/api/paths` then `/api/paths/:id/steps`, which exercises RLS instead of bypassing it and
    keeps the seeded row indistinguishable from a real one. Astro's CSRF check answers a
    plain-text **403** to a same-shape POST arriving without a matching `Origin`, before the
    handler runs — pinned in `contract-signin.int.test.ts:67-89`. Titles carry a `Date.now()`
    suffix so parallel workers and re-runs cannot collide. The service-role client is for owner
    create/delete only; `webServer.env` blanks `SUPABASE_SERVICE_ROLE_KEY` explicitly, because
    Playwright **merges** that object over `process.env` rather than replacing it, and the CI
    job exports all three keys into `$GITHUB_ENV`.
20. **A spec that wants its own identity must move the browser too.** The `request` fixture and
    the browser context are separate cookie jars seeded from the same `storageState`. Signing a
    new owner in on `request` moves only the API side; without copying the jar back
    (`request.storageState()` → `context.clearCookies()` → `addCookies`) the page still browses
    as the run owner and `/paths/[id]` answers 404 for a path it does not own.
21. **Teardown is one `deleteUser` — and it must not be the run's shared owner.** Deleting an
    owner cascades to every path and step they seeded (`on delete cascade`), so per-test cleanup
    is a single call. A spec that provisions its own owner deletes that one in `afterEach`; the
    `setup` project's owner belongs to `global-setup.ts`'s teardown, which reads its id from a
    sidecar file because the setup project runs in a worker the teardown cannot see into.
22. **`test.fail()` is how a coverage phase pins a live defect — but it inverts the whole test
    body.** **Historical as of 2026-09-07: the defects this item was written about are repaired
    and the annotations are gone** — `path-builder-stale-ordering.spec.ts` now carries **zero**
    inverted specs and `npm run test:e2e` reports **zero** expected failures, which is the
    number to read there now. See item 29 for the sequence that retired them. The two
    disciplines below are what generalize, so the item stays. Risk #9 **was** a set of live
    defects — F-1 through F-4 in
    `context/archive/2026-09-05-testing-path-builder-ordering/findings.md`, of which that change
    pinned F-1 and F-2 and `testing-path-builder-error-and-mode` pinned F-3 and F-4 — so a
    faithful spec was red, and the file carried **four** inverted specs against four expected
    failures. While that held, a run reporting fewer had had an annotation removed and one
    reporting an unexpected pass had had a guard fixed. Annotating a spec `test.fail()` keeps
    the suite green on current code
    and turns the build red the moment someone fixes the guard, reported as
    `Expected to fail, but passed.` Two disciplines come with it. **(a) Put setup in
    `beforeEach`, not in the body** — the annotation is registered by the body, so a hook failure
    stays a real failure, while a broken sign-in _inside_ the body would report as an "expected
    failure" and the file would go green covering nothing. Verified by deliberate break.
    **(b) Confirm _why_ it failed** before believing it: run once with the annotation commented
    out and read the error. A `test.fail()` spec that fails on a typo'd locator looks identical
    in the report to one that fails on the defect.
23. **Retries: leave them at the config default on an inverted spec.** Item 12's `retries: 0` is
    right when the failure is the signal — a retry could turn a genuine bug green. Here the
    failure is the _expected_ state, so a retry cannot hide a defect; it only absorbs a timing
    flake that would otherwise report a spurious unexpected pass. Same principle, opposite
    setting. **The inversion is temporary by construction**: the moment the annotations come
    off, this item stops applying and item 12 resumes — see item 29, which is the sequence that
    did exactly that to risk #9's four pins on 2026-09-07.
24. **CI copies the `integration` job verbatim.** The `e2e` job gained `npx supabase start`, the
    `supabase status -o env` export into `$GITHUB_ENV`, and `supabase stop` with `if: always()`
    — keys from the running stack, never from Actions secrets. Costs ~90s. No new job name, so
    no branch-protection change.

Items 25–27 were added 2026-09-06 by `testing-path-builder-error-and-mode`, which put two more
inverted specs (S3, S4) into the same file. Each is a fact the phase paid for and the next one
should not.

25. **A parked route needs a failing release too, and it is a 500, not an abort.**
    `mockScryfallWithParkedCollection` originally had only `release()`, which fulfills with a
    successful collection response — so a spec whose mechanism is "the held request comes back an
    error" had nothing to call. `ParkedRoute.releaseWithFailure(status = 500)`
    (`tests/e2e/fixtures/scryfall.ts:204`) is the second exit, fulfilling with the same
    `{object: "error", status}` body `mockScryfallCollectionFailsOnce` uses and sharing the
    single-shot `released` flag, so a route is released once by either door. **Never
    `route.abort()`** — item 8's reasoning applies unchanged and is the reason both fixtures do
    it this way: the 500 trips the explicit `!response.ok` guard at
    `src/lib/card-data/scryfall.ts:96-98` and yields a message naming endpoint and status, while
    an abort rejects the raw `fetch` with a browser-dependent `"Failed to fetch"`. When adding
    a release variant, add it to the interface rather than reaching for `route` in the spec: the
    handler owns the single-shot guard, and a spec that fulfills the route itself can double-fire
    it.
26. **Verify the asserted surface actually renders in the state the spec leaves the app in.**
    This is item 13's other half, and it is the one that makes an observation window lie. A
    window watching an element the render tree can never produce resolves false, the negative
    assertion passes, and the spec reports coverage it does not have — under `test.fail()` the
    same mistake fails, indistinguishably from a real pin. Both previews on the path builder are
    mode-gated (`PathEditor.tsx:733`, `:745`), so S4's stale verdict is only observable after a
    **round trip** back to full mode, and both switches have to precede the release — release
    first and the second `switchMode` resets the atom before the user arrives. Concretely:
    before writing the window, read the conditions on the line that renders your target and
    confirm each one holds at the moment you open it. Where the finding you are pinning _named_
    the symptom, re-derive it rather than trusting it — see `lessons.md`, "When a finding names a
    symptom surface, verify the render reaches it before writing the spec", which supersedes two
    such claims in risk #9's own findings list.
27. **Two banners with the same class string: name _both_ twins, not just the one you need.**
    A second instance of item 1, on a different surface. `PathEditor`'s path-level `mutationError`
    banner and its checkpoint-error banner rendered byte-identical class strings with no role and
    no name, so a locator for either matched both. The fix was the accepted Phase 4 shape —
    `role="alert"` plus a distinguishing `aria-label` ("Path error" `:602-608`, "Checkpoint error"
    `:777-783`) — applied to **both**, though only the second was needed. Naming one and relying
    on `role="alert"` being unique is relying on accidental uniqueness: it silently breaks when a
    third error banner lands, and F-3's own recommended fix adds exactly that. Two error banners
    where one is announced and the other is not is also an accessibility defect on its own terms,
    which is what makes this a production edit rather than a test-only concession. Related: assert
    the banner's **name**, not its message, whenever a fix would move the message to a different
    container — S3 does, because F-3's fix relocates the same text to a Check-owned banner and a
    text-matched assertion would keep failing after the repair, so the inversion would never lift.

Items 28–29 were added 2026-09-07 by `shared-stale-response-guard`, the first change on this
surface that **repaired** rather than pinned. Each is a fact that phase paid for and the next
one should not.

28. **Parking the app's OWN API is a different fixture from parking Scryfall, in three ways
    that each cost a run.** `mockScryfallWithParkedCollection` cannot be copied for
    `/api/paths/*`: Scryfall is mocked end to end, so its handler answers everything itself,
    while the app's API is real and the page's navigation, the seed and the second half of
    every overlap all have to reach the dev server. `parkAppApi`
    (`tests/e2e/fixtures/appApi.ts`) is the shape that works, and the differences are
    load-bearing rather than stylistic.
    (a) **The default branch is `route.continue()`**, not a synthetic fulfil, and the predicate
    receives **method plus URL** — these routes are told apart by verb (`PATCH /api/paths/[id]`
    and `DELETE /api/paths/[id]` differ in nothing else).
    (b) **Whether the held request reaches the server decides whether the spec can pin
    anything.** Answering a held mutation with a synthetic body keeps the server out of the
    assertion, which is exactly right for the rename spec: the held `PATCH` is answered with a
    stale `UpgradePath` the server never saw, so the server holds one title and the claim is
    about the client guard alone. It is exactly wrong for the delete spec: the false banner
    only exists once the server has actually lost its last step, so parking without delivering
    leaves the second `DELETE` answering 204 too, no banner ever renders, and the spec passes
    with its guard reverted. Hence the `deliver` option — forward on arrival, hold the server's
    own response — and `releaseFromServer()` as its release door. Decide which one the
    assertion needs **before** writing the window, and say so in the spec header.
    (c) **`arrived` must resolve on the server's ANSWER, not on the request's arrival**, when
    delivering. Signalling on arrival leaves the delivered request racing the spec's next
    action at the server: two `DELETE`s that overlap there both read the same last step and
    both answer 204, so the 404 never happens. This one is not visible by reading — the race
    resolves the harmless way often enough that the spec looks green. It was found by
    reverting the guard and getting the wrong failure.
    Add a release variant to the interface rather than reaching for `route` in the spec, for
    item 25's reason: the handler owns the single-shot guard.
29. **Retiring a `test.fail()` pin is a staged three-run sequence, and the retry setting flips
    at the third step.** Run it in this order and read each result before moving on: with the
    production edit **reverted**, the suite reports N expected failures; with the edit
    **applied and the annotations still in place**, it reports N **unexpected passes** — that
    is the signal the repair works, and it is a failing run; with the annotations **removed**,
    N passes. Any other sequence means a spec is passing for a reason other than the repair.
    The annotations and the repair must land in **one commit** (see §6.6's rollback note): a
    revert that drops one without the other leaves the suite reporting unexpected passes
    against unrepaired code. At the moment the annotations come off, **item 23 stops applying
    and item 12 resumes** — the file gains `test.describe.configure({ retries: 0 })`, because
    the failure has gone back to being the signal rather than the expected state.
    **And a green suite is not the finish line: a repair covering N findings needs a targeted
    break per finding.** One repair can flip a pin belonging to another. Verified here: S2 and
    S3 both edit the deck textarea before clicking Add, so invalidating in the textarea's
    `onChange` flips **all four** risk-#9 pins — S3 included, whose actual subject is atom
    ownership — while F-3's real defect stays reachable through the one overlap S3 does not
    drive. Revert each finding's repair alone, confirm the suite reddens, and confirm it
    reddens on the spec that owns that finding. Where a pin flips for two independent reasons,
    the targeted break needs a path the pinned spec does not drive; write that path into the
    plan's manual verification rather than discovering it at review. The same obligation
    applies to a spec written **green** inside the change that repairs the defect, where
    nothing forces the question — see `lessons.md`, "A repair covering N findings needs a
    targeted break per finding, not one green suite", for the two ways that bit here.
    One of them is worth stating as a locator rule in its own right: **`getByRole`'s `name` is
    a case-insensitive SUBSTRING match by default.** `{ name: "base" }` also matched the "Add
    base deck" section heading — which renders _precisely when_ the checkpoint is gone — so the
    assertion that the step disappeared read as if it had not. Pass `exact: true` whenever a
    short accessible name could be contained in another one on the same surface.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5), re-scoped
2026-08-25 once §3 Phases 1–3 completed and again 2026-09-02 once risk #9
narrowed the path-builder bullet to that surface's render — each bullet carries
its own source. Future contributors should respect these unless the underlying
assumption changes. The first bullet states the boundary the others are read
against.

- **Frontend / component rendering & layout** — the team will polish the UI
  once the logic is set in stone; spending budget on render/interaction tests
  now would churn against an unstable surface. The trigger this bullet named is
  now **half-met**, so state which half: the logic boundary _is_ locked (§3
  Phases 1–3 `complete`), but the UI is _not_ being finalized — the roadmap
  carries no open UI slice, every shipped one reads `done` and S-07 is parked
  (re-read 2026-09-02). The exclusion therefore stands on the unmet condition,
  not on inertia; unpark a UI slice and this bullet is due for re-evaluation in
  the same breath.
  **Where the line falls.** A browser phase is admissible only for a failure
  that exists _nowhere but the rendered result_ and that no cheaper layer can
  see — a notice that only exists once rendered (#7), an ordering that only
  manifests across two real in-flight requests (#8, #9). Rendering itself —
  layout, styling, the markup a component produces from given props — stays
  out, and so does any behavior an integration, contract or unit test can
  reach. Two phases on the browser side is **not** a general licence: §1
  principle 1 still rules, and each of the two names the specific unrenderable
  failure it buys. Apply this test to a new proposal before proposing it.
  (Source: Phase 2 interview Q5 + roadmap slice status re-read 2026-09-02.)
- **Re-testing the pure-logic engine** (`deck/diff`, `deck/plan`,
  `path/derive`, etc.) — already covered by the existing Vitest logic suite
  (§4 carries the dated count); duplicate coverage adds maintenance, not signal. Phase 2 pins the engine's
  _golden output_ once rather than re-deriving its internals. (Source: §1
  principle 1 + interview Q5.)
- **Pixel / snapshot tests of the deck card layout** — brittle against
  Tailwind tweaks, low signal. (Source: Phase 2 interview Q5.)
- **The path-builder and diff-mode UI — its _render_, not its ordering** —
  excluded on coverage, not on churn, and narrowed here from the whole surface
  to the render half. What stays out is the layout and the display of an
  already-verified result: §3 Phase 3 pins the derive→persist seam and Phases
  1–2 pin the routes the builder drives, so a render test would re-assert a
  result a cheaper layer already proved.
  What is **not** excluded is the builder's **client-side ordering** — whether
  a resolve that lands after the deck text changed or was cleared is dropped
  rather than rendered. That is risk **#9**, answered by §3 Phase 5, and it
  fails the cheaper-layer test in the first bullet above: the drop is a silent
  return that never reaches the DOM. This bullet previously read that "what is
  left is the rendering of an already-verified result" for the surface as a
  whole — true of the render, false of the ordering. Phase 4's lessons
  register produced the evidence that separated the two.
  The churn is stated plainly so the reasoning survives a busier month:
  `src/components/path` carries 2 commits/30d and 9/90d — re-verified
  unchanged 2026-09-02, occasional rather than dormant — and the comparer's
  `src/components/deck` now sits at 2 and 19 on the same windows, so the two
  surfaces are no longer separable by churn at all. This is not a dormancy
  argument and does not expire when the directory heats up; that reasoning
  still holds for the render half now that the ordering half has moved out.
  Re-read it instead if a path-builder **render** failure ever surfaces that
  the integration and contract layers could not have caught. (Source: §3
  Phases 1–3 `complete` + directory churn re-derived 2026-09-02 + the archived
  Phase 4 slice's lessons register, which is what narrowed this bullet; see §8
  for the churn-citation convention.)
- **Browser-level E2E is no longer excluded** — it is scoped in, narrowly, at
  two phases and no further. §3 Phase 4: the comparer's failure-surfacing
  (risks #7 and #8), where the notice and the superseded plan exist only once
  rendered. §3 Phase 5: the path builder's stale-response ordering (risk #9),
  where the superseded resolve is dropped by a silent return that never reaches
  the DOM. That is the whole of the inclusion, and §4 carries the runner both
  phases ride (Playwright `^1.62.1`, Chromium only, all Scryfall traffic
  intercepted). It is still not a licence to browser-test a flow an integration
  or contract test already covers — the test for admissibility is the boundary
  stated in the first bullet above, not the existence of these two phases.
  (Source: Phase 2 interview Q4 + Q5, whose sequencing condition — the logic
  boundary locked — §3 Phases 1–3 satisfied; extended to Phase 5 by risk #9.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-07 — **§2 only**, by
  `shared-stale-response-guard` (see the dated entry below): risk #9 moved to the protected
  table, risk #10 appended already protected with its response row, the protected table's
  preamble widened to admit a row protected by a change rather than a `complete` §3 phase,
  the open table emptied with a note on how to read that, and #9's disposition paragraph
  rewritten. **§1**'s header block was re-stamped in the same pass, because its "Last
  updated" note asserted "an open set of one: **risk #9**" — a live claim this change
  falsified. §3, §4, §5 and §7 re-read 2026-09-07 as still current and unchanged. The
  2026-09-02 review is the prior baseline: §1 (the `lessons.md` companion-read
  pointer; the three principles themselves unchanged since 2026-06-29 and re-read as
  still current, with principle 1's rhetorical suite figure dropped), §2 (split into
  protected and open tables, risk #9 and its response row appended, `src/components/deck`
  churn re-stamped, the quantity-degradation deferral closed), §3 (Phase 5 opened, with
  the branch-protection read behind its order rationale) and §4 (all four grounding
  bullets re-stamped, the `unit (logic)` count re-derived); §5 deliberately unchanged
  then and now — see the non-actions entry
- Cookbook (§6) last reviewed: 2026-09-07 — §6.7 gained items **28–29** (parking the app's
  own API, and retiring a `test.fail()` pin as a staged three-run sequence with a targeted
  break per finding), appended by `shared-stale-response-guard`. The same pass corrected three
  live claims the repair falsified: **item 22** said "risk #9 _is_ a set of live defects" and
  that the suite reports **four** expected failures — it now reads as history and states that
  the number to read is **zero**; **item 23** now says outright that its retry inversion is
  temporary and points at item 29; and the subsection's **reference-tests** list no longer
  calls `path-builder-stale-ordering.spec.ts` "the only `test.fail()` specs in the suite" and
  gains `path-builder-mutation-ordering.spec.ts`. Unchanged from the
  2026-09-06 review otherwise, when the same subsection gained
  items 25–27 and had item 22's findings reference corrected (see the dated entries below);
  everything else re-read as still current and unchanged from the 2026-09-02 review, which
  gave the preamble the `lessons.md` pointer and the record of §6's two schema deviations
  (seven sub-sections; §6.6 preceding §6.7). §6.7 filled by rollout Phase 4 (browser E2E);
  §6.4 filled by rollout Phase 3; §6.5 filled 2026-08-25 as a sequencing checklist over
  §6.2–§6.4, so no sub-section is a stub
- Rollout: §3 Phases 1–5 all `complete` — Phases 1–3 by 2026-08-20, Phase 4 on
  2026-08-31, Phase 5 on 2026-09-06 — so the rollout table has no open phase, and has had
  none since. Note that Phase 5 completing did **not** move risk #9 out of §2's open table;
  what moved it, on 2026-09-07, was `shared-stale-response-guard` — a repair change that
  opened no §3 phase. So the rollout table and the risk map are no longer in step, and that
  is deliberate rather than drift: §2's protected column now names whatever carries the
  proof, and #10 entered the map already protected by the same change. See §2's own
  paragraphs for why a completed phase can leave a risk documented rather than protected,
  and why closing one needed no phase at all. Phases 1–3 completing was
  the trigger §7 named for re-evaluating the E2E and component-render exclusions; that
  re-evaluation was taken deliberately on 2026-08-25 and re-taken 2026-09-02: browser
  E2E in at two phases and no further, component render and pixel tests still out
- **Refresh completed 2026-08-25** through `context/archive/2026-08-25-test-plan-refresh-2026-08-25/`
  (`/10x-test-plan --refresh` ran 2026-08-25 and opened it). What it changed: §2 gained
  risk #7 (a partial resolution or a card-data transport failure reaches the user as a
  plan that looks complete) and risk #8 (a slow earlier comparison clobbers a newer one),
  their Risk Response Guidance rows, and a recorded note on the resulting 8-row overflow
  against the schema's 5–7; §3 gained Phase 4 (comparer failure-surfacing, browser E2E,
  `not started`, no change folder); §4's e2e row names Playwright as planned-not-installed
  and all four grounding bullets were re-stamped; §5's e2e gate stopped reading "deferred"
  and now points at §3 Phase 4; §6.5 was filled; §7 scoped browser E2E in and added the
  path-builder / diff-mode UI as an exclusion.
- **Three claims the staged refresh note carried were corrected, not implemented.**
  Recorded here so a future refresh does not re-propose them. (a) An "astro 6→7 drift":
  `package.json` declares `astro ^6.3.1`, resolving to 6.4.8, so §4's "Astro 6" was
  confirmed rather than re-stamped — there was no drift to record. (b)
  "`src/components/deck` 55 commits/90d": the directory carries 18 commits/90d and 1/30d;
  55 was the sum of per-file touch counts inside it, a different measurement from the
  `N commits/30d` every §2 Source cell uses. (c) "Path builder dormant":
  `src/components/path` carries 9 commits/90d and 2/30d — more recent activity than the
  comparer's — so §7 excludes that surface on coverage, not on dormancy. A fourth staged
  proposal, a risk for an upgrade-plan cost total that under-reports, was not promoted;
  §2's not-promoted paragraph records the layers that already cover it.
- **Churn-citation convention** (adopted 2026-08-25, so a future refresh measures the
  same way): a churn figure in §2 or §7 is the count of commits touching a directory —
  `git log --oneline --no-merges --since=<window> -- <dir>` — never a sum of per-file
  touch counts, which counts one commit once per file it changed. Always state the window
  next to the number, and state both the 30d and 90d windows when they tell different
  stories about the same directory.
- **Rollout Phase 4 landed 2026-08-31** through
  `context/archive/2026-08-27-testing-comparer-failure-surfacing/` (archived 2026-08-31).
  What it changed: §2's not-promoted set gained the silent quantity degradation
  (`resolve.ts:99-102`), recorded rather than promoted because the map is already over budget and the failure is not
  browser-only; §3's Phase 4 row moved to `complete` and names the change folder; §4's
  `e2e` row stopped reading "planned" and now carries Playwright `^1.62.1` with the real
  harness shape; §5's `e2e on critical flows` row moved from `planned` to required, but
  **only after** the required-check list on `main` was re-read (see that row); §6.7 was
  filled from what the specs actually taught, which in two places contradicted the plan
  that predicted them (the hydration barrier and the one-shot negative assertion).
  `context/foundation/lessons.md` was also created — it had never existed, so every prior
  run of `/10x-implement`, `/10x-e2e` and the review skills silently skipped it.
  The closing gate check ran the same day — break PR #15, closed unmerged, two runs
  reddening one spec each while `ci` and `integration` stayed green (§6.6).
- **A correction three earlier artifacts owed — landed 2026-09-02.**
  `tests/integration/global-setup.ts`'s `overrideDevVars` doc comment, §6.2 rule 4 and
  §6.6's Phase 1 note all three attributed `.dev.vars`' precedence over the spawn env to
  the adapter's platform-proxy helper. The
  precedence claim was right and the harness that depends on it was correct; the
  mechanism was not — the Cloudflare adapter parses the file and calls
  `Object.assign(process.env, parsed)` (`@astrojs/cloudflare/dist/index.js:292-303`).
  All three now state that, corrected 2026-09-02 through
  `context/changes/test-plan-refresh-2026-09-01/`; the override's behavior did not
  change, only its stated cause. It was worth fixing rather than carrying because it
  says where to look when the override stops working. `lessons.md` recorded the
  divergence in the first place and, being append-only, still carries its original
  present-tense wording plus a dated note that the correction landed — read the note,
  not the bullet above it, for the current state.
- **Local quality layers wired 2026-08-31** — a tooling change, so it opened no
  rollout phase and no change folder: a per-edit `PostToolUse` hook
  (`.claude/settings.json` + `.claude/hooks/vitest-related.mjs`) running
  `vitest related` over `src/lib/{path,card-data,deck}` and `src/components/deck`,
  and `npm run typecheck` appended to `.husky/pre-commit`. §5 gained the
  `related unit tests (per-edit)` row plus the two paragraphs recording the timings
  that chose those layers and the deliberate break that proved the hook. Nothing in
  CI or branch protection changed — stated because §5's rule is that a gate row is
  aspirational until its job name is in the required-check list, and these two rows
  deliberately never enter it.
- **Refresh completed 2026-09-02** through
  `context/changes/test-plan-refresh-2026-09-01/` (opened 2026-09-02). Its trigger was
  the rollout closing with nothing left pointing forward, while Phase 4's own lessons
  register had meanwhile produced evidence that §7 contradicted. What it changed:
  **§2** split into a protected table (#1–#8, each naming the `complete` phase that
  answers it) and an open table, which retires the 8-row overflow note by structure
  rather than excusing it a third time — the 2026-08-25 refresh proposed exactly this
  split and did not take it; **§2** also gained **risk #9** (a path-builder pre-save
  Check verdict, diff preview or error banner describing deck text the user has already
  edited or cleared), Medium × Medium with its Risk Response Guidance row, and
  re-stamped `src/components/deck` churn from 1/30d and 18/90d to 2 and 19 — both 30d
  commits shipped-code changes made in service of testability, so the figure is product
  churn rather than test-only noise. **§3** gained **Phase 5** (path-builder
  stale-response ordering, risk #9, browser E2E, `not started`, no change folder) plus
  the order rationale recording that it is the first phase whose whole cost is the test
  itself — evidenced by a dated required-check read rather than asserted. **§4**'s
  four grounding bullets were re-stamped 2026-09-02 and moved to the past tense where
  they still described Phase 4's runner choice as pending. **§1** and **§7** stopped
  carrying the hard-coded Vitest suite-file count, which had gone stale twice in two
  sections,
  while the one derivable count stays in §4's `unit (logic)` Notes cell. **§7**'s
  three load-bearing bullets were rewritten: the component-render exclusion now names
  which half of its own trigger is unmet (logic boundary locked, UI not being
  finalized) and states the admissibility boundary for a browser phase outright; the
  path-builder bullet narrowed from the whole surface to its **render**, with that
  surface's client-side ordering explicitly **not** excluded; and the browser-E2E
  bullet dropped its false assertion that §4 recorded no installed runner, and widened
  to both browser phases. **§1** and **§6**'s preamble gained the `lessons.md` companion-read
  pointer, so the file is discoverable from the strategy and at the point of use rather
  than from §8 prose alone, and **§6**'s preamble now records its two schema
  deviations (seven sub-sections against three-to-six, and §6.6 preceding §6.7) as
  deliberate with the reason. The refresh's last item corrects §6.2 rule 4 and the
  integration harness comment — and §6.6's Phase 1 note, a third site the plan's own
  change list had missed — to name the Cloudflare adapter's actual mechanism instead of
  the platform-proxy helper they had all three named; the debt entry above records it as
  landed.
- **Two questions this refresh answered by declining to act.** (a) **§5 is unchanged.**
  Every gate row is accurate, and appending `#9` to the `e2e` row's "Catches" cell would
  claim coverage that does not exist: that row describes what is _wired_, and Phase 5 is
  `not started`. §5's standing rule is that a gate row is aspirational until its job
  name is in the required-check list; the mirror of it is that a row already in that
  list must not advertise a risk no spec covers yet. (b) **The silent quantity
  degradation stays unpromoted**, and the deferral is closed rather than passed on a
  third time. The row-budget half of the original reasoning was retired by the
  protected/open split, so the layer argument is the one that decides it: the failure
  needs a crafted `/cards/collection` response, which the integration and unit layers
  that already own the resolver can construct and a browser phase cannot cheaply — so
  §3 Phase 5 is the wrong home for it, and if it is ever promoted it belongs with #7's
  family at that layer. §2's not-promoted paragraph carries the decision; a future
  refresh should cite it rather than re-open it.
- **Rollout Phase 5 landed 2026-09-06** through
  `context/archive/2026-09-05-testing-path-builder-ordering/` (archived 2026-09-06). What it
  changed: **§3**'s Phase 5 row
  moved to `complete` and names the change folder; **§2** row #9 stayed in the open table
  with its "Answered by" cell rewritten to `complete` — **documented, not protected**, plus
  a paragraph stating why those two are not contradictory; **§6.7** gained an
  authenticated-browser-spec subsection (items 16–24) and had two of its header bullets
  corrected — the "Prerequisite: nothing, no Supabase, no auth" claim was true only of
  Phase 4's surface, and the naming convention was written as `comparer-<risk>` when the
  suite now holds two surfaces. The phase's own premise correction is the substantive one:
  §3's order rationale placed Phase 5 last partly because "no runner to add, no CI job to
  write, no branch-protection change to make", and that was **false for risk #9** — the
  path builder sits behind `src/middleware.ts`, so Phase 1 of the change was harness work
  (a `.dev.vars` stash, a `setup` project writing `storageState`, seeding helpers, and
  three CI steps booting local Supabase in the `e2e` job). The cheapness premise held for
  the marginal spec, not for the phase. Six findings were filed rather than fixed
  (`findings.md` F-1 through F-6), two of them pinned by `test.fail()` specs; the
  remaining §2/§3 corrections are listed in that change's `backport.md` for the next
  `/10x-test-plan --refresh`.
- **Risk #9's remaining two defects were pinned 2026-09-06** through
  `context/archive/2026-09-06-testing-path-builder-error-and-mode/`. It opened no rollout
  phase — §3 has had none since Phase 5 closed the same day — because it added no new risk
  and no new job: two more specs joined the file Phase 5 created, in the job Phase 5's CI
  work already built. What it changed: **§6.7** gained items **25–27** on the
  authenticated-spec subsection — a parked route needs a _failing_ release
  (`ParkedRoute.releaseWithFailure`, and why a 500 rather than `route.abort()`,
  cross-referencing item 8); an observation window must be pointed at a surface that can
  actually render in the state the spec leaves the app in, or the negative assertion passes
  vacuously; and the two-identical-banners case as a second instance of item 1, with the
  rule that you name **both** twins rather than relying on one being incidentally unique.
  **Item 22**'s findings reference was corrected: it named F-1 and F-2 and an unqualified
  "that change's `findings.md`", and now names F-1 through F-4, the archived path that holds
  them, and the fact that the file carries **four** inverted specs — so a run reporting fewer
  than four expected failures has had an annotation removed. One **production** edit shipped
  (`role="alert"` plus a distinguishing `aria-label` on both of `PathEditor`'s
  byte-identical error banners), which is the second time a browser phase has had to make a
  surface addressable in shipped code rather than in the test; item 1 predicted that and
  item 27 now records the twin case. Two claims in the archived Phase 5 `findings.md` were
  **superseded, not implemented** — F-3's "superseded or not" mechanism and F-4's predicted
  "full-list verdict under the diff-mode textarea", both of which the render tree forbids;
  the correction and its generalizable rule live in `context/foundation/lessons.md`, since
  the archived source is immutable. F-5 (three unguarded mutation flows) and F-6 (zero-entry
  text rendering the success verdict) are carried forward with re-verified line numbers in
  that change's own `findings.md`, which also names the F-5 shared-guard refactor as the
  designated successor and argues the ordering: the refactor now runs over four `test.fail()`
  pins rather than two.
- **Two §2 corrections this change owes and did not take.** Recorded here rather than in a
  `backport.md`, because the change folder is archived and immutable. Both are in risk #9's
  row, whose cells §2's own prose puts under edit restriction, so they want a refresh's
  authority rather than an implementation phase's: (a) the "Answered by" cell points at
  `context/changes/testing-path-builder-ordering/findings.md`, a path that no longer exists —
  it archived to `context/archive/2026-09-05-testing-path-builder-ordering/` on 2026-09-06;
  (b) that same cell says F-1 and F-2 "are live, pinned by `test.fail()` specs", which was
  true for one day. Four are now pinned, and the row's own explanatory paragraph below the
  table already says "the four defects behind it are F-1 through F-4" — so the table cell and
  the prose under it disagree. Neither correction changes the row's rating or its
  **documented, not protected** disposition: the specs are still inverted, the guards are
  still unrepaired, and #9 still belongs in the open table. A future refresh should fix the
  path, restate the count, and leave everything else in the row alone.
- **Risk #9 was repaired — not pinned — on 2026-09-07** through
  `context/changes/shared-stale-response-guard/`, the fourth and last change in that chain and
  the first that fixed rather than documented. It opened **no §3 rollout phase** (§3 has had
  none since Phase 5 closed on 2026-09-06) and **no CI job**: both browser spec files live
  under `tests/e2e/`, which the required `e2e` job already runs, and the new unit tests ride
  `npm test` in the required `ci` job. So no job name was added and the required-check list on
  `main` needed no read — the one gate condition §5 imposes.
  What it changed in the product: one guarded-async primitive
  (`src/lib/async/latestRun.ts`, pure and unit-tested at the `node` layer, plus the
  `useLatestRun.ts` hook) now owns staleness for the whole app, and **all eight**
  async-then-setState flows run through it — `DeckComparer.runPlan`, `PathEditor`'s six, and
  `NewPathForm.handleSubmit`, an eighth site no upstream record had counted. The invariant is
  mechanical: `grep -rn "useRef(0)\|Token.current" src/` returns nothing.
  What it changed here: **§2** as listed in the Strategy bullet above — #9 to the protected
  table, #10 appended already protected, the protected preamble widened, the open table
  emptied; **§6.7** gained items **28–29**. Nothing in §1, §3, §4, §5 or §7 moved. §7 in
  particular was **re-read and deliberately not touched**: its "two phases and no further"
  bullet still describes the phases correctly, because this change added neither a phase nor a
  runner, and #10's browser specs are admissible on the boundary that bullet already states —
  the divergence exists nowhere but the rendered result and §4 carries no component-render
  layer that could see it. The admissibility argument is in the change's `plan.md`, and the
  decision to take the §2 edits here rather than route them to `/10x-test-plan --refresh` is
  recorded there too: this is the change that falsified #9's disposition, so deferring would
  have left the map wrong in the actionable direction for however long a refresh took. No
  `backport.md` was written, deliberately.
  Findings: `findings.md` carries **F-6** forward (non-empty text parsing to zero cards still
  renders the success verdict) with line numbers re-verified against the post-repair file and a
  **third** affected site the archived entry never cited (`runDiffCheck`'s identical raw-text
  guard); and files **F-7**, the `NewPathForm` site, as found-and-closed-here with one residual
  accepted in the open (the submit control re-enables as navigation starts, where the old
  `pending` stayed set — and `NewPathForm` has no browser spec to pin either behavior).
- **Three claims in the archived risk-#9 record were superseded, not implemented** — the same
  pattern as the F-3/F-4 corrections the 2026-09-06 entry records, and for the same reason:
  the source files are archived and immutable. All three are in
  `context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md` F-5, all three
  **changed what got built**, and all three are held in
  `context/changes/shared-stale-response-guard/findings.md` (C-1 through C-4) plus
  `context/foundation/lessons.md`. (a) F-5's **symptom** is wrong: `DELETE /steps` removes the
  highest-position step per **call**, so two overlapping deletes produce two server deletes and
  the client's count agrees — the reachable divergence is a false error banner over a delete
  that succeeded. (b) F-5's **suggested fix** — read naturally as one discipline for all three
  mutations — would have made `handleDeleteLast` **worse than the defect**, dropping the
  successful 204 as superseded while the 404 set the error, leaving a step rendered against a
  server holding zero. The three mutations therefore ship under two disciplines. This is the
  generalizable one: `lessons.md` previously required a finding's named **symptom** to be
  re-derived from the render tree, and said nothing about its **fix**; it now requires both.
  (c) The four `test.fail()` pins were **necessary but not sufficient** as a specification — S2
  and S3 both edit the textarea before adding, so a two-line repair flips all four while F-3's
  actual defect stays reachable. Hence the rule now in §6.7 item 29 and in `lessons.md`: a
  repair covering N findings needs a targeted break **per finding**, and a green spec written
  inside the repairing change needs the deliberate-break run as much as an inverted one does.
- **The two §2 corrections the 2026-09-06 entry recorded as owed are now superseded, not
  fixed.** Both were in risk #9's "Answered by" cell — a `context/changes/...` path that had
  archived away, and a stale "F-1 and F-2" count that the prose beneath the table already
  contradicted. That cell no longer exists: the row moved to the protected table and the cell
  was replaced wholesale. A future refresh should **not** look for them. The generalizable
  half is worth keeping, because it is what the manual verification for this edit was written
  against: the defect those two corrections described was a **cell disagreeing with the prose
  beneath it**, so widening the protected table's preamble to admit a row protected by a change
  was not cosmetic — leaving it reading "every row below is answered by a `complete` §3 phase"
  above a row protected by no phase would have reproduced the same defect one table over.
- **A third stale change-folder path, found and fixed rather than recorded as owed,
  2026-09-07.** §3's Phase 5 row and this ledger's own Phase 5 entry both still pointed at
  `context/changes/testing-path-builder-ordering/`, which archived on 2026-09-06 — the same
  dead path the two owed §2 corrections above describe, in two more places nobody had checked.
  Both now name `context/archive/2026-09-05-testing-path-builder-ordering/`. This one was
  **taken** rather than deferred, unlike the §2 pair, and the distinction is the reason: those
  two sat in a frozen §2 cell that §2's own prose puts under edit restriction, so they wanted a
  refresh's authority; a §3 change-folder cell is under no such restriction and the convention
  is unambiguous — the other four §3 rows all carry archive paths, and every other §8 entry
  cites the archive path with its archived date. A one-cell path correction with four
  precedents is not a judgement call. **The generalizable point for whoever archives next:
  archiving a change breaks every §3 and §8 citation of its folder, and `/10x-archive` does not
  rewrite them.** Grep the foundation docs for the old `context/changes/<change-id>/` path in
  the same pass — this is the third time the omission has been found downstream rather than at
  archive time.
- **`lessons.md` gained three entries and one supersession, 2026-09-07.** "Treat the
  stale-response guard as five hand copies, not one pattern" — the standing review obligation
  that justified this whole chain — is superseded by "The stale-response guard has one
  definition now — reject a new hand-rolled counter". The register is append-only, so the
  original stays put with its present-tense wording; read the superseding entry for the current
  state. The other two are general rather than surface-specific: a finding's suggested **fix**
  needs the same verification against the code as its symptom, and a repair covering N findings
  needs a targeted break per finding rather than one green suite.
- Stack versions last verified: 2026-09-02 — every declared-versus-installed pair
  re-read and unchanged: `astro ^6.3.1` resolves to 6.4.8, `vitest ^4.1.9` to 4.1.9 and
  `@playwright/test ^1.62.1` to 1.62.1, so §4's rows and its "Vitest 4 / Astro 6"
  grounding bullet all still read correctly
- AI-native tool references last verified: 2026-09-02 — all four §4 grounding bullets
  re-stamped: Context7 still the only docs-grounding path (no Exa.ai or dedicated
  docs-search MCP), browser tooling still skills-only with no Playwright MCP exposed,
  `gh` CLI present and used for this refresh's branch-protection read

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes (e.g. the logic
  boundary is locked and frontend/E2E testing becomes worthwhile).
