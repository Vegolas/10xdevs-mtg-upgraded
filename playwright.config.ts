import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_PORT, STORAGE_STATE, SUPABASE_KEY, SUPABASE_URL } from "./tests/e2e/fixtures/env";

/**
 * Browser-E2E harness. Two suites live here now:
 *
 * - the deck comparer's failure surfacing (test-plan §3 Phase 4, risks #7 and #8),
 *   which needs no session and mounts at `/`;
 * - the path builder's stale-response ordering (§3 Phase 5, risk #9), which sits
 *   behind the middleware session gate and therefore needs a real Supabase stack.
 *
 * Phase 4's harness was deliberately Supabase-free; Phase 5 disproved that premise
 * for its own surface, so the harness now boots against LOCAL Supabase and signs one
 * owner in before the chromium project runs. Nothing here ever touches the cloud
 * project — `webServer.env` carries only what `.env.test` (or, in CI, the running
 * stack) resolved, and `tests/e2e/dev-vars.mjs` explains why a contributor's
 * `.dev.vars` has to be moved aside for that env to be the one the server sees.
 *
 * `webServer` deliberately replaces the spawn / readiness-poll / process-tree-kill
 * machinery that `tests/integration/global-setup.ts` hand-rolls. Playwright's launcher
 * does the same work internally, so none of it is ported here.
 *
 * CONCURRENCY HAZARD: `npm run test:integration` and `npm run test:e2e` must not run
 * at the same time. Both mutate `.dev.vars` in the repo root — the integration suite
 * rewrites it (`.dev.vars.intbak`), this one stashes it (`.dev.vars.e2ebak`).
 * Distinct sidecars stop the two snapshots corrupting each other; they do not make
 * the file safe to share. `reuseExistingServer` below compounds it locally: a dev
 * server someone else started on this port is reused with whatever env it has.
 */

export default defineConfig({
  // Pinning testDir is what stops Playwright's default testMatch from sweeping the
  // 33 vitest files under src/ and tests/integration/ (23 unit + 10 integration).
  testDir: "./tests/e2e",

  // Prerequisite checks and end-of-run cleanup: the stashed `.dev.vars` and the
  // owner the setup project created. NOT the stash itself — see the file for why.
  globalSetup: "./tests/e2e/global-setup.ts",

  // Absorb ordinary infrastructure flake in CI. `comparer-stale-response.spec.ts`
  // overrides this to 0 — a genuine out-of-order bug must never retry its way to green.
  retries: process.env.CI ? 1 : 0,

  // Above Playwright's 30s default because the FIRST test to reach a route pays for
  // `astro dev` compiling that route's island module graph through Vite, and that happens
  // AFTER `load` fires — so it lands on `gotoHydrated`'s barrier rather than inside
  // `page.goto`. 30s left the barrier and the test budget competing for the same seconds.
  // This does NOT slacken any assertion: `expect` keeps its 5s default, so a real product
  // failure still reddens in 5s.
  timeout: 60_000,

  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    // `auth.setup.ts` matches neither of Playwright's default test globs
    // (`*.spec.ts` / `*.test.ts`), so naming it here is also what keeps the chromium
    // project from picking it up a second time.
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    // The stash MUST precede the server: `@astrojs/cloudflare` reads `.dev.vars` at
    // `astro:config:done`, and Playwright starts webServer before `globalSetup`.
    // Chaining it into the command is the only hook early enough.
    //
    // `--host 127.0.0.1` is required: without it Astro binds `localhost`, and Node 18+
    // IPv6-first resolution can leave 127.0.0.1 unreachable.
    command: `node tests/e2e/dev-vars.mjs stash && npm run dev -- --host 127.0.0.1 --port ${E2E_PORT}`,
    url: BASE_URL,
    // Playwright MERGES this over `process.env` rather than replacing it, so blanking
    // the service-role key is the only way to keep it out of the dev server in CI,
    // where the `e2e` job exports all three keys into `$GITHUB_ENV`. The app never
    // reads it (`astro.config.mjs` declares only SUPABASE_URL / SUPABASE_KEY) — this
    // is about the process env, which is where a leak would actually live.
    env: { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY: "" },
    reuseExistingServer: !process.env.CI,
    // Astro answers before it has compiled `/`, so the first goto pays the Vite
    // transform plus Tailwind. Playwright's default 60s leaves no headroom.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
