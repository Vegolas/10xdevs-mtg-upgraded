# Findings deferred by `testing-comparer-failure-surfacing`

Live defects this change **found and deliberately did not fix**, so they do not evaporate
with the change folder. Each entry names a file and line verified against the code on
2026-08-31, the observed behavior, why it was deferred, and where it should land.

This was a **coverage phase, not a bug-fix phase**: risks #7 and #8 both pass green on the
current code, and a spec for any finding below would fail red today — which would change
what the phase is. The three share a shape the risk map already names for #7: the app makes
a **confident statement that is not true**, rather than failing visibly. F-1 and F-2 are
user-facing; F-3 is a testability gap that made one of this phase's own assertions
impossible to write.

---

## F-1 — unparseable input reads as empty input

**Where**: `src/lib/deck/plan.ts:90-92` (the short-circuit) and
`src/components/deck/DeckComparer.tsx:81-82` (`status: "empty"` → `setView({status:"idle"})`),
rendering `src/components/deck/DeckComparer.tsx:205`.

**Observed**: `generateUpgradePlan` returns `{status: "empty"}` when either deck parses to
zero **entries**, and discards `parsed.malformed` entirely at that point. `parseDeckList`
(`src/lib/deck/parse.ts:109-127`) routes a count-only line — `4`, `4x` — into `malformed`
rather than `entries`, so a deck whose every line is malformed parses to zero entries with a
non-empty `malformed` array. `runPlan` maps `empty` to the `idle` view, and `idle` renders
_"Paste a deck list into each box. Your upgrade plan builds automatically once both sides
have cards."_ — while both boxes visibly contain the user's text.

The information exists and is thrown away: the _same file_ folds `parsed.malformed` into
`unresolved` on the success path (`plan.ts:69`), tagged `reason: "malformed"`. Only the
short-circuit drops it.

**Impact**: the user is told they pasted nothing when they pasted something the parser could
not read. There is no path from the message to the actual problem — the advice is to do the
thing they already did. Reachable from ordinary input (a stray count-only line in an
otherwise-empty box), not just adversarial input.

**Why deferred**: the fix is a **new rendered state**, not a wiring correction — `empty` and
`idle` would have to stop being the same view, and someone has to decide what the third state
says. That is a product decision and a UI change, and this phase's remit is to prove the two
existing surfaces render, not to add a third.

**Suggested owner**: whoever next opens the comparer surface. Recommended fix: return
`{status: "empty", malformed}` and give `DeckComparer` a distinct branch that names the lines
it could not read — the `UnresolvedNotice` shape already exists and already handles
`reason: "malformed"`.

---

## F-2 — "these lists are identical" is claimed when the differing cards failed to resolve

**Where**: `src/components/deck/DeckComparer.tsx:254-257`.

**Observed**: the branch reads `view.plan.remove.length === 0 && view.plan.add.length === 0`
and prints _"These lists are identical — nothing to add or remove. Every card is shared
below."_ `diffDecks` only ever sees cards that **resolved**, so if every card that actually
differs between the two decks fails to resolve, both arrays are legitimately empty and the
app makes an affirmative false claim about two lists that are not identical.

The unresolved notice **does** render above it (`DeckComparer.tsx:238-242`, gated on
`unresolved.length > 0`), so this is a contradiction on screen rather than silence: a notice
saying _N cards couldn't be matched_ directly above a sentence saying the lists are identical.
That is materially better than the silent version and is why this is not urgent — but a reader
who trusts the sentence is misled, and the sentence is the more confident of the two.

**Impact**: a false statement about the user's own data, on the one surface risk #7 exists to
protect. It is the same failure class as #7 — a result that reads as complete — arriving
through the diff rather than through the resolver.

**Why deferred**: a spec for it would be **red today**, which is precisely the line this phase
does not cross. The fix is also a judgement call rather than a one-liner: the honest condition
is "no differences _and_ nothing unresolved", but what to render in the remaining case
(differences exist, none of them resolved) is a new message someone has to write.

**Suggested owner**: same surface owner as F-1. Recommended fix: gate the identity claim on
`view.unresolved.length === 0` as well, and render a distinct line when the diff is empty only
because the differing cards were never resolved. Add the E2E case at the same time — the
fixture is one line off `mockScryfallPartial`.

---

## F-3 — add and remove are indistinguishable to the accessibility tree in merged view

**Where**: `src/components/deck/MergedRow.tsx:43-115` — the kind glyph at `:54-56`
(`aria-hidden="true"`), the colour classes it carries (`KINDS`, `:15`), and the only textual
kind marker at `:103` (`kind === "stay"` → `" · stays"`).

**Observed**: a merged-view row signals whether a card is being **added**, **removed** or
**kept** through exactly two channels — a glyph span that is `aria-hidden="true"`, and a CSS
colour on the glyph and the price. Neither reaches the accessibility tree. Only `stay` carries
text. So an add row and a remove row for the same card name produce the **same** accessible
output: name, category, a signed price string. `formatSignedUsd` does carry the sign, but it
is a price, not a statement of intent, and it renders `—` when the card has no price at all.

**Impact**: this is a **testability finding, not a confirmed user-facing defect** — say so
plainly. A screen-reader user is plausibly affected, but that claim has not been verified with
an actual screen reader and this change is not the place to assert it. What _is_ verified is
the test consequence: risk #7's partial-resolution spec had to avoid merged view entirely and
assert against the columns view instead, because no accessibility query can distinguish the two
kinds. A future spec that needs to make a claim about merged view has the same problem, and
`§7`'s exclusion of component-render testing means no cheaper layer covers it either.

**Why deferred**: it is an a11y improvement to production markup with no failing test behind
it, which is out of scope for a coverage phase — and unlike F-1 and F-2 it does not produce a
false statement, it produces an absent one.

**Suggested owner**: the UI-polish pass §7 already names as the trigger for re-evaluating the
component-render exclusion. Recommended fix: give each row a visually-hidden kind word (or an
`aria-label` on the `<li>`) so `getByRole("listitem", {name: /add/})` becomes possible; verify
with a screen reader before claiming the user-facing half.
