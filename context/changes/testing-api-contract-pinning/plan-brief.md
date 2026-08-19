# API Contract Pinning + Engine Golden Output — Plan Brief

> Full plan: `context/changes/testing-api-contract-pinning/plan.md`
> Research: `context/changes/testing-api-contract-pinning/research.md`

## What & Why

Test-plan §3 Phase 2. Freeze the `/api/paths/*` request/response shapes and the engine's golden
output so a stale caller (risk #3) or a preserved-flow regression (risk #6) fails **loudly** instead
of silently. The team changes these handlers without confidence (interview Q3), and the additive
diff-mode change shipped behind a "byte-equivalent to full paste" promise that nothing verifies.

## Starting Point

The contract exists but is undeclared: `jsonResponse(data: unknown)` erases the type at the boundary,
so no handler can be typechecked against a shape, and all three client call sites re-assert with an
unchecked `as` cast. The `{error: string}` envelope is declared nowhere and re-declared inline four
times. The current suite pins `201` on the creates — which no consumer reads — while `deltaText`,
server-assigned `position`, the snapshot round-trip, both `204`s, the `{path, steps}` envelope and
every 400 body are pinned by nothing. On the engine side, `diffDecks` is pure and order-stable but
its tests project away prices, images and type lines, and the "byte-equivalent" claim is false as
written: `deriveSnapshot` emits Map order, full paste emits resolver order.

## Desired End State

Every path route's request and response shape is declared in one importable module and asserted
against a written contract table; the four never-covered surfaces are pinned; a realistic snapshot
provably round-trips through POST→persist→GET; the engine has committed goldens at the pure-diff and
add-flow seams; and a deliberate raw-row regression in `POST steps` turns `integration` red and
reports `BLOCKED` on a real PR.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Route scope | All 7 + handler↔SSR-page agreement | Only `GET /api/paths/[id]` is genuinely duplicated by its page, and that copy is the one live drift risk. | Plan |
| Auth scope | `signin` contract only | The whole harness depends on its 302 + cookie shape; a break there fails every suite confusingly. | Plan |
| Type or test | Both — declare the wire types, then pin behavior | Four of the ranked seams become `tsc` errors, which no test can do as cheaply. | Plan |
| Client couplings (#7/#8) | Pin server invariants, document the coupling | Gets the signal at the layer that owns the rule without breaching §7's component-test exclusion. | Plan |
| Test harness | Existing integration harness, new `contract-*.int.test.ts` files | Authentic responses over real HTTP with RLS live, and it rides a job that already blocks `main`. | Plan / change.md |
| Request side | Pinned too — 400 bodies + collapse rules | A `deltaText` key rename returns a cheerful 201 while provenance is lost permanently in an immutable row. | Plan |
| Snapshot round-trip | Realistic: multi-category, unresolved entries, a null price | The null price is the `$NaN` seam; a minimal snapshot exercises neither value-shaped seam. | Plan |
| Oracle for undocumented shapes | Decide each one in the plan and cite it | The assertion's authority must come from a written decision, not the handler (the named anti-pattern). | Research Q1–Q6 → Plan |
| Golden seams | A (`diffDecks`) + C (add-flow equality) | A is free (pure, order-stable, zero mocks); C is the only seam expressing risk #6's actual claim. | Research §6 → Plan |
| Golden format | `toMatchSnapshot` external `.snap` files | Chosen for low authoring cost; guarded by PR review of the first recording, committed `.snap`s, and CI's refusal to write missing snapshots. | Plan |
| "diff ≡ full paste" equality | Multiset, and correct the live claim | It is what the code guarantees and what every user-visible surface depends on; no engine change needed. | Research §4/§7 → Plan |
| Collation | Explicit `"en"` locale in production | Card order can currently differ between a dev machine, CI and a Cloudflare worker — a real bug, and the prerequisite for any trustworthy golden. | Plan |
| Contract holes | Fix the 500 leak + `[id]` UUID validation; file the other three | Pinning the 500 as-is would freeze a leak of table/column/constraint names; the missing validation is what produces those 500s. | Research §5 → Plan |
| CI gate | Reuse the `integration` job | `integration` is already required with `enforce_admins`, so the new §5 row cannot end up aspirational. | Plan |
| Deliberate break | Return the raw row from `POST steps` | Research's #1 seam — it compiles, presents as a flake, and should trip the type layer *and* two test assertions at once. | Plan |
| Registry | Fix the 3 stale descriptions + register the wire contract | The drifts are already identified, so the marginal cost of correcting them alongside the new rows is small. | Research §9 → Plan |

## Scope

**In scope:** a declared wire-contract module + explicitly parameterized `jsonResponse<T>`; one typed
client seam replacing three `as` casts; 500-body redaction with a correlation `ref`; `[id]` UUID
validation; explicit collation locale (2 sites); `astro check` in CI; five contract suites; two
engine goldens; §5/§6.3/§6.6 test-plan updates; registry update; a deliberate-break PR.

**Out of scope:** component and E2E tests (§7); re-testing engine internals (§7); seam B
(`generateUpgradePlan`) goldens; three deferred contract holes (snapshot unknown-key passthrough,
`toPathStep`'s silent fallback, `signup`'s unread `confirmPassword`); `signup`/`signout` and the
`?error=` channel; deleting the dead `GET /api/paths` or de-duplicating the SSR read path; adding a
sort to `derive.ts`/`quantity.ts`; branch-protection changes; any edit to `context/archive/**`.

## Architecture / Approach

Production-first, then pin, then gate. A new types-only `src/lib/api/contract.ts` is the single
declaration site both the server and the React islands import; `src/lib/api/paths.ts` gains
`jsonResponse<T>` / `errorResponse` / `serverError` / `parsePathId`; `src/lib/api/client.ts` gives the
browser one typed request seam. Contract tests then assert the decided-contract table through real
HTTP in the Phase 1 harness, and goldens pin the engine at two pure seams. Tests come *after* the
production changes so they pin the decided contract rather than pinning-then-editing — which would
be the oracle anti-pattern arriving through the back door.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Declare the contract | Wire types + typed helpers, 500 redaction + UUID validation, collation locale, `astro check` in CI, docstring correction | Redacting the 500 body destroys Phase 1's diagnosis rule unless the dev-server log is piped out first |
| 2. Pin `/api/paths/*` + signin | Five contract suites: closed key sets, request-side rules, both `204`s, snapshot round-trip, page agreement | Drifting into handler-mirrored expectations, or the page-agreement check becoming a de facto component test |
| 3. Engine goldens | `diffDecks` + `planAddCost` golden; add-flow multiset equality under a permuted mock | `toMatchSnapshot` records current output — the anti-pattern mechanised unless the first recording is genuinely reviewed |
| 4. Gate, cookbook, registry | §5 gate row, §6.3 recipe, §6.6 notes, registry update, 3 filed findings | Registry claims copied from research instead of verified against code |
| 5. Deliberate-break PR | Proof the gate blocks: red `integration`, `BLOCKED` PR | The typecheck may fail first and mask what the suite would have caught — both outcomes must be recorded |

**Prerequisites:** local Supabase running (`npx supabase start`) with `.env.test` filled from
`npx supabase status`; `gh` CLI authenticated for the Phase 5 PR observation; `main`'s existing
`ci` + `integration` required checks (already in place from Phase 1).

**Estimated effort:** ~4–5 sessions across 5 phases. Phase 2 is the largest (five suites); Phase 3
can run in parallel with Phase 2 since it depends only on Phase 1's collation fix.

## Open Risks & Assumptions

- **`toMatchSnapshot` was chosen over hand-authored literals.** The oracle risk is real: a recorded
  snapshot is the handler's/engine's current output. Three guards mitigate it (PR review of the first
  recording against a hand-computed expectation, committed `.snap` files, CI's refusal to write
  missing snapshots). The guard that depends on a human is #1 — if the first recording is skimmed,
  the golden blesses whatever the engine does today.
- **Closed key sets mean additive API fields fail the suite.** Intentional, but it makes every future
  field addition a deliberate test edit; if that friction proves wrong, loosen it consciously rather
  than by deleting assertions.
- **The 500 redaction trades network-tab diagnosis for log diagnosis.** Correlation by `ref` only
  works if the dev-server log actually reaches CI output — verified in Phase 1, and worth re-checking
  if the harness's spawn logic ever changes.
- **The page-agreement test asserts ordering in raw HTML.** Robust against styling, but a markup
  refactor that changes where step names appear could produce a confusing failure.
- **The archived "byte-equivalent" claim stays on disk.** CLAUDE.md makes `context/archive/**`
  immutable, so the correction lives in `src/lib/path/derive.ts`, the registry, and test-plan §6.6.
  A future reader who finds the archived copy first will still be misled.

## Success Criteria (Summary)

- A change to any `/api/paths/*` shape — request or response — fails either `npm run typecheck` or a
  named contract assertion, with a message that identifies the offending key.
- A regression in the resolve/diff/cost engine or in the full-paste add flow fails a committed
  golden, and nobody can `-u` past it in CI.
- The gate is proven, not assumed: a deliberate raw-row break reports red `integration` and
  `BLOCKED` on a real PR.
