---
bootstrapped_at: 2026-06-01T20:24:55Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: deck-delta
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: deck-delta
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack** (verbatim from the hand-off body):

> DeckDelta is a solo, after-hours web app on a 3-week timeline with zero technology-forcing features — no auth, payments, realtime, AI, or background jobs. The 10x Astro Starter is the recommended default for (web-app, js): TypeScript-first, React 19 for interactive components, Tailwind CSS 4 for styling, and Cloudflare Pages for zero-config edge deploy. It passes all four agent-friendly quality gates and ships with conventions a stranger (or agent) can navigate immediately. The included Supabase integration goes unused for this project but adds no runtime cost. CI runs on GitHub Actions with auto-deploy on merge.

## Pre-scaffold verification

| Signal      | Value                                                          | Severity | Notes                                                                 |
| ----------- | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| npm package | not run                                                        | —        | `cmd_template` starts with `git clone`; no `create-*` CLI to resolve  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17      | fresh    | from card `docs_url`; `gh` unavailable, fetched via GitHub REST API   |

Repo pushed 15 days before the run (2026-05-17 vs 2026-06-01) — within the 3-month "fresh" window. No staleness warning raised. Proceeded.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 (top-level entries)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold (existing `CLAUDE.md` in cwd preserved; scaffold copy sidelined)
**.gitignore handling**: moved silently (absent in cwd, so no append-merge needed)
**.bootstrap-scaffold cleanup**: deleted. Cloned `.git/` removed before move-up so upstream starter history did not leak. Temp dir removal initially hit a transient Windows file lock; cleared on retry.

Entries moved into cwd: `.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `CLAUDE.md` (→ `CLAUDE.md.scaffold`), `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`.

`context/` carried no scaffold collision (the starter ships none) and was preserved verbatim.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW (10 total)
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 — both direct findings (`@astrojs/check`, `wrangler`) are MODERATE; the lone HIGH and remaining 7 MODERATE are transitive.
**Dependency tree audited**: 895 dependencies (prod 430, dev 316, optional 131, peer 24).
**Audit exit code**: 1 (non-zero because findings exist — informational only, not a halt).

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive) — Svelte `devalue`: DoS via sparse array deserialization. Pulled in via the Astro/Cloudflare toolchain. Address with `npm audit fix` or by waiting for the upstream Astro dependency bump.

#### MODERATE findings

| Package                  | Direct? | Via / advisory                                                  |
| ------------------------ | ------- | -------------------------------------------------------------- |
| @astrojs/check           | direct  | @astrojs/language-server                                       |
| wrangler                 | direct  | miniflare                                                      |
| @astrojs/language-server | transitive | volar-service-yaml                                         |
| @cloudflare/vite-plugin  | transitive | miniflare, wrangler                                        |
| miniflare                | transitive | ws                                                         |
| volar-service-yaml       | transitive | yaml-language-server                                       |
| ws                       | transitive | ws: Uninitialized memory disclosure                       |
| yaml                     | transitive | yaml: Stack Overflow via deeply nested YAML collections   |
| yaml-language-server     | transitive | yaml                                                      |

#### LOW / INFO findings

None.

## Hints recorded but not acted on

These hand-off hints were read into the run and logged but trigger no automated action in bootstrapper v1.

| Hint                    | Value                  |
| ----------------------- | ---------------------- |
| bootstrapper_confidence | first-class            |
| quality_override        | false                  |
| path_taken              | standard               |
| self_check_answers      | null                   |
| team_size               | solo                   |
| deployment_target       | cloudflare-pages       |
| ci_provider             | github-actions         |
| ci_default_flow         | auto-deploy-on-merge   |
| has_auth                | false                  |
| has_payments            | false                  |
| has_realtime            | false                  |
| has_ai                  | false                  |
| has_background_jobs     | false                  |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md.scaffold` sibling the conflict policy created and decide which parts of the starter's version to merge into your existing `CLAUDE.md` (`diff CLAUDE.md CLAUDE.md.scaffold`).
- Address audit findings per your project's risk tolerance — the full breakdown is above. `npm audit fix` resolves most without breaking changes; the lone HIGH (`devalue`) is transitive and advisory until the upstream Astro/Cloudflare dependency ships a fix.
