# Findings deferred by `testing-path-builder-ordering`

Live defects and gaps this change **found and deliberately did not fix**, so they do not
evaporate with the change folder. Each entry names a file and line verified against the code
on 2026-09-06, the observed behavior, why it was deferred, and where it should land.

This list has a different shape from its predecessors. Phase 4's findings were things its
specs stepped around; **F-1 and F-2 here are the risk itself.** Risk #9 was promoted to §2
because the divergence was verified present in code, not hypothesized — so a spec asserting
the correct behavior is red today. Both are therefore pinned in the suite as `test.fail()`
specs (`tests/e2e/path-builder-stale-ordering.spec.ts`) rather than left as prose: the run
stays green on today's code and turns **red the moment either guard is fixed**, which is what
makes these two findings self-retiring. F-3 through F-6 have no spec and rely on this file
alone.

What they share with every earlier list is silence. The drop path in each guarded flow is a
bare `return` — no state change, no logging, and the counters are `useRef`s that never reach
the DOM. Nothing distinguishes "guard worked" from "guard was never reached" except rendered
content that contradicts the input.

---

## F-1 — clearing the deck box invalidates nothing, and the recorded cause is wrong

**Where**: `src/components/path/PathEditor.tsx` — the textarea's `onChange` (`:708-710`),
`runCheck`'s empty-text branch (`:322-324`), its token bump (`:326`) and re-check (`:330`),
and the Check button's `disabled` expression (`:771-776`).

**Observed**: the textarea's `onChange` calls `setListText` and nothing else. It moves no
token and resets no state. So a `runCheck` already awaiting `resolveDeck` when the user
empties the box still satisfies its own `token !== checkToken.current` check at `:330` and
writes `{status: "checked"}` — rendering the verdict at `:729` (`✓ All cards resolved.`) over
an input holding nothing.

**The mechanism recorded in `lessons.md:78-81` is not this one.** That entry attributes the
bug to `runCheck`'s empty-text branch "returning without bumping" (`:322-324`). That branch is
effectively unreachable: `runCheck` has **three** call sites — `:395` and `:406`, both
accept-driven and both passing rewritten non-empty text, and `:778`, the Check button, which
is `disabled` while `listText.trim() === ""` (`:771-776`). A fix that adds a bump to `:323`
would change nothing observable.

(This plan's own Current State Analysis says five call sites, listing `:419` and `:430` too.
Those two are `runDiffCheck`'s; the five are the call sites of both Check functions together.
Corrected here, verified 2026-09-06.)

**Impact**: the user is shown a verdict about a deck they have already discarded, at exactly
the moment they are deciding whether to save. Medium by §2's rubric — the persist boundary is
defended by §3 Phase 3, so the blast radius stops before the stored snapshot.

**Why deferred**: this change's remit is coverage, not repair (§6.7 item 15). The fix is a
behavior change on a live input handler, and picking it correctly requires deciding whether an
edit should invalidate an in-flight Check or merely mark the verdict stale — a product
question, not a test one. Filing it costs nothing because the spec makes it self-announcing.

**Suggested owner**: whoever next touches `PathEditor`'s Check flow, or the shared-guard
refactor in F-5's note. Recommended fix: bump `checkToken` and reset `checkState` /
`diffPreview` from `onChange` itself, so every edit — not just an emptying one — invalidates
work in flight. Verified locally during this change: with that bump in place, S1 reports
`Expected to fail, but passed.` **Do not** fix only `:322-324`; that is the misattribution
above.

**Pinned by**: `tests/e2e/path-builder-stale-ordering.spec.ts` — "a pre-save verdict never
describes a deck box the user cleared", `test.fail()`.

---

## F-2 — a successful add clears the verdict under the wrong counter

**Where**: `src/components/path/PathEditor.tsx:314-315` (the `setCheckState` / `setDiffPreview`
resets at the end of `handleAddStep`'s success block, `:310-315`), guarded by `addToken`
(`:189`, bumped `:225`) rather than `checkToken` (`:191`).

**Observed**: the add flow's success block resets `checkState` and `diffPreview` — two atoms
that only `checkToken` guards. Since an add never advances `checkToken`, a `runCheck` in flight
when the checkpoint saves is not superseded: it lands afterwards, passes its own token check,
and re-populates both atoms over the box `:312` just emptied. The overlap is reachable through
ordinary affordances because the Add button is disabled on `addState === "resolving"` alone
(`:790`) — an in-flight Check does not block it.

**Impact**: the same misleading verdict as F-1, but harder to dismiss: it appears _after_ a
successful save, next to a checkpoint that has already been written, so it reads as a statement
about the saved step rather than about discarded text.

**Why deferred**: same remit. The fix is one line, but it belongs with a decision about the
whole guard family (F-5) rather than as a spot repair on the flow this change happened to
spec.

**Suggested owner**: same as F-1. Recommended fix: advance `checkToken` in the success block
immediately before `:314`, so the resets and the counter that guards them move together.
Verified locally: with that bump, S2 reports `Expected to fail, but passed.`

**Pinned by**: `tests/e2e/path-builder-stale-ordering.spec.ts` — "a pre-save verdict never
survives the checkpoint that replaced it", `test.fail()`.

---

## F-3 — both Check flows write the add-error banner under a counter that does not guard it

**Where**: `src/components/path/PathEditor.tsx:339` (inside `runCheck`'s `catch`, guarded by
`checkToken` at `:335`) and `:367` (inside `runDiffCheck`'s `catch`, guarded at `:363`). Both
call `setAddState({status: "error", …})`; the banner they write renders at `:759-762`.

**Observed**: `addState` is the add flow's atom, guarded by `addToken`. A Check that throws
writes it from inside a `checkToken`-guarded branch, so the add-error banner is written by
whichever Check throws — superseded or not — and can appear over an add that succeeded, or
persist after the Check that produced it has been replaced. The reverse also holds: an add's
own error banner can be overwritten by a Check's transport failure.

**Impact**: lower than F-1/F-2 in practice, because both messages describe a card-database
transport failure and read plausibly either way. It is a correctness problem in the guard
rather than a routinely-visible one.

**Why deferred**: it is not spec-able without a production edit first. The banner at
`:759-762` is an unnamed `<p>` carrying a class string **byte-identical** to the path-level
`mutationError` banner at `:596`, so a locator for one matches the other — the same
addressability trap §6.7 item 1 records from Phase 4, where the fix was two one-line
production edits. Making this change do that edit would have pulled a production `role` /
`aria-label` change into a coverage phase, which the plan explicitly held out.

**Suggested owner**: a change that can take both halves — `role="alert"` on `:759-762` (and a
distinguishing `aria-label` between it and `:596`), then a third spec in the existing file.
Recommended fix for the guard itself: have each Check's `catch` write a Check-owned error atom,
not `addState`.

---

## F-4 — `switchMode` resets three atoms and advances neither counter

**Where**: `src/components/path/PathEditor.tsx:376-382`.

**Observed**: switching between "Full list" and "Changes" clears `listText` and all three
state atoms (`checkState`, `diffPreview`, `addState`) while bumping neither `addToken` nor
`checkToken`. Any of the three flows in flight at that moment survives the switch and writes
its result into the other mode's surface. It is F-1's shape and F-2's shape at once, on a
control that exists specifically to stop the two modes bleeding into each other — which is what
its own comment at `:374-375` says it is for.

**Impact**: the resulting render is the most confusing of the four: a full-list verdict under
the diff-mode textarea, or a diff summary under the full-list one. Rare, because it needs a
mode switch during an in-flight resolve.

**Why deferred**: the mode toggle only renders when `steps.length >= 1` and the surfaces differ
per mode, so a faithful spec needs a second seeded shape and a locator set this change did not
build. It is also the finding most likely to disappear entirely under F-5's shared-helper fix,
so specing it first would risk writing a test against a structure about to be replaced.

**Suggested owner**: same change as F-3, or the F-5 refactor. Recommended fix: advance both
counters in `switchMode` — it is the one site where "invalidate everything" is unambiguously
correct.

---

## F-5 — three mutation flows carry no stale-response guard at all

**Where**: `src/components/path/PathEditor.tsx` — `handleDeleteLast` (`:433-444`),
`handleRename` (`:447-466`), `handleDeletePath` (`:469-479`).

**Observed**: each awaits a `requestJson` call and then writes state (`setSteps`, `setTitle` +
`setRenaming`, or a `window.location` navigation) with no token, no counter and no re-check.
`handleDeletePath` is self-limiting — it navigates away — but `handleDeleteLast` and
`handleRename` can both land after a newer action. Two rapid deletes can pop two steps for one
server delete; a rename that resolves late can restore a title the user has since changed.

**Impact**: low frequency, but unlike F-1 through F-4 these can leave the **rendered step list
disagreeing with the server**, which the pre-save findings cannot. A reload corrects it, so no
data is lost.

**Why deferred**: this is the standing obligation `lessons.md:57-88` already records — the
guard is five hand copies with no shared definition, and these three flows are simply the
copies nobody made. Adding a fourth, fifth and sixth hand copy is the wrong fix; extracting a
shared helper is a refactor with its own risk, and this change's plan holds it out by name.

**Suggested owner**: a dedicated refactor extracting one guarded-async helper and routing all
of `DeckComparer.runPlan` plus `PathEditor`'s six flows through it. That change retires F-1
through F-5 together and is the reason none of them is worth a spot fix.

---

## F-6 — non-empty text that parses to zero cards renders "✓ All cards resolved."

**Where**: `src/components/path/PathEditor.tsx:322` (`text.trim() === ""`) and `:216`
(`listText.trim() === ""`) versus `src/lib/deck/parse.ts:107-128` (`parseDeckList`), with the
verdict rendered at `PathEditor.tsx:729`.

**Observed**: both guards test the raw text, while everything downstream works on **parsed
entries**. `parseDeckList` deliberately drops blank lines, comments (`#…`, `//…`) and section
headers (`splitCardLine`, `parse.ts:72-94`), so text like `// my commander deck` or `Deck (99)`
is non-empty by `trim()` and yields `entries: []`, `malformed: []`. `resolveCards([])` issues
no request and returns empty, so `runCheck` reaches `{status: "checked", unresolved: []}` and
renders `✓ All cards resolved.` for a list containing no cards at all. The Check button is
enabled throughout, for the same `trim()` reason (`:772`).

The same gap sits on the add path: `:216` lets that text through, and `handleAddStep` persists
a checkpoint whose snapshot is `{cards: [], unresolved: []}` — so the user can be told
everything resolved and then save an empty checkpoint.

**Impact**: low and self-evident on the page (the saved step renders as an empty deck), but the
verdict is actively wrong rather than merely unhelpful: `✓` is the one signal in this surface
that means "safe to save".

**Why deferred**: outside risk #9 entirely — it is a validation gap, not an ordering one, and
was found only because this change had to reason about the empty-text branch for F-1. Promoting
it here would have widened a coverage phase into a behavior change.

**Suggested owner**: a unit-layer change — this needs no browser. Recommended fix: gate on
`parseDeckList(text).entries.length === 0` rather than `text.trim() === ""` at both `:322` and
`:216`, and give the zero-entry case its own message ("no card lines found") instead of the
success verdict. `src/lib/deck/parse.test.ts` already owns the parser's classification rules,
so the assertion has a home.

---

## Recorded, not filed: what this change proved about the harness premise

Not a defect — a correction to a planning claim, kept here because the next browser phase will
inherit the same premise if nobody writes it down.

### D-1 — the "no runner, no CI job, no branch-protection change" premise was false for #9

§3's order rationale placed Phase 5 last partly because its whole cost was supposed to be the
test itself. That was established for **Phase 4**, whose surface (`/`) is reachable without a
session. Risk #9's surface is not: `src/lib/supabase.ts:7-9` returns `null` without keys, so
`src/middleware.ts:20-24` redirects every `/paths*` request regardless of cookies, and
`@astrojs/cloudflare` `Object.assign`s `.dev.vars` over anything Playwright injects
(`dist/index.js:292-303`). Phase 1 of this change was therefore harness work — a `globalSetup`
stashing `.dev.vars`, a `setup` project writing `storageState`, seeding helpers, and three new
CI steps booting local Supabase in the `e2e` job.

The cheapness premise held for the _marginal_ spec (Phases 2 and 3 were pure test authoring) but
not for the phase. Recorded in `backport.md` as a §3 correction for `/10x-test-plan`, and in
§6.7's authenticated-spec subsection as the recipe.
