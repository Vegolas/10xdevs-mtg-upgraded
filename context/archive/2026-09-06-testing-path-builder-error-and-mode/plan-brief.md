# Path Builder Error Banner & Mode Switch — Plan Brief

> Full plan: `context/changes/testing-path-builder-error-and-mode/plan.md`
> Change brief: `context/changes/testing-path-builder-error-and-mode/change.md`
> Upstream findings (immutable): `context/archive/2026-09-05-testing-path-builder-ordering/findings.md`

## What & Why

Two of risk #9's four stale-ordering defects in the path builder are still unpinned: a Check
that throws writes the **add** flow's error banner (F-3), and `switchMode` clears three state
atoms while advancing **neither** counter (F-4). Both are live defects, not forecasts. Pinning
them as `test.fail()` specs keeps the suite green today and turns the build red the moment
someone fixes a guard — which is what makes the eventual F-5 refactor safe to attempt.

## Starting Point

`tests/e2e/path-builder-stale-ordering.spec.ts` already carries S1 and S2, pinning F-1 and
F-2, behind a built authenticated harness (`global-setup.ts`, the `setup` project,
`fixtures/auth.ts`). `PathEditor.tsx` carries six async flows guarded by two hand-copied
counters. S3 was blocked on addressability: the add-error banner (`:759-762`) and the
path-level `mutationError` banner (`:596`) have byte-identical class strings and no roles, so
no locator can tell them apart.

## Desired End State

Four `test.fail()` specs in one file — four expected failures, zero unexpected. `PathEditor`'s
two error banners are distinguishable by role and name in production code. `ParkedRoute` can
fail a held request as well as fulfil it. The F-5 shared-guard refactor has four pins under it
instead of two, and is named as this change's successor.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope (change.md's open question) | Spec both S3 and S4; F-5 refactor is the successor | Coverage belongs *before* a refactor of the six guarded flows, not after — and F-4's deferral reasons don't survive contact with the code | Plan |
| S3's overlap | Check fails *after* a successful add | The catches do re-check `checkToken`, so Check-vs-Check is correctly dropped; the real defect is a write to an atom `addToken` owns | Plan |
| S4's surface | Check verdict via a mode round trip | Pins the defect a *different* fix (bumping counters in `switchMode`) retires, so it stays live after S3's fix | Plan |
| Addressability edit | `role="alert"` + `aria-label` on **both** banners | Naming only one relies on accidental uniqueness that F-3's own fix would break by adding a third banner | Plan |
| Fixture extension | Add `releaseWithFailure(status = 500)` | Explicit at the call site in a spec whose mechanism *is* the failing release; `release()` stays untouched for S1/S2 | Plan |
| Where corrections land | `lessons.md` + spec headers | The archived findings are immutable, and `lessons.md` is what every skill re-reads | Plan |

## Scope

**In scope:** two `test.fail()` specs in the existing file; `role="alert"` + `aria-label` on
`PathEditor.tsx:596` and `:759-762`; `releaseWithFailure()` on `ParkedRoute`; this change's
`findings.md`; a `lessons.md` correction entry; three §6.7 cookbook additions.

**Out of scope:** fixing F-1 through F-5; the F-5 shared-guard refactor; F-6 (a unit-layer
validation gap); a Check-owned error atom; the reverse F-3 direction; the add-banner
cross-mode variant; any `retries` change; any CI or branch-protection change.

## Architecture / Approach

Enablers land alone first, so a regression in the existing suite unambiguously blames the
production edit rather than a new spec. Then one phase per spec, because each carries its own
mandatory deliberate-break run (§6.7 item 22b) — a `test.fail()` spec that fails on a typo'd
locator is indistinguishable in the report from one that fails on the defect. Both specs
follow the shape S1 and S2 established: park selectively, prove the run is genuinely in
flight, prove it ran to completion, and assert the negative through an observation window
opened *before* the release.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Enablers | Both banners addressable; `ParkedRoute` can fail | `role="alert"` changes announcement behavior for path-level errors |
| 2. S3 | Pins F-3 — a Check's failure never lands on a saved checkpoint | Asserting the banner's *message* would keep failing after the fix; must assert its identity |
| 3. S4 | Pins F-4 — a mode round trip invalidates the Check in flight | Both switches must precede the release, or the stale write is real but invisible |
| 4. The record | `findings.md`, `lessons.md` correction, §6.7 additions | The corrections are the deliverable; a thin entry loses what the planning session found |

**Prerequisites:** `npx supabase start` and `.env.test` with both keys. Never run
`npm run test:integration` and `npm run test:e2e` concurrently — they share `.dev.vars`.

**Estimated effort:** ~1–2 sessions across 4 phases; the specs are structural variants of
ones that already exist.

## Open Risks & Assumptions

- **S4's round trip may read as S1 with extra steps.** It isn't — `switchMode` and the
  textarea's `onChange` are distinct guard sites that retire independently — but the spec
  header has to say so or a future reader will delete one as redundant.
- **The upstream `findings.md` is wrong in two places and cannot be edited.** If Phase 4's
  `lessons.md` entry is thin, the next frame or research run inherits the wrong mechanism —
  which is exactly how F-1's misattribution survived into a plan once already.
- **`role="alert"` on a conditionally-rendered element** is inserted together with its content,
  which some screen readers do not announce. It does not affect the locator, but the manual
  verification step is worth actually doing rather than assuming.
- **F-3's fix will add a third error banner**, which is the assumption behind naming both
  banners now rather than relying on `role="alert"` being unique.

## Success Criteria (Summary)

- `npm run test:e2e` reports **four** expected failures and zero unexpected ones.
- Each new spec, run once with its `test.fail()` commented out, fails on the **defect** — the
  banner appearing, the verdict rendering — and not on a locator, a timeout, or a rejected seed.
- Bumping `checkToken` in `switchMode` locally flips S4 to `Expected to fail, but passed.`
