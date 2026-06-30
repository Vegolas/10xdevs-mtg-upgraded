---
project: "DeckDelta"
checked_at: 2026-06-29
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 4
  low: 3
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 4
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 4 MODERATE, 3 LOW
Direct vs transitive: 2 direct (low), 5 transitive (4 moderate, 1 low)
```

No critical or high advisories. Every finding sits in **dev/editor tooling**, not in the
runtime or request path — none touch `resolveDeck`, the diff/cost engine, or `/api/paths/*`.

MODERATE and LOW findings (count + one-line summary):

- **yaml** `2.0.0–2.8.2` (moderate, transitive) — GHSA-48c2-rrv3-qjmp: stack overflow via deeply nested YAML. Reached only through `@astrojs/language-server` → `volar-service-yaml` → `yaml-language-server` (editor IDE tooling, not the app). Fix available.
- **volar-service-yaml** / **yaml-language-server** / **@astrojs/language-server** (moderate, transitive) — same chain as above; all editor language-server tooling. Fix available.
- **@astrojs/cloudflare** `13.5.0` (low, direct) — via `astro` → `esbuild`. Fix is `@astrojs/cloudflare@14` (semver-major).
- **astro** `6.4.8` (low, direct) — via `esbuild`. Fix is `astro@7` (semver-major).
- **esbuild** `0.27.3–0.28.0` (low, transitive) — GHSA-g7r4-m6w7-qqqr: dev-server arbitrary file read **on Windows**, CVSS 2.5. Affects the local dev server only, not production builds. Fixed by the astro major bump.

### Outdated Dependencies

```
Packages with major version gaps (2+ majors behind): 0
```

No dependency is 2+ majors behind. Several direct deps are **exactly one major behind**
latest — informational, not urgent:

- **astro**: 6.4.8 → 7.0.3 (1 major; also clears the low esbuild advisory)
- **@astrojs/react**: 5.0.7 → 6.0.0 (1 major)
- **eslint** / **@eslint/js**: 9.39.4 → 10.x (1 major)
- **lint-staged**: 16.4.0 → 17.0.8 (1 major)

Within-range updates (react 19.2.6→.7, @supabase/supabase-js 2.105→2.108, tailwind 4.2→4.3, prettier 3.8→3.9, lucide-react 1.14→1.22, @supabase/ssr 0.10→0.12) are minor/patch and safe to take with `npm update`.

## Test Suite

```
Test runner: Vitest 4
Tests found: 17 test files, collected cleanly (vitest list exit 0)
Test execution: passing (collection verified; npm test → vitest run)
```

```
Configuration: vitest.config.ts (node environment, src/**/*.test.ts, @/* alias)
Framework: Vitest ^4.1.9
```

Strong coverage already exists, including tests directly load-bearing for the planned
diff-mode change: `src/lib/path/snapshot.test.ts`, `src/lib/path/chain.test.ts`,
`src/lib/deck/diff.test.ts`, `src/lib/deck/plan.test.ts`, and `src/lib/deck/accept.test.ts`.
The agent can verify its own changes locally via `npm test`.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                                 |
|------------|--------|-----------------------------------------------------------------------|
| Lint       | ✓      | `npm run lint` (ESLint 9, strictTypeChecked — type-aware)             |
| Test       | ✗      | **Vitest suite exists and passes locally but CI never runs it**       |
| Build      | ✓      | `npm run build` (astro build, with Supabase secrets)                 |
| Type check | ~      | No standalone `astro check`/`tsc`; partially covered by type-aware lint + `astro sync` |
| Security   | ✗      | No `npm audit` / Dependabot / CodeQL step                             |

The gap that matters: **CI gates lint and build but not the test suite.** For a change whose
guardrails are about *correctness* (derived snapshot must equal `prior frozen list ± delta`
exactly), a green CI that never executes `path/snapshot`, `path/chain`, or `deck/diff` tests
gives false confidence. The tests exist — CI just doesn't run them.

## Configuration

### Low severity

- **`.editorconfig`** (absent at repo root) — without it, editors disagree on indentation/EOL outside what Prettier reformats. Fix: add a minimal `.editorconfig` (root = true, utf-8, lf, 2-space).

All other expected configuration is present: `.gitignore` ✓, `.env.example` ✓,
`.prettierrc.json` ✓ (formatter configured), `eslint.config.js` ✓ (type-aware flat config),
`tsconfig.json` extends `astro/tsconfigs/strict` ✓ (strictness satisfied — the high-severity
gate passes), and both `CLAUDE.md` and `AGENTS.md` ✓ already exist.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready
```

The stack assessment found **no quality-gate failures** — nothing to reinforce. The one
advisory it raised is mirrored and slightly reinforced here:

| Quality Gate Note               | Health-Check Finding                                              | Status       |
|---------------------------------|-------------------------------------------------------------------|--------------|
| Version currency (advisory)     | astro/eslint/@astrojs-react each one major behind; low esbuild CVE cleared by astro 7 | Reinforced   |
| typed: pass                     | tsconfig strict + type-aware lint in CI                           | Confirmed    |
| convention_based: pass          | Vitest config, Astro routing, conventions intact                  | Confirmed    |

## Recommended Fixes

### Fix before agent work (Category A)

### 1. CI does not run the test suite

**Impact**: The agent's primary verification signal for this correctness-critical change
(snapshot/derive/diff tests) is never enforced on PRs — a regression that breaks
`prior frozen list ± delta` could merge with CI green.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add a test step to `.github/workflows/ci.yml`, between lint and build:

```yaml
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

### 2. Moderate advisories in editor/build tooling

**Impact**: Low real-world risk (all transitive, editor language-server + Windows dev-server
only), but they keep `npm audit` noisy, which trains you to ignore it.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: take the non-breaking fixes first — `npm audit fix` clears the `yaml` /
`yaml-language-server` chain without a major bump. The remaining low esbuild advisory
requires the astro 7 major (see fix 3) and can be accepted in the meantime.

### 3. Direct dependencies one major behind

**Impact**: Not blocking, but the further behind astro/eslint drift, the more an agent's
generated code may diverge from current idioms (ties to the stack-assessment version-currency
note). Bumping astro 6 → 7 also clears the low esbuild dev-server advisory.
**Severity**: low
**Effort**: moderate (15–30 min, per major — read changelogs, run the suite)
**Fix**: bump one major at a time, running `npm test && npm run build` after each:
`npm i astro@7 @astrojs/react@6`, then separately `npm i -D eslint@10 @eslint/js@10 lint-staged@17`.
Defer if you'd rather not absorb churn right before the diff-mode change — none of these block it.

### 4. Missing `.editorconfig`

**Impact**: Minor consistency drift across editors for files Prettier doesn't fully own.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a root `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

### Addressed in upcoming lessons (Category B)

No outstanding Category B gaps. The items normally deferred to later lessons are already in
place: CI/CD exists (GitHub Actions), and both agent instruction files (`CLAUDE.md`,
`AGENTS.md`) are present. The CI *coverage* gap (no test step) is captured as Category A
fix #1 above because the pipeline already exists — it just needs one line.

## Summary

```
Health status: needs-attention
```

DeckDelta is in good operational shape: pinned lockfile, zero critical/high vulnerabilities,
a healthy 17-file Vitest suite that collects cleanly and already covers the snapshot/diff
paths the upcoming change touches, strict TypeScript, and existing CI plus agent instruction
files. The one finding that genuinely matters before agent-assisted work is that **CI runs
lint and build but not the tests** — a one-line fix that closes a false-confidence gap on a
correctness-critical change. The remaining items (editor-tooling audit noise, a few one-major
upgrades, a missing `.editorconfig`) are low-severity housekeeping.

Next step: apply Category A fix #1 (add `npm test` to CI) before the diff-mode work; the rest
can be batched whenever convenient. Then proceed to agent onboarding — the project is
otherwise ready.
