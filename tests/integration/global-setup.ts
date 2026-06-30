import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TEST_PORT } from "./helpers/env";

/**
 * Vitest `globalSetup`: boot a real `astro dev` server pointed at local Supabase
 * before the suite, tear it down after. Every test then issues real HTTP that
 * runs the actual middleware (`getUser()`) + handlers (`requireUser`) + RLS —
 * there is nothing in-process to mock without bypassing the thing under test.
 *
 * Prerequisite: local Supabase is already running (`npx supabase start`). CI
 * boots it explicitly (Phase 4). No DB reset here — tests self-clean.
 */

const ROOT_DIR = path.resolve(import.meta.dirname, "..", "..");
const DEV_VARS = path.join(ROOT_DIR, ".dev.vars");
const DEV_VARS_BACKUP = path.join(ROOT_DIR, ".dev.vars.intbak");
const BOOT_TIMEOUT_MS = 60_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Fail fast with a clear message when the prerequisites aren't met. */
async function assertPrerequisites(): Promise<void> {
  if (SUPABASE_KEY.length === 0 || SUPABASE_SERVICE_ROLE_KEY.length === 0) {
    throw new Error(
      "Integration env is incomplete. Copy `.env.test.example` to `.env.test` and fill " +
        "SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY from `npx supabase status`.",
    );
  }
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(
      `Local Supabase is not reachable at ${SUPABASE_URL}. Start it with \`npx supabase start\` ` +
        "before running the integration suite.",
    );
  }
}

/**
 * Point the dev server at LOCAL Supabase by overriding `.dev.vars`, which the
 * @astrojs/cloudflare adapter resolves `astro:env/server` from (via
 * getPlatformProxy) — it wins over the env we inject when spawning. We snapshot
 * the contributor's real `.dev.vars` to a sidecar and restore it on teardown.
 *
 * Crash-safe: a leftover `.dev.vars.intbak` from a previously killed run means
 * `.dev.vars` currently holds OUR local copy, so we restore the original first.
 * Returns the restore thunk.
 */
function overrideDevVars(): () => void {
  // Recover from a prior crashed run before taking a fresh snapshot.
  if (fs.existsSync(DEV_VARS_BACKUP)) {
    fs.renameSync(DEV_VARS_BACKUP, DEV_VARS);
  }

  const hadOriginal = fs.existsSync(DEV_VARS);
  if (hadOriginal) {
    fs.copyFileSync(DEV_VARS, DEV_VARS_BACKUP);
  }
  fs.writeFileSync(DEV_VARS, `SUPABASE_URL=${SUPABASE_URL}\nSUPABASE_KEY=${SUPABASE_KEY}\n`);

  return () => {
    if (fs.existsSync(DEV_VARS_BACKUP)) {
      fs.renameSync(DEV_VARS_BACKUP, DEV_VARS);
    } else if (!hadOriginal && fs.existsSync(DEV_VARS)) {
      fs.rmSync(DEV_VARS);
    }
  };
}

/** Cross-platform process-tree kill so no orphaned `astro dev` survives the run. */
function killServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.pid === undefined || child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => {
      resolve();
    });
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    // Safety net: resolve even if the `exit` event never arrives.
    setTimeout(() => {
      resolve();
    }, 5000);
  });
}

export default async function setup(): Promise<() => Promise<void>> {
  await assertPrerequisites();

  // Repoint the dev server at local Supabase, then guarantee restoration.
  const restoreDevVars = overrideDevVars();

  const isWindows = process.platform === "win32";
  const child = spawn(
    isWindows ? "npx.cmd" : "npx",
    ["astro", "dev", "--port", String(TEST_PORT), "--host", "127.0.0.1"],
    {
      cwd: ROOT_DIR,
      // The dev server gets only the local URL + anon key — never the service-role key.
      env: { ...process.env, SUPABASE_URL, SUPABASE_KEY },
      stdio: ["ignore", "pipe", "pipe"],
      detached: !isWindows,
      shell: isWindows,
    },
  );

  let log = "";
  child.stdout.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
      ready = true;
      break;
    } catch {
      await delay(500);
    }
  }

  if (!ready) {
    await killServer(child);
    restoreDevVars();
    throw new Error(
      `astro dev did not become ready at ${BASE_URL} within ${BOOT_TIMEOUT_MS}ms.\n` + `--- dev server log ---\n${log}`,
    );
  }

  return async () => {
    await killServer(child);
    restoreDevVars();
  };
}
