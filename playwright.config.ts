import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-E2E harness for the deck comparer's failure surfacing
 * (test-plan §3 Phase 4, risks #7 and #8).
 *
 * `webServer` deliberately replaces the spawn / readiness-poll / process-tree-kill
 * machinery that `tests/integration/global-setup.ts` hand-rolls. Playwright's launcher
 * does the same work internally, so none of it is ported here.
 *
 * The comparer needs no Supabase and no auth: it mounts at `/`, and `src/middleware.ts`
 * protects only `/dashboard` and `/paths`. Card resolution is a browser-side fetch to
 * Scryfall, which every spec intercepts — no test touches the live API.
 */

/** Dedicated port. NOT 4321: the integration harness defaults there
 *  (`tests/integration/helpers/env.ts`) with no collision handling, and Astro inherits
 *  Vite's `strictPort: false`, so a taken port silently binds the next one. */
const PORT = 4323;

export default defineConfig({
  // Pinning testDir is what stops Playwright's default testMatch from sweeping the
  // 33 vitest files under src/ and tests/integration/ (23 unit + 10 integration).
  testDir: "./tests/e2e",

  // Absorb ordinary infrastructure flake in CI. `comparer-stale-response.spec.ts`
  // overrides this to 0 — a genuine out-of-order bug must never retry its way to green.
  retries: process.env.CI ? 1 : 0,

  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"]],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // `--host 127.0.0.1` is required: without it Astro binds `localhost`, and Node 18+
    // IPv6-first resolution can leave 127.0.0.1 unreachable.
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Astro answers before it has compiled `/`, so the first goto pays the Vite
    // transform plus Tailwind. Playwright's default 60s leaves no headroom.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
