---
project: "DeckDelta"
assessed_at: 2026-06-29
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript
  framework: Astro 6 (output server) + React 19 islands
  build_tool: Vite 7 (via Astro)
  test_runner: Vitest 4
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers (@astrojs/cloudflare adapter)
gates_passed: 4
gates_failed: 0
---

## Stack Components

- **Language — TypeScript (`^5.9.3`).** Typed end-to-end. `tsconfig.json` extends `astro/tsconfigs/strict` and the project uses path aliasing (`@/* → ./src/*`) mirrored in `vitest.config.ts`. ESLint runs `strictTypeChecked` + `stylisticTypeChecked` with `projectService` enabled, so type-aware linting covers the whole tree.
- **Framework — Astro 6 (`^6.3.1`) in `output: "server"` mode with React 19 (`^19.2.6`) islands.** File-based routing + island architecture. The Cloudflare adapter (`@astrojs/cloudflare ^13.5.0`) targets the Workers runtime. Matches the PRD's "client-heavy Astro + React; `resolveDeck` and the diff/cost engine run in the browser; paths persist via `/api/paths/*`."
- **Build tool — Vite 7** (pinned via `overrides`), driven through Astro's build pipeline; Tailwind 4 wired in as a Vite plugin.
- **Test runner — Vitest 4 (`^4.1.9`).** `node` environment, `src/**/*.test.ts` include glob, alias-aware. `npm test` → `vitest run`.
- **Package manager — npm.** CI uses `npm ci`; standard `package-lock` workflow.
- **Data layer — Supabase** (`@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.99.1`), `supabase/config.toml` present, migration scripts in `package.json`. Cookie-bound, RLS-scoped per the PRD.
- **CI/CD — GitHub Actions** (`.github/workflows/ci.yml`): Node 22, `astro sync` → `npm run lint` → `npm run build` on push/PR to `main`.
- **Deployment — Cloudflare Workers** via `wrangler ^4.98.0` (`wrangler.jsonc`); `npm run deploy` = `astro build && wrangler deploy`.
- **Instruction files — `CLAUDE.md` and `AGENTS.md`** both present at repo root.

## Quality Gate Assessment

| Component   | Typed | Convention | Training Data | Documented | Verdict |
|-------------|-------|------------|---------------|------------|---------|
| Language    | ✓     | —          | —             | —          | pass    |
| Framework   | —     | ✓          | ✓             | ✓          | pass    |
| Build tool  | —     | ✓          | ✓             | ✓          | pass    |
| Test runner | —     | —          | ✓             | ✓          | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Type safety — pass.** TypeScript is typed by the language. Evidence: `tsconfig.json` extends `astro/tsconfigs/strict`; `eslint.config.js` applies `tseslint.configs.strictTypeChecked` and `stylisticTypeChecked` with `parserOptions.projectService: true` (type-aware linting). No untyped escape hatch is configured. This directly supports the PRD's correctness guardrails (derived-snapshot correctness, no-silent-drops) — the `StepSnapshot` shape and the additive nullable delta field are checkable at the source.

**Convention-based — pass.** Astro ships strong conventions: file-based routing (`src/pages/`), island architecture, and a defined adapter/integration model (evidence: `astro.config.mjs` declares integrations + Cloudflare adapter + env schema). React islands and Vite follow Astro's conventions. The PRD's `/paths/[id]` route and `/api/paths/*` endpoints map onto Astro's file-based routing without ad-hoc wiring.

**Popular in training data — pass (within the JS family).** Astro, React, Vite, Vitest, Tailwind, and Supabase are all mainstream choices in the JavaScript ecosystem with deep training-corpus coverage. The agent will pattern-match real idioms, not confabulate. One currency caveat below.

**Well-documented — pass.** Astro, React, Vite, Vitest, Cloudflare Workers, and Supabase all publish current, version-pinned official docs reachable by URL.

## Gaps & Compensation

No quality gate fails. The stack is agent-friendly out of the box — typed end-to-end, convention-driven, mainstream, and well-documented. There is **no stack gap requiring compensation.**

One **advisory** (not a gate failure) worth pinning, because it bears on agent accuracy for this specific change:

- **Version currency on recent majors.** Astro 6, React 19, Vite 7, and Tailwind 4 are recent major versions, and `eslint-plugin-react-compiler` is on a release-candidate (`19.1.0-rc.2`). The frameworks are popular and well-documented (gates pass), but an agent's internalized idioms can lag the newest majors — e.g. the React Compiler is enabled as an ESLint error (`react-compiler/react-compiler: "error"`) and forbids patterns older React code took for granted. This is a steering note, not a stack weakness.

### Recommended Instruction File Additions

These are optional hardening entries — the stack passes without them. Paste into `CLAUDE.md` or `AGENTS.md` if you want to reduce agent correction cycles on the recent-majors edge:

```markdown
## Version currency
- This project is on Astro 6, React 19, Vite 7, Tailwind 4. Prefer current-version
  idioms; do not introduce patterns from older majors (no legacy React lifecycle
  patterns, no Tailwind v3 config-file assumptions — Tailwind 4 is configured via
  the Vite plugin, not tailwind.config.js).
- `react-compiler/react-compiler` is an ESLint **error**. Write components that the
  React Compiler accepts: no manual memoization workarounds that violate the rules
  of React, no conditional hooks, no mutation of props/state.
```

```markdown
## Diff-mode change (StepSnapshot derive)
- The persisted full list MUST equal `prior frozen list ± delta` exactly. Derive
  from the prior snapshot's stored (frozen) list only — never mutate a saved step.
- The persisted-delta field is additive and nullable: existing/full-pasted steps
  carry no value and must render identically to today. Do not change the
  `StepSnapshot` shape or the `/` comparer output.
- Unapplicable delta lines (`− card` not in prior list, `+ card` that won't resolve)
  must be surfaced, never silently dropped — consistent with the card-data-accuracy bar.
```

(The second block is PRD-derived guardrail text, not a stack compensation — included because it is the load-bearing correctness contract for the change in scope.)

## Summary

**Verdict: ready.** DeckDelta's stack passes all four agent-friendly criteria with no gate failures. TypeScript with strict, type-aware linting gives the agent reliable contract reasoning; Astro's file-based routing and island conventions make the codebase predictable; React/Astro/Vite/Vitest/Supabase are all mainstream and well-documented.

- **Key strengths:** end-to-end type safety with type-aware ESLint; convention-based Astro routing; mainstream, well-documented stack; CI already gates lint + build; both `CLAUDE.md` and `AGENTS.md` already exist as steering surfaces.
- **Key gaps:** none at the gate level. Only a version-currency advisory on recent majors (Astro 6 / React 19 / Tailwind 4 / react-compiler RC).
- **For the `diff-style-checkpoint-entry` change specifically:** the typed `StepSnapshot` and additive-nullable delta field are exactly the kind of contract an agent can verify from the source — the stack supports the PRD's correctness and immutability guardrails well.

**Recommended next step:** `/10x-health-check` to scan dependencies, security, and any missing config before agent onboarding.
