---
change_id: testing-path-builder-ordering
title: Prove a superseded path-builder resolve never reports on text the user replaced
status: archived
created: 2026-09-05
updated: 2026-09-06
archived_at: 2026-09-06T11:18:46Z
---

## Notes

Rollout Phase 5 of `context/foundation/test-plan.md` §3 — the last open phase,
and the only one whose risk was **found rather than forecast**: #9 came out of
Phase 4's own lessons register
(`context/archive/2026-08-27-testing-comparer-failure-surfacing/`), so no earlier
ordering could have reached it.

Risk covered — §2 row **#9** (Medium × Medium), the single row in the open table:

- In the **path builder**, a pre-save Check verdict, a diff preview, or an error
  banner describes deck text the user has already edited or cleared. A slow
  earlier resolve lands after the input moved on, so the user decides whether to
  save on a verdict about text that no longer exists.
- Medium impact because Phase 3 already defends the persist boundary: the blast
  radius stops at what the user is shown _before_ saving. Medium likelihood
  because the divergence is verified present in code rather than hypothesized —
  that is what separates #9 from #8's Low.

Test type planned: **browser E2E**.

### Risk response intent (§2 Risk Response Guidance, row #9)

- **Prove**: every path-builder surface that reports on deck text — the pre-save
  Check verdict, the diff preview, the error banner — matches the text currently
  in the box, and a superseded resolve leaves no trace on any of them, including
  when the box was **cleared** while the resolve was in flight.
- **Challenge**: "this flow is safe because it mirrors the one next to it", and
  "clearing an input cannot race — there is nothing left in flight".
- **Research must ground**: each flow's own guard checkpoints and how many it has;
  which counter each flow advances and which flows share one; whether the
  empty-input path invalidates work already in flight; and which state atom each
  guarded write targets versus which counter guards it.
- **Anti-pattern to avoid**: driving the overlap by typing. The debounce coalesces
  keystrokes into a single run, so the second run never starts and the test passes
  without ever overlapping anything.

### Open scope question — research must settle, do NOT treat as decided

§3's order rationale claims this phase's whole cost is the test itself: "no runner
to add, no CI job to write, no branch-protection change to make". That premise was
established for **Phase 4**, whose surface is reachable without a session.

Risk #9's surface is not. The path builder is served behind the middleware session
gate, while the `e2e` CI job and `playwright.config.ts` are deliberately
Supabase-free and carry no `storageState` and no setup project — that was a stated
design choice of Phase 4, not an oversight.

Research must ground what a browser test actually needs to reach this surface —
session acquisition, `storageState`, and whether the `e2e` job needs a Supabase
stack the way the `integration` job boots one — and report whether the phase's
cheapness premise still holds. If it does not, that is a **§3 correction to
backport through `/10x-test-plan`**, not something to absorb silently in the plan.

### Standing constraint from Phase 4

A phase like this is **coverage, not repair** (§6.7 recipe item 15). If a live
defect surfaces, file it to `findings.md` rather than fixing it — a spec for a real
defect would be red today, which makes it a different change.

### Resolved by the plan (2026-09-05)

Both open items above are settled in `plan.md`:

- **The scope question is answered: the cheapness premise is false.** The path
  builder's surface is unreachable without Supabase keys on the dev server
  (`src/lib/supabase.ts:7-9` + `middleware.ts:20-24`), and `.dev.vars` outranks
  anything Playwright injects. Phase 1 of the plan is harness work. This is a §3
  correction to backport.
- **"Coverage, not repair" holds, but not the way Phase 4 meant it.** Risk #9 _is_
  live defects, so a faithful spec is red today. The specs assert the correct
  behavior and carry `test.fail()`: no production logic changes, the suite stays
  green, and a fix to either guard turns the build red. Consequence: Phase 5
  completes without risk #9 being protected, so §2 row #9 stays open.
