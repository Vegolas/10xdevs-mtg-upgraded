# Findings deferred by `testing-path-builder-error-and-mode`

Live defects and gaps this change **found and deliberately did not fix**, so they do not
evaporate with the change folder. Each entry names a file and line verified against the code
on 2026-09-06 — *after* this change's Phase 1 production edit, which shifted every line below
`PathEditor.tsx:595` — the observed behavior, why it was deferred, and where it should land.

This list is the third in a chain and inherits its two predecessors' shape. What it inherits
from the immediate one is the reason it is short:
`context/archive/2026-09-05-testing-path-builder-ordering/findings.md` filed six findings, F-1
through F-6. F-1 and F-2 were pinned there. **F-3 and F-4 are pinned here**, by S3 and S4 in
`tests/e2e/path-builder-stale-ordering.spec.ts`, so all four are now self-retiring: the suite
stays green on today's code and reports `Expected to fail, but passed.` the moment someone
repairs a guard. What survives with no spec at all is F-5 and F-6, carried forward below
because this file is the only thing standing between them and silence.

Numbering is continuous with the archived list on purpose. F-5 stays F-5 so that the places
already pointing at it — `context/foundation/lessons.md`, test-plan §6.7, this change's
`plan.md`, and the archived list itself — keep resolving. Nothing is renumbered.

What every entry shares with every earlier list is silence. The drop path in each guarded flow
is a bare `return` — no state change, no logging, and the counters are `useRef`s that never
reach the DOM. Nothing distinguishes "guard worked" from "guard was never reached" except
rendered content that contradicts the input.

---

## Closed here, not carried: F-3 and F-4

Neither is fixed. Both are now **pinned**, which is the disposition this change was opened to
produce. The two corrections that made them spec-able are recorded in
`context/foundation/lessons.md` rather than here — the archived list is immutable, and the
register is what the skills re-read.

- **F-3** — both Check flows write the checkpoint-error banner under a counter that does not
  guard it. `runCheck`'s catch (`src/components/path/PathEditor.tsx:334-341`) and
  `runDiffCheck`'s (`:362-369`) both call `setAddState`; `addToken` (`:189`) is what guards
  that atom and neither Check advances it. Pinned by "a checkpoint-error banner never
  describes a Check that failed after the save", `test.fail()`. **The filed mechanism was
  wrong** and the difference decided the spec: both catches *do* re-check `checkToken`
  (`:335`, `:363`), so the archived "superseded or not" wording overstates it — and the Check
  button is disabled while a Check is in flight (`:792-797`), so a Check-versus-Check overlap
  cannot be driven through the UI at all. The reachable overlap is Check-versus-**add**.
- **F-4** — `switchMode` (`:376-382`) resets three atoms and advances neither counter. Pinned
  by "a pre-save verdict never survives the entry-mode switch that cleared it", `test.fail()`.
  **The filed impact was impossible**: both previews are mode-gated (`:733`, `:745`), so
  neither can render under the other mode's textarea. The observable defect needs a mode
  **round trip**, with both switches landing before the release.
- **F-4's deferral reason was also stale.** The archived entry defers partly because "the mode
  toggle only renders when `steps.length >= 1`" and "a faithful spec needs a second seeded
  shape". `seedPathWithStep` (`tests/e2e/fixtures/auth.ts`) already seeds exactly one step, so
  `canDiff` (`:196`) is true and the toggle renders on the shape S1 and S2 were already using.
  No second seeded shape was needed.

**One thing F-3's fix will do to this surface, recorded because Phase 1 anticipated it.** The
recommended repair routes each Check's catch to a Check-owned error atom, which means a
**third** error banner on `PathEditor` carrying the same class string as the two that already
exist. That is why Phase 1 gave `role="alert"` plus a distinguishing `aria-label` to **both**
existing banners (`:602-608` "Path error", `:777-783` "Checkpoint error") rather than only to
the one S3 needed. A locator that works because nothing else happens to carry `role="alert"`
is relying on accidental uniqueness, and F-3's own fix is the thing that would remove it.
Whoever writes that fix should name the third banner in the same breath as adding it.

---

## F-5 — three mutation flows carry no stale-response guard at all

**Where**: `src/components/path/PathEditor.tsx` — `handleDeleteLast` (`:433-445`),
`handleRename` (`:447-467`), `handleDeletePath` (`:469-480`). Re-verified 2026-09-06 against
the post-Phase-1 file. All three sit above Phase 1's edit and did not move; the archived
entry's `:433-444` / `:447-466` / `:469-479` each stopped one line short of the closing
`useCallback` dependency line and are otherwise identical.

**Observed**: each awaits a `requestJson` call and then writes state — `setSteps` (`:441`),
`setTitle` + `setRenaming` (`:462-463`), or a `window.location` navigation (`:476`) — with no
token, no counter and no re-check. `handleDeletePath` is self-limiting because it navigates
away. `handleDeleteLast` and `handleRename` are not: two rapid deletes can pop two steps for
one server delete, and a rename that resolves late can restore a title the user has since
changed.

**Impact**: low frequency, but unlike F-1 through F-4 these can leave the **rendered step list
disagreeing with the server**, which the pre-save findings cannot. A reload corrects it, so no
data is lost.

**Why deferred**: this is the standing obligation `context/foundation/lessons.md` already
records under "Treat the stale-response guard as five hand copies, not one pattern" — the
guard is duplicated by hand with no shared definition, and these three flows are simply the
copies nobody made. Adding a fourth, fifth and sixth hand copy is the wrong fix. Extracting a
shared helper is a refactor with its own risk, and both this change's plan and its
predecessor's hold it out by name.

**Suggested owner — and this change's designated successor.** A dedicated refactor extracting
one guarded-async helper and routing `DeckComparer.runPlan` plus `PathEditor`'s six flows
through it. That change retires F-1 through F-5 together, which is why none of the five is
worth a spot fix.

**Why it had to wait for this change, stated so the ordering is not re-argued.** The refactor
rewrites the exact code paths F-1 through F-4 describe, and its own regression net *is* those
findings' specs. Landing it after `testing-path-builder-ordering` would have run it over
**two** pins — S1 and S2, covering the textarea and the add flow — with the Check-flow catch
and the mode toggle uncovered. Those two, F-3 and F-4, are precisely the sites whose guard
*mechanism* the refactor changes most: one writes an atom a different counter owns, the other
resets three atoms and owns no counter at all. It now runs over **four**. That is the whole
argument for this change existing as coverage rather than being folded into the refactor: four
`test.fail()` specs are a specification of what the shared helper must do, written before the
helper exists, each naming a distinct invalidation site (`onChange`, the add success block, a
Check's catch, `switchMode`). The refactor's success condition is that all four report
`Expected to fail, but passed.` and their annotations come off in one commit. Under two pins,
half of that specification would have been prose.

The archived F-4 entry raises the counter-argument — S4 is "the finding most likely to
disappear entirely" under the refactor, so a spec written now may test a structure about to be
deleted. This change took the opposite position, and it should be read as a decision rather
than an oversight: S4 asserts *behavior* at a production affordance (`role="group"`, name
"Entry mode"), not structure. `switchMode` can be deleted, inlined, or replaced wholesale by
the shared helper and the spec still reads correctly — what it would lose is its
`test.fail()`, which is the outcome the refactor is aiming for.

---

## F-6 — non-empty text that parses to zero cards renders "✓ All cards resolved."

**Where**: `src/components/path/PathEditor.tsx:322` (`text.trim() === ""` in `runCheck`) and
`:216` (`listText.trim() === ""` in `handleAddStep`) versus `src/lib/deck/parse.ts:107-128`
(`parseDeckList`), with the verdict rendered at `PathEditor.tsx:741`. The two guards are
unchanged; the verdict moved from the archived entry's `:729` — Phase 1 inserted twelve lines
above it — as did the Check button's `trim()` test, now `:793`.

**Observed**: both guards test the raw text while everything downstream works on **parsed
entries**. `parseDeckList` deliberately drops blank lines, comments (`#…`, `//…`) and section
headers (`splitCardLine`, `parse.ts:72-94`), so text like `// my commander deck` or
`Deck (99)` is non-empty by `trim()` and yields `entries: []`, `malformed: []`.
`resolveCards([])` issues no request and returns empty, so `runCheck` reaches
`{status: "checked", unresolved: []}` and renders `✓ All cards resolved.` for a list containing
no cards at all. The Check button is enabled throughout, for the same `trim()` reason
(`:793`).

The same gap sits on the add path: `:216` lets that text through, and `handleAddStep` persists
a checkpoint whose snapshot is `{cards: [], unresolved: []}` — so the user can be told
everything resolved and then save an empty checkpoint.

**Impact**: low and self-evident on the page (the saved step renders as an empty deck), but the
verdict is actively wrong rather than merely unhelpful: `✓` is the one signal in this surface
that means "safe to save".

**Why deferred**: outside risk #9 entirely — it is a validation gap, not an ordering one, and
was found only because the previous change had to reason about the empty-text branch for F-1.
This change's plan holds it out by name for the same reason plus a sharper one: it needs no
browser, so spending a browser phase's budget on it would be the exact §7 boundary violation
that phase's own admissibility test forbids.

**Suggested owner**: a unit-layer change. Recommended fix: gate on
`parseDeckList(text).entries.length === 0` rather than `text.trim() === ""` at both `:322` and
`:216`, and give the zero-entry case its own message ("no card lines found") instead of the
success verdict. `src/lib/deck/parse.test.ts` already owns the parser's classification rules,
so the assertion has a home.

---

## Recorded, not filed: what this change proved about writing a spec from a finding

Not a defect — two corrections to the archived list, kept here as a pointer, because the
general rule they share is what the next browser phase needs and it lives elsewhere.

Both F-3's and F-4's filed descriptions survived a plan review and a research pass and still
did not survive contact with the render tree. F-3's named mechanism ("superseded or not")
describes an overlap the disabled-button expression forbids. F-4's named impact ("a full-list
verdict under the diff-mode textarea") describes a render two mode gates forbid. In both cases
a spec written faithfully to the finding would have been vacuous — passing, or failing for a
reason unrelated to the defect — and `test.fail()` would have hidden it, because an inverted
spec that fails on an unreachable target looks identical in the report to one that fails on
the bug.

The generalizable rule is filed in `context/foundation/lessons.md` under "When a finding names
a symptom surface, verify the render reaches it before writing the spec". The mode-gating half
is also in test-plan §6.7, as an item of the authenticated-spec recipe. Neither correction can
be made at its source: the archived list is immutable.
