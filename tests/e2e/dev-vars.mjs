/* global process -- runs under bare `node` from `webServer.command`, not through the TS config. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Move a contributor's `.dev.vars` out of the way for the duration of a browser
 * run, and put it back afterwards.
 *
 * WHY A FILE MOVE AND NOT AN ENV INJECTION. `@astrojs/cloudflare` parses
 * `.dev.vars` at `astro:config:done` and does `Object.assign(process.env, parsed)`
 * (`dist/index.js:292-303`), so the file OVERWRITES whatever env Playwright hands
 * the dev server. A contributor's file points at their cloud project; the browser
 * suite must reach the LOCAL stack. Verified 2026-09-06: with the file absent, the
 * injected env reaches `astro:env/server` normally (no config-error banner), so the
 * file only has to be absent — nothing needs to be written in its place, and no key
 * is ever written to disk. `webServer.env` in `playwright.config.ts` supplies the
 * local values.
 *
 * WHY THIS RUNS FROM `webServer.command` AND NOT FROM `global-setup.ts`. Playwright
 * starts `webServer` as a PLUGIN, and `createGlobalSetupTasks()` runs plugin setup
 * BEFORE `globalSetup` (`playwright/lib/runner/index.js`). A stash performed in
 * `globalSetup` would land after the adapter had already read the file. Chaining it
 * into the server's own command is the only hook that is guaranteed to precede boot
 * — which is why this is a standalone `.mjs`: it has to be runnable by bare `node`.
 *
 * CROSS-SUITE HAZARD. `tests/integration/global-setup.ts` rewrites the SAME file
 * with its own `.dev.vars.intbak` sidecar. Distinct sidecars keep the two snapshots
 * from corrupting each other, but they do not make the suites safe to run at the
 * same time: running `npm run test:integration` and `npm run test:e2e`
 * concurrently is UNSUPPORTED, because both mutate `.dev.vars` in the repo root.
 */

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEV_VARS = path.join(ROOT_DIR, ".dev.vars");
const DEV_VARS_BACKUP = path.join(ROOT_DIR, ".dev.vars.e2ebak");

/**
 * Put the contributor's `.dev.vars` back. Stateless on purpose — the sidecar's
 * EXISTENCE is the entire record, so this is safe to call twice, safe to call when
 * no stash happened, and safe to call from a crashed run's successor.
 */
export function restoreDevVars() {
  if (fs.existsSync(DEV_VARS_BACKUP)) {
    fs.renameSync(DEV_VARS_BACKUP, DEV_VARS);
  }
}

/**
 * Move `.dev.vars` aside so the dev server sees the env we inject instead.
 *
 * Crash-safe: a leftover sidecar from a killed run means the original is still in
 * the sidecar, so restore it before taking a new one. No file is created when there
 * was no `.dev.vars` to begin with (CI's normal case), which is what keeps
 * "byte-identical before and after" true in both environments.
 */
export function stashDevVars() {
  if (process.env.SUPABASE_URL === undefined || process.env.SUPABASE_KEY === undefined) {
    throw new Error(
      "Refusing to stash .dev.vars: SUPABASE_URL / SUPABASE_KEY are not set for the dev server. " +
        "Copy `.env.test.example` to `.env.test` and fill it from `npx supabase status`.",
    );
  }

  restoreDevVars();

  if (fs.existsSync(DEV_VARS)) {
    fs.renameSync(DEV_VARS, DEV_VARS_BACKUP);
  }
}

// CLI entry: `node tests/e2e/dev-vars.mjs stash`, chained ahead of `astro dev` in
// `playwright.config.ts`'s `webServer.command`. The matching restore is owned by
// `global-setup.ts`, which holds it for the whole run and also nets a Ctrl+C exit.
if (process.argv[2] === "stash") {
  stashDevVars();
}
