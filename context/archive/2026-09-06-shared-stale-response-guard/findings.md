# Findings deferred by `shared-stale-response-guard`

What this change **found and deliberately did not fix**, so it does not evaporate with the
change folder. Each entry names a file and line verified against the code on 2026-09-07 —
_after_ all three production phases, which moved every line below `PathEditor.tsx:184` — the
observed behavior, why it was deferred, and where it should land.

This list is the fourth in the risk-#9 chain and the shortest, because this change **repairs**
rather than pins. Its three predecessors filed six findings between them; five of those are
closed here. What is left is one carried-forward entry and one that was found and closed in
the same change.

Numbering is continuous with the archived lists on purpose. F-6 stays F-6 so the places
already pointing at it keep resolving — `context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md`,
this change's `change.md`, and its `plan.md`'s "What We're NOT Doing". Nothing is renumbered.

**What is closed and where the proof lives**, stated once so the next reader does not have to
reconstruct it:

| Finding | Disposition                                        | Proof                                                      |
| ------- | -------------------------------------------------- | ---------------------------------------------------------- |
| F-1     | repaired — the textarea's `onChange` invalidates   | S1, `tests/e2e/path-builder-stale-ordering.spec.ts`, green |
| F-2     | repaired — a successful add supersedes the preview | S2, same file, green                                       |
| F-3     | repaired — the Check flows own `checkError`        | S3, same file, green, plus its own targeted break          |
| F-4     | repaired — `switchMode` invalidates                | S4, same file, green                                       |
| F-5     | repaired — three mutation lanes, two disciplines   | `tests/e2e/path-builder-mutation-ordering.spec.ts`, green  |
| F-6     | **carried forward** — see below                    | none; it needs no browser                                  |
| F-7     | found and closed here — see below                  | none; no browser spec exists for `NewPathForm`             |

---

## F-6 — non-empty text that parses to zero cards renders "✓ All cards resolved."

**Where**: `src/components/path/PathEditor.tsx:376` (`text.trim() === ""` in `runCheck`) and
`:266` (`listText.trim() === ""` in `handleAddStep`) versus `src/lib/deck/parse.ts:107-128`
(`parseDeckList`), with the verdict rendered at `PathEditor.tsx:853`. Re-verified 2026-09-07.
Every citation moved from the archived entry's `:322` / `:216` / `:741` — Phase 2 inserted the
`checkError` atom and its banner, Phase 3 the three mutation lanes. The Check button's
`trim()` test is now at `:921`, inside the same four-way `disabled` expression, and
`runDiffCheck` carries the identical raw-text guard at `:411`, which the archived entry did not
cite and which has the same defect.

**Observed**: unchanged by this change, and unchanged _in kind_ — but note what did change
around it. Both guards test the raw text while everything downstream works on **parsed
entries**. `parseDeckList` deliberately drops blank lines, comments (`#…`, `//…`) and section
headers (`splitCardLine`, `parse.ts:72-94`), so text like `// my commander deck` or
`Deck (99)` is non-empty by `trim()` and yields `entries: []`, `malformed: []`.
`resolveCards([])` issues no request and returns empty, so `runCheck` reaches
`{status: "checked", unresolved: []}` and renders `✓ All cards resolved.` for a list containing
no cards. The same gap sits on the add path: `:266` lets that text through and a checkpoint
whose snapshot is `{cards: [], unresolved: []}` is persisted.

**What this change altered, and it is worth stating precisely so the next reader does not
mis-scope the fix.** The zero-entry path now runs through the `preview` lane like every other
Check, and the verdict is dropped if the box moved on. That is orthogonal: the guard decides
_whether_ a verdict lands, never _whether the verdict is right_. A superseded wrong verdict is
now correctly dropped; a current wrong verdict renders exactly as before. F-6 is untouched by
the repair and no spec in either browser file can see it.

**Impact**: low and self-evident on the page (the saved step renders as an empty deck), but the
verdict is actively wrong rather than merely unhelpful: `✓` is the one signal on this surface
that means "safe to save".

**Why deferred**: it is a validation gap, not an ordering one — `change.md` and `plan.md` both
hold it out by name, and the reason is the same one that keeps it cheap: it needs no browser
and no shared guard. Folding it into this change would have mixed a validation fix into a
refactor whose entire success condition is four annotations coming off, so a red build would
have had two candidate causes.

**Suggested owner**: a unit-layer change. Recommended fix: gate on
`parseDeckList(text).entries.length === 0` rather than `text.trim() === ""` at `:266`, `:376`
**and `:411`** — three sites now, not the archived entry's two — and give the zero-entry case
its own message ("no card lines found") instead of the success verdict. `src/lib/deck/parse.test.ts`
already owns the parser's classification rules, so the assertion has a home.

---

## F-7 — `NewPathForm.handleSubmit` read its own guard before setting it (closed here)

**Where**: `src/components/path/NewPathForm.tsx` — `handleSubmit` (`:33-65`), the guard read at
`:38`, the lane at `:31`, the submit control's `disabled` at `:95`, and the second trigger at
`:81-85`. Filed as a finding rather than as a plan line because it was **absent from every
upstream record**: `findings.md` F-5 counts three unguarded mutation flows, `lessons.md` counts
five hand copies, and this change's own `change.md` was opened against eight sites. This was
the ninth, and nothing pointed at it.

**Observed** (pre-repair): `handleSubmit` read `pending` at its top and called `setPending(true)`
three lines later, in the same closure. `pending` was in its own dependency array, so a second
click _after React committed_ was correctly blocked — which is why this never showed up. Two
submits inside one tick were not: both closures read `false` and both POSTed, creating two
paths. The same class as `handleDeleteLast`, reached by a different route: not an absent guard,
but a guard whose read cannot see its own write.

**Impact**: low — a duplicate path is visible, empty and deletable, and the second navigation
wins so the user lands on one of them. No data is lost and nothing is corrupted. It is recorded
because the _shape_ is the interesting part, not the blast radius.

**Why it is closed here rather than carried**: leaving one hand-rolled guard behind would have
meant the register entry this change exists to discharge could only be amended, not closed —
and the next reader would still have to re-read all of them to know which was which. That is
precisely the standing obligation being retired. `handleSubmit` now runs at-most-one on a
`create` lane; `pending` is deleted.

**One residual, deliberately accepted, and the only reason this entry is not simply "fixed".**
The lane clears `inFlight` in its `finally` once the run settles, so on the success path the
control re-enables as `window.location.href` navigation _starts_ rather than staying disabled
until the page unloads — where `pending` was never reset on success and so stayed set. The
double-submit window is closed; the navigation window is not. A click landing inside it creates
a second path. Not fixed because the honest fix is a distinct `navigating` state, which is a
product decision about what a control does while the page is leaving, and because
`NewPathForm` has **no browser spec** to pin either behavior — so a fix here would ship with no
regression net at all.

**Suggested owner**: whichever change next gives `/paths` browser coverage, or a small
follow-up if the navigation window is ever observed. Recommended fix: hold the control disabled
across the navigation rather than reintroducing a second boolean — a `navigating` commit that
the lane does not clear.

---

## Recorded, not filed: three claims in the upstream record that did not survive this change

All three are in immutable archived files, so this is their only home besides
`context/foundation/lessons.md`. Each one **changed what got built**, which is why they are
recorded as corrections rather than as pedantry. Every one was verified by running the code,
not by reading it.

### C-1 — F-5's stated symptom is wrong: two rapid deletes produce two server deletes

`context/archive/2026-09-06-testing-path-builder-error-and-mode/findings.md` F-5 says "two
rapid deletes can pop two steps for one server delete". They cannot.
`DELETE /api/paths/[id]/steps` selects the highest-position step and deletes **that row**, per
call (`src/pages/api/paths/[id]/steps.ts:214-236`), so two overlapping deletes produce two
server deletes and the client's count agrees with the server's.

The reachable divergence on a one-step path is a **false error banner**: the first DELETE
answers 204 and pops, the second answers 404 `"No steps to delete"` (`steps.ts:225-227`) and
writes `mutationError` over a delete that succeeded. This is load-bearing because it decides
what the spec asserts. Written to the filed symptom, the delete spec would have counted steps —
and on a one-step path both readings leave zero steps rendered, so it would have passed
vacuously whether the guard existed or not. `path-builder-mutation-ordering.spec.ts`'s delete
spec therefore asserts the **banner** and the **disabled trigger**, and its header records why.

### C-2 — F-5's implied fix would have made `handleDeleteLast` worse than the defect

F-5's suggested owner is "one guarded-async helper", read naturally as one discipline for all
three mutations. Under latest-wins, the first DELETE's successful 204 is dropped as superseded
— no pop — and the second's 404 sets the error. The result is a step rendered against a server
holding zero: the rendered-list-disagrees-with-the-server failure F-5 names as its own impact,
manufactured by the guard meant to prevent it.

So the three mutations ship under **two** disciplines: `handleDeleteLast` and `handleDeletePath`
run at-most-one with their trigger disabled, `handleRename` runs latest-wins. The generalizable
half of this is in `lessons.md` — a finding's _suggested fix_ needs the same verification
against the code that its _symptom_ does, and nothing in the chain had been applying it there.

### C-3 — the four `test.fail()` pins are necessary but not sufficient as a specification

S2 and S3 both `deckBox.fill(DECK_B)` before clicking Add, which fires the textarea's
`onChange`. So a two-line repair — invalidate in `onChange` and in `switchMode` — flips **all
four** specs, S3 included, whose actual subject is atom ownership. The Check-versus-add overlap
F-3 describes stays reachable with no textarea edit between (Check text T, fill the checkpoint
name, add the same text T), and would have survived a green suite.

The consequence is a rule, not a caveat: a repair covering N findings needs a targeted break
**per finding**, because a green suite proves only that no pinned path is red, not that each
defect was individually addressed. Both of Phase 2's targeted breaks and both of Phase 3's are
recorded in `plan.md`'s Progress rows (2.7, 2.8, 3.6). Phase 3's were run twice: the first
attempt failed on the wrong assertion and exposed a race in the new fixture, which is how
`parkAppApi`'s `arrived` contract came to wait for the server rather than for the request.

### C-4 — a green spec needs the deliberate-break run as much as an inverted one does

`lessons.md`'s "Pin a live defect with `test.fail()`" states trap 2 for inverted specs: a spec
that fails on a typo'd locator is indistinguishable in the report from one that fails on the
defect. The mirror holds for a **green** spec written inside the change that repairs the
defect, and it bit twice here — both times in the same file, both times invisibly.

1. `getByRole`'s `name` is a case-insensitive **substring** match by default. `{ name: "base" }`
   also matched the "Add base deck" section heading, which renders _precisely when_ the
   checkpoint is gone — so the assertion that the step disappeared read as if it had not.
   Caught by a real failure, but only because the two strings happened to differ in visibility;
   the reverse pairing would have passed.
2. Parking a request without delivering it to the server left the delete spec vacuous: the
   server kept its step, the second DELETE also answered 204, and no banner could ever render.
   Caught only by reverting the guard and finding the spec still green.

The rule this yields is in `lessons.md`: for a green spec, the deliberate break is not
optional polish — it is the only thing that distinguishes "the guard works" from "the overlap
never happened".
