import fs from "node:fs";
import { restoreDevVars } from "./dev-vars.mjs";
import { OWNER_ID_FILE, STORAGE_STATE, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./fixtures/env";

/**
 * Playwright `globalSetup` for the browser suite: check the prerequisites the
 * harness cannot invent, and own the two things that must be undone at the end of a
 * run — the stashed `.dev.vars` and the owner the `setup` project created.
 *
 * What it deliberately does NOT do is the `.dev.vars` stash itself. Playwright runs
 * `webServer` as a plugin and plugin setup precedes `globalSetup`
 * (`playwright/lib/runner/index.js`, `createGlobalSetupTasks`), so by the time this
 * file runs the dev server has already booted and `@astrojs/cloudflare` has already
 * read the file. The stash is chained into `webServer.command` instead — see
 * `./dev-vars.mjs` for the whole story. Restoring from here is safe and correct:
 * teardowns run in reverse task order, so this fires while the dev server is still
 * up, and the server never re-reads the file.
 *
 * Prerequisite: local Supabase is already running (`npx supabase start`). CI boots
 * it explicitly in the `e2e` job. No DB reset here — the run cleans up after itself.
 */

const OWNER_DELETE_TIMEOUT_MS = 10_000;

/** Fail fast, with the fix in the message, when the prerequisites aren't met. */
async function assertPrerequisites(): Promise<void> {
  if (SUPABASE_KEY.length === 0 || SUPABASE_SERVICE_ROLE_KEY.length === 0) {
    throw new Error(
      "Browser-E2E env is incomplete. Copy `.env.test.example` to `.env.test` and fill " +
        "SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY from `npx supabase status`.",
    );
  }
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(
      `Local Supabase is not reachable at ${SUPABASE_URL}. Start it with \`npx supabase start\` ` +
        "before running the browser suite.",
    );
  }
}

/**
 * Delete the run's owner, which cascades to every path and step the specs seeded
 * (`on delete cascade`, same mechanism as `tests/integration/helpers/cleanup.ts`).
 *
 * The id arrives through a file rather than a variable because the owner is created
 * in the `setup` PROJECT, which is a worker process — nothing in memory here can see
 * it. A missing file means the setup project never got that far, which is not a
 * cleanup failure; teardown must never mask the real one.
 */
async function deleteRunOwner(): Promise<void> {
  if (!fs.existsSync(OWNER_ID_FILE)) {
    return;
  }
  const userId = fs.readFileSync(OWNER_ID_FILE, "utf8").trim();
  fs.rmSync(OWNER_ID_FILE);
  if (userId.length === 0) {
    return;
  }

  // Imported lazily: pulling supabase-js into the runner's module graph at config
  // load would cost every `--list` and every worker start for a call made once.
  const { admin } = await import("./fixtures/auth");
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    // A stale owner is a local-DB annoyance, not a reason to fail a green run.
    process.stderr.write(`[e2e teardown] could not delete owner ${userId}: ${error.message}\n`);
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await assertPrerequisites();

  // Net for the paths a returned teardown does not cover — Ctrl+C, a reporter crash.
  // `restoreDevVars` is synchronous and idempotent (the sidecar's existence is its
  // entire state), so running it twice, or when no stash happened, is a no-op.
  process.once("exit", restoreDevVars);

  return async () => {
    await Promise.race([
      deleteRunOwner(),
      new Promise((resolve) => setTimeout(resolve, OWNER_DELETE_TIMEOUT_MS)),
    ]).catch((error: unknown) => {
      process.stderr.write(`[e2e teardown] owner cleanup failed: ${String(error)}\n`);
    });
    // Always last, and always: the contributor's `.dev.vars` outranks a tidy DB.
    if (fs.existsSync(STORAGE_STATE)) {
      fs.rmSync(STORAGE_STATE);
    }
    restoreDevVars();
  };
}
