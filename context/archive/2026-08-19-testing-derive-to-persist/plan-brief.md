# Derive-to-Persist Correctness — Plan Brief

> Full plan: `context/changes/testing-derive-to-persist/plan.md`
> Change intent: `context/changes/testing-derive-to-persist/change.md`
> Test plan: `context/foundation/test-plan.md` §3 Phase 3

## What & Why

Rollout Phase 3 of the test plan closes risks #4 and #5: a diff-mode checkpoint must
persist a list equal to `prior ± delta`, and an unapplicable or unresolved delta line
must be flagged rather than silently dropped. Both are High × Medium and sit on the
newest feature (diff-mode derive) plus the two most-churned logic directories.

Planning found the phase is not the testing-only phase the test plan assumed. **The
server never derives** — it accepts any structurally-valid snapshot alongside any
`deltaText` — so the invariant the plan asks to "verify through the POST→persist path"
does not exist to be verified. This phase creates it, fixes a live silent-corruption
bug both add flows share, and then covers the seam.

## Starting Point

`handleAddStep` derives in the browser and POSTs the result; the route validates shape
(`parseStepInput` → `parseSnapshot`), assigns `position = max+1`, and inserts. It never
reads the prior step and never parses the delta. The pure layer is already well covered
— `derive.test.ts` (8 tests), `add-flow.golden.test.ts` (multiset equality against a
hand-written full-paste oracle, re-run under a permuted resolver), `snapshot.test.ts` —
so the gap is entirely in the wiring, not the derivation.

Four things nothing covers: derive from a snapshot that came back out of `jsonb`;
warnings discarded at save (`handleAddStep` takes only `.snapshot`, and "Check" is
optional, so `- Sol Ring` for an absent card no-ops while `deltaText` records a removal
that never happened); the prior read from client state while the server assigns
position, so a stale tab persists a wrong chain; and `list_text` as a second derived
artifact that can silently disagree with `snapshot`.

## Desired End State

A snapshot that contradicts its own `deltaText` is refused with a message naming the
broken rule. An unapplicable `−` is a 400 with nothing persisted. A raced append is a
409. `+3 <canonicalized name>` persists three copies, not one. A required CI job proves
all of it on every PR, verified by a deliberate-break PR that reports `BLOCKED`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where `prior ± delta` is enforced | Server-side structural check | Makes the invariant real so integration tests can assert it through POST, with no network in the request path. | Plan |
| Verification code | New pure `src/lib/path/verify.ts`, one message per rule | Pure means unit-testable without the harness; distinct messages survive Phase 2's layered-asserter lesson. | Plan |
| Integration oracle | Full paste through the API, as a multiset | A genuinely independent code path, reusing Phase 2's proven oracle. | Plan |
| Unapplicable `−` line | Server rejects with 400 | Satisfies PRD FR-003's "surfaced at save" literally and falls out of the structural check for free. | Plan |
| Stale prior | Optimistic concurrency (`priorStepId` → 409) | Closes the hole at the boundary where a test can reach it. | Plan |
| Shared quantity-join bug | Fix both flows, pin with a canonicalization case | One defect shape in two places; leaving one live would break the diff-equals-full-paste equality Phase 2 pinned. | Plan |
| Resolver fix shape | Additive `matched` map on `ResolutionResult` | Neither existing consumer breaks; the registry gains a row instead of rewriting two. | Plan |
| New `+` cards | Count bound plus `unresolved` prefix check | Both rules are exact and cannot false-positive under canonicalization. | Plan |
| `listText` vs `snapshot` | Asserted in tests, not server-enforced | Catches divergence without freezing a client rendering choice into the wire contract. | Plan |
| Risks covered / excluded | #4, #5 in; #1–#3, #6 closed by Phases 1–2 | Test plan §3 rollout sequencing. | Test plan |
| E2E and component tests | Out | Deliberately deferred per §7 until the logic boundary this phase closes is locked. | Test plan |

## Scope

**In scope:** the exact quantity join in both add flows; a pure derive-to-persist
verifier; server enforcement plus optimistic concurrency on `POST /api/paths/[id]/steps`;
the `derive-persist.int.test.ts` suite; flipping §5's gate row to required; filling
test-plan §6.4 and appending a §6.6 note; a deliberate-break PR.

**Out of scope:** browser E2E and component/render tests (§7); re-testing the pure
engine; server-side re-derivation (no Scryfall in a request path); re-pinning Phase 2's
contracts; mid-path insert/reorder/re-base (PRD non-goal); forcing the pre-save "Check"
in the component.

## Architecture / Approach

```
browser: deriveSnapshot(prior, deltaText) ──POST {snapshot, deltaText, priorStepId}──┐
                                                                                     v
route: requireUser → parsePathId → parseStepInput(400) → ownership(404)
       → prior-step read → concurrency check(409) → verifyDerived(400) → insert
                                                          |
                            pure, resolution-free: parseDeltaList + resolutionKey only
```

The verifier is resolution-free by design. Prior-held keys are fully checkable
(`prior + adds − removes`, untouched cards byte-identical); keys absent from the prior
cannot be matched to typed names — canonicalization is exactly why — so they are bounded
by count, and `unresolved` is checked as a prefix. What the server cannot prove about a
genuinely new `+` line stays the unit layer's job, stated rather than papered over.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Exact quantity join | `matched` map on `ResolutionResult`; both flows join through it; canonicalization unit cases | Touches the preserved full-paste path (FR-007 / risk #6); Phase 2's goldens are the guard |
| 2. Pure verifier | `src/lib/path/verify.ts` + unit tests, wired to nothing | A rule that false-positives on legitimate derive output |
| 3. Enforce at the boundary | Route enforcement, `priorStepId`, client wiring, contract updates | Handler ordering — body validation must stay ahead of the ownership check |
| 4. Integration suite | `derive-persist.int.test.ts`, nine cases, hand-authored oracles | An expectation accidentally built by calling `deriveSnapshot` (tautological oracle) |
| 5. Gate + cookbook + break | §5 row required, §6.4 recipe, §6.6 note, break PR | A suite that reports but does not block; a break that measures the wrong gate |

**Prerequisites:** local Supabase up with `.env.test` populated; `gh` CLI for the break
PR; `main`'s required checks already include `integration` (verify, don't assume).

**Estimated effort:** ~4–5 sessions across five phases; Phase 1 and Phase 4 are the two
substantial ones.

## Open Risks & Assumptions

- **Scryfall's response ordering is the association's fallback.** Pairing a returned
  card to the identifier that fetched it is positional for names the resolver
  canonicalized. Mitigated by degrading to today's `?? 1` behavior whenever the residual
  sets do not line up — an absent entry beats a mis-assigned quantity.
- **Phase 1 may move Phase 2's goldens.** If it does, the diff must be explained line by
  line. If it does *not*, that means the golden fixtures never exercised
  canonicalization — itself worth recording.
- **The 400 on an unapplicable `−` is a real UX change.** A typo that used to no-op now
  blocks the save. Deliberate: PRD FR-003 calls the silent no-op a guardrail violation.
- **The component's own wiring stays unverified.** `handleAddStep` discarding warnings is
  neutralized by the server check rather than tested, because §7 forbids the only layers
  that could test it directly.
- **The new-`+` half of the check is weaker than the unit layer.** A wrong card or
  quantity on a genuinely new `+` line still passes the server. Stated in the plan rather
  than hidden behind the gate's name.

## Success Criteria (Summary)

- A diff checkpoint whose snapshot contradicts its `deltaText` cannot be saved, and the
  refusal says which rule broke.
- A `+3` line whose name Scryfall canonicalizes persists three copies, in both the
  diff-mode and full-paste flows.
- The `integration` job runs `derive-persist.int.test.ts` as a required check, and a
  deliberate-break PR is refused by it rather than merely reported on.
