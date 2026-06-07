---
project: deck-delta
researched_at: 2026-06-07
recommended_platform: Cloudflare Workers (Static Assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 5 (+ React 19, Tailwind 4)
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers (with Static Assets).**

For a solo, cost-sensitive, mostly-static Astro 5 app whose data lives on-device and whose only backend touchpoints are external (Supabase + card-data lookups), Cloudflare scored a clean pass on all five agent-friendly criteria, costs **$0** at this traffic (free tier is 100k requests/*day*), and ships the strongest agent tooling of any candidate — `llms.txt` docs plus 15 official MCP servers. It is also where the framework itself now lives (Astro joined Cloudflare in 2025), so long-term support is aligned. The interview confirmed the fit: no persistent connections (serverless is fine), cost is the top priority (free tier wins), single region (edge is a free bonus, not a cost), and external Supabase (no co-located database needed). The one correction the research forced — and it is load-bearing — is that the deploy target must be **Workers**, not Pages: the current `@astrojs/cloudflare` adapter no longer supports Pages for SSR.

## Platform Comparison

| Platform | CLI-first | Managed / Serverless | Agent docs | Stable deploy API | MCP / Integration | Cost (this MVP) |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Cloudflare** | Pass | Pass | Pass (`llms.txt`) | Pass | Pass (15 servers) | **$0** — free 100k req/day |
| **Vercel** | Pass | Pass | Pass (`llms.txt`) | Pass | Pass (beta) | $0 Hobby (non-commercial); Pro $20/mo |
| **Render** | Pass | Pass | Partial (no `llms.txt`) | Pass | Pass (GA) | **$0** free Static Site (no commercial limit) |
| **Netlify** | Pass | Pass | Partial | Pass | Pass | $0 credit-based; 15 credits/deploy + secret-scan gotcha |
| **Fly.io** | Pass | Partial (containers) | Pass (md) | Pass | Pass | **~$2–5/mo — no free tier** |
| **Railway** | Pass | Pass | Pass (`llms.txt`) | Partial (MCP WIP) | ~$5/mo Hobby (no real free tier) |

**Per-platform notes (all facts checked 2026-06-07):**

- **Cloudflare** — Runs Astro 5 via `@astrojs/cloudflare` targeting **Workers + Static Assets** (the adapter dropped Pages SSR support in 2025). `wrangler` covers deploy / rollback / tail. Free tier 100k req/day with a **10 ms CPU/invocation** ceiling; static assets are free and unlimited. SSR requires the `nodejs_compat` flag and an `ASSETS` binding. Best-in-class agent docs (`llms.txt` + `llms-full.txt`, per-page markdown) and 15 official OAuth MCP servers (docs, Workers bindings, observability).
- **Vercel** — Equal on the five criteria with arguably the smoothest Astro DX and excellent `llms.txt` docs. Dropped to runner-up by one hard fact: **the Hobby free tier is non-commercial only**; if DeckDelta ever monetizes, it forces **Pro at $20/seat/mo**. Vercel MCP is OAuth-backed but **beta**. Vercel Postgres was shut down in 2025 — Supabase-as-external is the recommended pattern anyway.
- **Render** — The cost-purest alternative: a **free Static Site path with no commercial restriction and no cold starts**, ideal for a client-side Astro app using the Supabase anon key. CLI (GA Dec 2024) and MCP (GA Aug 2025, create/read-only — can't delete, matching the human-on-destructive posture). Held to third only by weaker agent docs (no confirmed `llms.txt`) and the free *Web Service* path's ~1 min spin-down cold start (irrelevant if you stay static).
- **Netlify** — Capable and has an official MCP server, but the new **credit-based free tier** is harder to reason about (15 credits per production deploy; a frequent-deploy MVP can exhaust it on deploys alone), and **secret scanning fails builds** if a Supabase key reaches build output — a real friction point for this stack.
- **Fly.io** — Technically strong and notably agent-friendly, but a **poor fit for this brief**: no free tier (~$2–5/mo floor, violating the cost priority) and it forces a maintained Dockerfile + an always-on Node server for an app that is mostly static and needs no persistent connections.
- **Railway** — Clean CLI and `llms.txt` docs, but **no genuine free tier** (one-time $5 trial, then a $0/$1-credit plan too small to be useful → realistically $5/mo Hobby). Its MCP server is self-described "work in progress." Runs a Node SSR server for what could be static.

### Shortlisted Platforms

#### 1. Cloudflare (Recommended)

Wins on every axis that matters here: $0 cost at this traffic, top agent-operability (`llms.txt`, 15 MCP servers, clean `wrangler` loop), serverless with zero infra to misconfigure, and strategic alignment now that Astro is a Cloudflare project. Single-region usage means the edge network is a free bonus rather than something you pay for. The only homework is using the **Workers** path from day one.

#### 2. Vercel

The closest peer to Cloudflare on agent-friendliness and the smoothest Astro DX, making it the natural fallback if Workers/Astro friction ever bites. The gap is commercial: its free tier is non-commercial, so the moment DeckDelta earns revenue you're on the $20/mo Pro plan — a poor match for a stated cost-minimizing posture. If you never monetize, it's effectively a tie with Cloudflare on cost.

#### 3. Render

The strongest "purely free, low-lock-in" option: a free Static Site with no commercial restriction and no cold starts, plus a GA CLI and a deliberately non-destructive MCP server. It falls to third only because its agent docs are weaker (no `llms.txt`) and its server path carries cold starts — neither fatal, but enough to rank behind two platforms that match it on cost while beating it on docs.

## Anti-Bias Cross-Check: Cloudflare

### Devil's Advocate — Weaknesses

1. **The tech-stack file is already stale.** `tech-stack.md` says `deployment_target: cloudflare-pages`, but the current `@astrojs/cloudflare` adapter **no longer supports Pages for SSR** — it targets **Workers + Static Assets**. `wrangler pages deploy` and `wrangler deploy` are not interchangeable, so a Pages-shaped CI step breaks the first time you add a server route.
2. **Dev/prod runtime drift on Astro 5.** With Astro 5 (adapter v12), `astro dev` runs on **Node with a best-effort `platformProxy` emulation — not real workerd**. Real workerd-in-dev arrives only with Astro 6 / adapter v13. Code that passes locally can fail in production unless tested via `wrangler dev`.
3. **Supabase SDK + `nodejs_compat`.** SSR needs the `nodejs_compat` flag; the Supabase client's transitive deps (ws, Node polyfills) can hit Workers runtime edges, especially if Realtime/auth helpers that assume Node are added later.
4. **Free tier caps CPU, not just requests.** Free is generous on volume (100k req/day) but **10 ms CPU per invocation**. SSR-ing the deck-diff over 100+ card lists plus card-data fetches is a compute risk (moot if the diff stays client-side).
5. **Image-service footgun for a card-image-heavy UI.** The adapter defaults Astro `<Image>` to the `cloudflare-binding` service, which auto-provisions **Cloudflare Images (a billable product)** — directly relevant to FR-005 and at odds with the "$0" premise unless `imageService` is set explicitly.

### Pre-Mortem — How This Could Fail

The team scaffolds DeckDelta following `tech-stack.md` to the letter: `cloudflare-pages`, GitHub Actions auto-deploy on merge. Six months later it's a mess. The first deploy went to Pages with the static path, but the moment they added a server endpoint to hide the Supabase service-role key, they hit the adapter's dropped Pages-SSR support — forcing a mid-project migration to Workers, rewriting the CI deploy step (`pages deploy` → `wrangler deploy`) and the wrangler config. Meanwhile card images intermittently 404'd because the default `cloudflare-binding` image service silently tried to provision Cloudflare Images, generating charges that contradicted the "free" premise. Local `astro dev` had masked a `node:crypto` incompatibility that only surfaced on workerd in production, eating a weekend. The platform was never the problem — the team trusted a stale `deployment_target` hint and a "deploy Astro in minutes" story instead of the adapter's actual 2025 state, and paid for it in migration tax and drift.

### Unknown Unknowns

- The `deployment_target: cloudflare-pages` line in your own `tech-stack.md` is the most dangerous artifact in the chain — it's stale, and the bootstrapper/CI templates likely need to target **Workers** before first deploy.
- **Astro joined Cloudflare (2025).** Strategically positive, but it means the Pages path is being de-emphasized fast; betting on Pages-specific behavior bets against the roadmap.
- The `astro dev` ↔ production fidelity gap is **version-gated**: Astro 5 = Node emulation; only Astro 6 / adapter v13 = real workerd locally. Your local runtime does not match prod until you run `wrangler dev` or upgrade.
- "Free" is **100k requests/day** (very generous) but **CPU-metered at 10 ms/invocation** — the ceiling to watch is compute, not traffic.
- The default Astro image service silently wires **Cloudflare Images (billable)** — set `imageService` explicitly for an image-heavy card UI.

## Operational Story

- **Preview deploys**: Workers produces preview URLs via versioned uploads — `wrangler versions upload` creates a non-production preview (optionally `--preview-alias <name>` for a stable URL), then `wrangler versions deploy` promotes to production. A GitHub Actions job can post the preview URL on each PR. Fork PRs run without repo secrets, so preview builds that need the Supabase service-role key won't function from forks — expected and acceptable for a solo project.
- **Secrets**: The Supabase **anon key is public** — expose it with a `PUBLIC_` prefix (baked into the client bundle). The Supabase **service-role key is a Worker secret** — `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`, never `PUBLIC_`-prefixed, read only inside server endpoints. The CI deploy token lives in **GitHub Secrets** (`CLOUDFLARE_API_TOKEN`), scoped to Workers Scripts:Edit for this one project — not an account-wide key.
- **Rollback**: `npx wrangler rollback [--version-id <id>]` reverts to a prior version in seconds; `npx wrangler deployments list` to find the version. Static assets revert with the version. Caveat: **Supabase schema/migration changes do not roll back with the Worker** — database migrations are reverted separately in Supabase.
- **Approval**: An agent may build, deploy previews, and tail logs unattended. **Human-only**: promoting a version to production (if you gate it), rotating the Supabase service-role key, and any destructive Supabase action (dropping a table, resetting the database) — those are done by hand in the Supabase panel per the minimal-permissions posture.
- **Logs**: `npx wrangler tail` streams live runtime logs; filter with `--status error`, `--format json`, or `--search "<text>"`. For structured, repeated queries against live state, the Cloudflare **Observability MCP** server (`observability.mcp.cloudflare.com/mcp`) exposes typed tools.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|:---:|:---:|---|
| Stale `cloudflare-pages` target → wrong deploy path / broken CI | Devil's advocate / Unknown unknowns | H | M | Re-point `tech-stack.md` to **Cloudflare Workers (Static Assets)**; ensure bootstrapper + CI use `wrangler deploy`, not `pages deploy`. |
| Dev/prod drift — `astro dev` is Node emulation on Astro 5, not workerd | Pre-mortem / Unknown unknowns | M | M | Run `wrangler dev` before every deploy; consider upgrading to Astro 6 / adapter v13 for real workerd in dev. |
| Default image service auto-provisions billable Cloudflare Images | Devil's advocate | M | M | Set `imageService: 'compile'` (or `'passthrough'`) in the adapter config; confirm no Cloudflare Images binding is created. |
| Supabase SDK deps require `nodejs_compat` / hit Workers edges | Devil's advocate | M | M | Enable `nodejs_compat`; prefer client-side (anon-key) Supabase access; test any Realtime/auth helpers on `wrangler dev`. |
| 10 ms free-tier CPU limit exceeded by heavy SSR deck-diff | Pre-mortem | L | M | Keep the deck-diff computation client-side; if SSR'd, profile CPU and move to the $5/mo paid tier if needed. |
| Service-role key leaks into the client bundle | Research finding / Devil's advocate | L | H | Never `PUBLIC_`-prefix the service-role key; store as a Worker secret; use it only in server endpoints. |
| Pages path de-emphasized after the Astro→Cloudflare acquisition | Research finding | L | L | Standardize on Workers from day one; watch the `@astrojs/cloudflare` CHANGELOG. |

## Getting Started

> First, fix the upstream contract: change `deployment_target` in `context/foundation/tech-stack.md` from `cloudflare-pages` to **`cloudflare-workers`** so the bootstrapper and CI generate the Workers deploy path, not the Pages one.

1. **Add the Astro-5-compatible Cloudflare adapter** (npm `latest` targets Astro 6 — pin the v12 line for Astro 5):
   ```bash
   npm install @astrojs/cloudflare@^12
   ```
2. **Configure `astro.config.mjs`** — server output for the Supabase-server path (use `'static'` if you stay purely client-side with the anon key), and set the image service explicitly to avoid the Cloudflare Images footgun:
   ```js
   import { defineConfig } from 'astro/config';
   import cloudflare from '@astrojs/cloudflare';

   export default defineConfig({
     output: 'server',
     adapter: cloudflare({ imageService: 'compile' }),
   });
   ```
3. **Configure `wrangler.jsonc`** with the Node compat flag and the static-assets binding (SSR breaks without `nodejs_compat`):
   ```jsonc
   {
     "name": "deck-delta",
     "compatibility_date": "2026-06-07",
     "compatibility_flags": ["nodejs_compat"],
     "assets": { "directory": "./dist", "binding": "ASSETS" }
   }
   ```
4. **Wire secrets** — public anon key as a `PUBLIC_` build var; service-role key (only if you add server endpoints) as a Worker secret:
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
5. **Develop with runtime fidelity** — on Astro 5, `npm run dev` (astro dev) is fine for UI work, but test the deployable build on workerd before shipping:
   ```bash
   npx wrangler dev
   ```
6. **Deploy, then verify** — `npm run deploy` (wraps `astro build && wrangler deploy`), confirm with `npx wrangler deployments list`, and tail with `npx wrangler tail`. Roll back with `npx wrangler rollback` if needed.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (the GitHub Actions auto-deploy-on-merge flow is named in the tech stack but not designed here)
- Production-scale architecture (multi-region, HA, DR)
