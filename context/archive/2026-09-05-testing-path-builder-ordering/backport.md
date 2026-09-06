# Backport list — corrections `/10x-test-plan` should carry forward

Four claims in `context/foundation/test-plan.md` (and one in the guide that generated it) that
this change **disproved by building the thing they described**. Each item states the claim, the
evidence against it, and what should replace it.

The §6.7 and §8 halves of these corrections landed with this change (see its Phase 4 commit).
What is listed here is the part that belongs to a **refresh** rather than to a rollout phase:
§2's and §3's own text, and one item that lives outside this repo in the orchestrator's guide.
A refresh should cite this file rather than re-deriving any of it.

---

## B-1 — §2's anti-pattern row for risk #9 names a debounce the path builder does not have

**The claim.** §2 Risk Response Guidance, row #9, "Anti-pattern to avoid":

> driving the overlap by typing — the debounce coalesces keystrokes into a single run, so the
> second run never starts and the test passes without overlapping anything

**The evidence.** That sentence is correct for risk **#8** and was inherited verbatim. The
comparer debounces at `DeckComparer.tsx:17` (`DEBOUNCE_MS = 700`) with an effect cleanup that
cancels the pending timer on every keystroke (`:99-101`) — which is exactly why `compare()`
routes through the Calculate CTA. The path builder has **no debounce at all**: both Check flows
are started by an explicit button click (`PathEditor.tsx:778`), the add flow by another
(`:792`), and the component says so in its own comment at `:386` ("the path builder has no
debounce"). Typing cannot coalesce two runs here because typing never starts one.

**Why it matters.** The row is the first thing `/10x-research` and `/10x-plan` read for this
risk, and it points at a hazard that does not exist while staying silent about the one that
does. Both specs written for #9 had to establish overlap by parking a request and driving the
second run through a _different_ affordance — and the genuine trap is subtler: the Add button
is **not** disabled during an in-flight Check (`:790` gates on `addState === "resolving"`
alone), which is the only reason the F-2 overlap is reachable by a user at all.

**Replace with.** Something like: _"a test that never actually overlaps two runs — the path
builder is button-driven with no debounce, so the trap is not typing but asserting the overlap
instead of establishing it: park the first resolve and `await parked.arrived` before starting
the second, and prove the first ran to completion before asserting it was dropped."_

---

## B-2 — impl-review finding F10's "four divergences, two live" mis-count is still in the guide

**The claim.** Phase 4's impl-review recorded four verified divergences across the hand-copied
stale-response guards, "two of them still live". §2 row #9's Source cell repeats it verbatim,
and it is what sized risk #9.

**The evidence.** `lessons.md:57-88` actually enumerates **five**: four numbered ones plus a
fifth introduced mid-sentence inside bullet 4 ("A fifth divergence sits next to it"), which is
the empty-box case — and that fifth one is the risk's headline scenario, F-1. Counting the
guards as this change had to, the live set is larger again: F-1 through F-4 in `findings.md`
are all live, plus F-5's three flows that carry no guard at all (`handleDeleteLast` `:433-444`,
`handleRename` `:447-466`, `handleDeletePath` `:469-479`), which the "five hand copies" framing
does not count because they are the copies nobody made.

**Why it matters.** Two-of-four is what made #9 look like a Medium-likelihood row with a
bounded surface. The true shape — every divergence live, on a component with six async
state-writing flows and one shared helper missing — is the argument for the refactor in F-5's
note, and a refresh that re-reads the old count will keep deferring it.

**Replace with.** The count from `findings.md`, stated as a range rather than a tally: five
recorded divergences of which four are live defects (F-1 through F-4), plus three flows with no
guard at all (F-5). Note also that the fifth divergence is buried inside bullet 4 rather than
numbered — worth fixing in `lessons.md`'s reader, not the file, which is append-only.

---

## B-3 — §3's order rationale claims a cheapness this phase disproved

**The claim.** §3's order rationale placed Phase 5 last partly because its whole cost was the
test itself: "no runner to add, no CI job to write, no branch-protection change to make."

**The evidence.** True for Phase 4, whose surface mounts at `/` and needs no session. False for
risk #9. `src/lib/supabase.ts:7-9` returns `null` without keys, so `src/middleware.ts:20-24`
redirects **every** `/paths*` request regardless of cookies — the surface is unreachable without
a real Supabase stack. And the env cannot simply be injected: `@astrojs/cloudflare` parses
`.dev.vars` and calls `Object.assign(process.env, parsed)` at `dist/index.js:292-303`, after
config resolution, so a contributor's gitignored file outranks `webServer.env`. Phase 1 of this
change was therefore entirely harness work — `tests/e2e/global-setup.ts`, `tests/e2e/dev-vars.mjs`,
a `setup` project writing `storageState`, `tests/e2e/fixtures/auth.ts`, and three new steps in
the `e2e` CI job.

**Why it matters.** The rationale is a **sequencing** claim, and it was used to defer this phase
to last on the grounds that it was cheap. It was the most expensive of the two browser phases.
A future refresh ordering phases by "which needs no infrastructure" will make the same mistake
unless the rationale records that a surface behind middleware is never in that category.

**Replace with.** Keep the ordering, correct the reason: Phase 5 went last because it depended
on Phase 4 having established the browser harness, **not** because it was free. Add the general
rule — a browser phase's cost is set by whether its surface is behind the session gate, and
§6.7 items 16–24 now record what that costs. Note the branch-protection half of the claim did
survive: the `e2e` job kept its name, so no required-check change was needed.

---

## B-4 — risk #9 is documented, not protected, and §2's vocabulary has no word for that

**The claim.** §3's status vocabulary is a fixed parser literal list (`not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`), and §2's structure
assumes a risk moves to the protected table once the phase answering it reads `complete`.

**The evidence.** Phase 5 is `complete` and risk #9 is **not** protected. Its specs assert the
correct behavior and are annotated `test.fail()`, because the risk turned out to be four live
defects (F-1 through F-4) rather than a forecast. The suite is green, the phase did everything
it set out to do, and the failure the risk describes still happens on every run. §2 row #9's
"Answered by" cell and the paragraph added beneath the open table now say this in prose, but
there is no vocabulary for it — a reader scanning §3 for `complete` will infer protection that
does not exist.

**Why it matters.** This is the first phase in the rollout to find its risk already broken;
every earlier one found its risk defended and left green specs behind. The distinction between
"a phase finished" and "a risk is closed" was implicit while the two always coincided, and it
will recur the next time a risk is promoted on a divergence verified in code.

**Replace with.** Either a `documented` status value in §2's Answered-by column (not §3's — that
vocabulary is a parser literal and renumbering it is a breaking change), or a standing rule in
§2's preamble: _a risk leaves the open table only when a **passing** spec proves the failure
cannot happen; a `test.fail()` spec keeps it here, pointed at the finding, until the annotation
comes off._ The second is cheaper and needs no schema change.
