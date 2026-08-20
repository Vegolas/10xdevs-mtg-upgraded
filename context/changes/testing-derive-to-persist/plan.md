# Derive-to-Persist Correctness Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md` §3 — the last phase of the
logic-boundary rollout. It closes risks #4 (a diff-mode checkpoint persists a list
that is not `prior ± delta`) and #5 (an unapplicable or unresolved delta line is
silently dropped at persist).

Research done while planning changed the phase's shape: **the server never derives.**
The correctness claim the test plan asks to verify "through the POST→persist path"
is, today, entirely a client-side promise the server does not check. So this is not
a test-only phase. It makes `prior ± delta` a server-enforced invariant, fixes a
live silent-corruption bug both add flows share, and then covers the seam with an
integration suite. Production-first, exactly as Phase 2 was.

## Current State Analysis

**Derive happens in the browser; the server is a structural gatekeeper only.**
`handleAddStep` (`src/components/path/PathEditor.tsx:214-300`) calls
`deriveSnapshot(prior, listText)` client-side, then POSTs
`{name, listText: <rendered derived list>, snapshot, deltaText: <raw delta>}`.
`POST /api/paths/[id]/steps` (`src/pages/api/paths/[id]/steps.ts:18-81`) validates
the body with `parseStepInput` → `parseSnapshot` (shape only), assigns
`position = max+1`, and inserts. It never reads the prior step, never parses
`deltaText`, and never compares the two. **Any structurally-valid snapshot is
accepted alongside any `deltaText`.**

**The pure layer is already strong — and Phase 2's oracle is the good one.**
`src/lib/path/derive.test.ts` has 8 tests including `prior ± delta` and
"warns not-in-prior without persisting it". `src/lib/path/add-flow.golden.test.ts`
runs diff-mode against a hand-written full-paste equivalent — a genuinely
independent oracle — pins the equality as **multiset**, and re-runs it with the
mock's `resolved` array permuted. `src/lib/path/snapshot.test.ts` covers
serialize/parse and its rejections. Re-deriving any of that at the integration
layer is the duplication test-plan §1 principle 1 forbids.

**Four gaps nothing covers.**

1. **Derive from a *persisted* prior.** Phase 2's `contract-steps.int.test.ts`
   round-trips a hand-authored literal (`realisticSnapshot()`), never a derived
   snapshot, and never a derive whose prior came back out of `jsonb`. A chained
   path re-round-trips the same card objects at every step; nothing exercises that.
2. **Unapplicable lines do not block or flag the save.** `handleAddStep` calls
   `deriveSnapshot` fresh at save and takes only `.snapshot` (line 246) —
   `result.warnings` is discarded. "Check" is optional; Add is disabled only while
   resolving (line 778). So `- Sol Ring` for a card the prior list does not hold
   silently no-ops while `deltaText` is persisted **claiming a removal that never
   happened**. PRD FR-003 / US-02 promise surfacing "before/**at** save"; only
   "before" exists, and only if the user opts in.
3. **The prior is client state, not the server's last step.** `steps.at(-1)?.snapshot`
   (line 237) versus server-side `position = max+1` (line 59). A stale tab derives
   from the wrong predecessor and the server appends it happily, leaving a persisted
   chain containing a step that is not `prior ± delta` relative to its actual
   predecessor.
4. **`list_text` is a second derived artifact.** `postListText = deckCardsToText(result.snapshot.cards)`
   (line 247). Nothing asserts it re-parses to the same holdings as `snapshot`, so
   the two persisted columns can silently disagree.

**A live silent-corruption bug, shared by both add flows.** `attachQuantities`
(`src/lib/deck/quantity.ts:33`) does `quantityByKey.get(resolutionKey(card.name)) ?? 1`
against a map keyed by the **typed** names; `deriveSnapshot` (`src/lib/path/derive.ts:163-164`)
does the same with `newByKey`. `resolutionKey` is only front-face-lowercase
(`src/lib/card-data/resolve.ts:34`), but Scryfall's `name` identifier matching is
more forgiving — `Jace the Mind Sculptor` resolves to `Jace, the Mind Sculptor`,
a different key. Both flows then fall back to **quantity 1**, with no warning and no
`unresolved` entry. That is risk #4's exact failure mode, and the `?? 1` fallback is
documented as deliberate, which is why it has never read as a bug.

**Phase 2's oracle is blind to it.** Full-paste equivalence compares two flows that
share the defect, and `add-flow.golden.test.ts`'s mock returns cards whose names
match the typed names exactly. Any case exercising canonicalization needs a
hand-authored oracle.

### Key Discoveries

- Only two consumers read `resolution.resolved`: `src/lib/deck/plan.ts:66` and
  `src/lib/path/derive.ts:162`. An additive resolver field ripples no further.
- `resolveCards` already knows the association it does not expose: `uniqueByKey`
  (`resolve.ts:82`) maps query key → original spelling, and `not_found` echoes the
  identifiers it could not match (`ScryfallNotFound.name`, `scryfall.ts:69-71`).
- `parseDeltaList` (`src/lib/path/delta.ts:49`) is pure and import-safe from a route
  handler — no card-data, no I/O. Server-side delta re-parsing costs nothing.
- `derive.ts:158` carries `prior.unresolved` forward verbatim as a prefix, then
  appends new misses. That ordering is an invariant nothing currently checks.
- Contract-surface registry rows that this change touches:
  `docs/reference/contract-surfaces.md` lines 14 (`ResolutionResult`),
  33 (`attachQuantities`), 99 (`StepCreateRequest`).
- The integration harness serializes everything (`fileParallelism: false`,
  `vitest.integration.config.ts`) and boots one `astro dev` against local Supabase.
  A test-process `vi.mock("@/lib/card-data", importOriginal)` cannot collide with the
  app server, because the app server never resolves cards.

## Desired End State

A diff-mode checkpoint whose snapshot contradicts its own `deltaText` is rejected by
the server with a message naming which rule broke. An unapplicable `−` line is a 400,
not a silent no-op, and nothing is persisted. An append that derived from a stale
prior is a 409. `+3 <name Scryfall canonicalizes>` persists as three copies, not one.
And a required CI job proves all of it on every PR — verified by a deliberate-break
PR that reports `BLOCKED` next to `mergeable`.

Verify by: `npm run test:integration` green locally; the `integration` job green in
CI with `derive-persist.int.test.ts` in it; the break PR refused by required checks.

## What We're NOT Doing

- **No browser-level E2E and no component/render tests.** Deliberately deferred per
  test-plan §7. This phase closes the logic boundary that §7 says must be locked
  *before* E2E is re-evaluated; it does not open that door.
- **No re-testing of the pure engine.** `derive.test.ts`, `add-flow.golden.test.ts`
  and `snapshot.test.ts` own `deriveSnapshot`'s branches, the multiset equality, and
  the serialize/parse guard. This phase tests the **wiring**, not the derivation. The
  one exception is Phase 1, which adds unit cases because it changes the join itself.
- **No server-side re-derivation.** The server never calls Scryfall in a request
  path. Verification is structural and resolution-free by construction.
- **No re-pinning of Phase 2's contracts.** `contract-steps.int.test.ts` is edited
  only where this change alters the contract (the new request field, the new error
  bodies), never re-asserted.
- **No mid-path insert / reorder / re-base.** PRD non-goal; the 409 rule assumes
  append-only.
- **No fix for `PathEditor`'s optional "Check".** Forcing the preview is a component
  change in the one layer §7 forbids testing. The server 400 makes it unnecessary:
  an ignored warning now fails the save.
- **Risks #1, #2, #3, #6 are closed by Phases 1–2** and are not re-opened, beyond
  re-recording the goldens Phase 1's change legitimately moves.

## Implementation Approach

Five phases, production-first, each independently verifiable.

Phase 1 fixes the quantity join in the card-data layer so both add flows join
exactly. It is deliberately first: it is the only phase that touches the preserved
full-paste path (FR-007 / risk #6), and Phase 2's committed goldens are what guard
it — better to take that risk while the goldens are the only thing that can go red.

Phase 2 writes the verifier as a pure module wired to nothing, so it cannot break
production and is unit-testable without the harness (the `request.ts` precedent).

Phase 3 wires it into the route together with optimistic concurrency, which is where
the contract actually changes.

Phase 4 writes the integration suite — the phase's headline deliverable — and Phase 5
turns it into a gate and proves the gate blocks.

The verifier's rule set is resolution-free by design. Keys the prior list already
holds are fully checkable: expected quantity is `prior + adds − removes`, and a card
with no delta line must come back byte-identical. Keys absent from the prior list
cannot be matched to typed names at all (canonicalization is exactly why), so they
are bounded by count only, and `unresolved` is checked as a prefix. What the server
cannot prove about a genuinely new `+` line stays the unit layer's job — stated
plainly rather than papered over.

## Critical Implementation Details

**The resolver's card→query association depends on response ordering, so it must
degrade rather than guess.** Scryfall returns found cards in `data` and echoes
unmatched identifiers in `not_found`; pairing a returned card back to the identifier
that fetched it is only positional. Build `matched` in two passes: first, any returned
card whose own `resolutionKey` equals a sent identifier's key pairs directly (the
common case, no ordering dependency); then pair the residual cards with the residual
identifiers positionally, **and only when both residual sets are the same size**.
If they are not, leave those cards out of `matched` and let the existing `?? 1`
fallback stand. A mis-assigned quantity would be worse than today's bug; an absent
entry is exactly today's behavior.

**Body validation must keep running before the ownership check.** `steps.ts`'s
docstring pins that ordering as decided contract: a malformed body aimed at another
owner's path answers 400, not 404. The verifier needs the prior step, which is an
owner-scoped read — so it runs *after* the ownership check, and its rejections are
therefore visible only to the owner. That is correct and deliberate: a verifier
message would otherwise leak whether someone else's path exists.

## Phase 1: Exact quantity join

### Overview

Give the resolver a query-key → card mapping and join through it in both add flows,
so a canonicalized name keeps the quantity the user typed.

### Changes Required:

#### 1. Resolver result shape

**File**: `src/lib/card-data/types.ts`

**Intent**: Expose the association `resolveCards` already computes internally so
callers can join quantities exactly instead of guessing by name.

**Contract**: `ResolutionResult` gains `matched: Map<string, Card>`, keyed by the
**caller's** `resolutionKey(typed name)` — not the canonical card's key. `resolved`
and `unresolved` are unchanged, so both existing consumers keep compiling. Docstring
must state which field a caller should reach for: `matched` to join by input,
`resolved` to render.

#### 2. Build the map

**File**: `src/lib/card-data/resolve.ts`

**Intent**: Populate `matched` on both the cache-hit and the fetch path, degrading to
omission rather than a positional guess when the association is ambiguous.

**Contract**: Cache hits pair directly (the loop at `resolve.ts:96` already has the
query key in hand). Fetched cards use the two-pass rule in Critical Implementation
Details. Every key in `matched` is a key from `uniqueByKey`; `matched.size` never
exceeds `resolved.length`. `sessionCache` behavior is unchanged.

#### 3. Full-paste join

**File**: `src/lib/deck/quantity.ts`

**Intent**: Join through `matched` so `+3`-style counts survive canonicalization,
keeping the current fallback only for cards `matched` does not cover.

**Contract**: `attachQuantities` takes the resolution result (or the `matched` map)
in addition to what it takes today. Quantities still sum per key so duplicate lines
and DFC spellings collapse; the `?? 1` fallback stays for genuinely unmatched cards.
Update the registry row at `docs/reference/contract-surfaces.md:33`.

#### 4. Derive join

**File**: `src/lib/path/derive.ts`

**Intent**: Same fix on the diff-mode side — the `newByKey` lookup at lines 163-164
must find the typed quantity even when the resolved name's key differs.

**Contract**: New `+` cards are added at their listed quantity, looked up via the
query key `matched` supplies rather than `resolutionKey(card.name)`. The docstring's
"multiset equality" paragraph stays true and needs no change.

#### 5. Unit coverage for the canonicalization case

**Files**: `src/lib/card-data/resolve.test.ts`, `src/lib/deck/quantity.test.ts`,
`src/lib/path/derive.test.ts`

**Intent**: Pin the bug that motivated the change — a resolved card whose
`resolutionKey` differs from the typed name's — plus the degrade-not-guess rule.

**Contract**: At minimum: a mocked collection response returning
`Jace, the Mind Sculptor` for a sent `Jace the Mind Sculptor` keeps quantity 3 in
both flows; a residual-size mismatch leaves the card out of `matched` and falls back
to 1; `matched` pairs correctly when a batch mixes found and `not_found` identifiers.

#### 6. Re-record the goldens

**Files**: `src/lib/deck/__snapshots__/diff.golden.test.ts.snap`,
`src/lib/path/__snapshots__/add-flow.golden.test.ts.snap`

**Intent**: The join change may legitimately move golden output; the recorded delta is
the evidence that it moved only where intended.

**Contract**: Re-record only if the existing goldens actually fail. Any diff must be
explained in the PR body line by line — Phase 2's rule that the first recording is
reviewed, not trusted. If the goldens do **not** move, say so explicitly: it means
the fixture never exercised canonicalization, which is itself the finding.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- The new canonicalization cases fail against the pre-fix join (verify by stashing the
  `quantity.ts` / `derive.ts` edits and re-running)

#### Manual Verification:

- Golden snapshot diffs reviewed line by line, each change attributable to the join fix
- A diff-mode checkpoint added in the running app with a canonicalizing name persists
  the typed quantity
- Full-paste add flow behaves identically to before for ordinary lists

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to the next phase.

---

## Phase 2: The pure derive-to-persist verifier

### Overview

A pure module that answers "is this submitted snapshot `prior ± deltaText`?" with a
named reason, wired to nothing.

### Changes Required:

#### 1. The verifier

**File**: `src/lib/path/verify.ts` (new)

**Intent**: Decide, without any I/O or resolution, whether a submitted snapshot is
consistent with the prior snapshot plus the delta text that claims to produce it.

**Contract**: Pure — no Astro, Supabase, or card-data-network imports; `parseDeltaList`
and `resolutionKey` only. Exports a discriminated result over a **closed** reason set,
because Phase 3 maps each reason to its own wire message:

```ts
export type DerivedVerdict =
  | { ok: true }
  | { ok: false; reason: DerivedViolation; detail: string };

export type DerivedViolation =
  | "unapplicable-removal"    // a `-` for a key the prior list does not hold
  | "quantity-mismatch"       // a prior-held key's quantity is not prior ± delta
  | "untouched-card-changed"  // a prior key with no delta line came back altered
  | "unresolved-prefix"       // submitted.unresolved does not start with prior.unresolved
  | "excess-new-cards";       // more new keys than distinct new `+` lines

export function verifyDerived(
  prior: StepSnapshot,
  submitted: StepSnapshot,
  deltaText: string,
): DerivedVerdict;
```

Rules, all resolution-free: for every key the prior holds, expected quantity is
`prior + Σ(+n) − Σ(−n)`, and `≤ 0` means the key must be absent (matching
`derive.ts:139-143`'s clamp); a prior key with no delta line must come back with an
identical `quantity` **and** a deep-equal `card`; a `−` whose key the prior does not
hold is `unapplicable-removal`; `submitted.unresolved` must begin with
`prior.unresolved` element-for-element; keys absent from the prior must number no more
than the distinct new `+` keys. `detail` names the offending card or line so the 400
is diagnosable. Malformed delta lines are **not** violations — `parseDeltaList` already
buckets them and `deriveSnapshot` treats them as no-ops.

#### 2. Unit tests

**File**: `src/lib/path/verify.test.ts` (new)

**Intent**: Cover every reason plus the accept path, including the cases most likely
to false-positive.

**Contract**: One test per `DerivedViolation`; a happy path built from a real
`deriveSnapshot` output (proving the verifier accepts what production produces); and
explicit non-violations: a malformed line, a `−` clamped to zero, a `+` that lands in
`unresolved`, duplicate delta lines for one card, and a full-paste snapshot never
reaching the verifier at all.

#### 3. Barrel + registry

**Files**: `src/lib/path/index.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Make the verifier importable by a route handler and register it as a
load-bearing name.

**Contract**: Export `verifyDerived` and its types from `@/lib/path`. Add a registry
row stating the resolution-free guarantee and that the reason set is closed.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- The verifier accepts the output of a real `deriveSnapshot` call for every fixture in
  `add-flow.golden.test.ts`'s delta table

#### Manual Verification:

- The reason set reads as closed and exhaustive against `deriveSnapshot`'s branches
- No import in `verify.ts` reaches the network, Supabase, or Astro

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to the next phase.

---

## Phase 3: Enforce at the boundary

### Overview

Wire the verifier and optimistic concurrency into `POST /api/paths/[id]/steps`, and
update the contract surfaces that changes.

### Changes Required:

#### 1. Request contract

**Files**: `src/lib/api/contract.ts`, `src/lib/path/request.ts`

**Intent**: Let the client declare which step it derived from, so the server can
refuse an append that raced another one.

**Contract**: `StepCreateRequest` gains `priorStepId?: string | null`. `StepInput`
carries it through `parseStepInput` with the same collapse rule `deltaText` uses
(absent, blank, or non-string → `null`). Required when `deltaText` is non-null;
ignored for full paste. `position` stays server-owned.

#### 2. Route enforcement

**File**: `src/pages/api/paths/[id]/steps.ts`

**Intent**: For a diff-authored step, load the prior step, confirm it is the one the
client derived from, and verify the submitted snapshot against it before inserting.

**Contract**: Ordering is load-bearing and must be exactly: `requireUser` →
`parsePathId` → `parseStepInput` (400) → ownership check (404) → prior-step read →
concurrency check (409) → `verifyDerived` (400) → insert. Body validation stays ahead
of the ownership check per the existing docstring; the verifier runs after it, so its
messages never leak another owner's state. New responses, each pinned in the contract
suite:

- 400 `"Diff checkpoint needs a previous step"` — `deltaText` set on an empty path
- 400 `"Diff checkpoint must name the step it derives from"` — `deltaText` set,
  `priorStepId` absent
- 409 `"Path changed since you started"` — `priorStepId` is not the current last step
- 400, one message per `DerivedViolation`, each naming its rule

Full-paste POSTs (`deltaText === null`) skip the prior read entirely — unchanged
behavior and no extra query.

#### 3. Client wiring

**File**: `src/components/path/PathEditor.tsx`

**Intent**: Send `priorStepId` and make the new failures readable instead of surfacing
as a bare status.

**Contract**: `handleAddStep` sends the id of the step it read `prior` from (line 237's
`steps.at(-1)`). A 409 gets its own message telling the user to reload; the verifier's
400s surface `result.error` from the body via the existing `result.fromBody` branch.
No change to the derive call, the preview, or the button's enabled rule.

#### 4. Contract suite + registry updates

**Files**: `tests/integration/contract-steps.int.test.ts`,
`tests/integration/helpers/paths.ts`, `docs/reference/contract-surfaces.md`

**Intent**: Keep Phase 2's pinned contract honest about the new field and statuses,
without re-asserting what it already covers.

**Contract**: Add rows for `priorStepId`'s collapse behavior and the new status/body
pairings. `addStep` sends no `deltaText`, so it stays a full-paste helper and needs no
`priorStepId` — confirm the existing suite still passes untouched. Update the
`StepCreateRequest` registry row (line 99).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Integration tests pass: `npm run test:integration`
- The pre-existing contract and ownership suites pass with no assertion changed other
  than the deliberate additions

#### Manual Verification:

- A diff checkpoint with an unapplicable `−` line is refused in the running app, with
  a readable message, and no step appears
- Two browser tabs on the same path: the second append is refused with the reload
  message rather than persisting a wrong chain
- An ordinary full-paste checkpoint still saves with no extra latency

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to the next phase.

---

## Phase 4: The derive-to-persist integration suite

### Overview

The phase's headline deliverable: cover the whole seam through real HTTP against a
real database, with an oracle that is not the function under test.

### Changes Required:

#### 1. The suite

**File**: `tests/integration/derive-persist.int.test.ts` (new)

**Intent**: Prove a derived snapshot survives derive → POST → `jsonb` → GET as the
same holdings, that a chain of derives does not drift, and that every rejection rule
actually rejects and persists nothing.

**Contract**: The `.int.test.ts` infix lands it in the already-required `integration`
job — no new job and no branch-protection change (Phase 2's cheap-gate lesson). Mocks
only the card-data edge in the test process, via the `vi.mock("@/lib/card-data", importOriginal)`
pattern with `resolutionKey` kept real; the app server never resolves, so there is no
cross-process concern. Cases:

- **Derive from a persisted prior.** Create a path, POST a full-paste base, GET it
  back, `deriveSnapshot` from the *returned* snapshot, POST, GET again. The persisted
  holdings equal an independently-built expected list.
- **Full-paste equivalence as the oracle.** POST the derived step to path A and a
  full-paste step with the hand-written equivalent list to path B; the two persisted
  snapshots hold the same `(card, quantity)` multiset. Never `toEqual` on the arrays —
  `jsonb` does not preserve key order and the guarantee is multiset (see
  `helpers/snapshot.ts`'s note and test-plan §6.6).
- **A three-step chain.** base → derive → derive, each from the previous step's
  *persisted* snapshot; the final holdings equal the composed delta applied once.
- **`unresolved` carry-forward.** A prior carrying misses, plus a `+` that fails to
  resolve: the persisted `unresolved` starts with the prior's entries verbatim and
  appends the new miss.
- **`listText` agrees with `snapshot`.** Parse the persisted `list_text` and compare
  its holdings to the persisted snapshot's. Asserted, not enforced — a mismatch is a
  test failure, not a 400.
- **Canonicalization, hand-authored oracle.** A `+3` line whose resolved name carries
  a different `resolutionKey` persists three copies. The expected value is written by
  hand, because the full-paste oracle shares the defect Phase 1 fixed and cannot see
  this class.
- **Unapplicable `−` → 400, nothing persisted.** Assert the status and body via
  `assertStatus`, then `countSteps` unchanged via the service-role read-back.
- **Out-of-order append → 409, nothing persisted.** Two appends both claiming the same
  `priorStepId`; the second is refused and the chain is unchanged.
- **A contradicting snapshot → 400 per rule.** Hand-build a snapshot that violates each
  `DerivedViolation` and confirm the message names that rule. Phase 2's lesson applies:
  a layered check reports its outermost violated rule, so each break must be narrow
  enough to leave the earlier rules satisfied, or the expected message is wrong.

Every status assertion routes through `tests/integration/helpers/http.ts#assertStatus`
— never a bare status comparison (Phase 1's durable rule). Unique names per test
(timestamp suffix) so re-runs and the serialized worker cannot collide.

#### 2. Fixture helper

**File**: `tests/integration/helpers/derive.ts` (new)

**Intent**: One place for the prior/delta/expected fixtures and the card-data mock
shape, so each test reads as a scenario rather than as setup.

**Contract**: Factories return fresh objects per call (the `realisticSnapshot()`
precedent). Exposes the hand-written full-paste equivalent alongside each delta, so the
oracle and the delta cannot drift apart. Register in `contract-surfaces.md`'s
test-helper table next to `realisticSnapshot`.

### Success Criteria:

#### Automated Verification:

- Integration tests pass: `npm run test:integration`
- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Each rejection case fails with the expected rule's message, not an outer guard's

#### Manual Verification:

- Every assertion's expected value traces to the hand-written oracle or the full-paste
  path — no expectation built by calling `deriveSnapshot`
- A deliberate one-line break in `verify.ts` makes the intended case red locally

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to the next phase.

---

## Phase 5: Gate, cookbook, and the deliberate-break check

### Overview

Turn the suite into an enforced gate, fill the test plan's cookbook, and prove on a
real PR that the red is load-bearing.

### Changes Required:

#### 1. Gate row

**File**: `context/foundation/test-plan.md` (§5)

**Intent**: Flip `derive-to-persist integration` from "required after §3 Phase 3" to
required, with the command that enforces it named.

**Contract**: The row must name the job (`integration`) and the command
(`npm run test:integration`). Confirm the required-checks list on `main` already
contains `integration` — if it does, state that no branch-protection change was needed;
if it does not, the gate is not enforced and that must be fixed here. Phase 2's lesson:
"the types will catch it" — or "the suite will catch it" — is a claim about a CI step.

#### 2. Cookbook + phase note

**File**: `context/foundation/test-plan.md` (§3 status, §6.4, §6.6, §8)

**Intent**: Replace the §6.4 TBD stub with the real recipe and record what this phase
taught.

**Contract**: §6.4 documents the harness entry point, the mock seam, the
oracle-independence rule, and the multiset caveat. §3's Phase 3 row moves to
`complete`. §6.6 gains a note covering: the server-never-derives finding, the shared
quantity-join bug and why full-paste equivalence was blind to it, and the
degrade-not-guess rule. §8 gets a review date.

#### 3. Deliberate-break PR

**Intent**: Prove the gate blocks rather than merely reports.

**Contract**: Stage a break that reproduces a real seam — the likeliest is reverting the
Phase 1 join fix, which should redden both the unit canonicalization case and the
integration canonicalization case. Run it as a **PR, not locally**. Keep `lint` and
`typecheck` green by hand: `ci` runs lint before typecheck before unit, so an orphaned
import would kill the job at the wrong step and measure the wrong gate. Record
`mergeStateStatus` **next to** `mergeable` — `BLOCKED` alone does not distinguish a
required-check refusal from a merge conflict. Close the PR unmerged; record the
observed job, timing, and failure attribution in §6.6.

### Success Criteria:

#### Automated Verification:

- Full suite green on the change branch: `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run test:integration`
- CI green on the change PR, with `integration` reporting `derive-persist`
- The break PR's `integration` job red, and the failure message names the expected rule

#### Manual Verification:

- The break PR reports `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE`
- Failure attribution is diagnosable from the CI log alone, without reproducing locally
- §6.4 is a recipe a future contributor can follow without reading this plan
- Break PR closed unmerged; no staged break reaches `main`

**Implementation Note**: This is the final phase. After it lands, the change is ready
for `/10x-impl-review` and then `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- `resolve.test.ts` — `matched` on the cache-hit path, the fetch path, a mixed
  found/`not_found` batch, and the residual-size-mismatch degrade
- `quantity.test.ts` / `derive.test.ts` — a canonicalized name keeps its typed
  quantity in both flows
- `verify.test.ts` — one case per `DerivedViolation`, an accept path built from real
  `deriveSnapshot` output, and the explicit non-violations
- Goldens — re-recorded only if the join fix legitimately moves them

### Integration Tests:

- The nine cases in Phase 4, all through real HTTP against local Supabase with RLS live
- Contract additions in `contract-steps.int.test.ts` for `priorStepId` and the new
  status/body pairings

### Manual Testing Steps:

1. Add a diff checkpoint with `- <card not in the prior list>`; expect a refusal with a
   readable message and no new step in the list
2. Add a diff checkpoint with `+3 Jace the Mind Sculptor`; expect three copies persisted
3. Open the same path in two tabs, append in both; expect the second to be refused with
   the reload message
4. Add an ordinary full-paste checkpoint; expect unchanged behavior and no added latency
5. Add a diff checkpoint on a path with no steps; expect the "needs a previous step" 400

## Performance Considerations

The verifier adds one owner-scoped read of the prior step per diff-mode POST and a pure
delta re-parse. Full-paste POSTs are untouched — no extra query. Nothing new enters the
request path over the network, which is the whole reason full server-side re-derivation
was rejected.

## Migration Notes

No migration. `priorStepId` is request-only and never stored; the verifier is
write-path only, so existing rows are unaffected and no backfill is needed. Steps
persisted before this change are not re-validated.

## References

- Test plan: `context/foundation/test-plan.md` (§2 risks #4/#5 and Risk Response
  Guidance, §3 Phase 3, §5 gates, §6.4 stub, §6.6 Phase 1–2 lessons, §7 exclusions)
- Change intent: `context/changes/testing-derive-to-persist/change.md`
- Prior phase (contracts, harness lessons, the multiset correction):
  `context/archive/2026-08-11-testing-api-contract-pinning/`
- Phase 1 (harness + CI gate): `context/archive/2026-06-29-testing-server-boundary-auth/`
- PRD guardrails and FR-003 / US-02: `context/foundation/prd-v3.md:47-53`, `:70-81`
- The seam: `src/components/path/PathEditor.tsx:214-300`,
  `src/pages/api/paths/[id]/steps.ts:18-81`, `src/lib/path/derive.ts:117-181`
- The shared bug: `src/lib/deck/quantity.ts:33`, `src/lib/path/derive.ts:163-164`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Exact quantity join

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Type checking passes: `npm run typecheck`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 The new canonicalization cases fail against the pre-fix join

#### Manual

- [x] 1.5 Golden snapshot diffs reviewed line by line, each change attributable to the join fix
- [x] 1.6 A diff-mode checkpoint with a canonicalizing name persists the typed quantity in the running app
- [x] 1.7 Full-paste add flow behaves identically to before for ordinary lists

### Phase 2: The pure derive-to-persist verifier

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run lint`
- [ ] 2.4 The verifier accepts real `deriveSnapshot` output for every `add-flow.golden` delta-table fixture

#### Manual

- [ ] 2.5 The reason set reads as closed and exhaustive against `deriveSnapshot`'s branches
- [ ] 2.6 No import in `verify.ts` reaches the network, Supabase, or Astro

### Phase 3: Enforce at the boundary

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Type checking passes: `npm run typecheck`
- [ ] 3.3 Linting passes: `npm run lint`
- [ ] 3.4 Integration tests pass: `npm run test:integration`
- [ ] 3.5 Pre-existing contract and ownership suites pass with no assertion changed beyond the deliberate additions

#### Manual

- [ ] 3.6 A diff checkpoint with an unapplicable `−` line is refused in the app, with a readable message and no step added
- [ ] 3.7 Two tabs on one path: the second append is refused with the reload message
- [ ] 3.8 An ordinary full-paste checkpoint still saves with no extra latency

### Phase 4: The derive-to-persist integration suite

#### Automated

- [ ] 4.1 Integration tests pass: `npm run test:integration`
- [ ] 4.2 Unit tests pass: `npm test`
- [ ] 4.3 Type checking passes: `npm run typecheck`
- [ ] 4.4 Linting passes: `npm run lint`
- [ ] 4.5 Each rejection case fails with the expected rule's message, not an outer guard's

#### Manual

- [ ] 4.6 Every expected value traces to a hand-written oracle or the full-paste path — none built by calling `deriveSnapshot`
- [ ] 4.7 A deliberate one-line break in `verify.ts` makes the intended case red locally

### Phase 5: Gate, cookbook, and the deliberate-break check

#### Automated

- [ ] 5.1 Full suite green on the change branch: lint, typecheck, unit, integration
- [ ] 5.2 CI green on the change PR, with `integration` reporting `derive-persist`
- [ ] 5.3 The break PR's `integration` job red, with the failure message naming the expected rule

#### Manual

- [ ] 5.4 The break PR reports `mergeStateStatus: BLOCKED` with `mergeable: MERGEABLE`
- [ ] 5.5 Failure attribution is diagnosable from the CI log alone
- [ ] 5.6 §6.4 is a recipe a future contributor can follow without reading this plan
- [ ] 5.7 Break PR closed unmerged; no staged break reaches `main`
