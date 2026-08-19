# Findings deferred by `testing-api-contract-pinning`

Contract holes and duplications this change **found and deliberately did not fix**, so they
do not evaporate with the change folder. Each entry names a file and line verified against
the code on 2026-08-18, the observed behavior, why it was deferred, and where it should
land.

The three holes share a shape: all are **silent** degradations at a boundary. None makes a
test fail today, and none has a user-visible symptom until data is already wrong, which is
exactly why they need to be written down rather than remembered.

---

## F-1 — `parseSnapshot` lets unknown keys inside a `card` persist forever

**Where**: `src/lib/path/snapshot.ts` — `isCard` (`:30–44`), `serializeSnapshot` (`:75–83`,
the `card: { ...entry.card }` spread at `:78`), `parseSnapshot` (`:91–110`, the
`return { cards, unresolved }` at `:109`).

**Observed**: `isCard` checks the presence and type of the six `Card` fields; it does not
check for _absence_ of anything else. `parseSnapshot` then returns the caller's own arrays
unchanged, and `serializeSnapshot` rebuilds each entry with a spread rather than a field
list. So a POSTed snapshot carrying
`{card: {name, typeLine, category, imageUrl, priceUsd, priceEur, evilKey: "…"}, quantity}`
passes validation, is written to the `jsonb` column with `evilKey` intact, and comes back
out of `parseSnapshot` with `evilKey` still there. `path_steps` rows are immutable by design
(the app only ever appends a checkpoint or deletes the last one), so anything that gets in
stays in.

The docstring at `:70–73` claims the rebuild "keeps the stored payload to exactly the fields
`parseSnapshot` validates and round-trips." That is the intent; the spread does not
implement it.

**Impact**: low today — nothing reads unknown keys, and the write path is our own client. It
is a data-durability hazard rather than a live bug: the row cannot be migrated away from,
and a future `Card` field could collide with a key some earlier payload smuggled in.

**Why deferred**: fixing it properly means deciding a policy (reject the extra key with a
400, or strip it silently), and the strict option is a behavior change on a live write path
that this phase's remit — pin the contract, fix only what blocks an honest pin — does not
cover. The contract suites pin what the _server_ emits, and the server emits only what the
mappers build, so this hole is invisible to them by construction.

**Suggested owner**: test-plan §3 Phase 3 (derive-to-persist correctness) — it owns the
POST→persist→read path and will need a stance on snapshot fidelity anyway. Recommended fix:
build the card field-by-field in `serializeSnapshot` (matching its own docstring) and have
`parseSnapshot` return rebuilt arrays, not the caller's.

---

## F-2 — `toPathStep` turns a corrupt snapshot into an empty checkpoint

**Where**: `src/lib/api/paths.ts:159` —
`snapshot: parseSnapshot(row.snapshot) ?? { cards: [], unresolved: [] }`. Same fallback in
`toPathWithSummary` at `:142`.

**Observed**: `parseSnapshot` returns `null` for any malformed payload. The `??` converts
that `null` into a _valid-looking_ empty snapshot, so a corrupted row is served as a
checkpoint holding zero cards and zero unresolved entries. Nothing logs, nothing 500s, and
the response satisfies the contract's closed key set — `snapshot` is present and has exactly
`{cards, unresolved}`. On the page the checkpoint renders as an empty deck, and because
`overallPathSummary` folds the same empty snapshot, the path's base→final cost silently
shifts too.

**Impact**: the failure mode is indistinguishable from a legitimately empty checkpoint, so a
corruption would be read as a product bug ("my cards disappeared") with no server-side
signal to correlate it to. The graceful degradation is defensible — one bad row should not
fail a whole path load — but it is currently _silent_ degradation, which is the part worth
changing.

**Why deferred**: the fallback is deliberate and predates this change; removing it trades a
silent wrong answer for a hard failure on a read path, which is a product decision, not a
contract fix. The cheap improvement — keep the fallback, add a `console.error` naming the
step id — was still a behavior change outside this phase's scope, and unlike the `500`
redaction it was not blocking an honest pin.

**Suggested owner**: test-plan §3 Phase 3, alongside F-1 (same seam, same phase).
Recommended fix: keep degrading, but log the step id against the same `[api]` prefix
`serverError` uses so a support report can be correlated; consider surfacing a per-step
"could not be read" marker instead of an empty deck.

---

## F-3 — `signup` accepts an unread `confirmPassword`, and its `as string` casts lie

**Where**: `src/pages/api/auth/signup.ts:6–7`
(`const email = form.get("email") as string;` and the same for `password`) vs
`src/components/auth/SignUpForm.tsx:66` (the `<form method="POST" action="/api/auth/signup">`)
and `:105–106` (the `confirmPassword` field, `id`/`name` both set, so it **is** submitted).

**Observed**: two separate problems in one route.

1. `confirmPassword` is posted and never read. The match check lives only in
   `SignUpForm.tsx:37–40`, client-side. A direct POST — or the same form with JS
   disabled/failed, since it also carries `noValidate` — creates an account with no
   confirmation check at all. Not a security hole (the user chose the password either way),
   but the server accepts a field it does not honor, which is the definition of an
   undeclared contract.
2. `form.get()` returns `FormDataEntryValue | null`. The `as string` casts make a _missing_
   field into `null` typed as `string`, which then flows into
   `signInWithPassword`/`signUp`. The type system has been told a lie precisely where the
   input is untrusted — and this is the one API surface `npm run typecheck` cannot help
   with, because the cast is the assertion.

**Impact**: low. The failure surfaces as a Supabase validation error on the `?error=`
redirect channel, so a bodyless POST does not crash. It is a correctness and honesty
problem, not an outage.

**Why deferred**: this phase's contract scope was explicitly `/api/paths/*` plus `signin`'s
302 — `signin` only because the integration harness is built on it. `signup` and `signout`
were carved out (see the plan's "What We're NOT Doing"), and fixing the cast without also
deciding the `confirmPassword` policy would be half a change. `signin.ts:6–7` carries the
identical cast pattern and should be fixed in the same pass.

**Suggested owner**: a dedicated auth-contract change, or whichever phase next touches
`/api/auth/*`. Recommended fix: validate both fields with a `parse*Input`-style guard in
`src/lib/path/request.ts`'s idiom (returning `null` rather than casting), and either honor
`confirmPassword` server-side or stop submitting it.

---

## Recorded, not filed: two duplications this phase pinned rather than removed

Both are live, both are intentional for now, and both are pinned by the contract suites — so
they are recorded here as facts a future reader should not rediscover as bugs.

### D-1 — `GET /api/paths` has no application consumer

`src/pages/api/paths/index.ts`'s `GET` is called by nothing. `/paths` does its own
server-side read and renders a _different_ shape entirely: `toPathWithSummary` →
`PathWithSummary[]` (`src/pages/paths/index.astro:5–6,22`), which carries a computed
`summary` the API route does not. Kept because it is a coherent public read surface and
deleting it is a product decision, not a test decision. Pinned by
`contract-paths.int.test.ts` (200, bare `UpgradePath[]`, `created_at` desc).

### D-2 — `GET /api/paths/[id]` and `paths/[id].astro` are the same read, written twice

`src/pages/paths/[id].astro:21–31` runs `toUpgradePath` + `toPathStep` with the same
`.eq("path_id", id).order("position", { ascending: true })` clause as
`src/pages/api/paths/[id].ts`. Two copies of one ordering rule, so a fix applied to one can
miss the other — and the divergence would be invisible, since each side is internally
consistent. De-duplicating means extracting a shared reader, which is a refactor this phase
did not take on. Mitigated instead by `contract-page-agreement.int.test.ts`, which compares
each step name's position in the page's raw HTML against the API's `steps[].name` order, so
a divergent `.order()` clause fails CI. If the duplication is ever removed, that test
becomes redundant — remove it in the same change.
