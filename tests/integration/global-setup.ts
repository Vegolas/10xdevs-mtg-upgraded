import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TEST_PORT } from "./helpers/env";
import { FAULT_BASE_URL, FAULT_PORT, FAULT_PROXY_URL, startFaultProxy, type FaultProxy } from "./helpers/faultProxy";

/**
 * Vitest `globalSetup`: boot real `astro dev` servers pointed at local Supabase
 * before the suite, tear them down after. Every test then issues real HTTP that
 * runs the actual middleware (`getUser()`) + handlers (`requireUser`) + RLS —
 * there is nothing in-process to mock without bypassing the thing under test.
 *
 * TWO servers now:
 *
 * - the **main** server on `TEST_PORT`, talking straight to local Supabase —
 *   every pre-existing suite uses only this one and is unaffected;
 * - the **fault** server on `FAULT_PORT`, whose `SUPABASE_URL` points at
 *   `helpers/faultProxy.ts` so a single route's failure can be armed on demand.
 *   Only `fault-*.int.test.ts` uses it.
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
 * Move the contributor's real `.dev.vars` out of the way for the whole run.
 *
 * The @astrojs/cloudflare adapter parses `.dev.vars` and assigns it over
 * `process.env` — that assignment is why the file wins over the env we inject
 * when spawning. So a server that must read an env-injected `SUPABASE_URL` (the
 * fault server, pointed at the proxy) can only do so while no `.dev.vars`
 * exists. We rename rather than copy for exactly that reason; `.dev.vars` is
 * *absent* between this call and {@link writeLocalDevVars}.
 *
 * Crash-safe: a leftover `.dev.vars.intbak` from a previously killed run means
 * `.dev.vars` currently holds OUR local copy, so we restore the original first.
 * Returns the restore thunk.
 */
function stashDevVars(): () => void {
  // Recover from a prior crashed run before taking a fresh snapshot.
  if (fs.existsSync(DEV_VARS_BACKUP)) {
    fs.renameSync(DEV_VARS_BACKUP, DEV_VARS);
  }

  const hadOriginal = fs.existsSync(DEV_VARS);
  if (hadOriginal) {
    fs.renameSync(DEV_VARS, DEV_VARS_BACKUP);
  }

  return () => {
    if (fs.existsSync(DEV_VARS_BACKUP)) {
      fs.renameSync(DEV_VARS_BACKUP, DEV_VARS);
    } else if (!hadOriginal && fs.existsSync(DEV_VARS)) {
      fs.rmSync(DEV_VARS);
    }
  };
}

/**
 * Point the main dev server at LOCAL Supabase via the file the adapter reads.
 *
 * Belt and braces: the spawn env already carries the local URL, but the file
 * overwrites `process.env` at `astro:config:done`, so writing it here means the
 * main server lands on local Supabase even if something else repoints the
 * environment mid-run.
 */
function writeLocalDevVars(): void {
  fs.writeFileSync(DEV_VARS, `SUPABASE_URL=${SUPABASE_URL}\nSUPABASE_KEY=${SUPABASE_KEY}\n`);
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

interface BootOptions {
  /** Appears only in the boot announcement and the timeout error. */
  label: string;
  port: number;
  /** Polled until it answers. Separate from `port` so `TEST_BASE_URL` keeps overriding the main server's. */
  readyUrl: string;
  /** Layered over `process.env` for this server only — this is how the fault server gets the proxy URL. */
  env: Record<string, string>;
}

interface DevServer {
  stop: () => Promise<void>;
}

/**
 * Spawn one `astro dev`, wait for it to answer, and return its teardown thunk.
 *
 * Extracted because the boot is needed twice now. On failure it kills the child
 * itself and throws with the captured log — the caller still owns everything
 * booted before it.
 */
async function bootDevServer(options: BootOptions): Promise<DevServer> {
  process.stderr.write(`[integration] booting ${options.label} dev server on port ${options.port}\n`);

  const isWindows = process.platform === "win32";
  const child = spawn(
    isWindows ? "npx.cmd" : "npx",
    ["astro", "dev", "--port", String(options.port), "--host", "127.0.0.1"],
    {
      cwd: ROOT_DIR,
      // The dev server gets only a Supabase URL + anon key — never the service-role key.
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: !isWindows,
      shell: isWindows,
    },
  );

  // Two consumers of the child's output. The buffer is only read when boot fails
  // (the throw below). The passthrough to our own stderr is what keeps 500s
  // diagnosable now that the response body is redacted: `serverError` logs the
  // correlation `ref` plus the Postgres detail server-side, and without this the
  // dev server's stdout is captured and discarded, so that line would go nowhere.
  // The same passthrough carries `[api] degraded` lines. Chunks are written
  // through unmodified — no label prefix — so a log line is byte-identical to
  // what the server emitted; the boot announcement above is what separates them.
  let log = "";
  child.stdout.on("data", (chunk: Buffer) => {
    log += chunk.toString();
    process.stderr.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    log += chunk.toString();
    process.stderr.write(chunk);
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      await fetch(options.readyUrl, { signal: AbortSignal.timeout(2000) });
      ready = true;
      break;
    } catch {
      await delay(500);
    }
  }

  if (!ready) {
    await killServer(child);
    // A busy port is the likely cause of a silent miss: `astro dev` falls
    // forward to the next free port, so it is running — just not where we look.
    throw new Error(
      `astro dev (${options.label}) did not become ready at ${options.readyUrl} within ${BOOT_TIMEOUT_MS}ms.\n` +
        `--- dev server log ---\n${log}`,
    );
  }

  return {
    stop: () => killServer(child),
  };
}

export default async function setup(): Promise<() => Promise<void>> {
  await assertPrerequisites();

  const stops: (() => Promise<void>)[] = [];
  let proxy: FaultProxy | undefined;
  let restoreDevVars: (() => void) | undefined;

  const teardown = async (): Promise<void> => {
    for (const stop of [...stops].reverse()) {
      await stop();
    }
    restoreDevVars?.();
    await proxy?.stop();
  };

  try {
    proxy = await startFaultProxy();

    // Order is load-bearing, see `stashDevVars`: the fault server must boot
    // while no `.dev.vars` exists, so that the proxy URL we inject through the
    // spawn env is what it actually resolves. The file goes back only after it
    // is up. `helpers/faultProxy.ts` counts logout hits precisely because a
    // config reload here would be silent.
    restoreDevVars = stashDevVars();

    stops.push(
      (
        await bootDevServer({
          label: "fault",
          port: FAULT_PORT,
          // An API route, not `/`: the two dev servers share one
          // `node_modules/.vite` deps cache, and SSR-rendering a React island
          // during this server's cold `optimizeDeps` churn mixes two optimizer
          // generations and throws "Invalid hook call" — a flood of noise from
          // a page no fault spec ever requests. `/api/paths` answers 401 JSON
          // through the real middleware with no React in the graph.
          readyUrl: `${FAULT_BASE_URL}/api/paths`,
          env: { SUPABASE_URL: FAULT_PROXY_URL, SUPABASE_KEY },
        })
      ).stop,
    );

    writeLocalDevVars();

    stops.push(
      (
        await bootDevServer({
          label: "main",
          port: TEST_PORT,
          readyUrl: BASE_URL,
          env: { SUPABASE_URL, SUPABASE_KEY },
        })
      ).stop,
    );
  } catch (cause) {
    await teardown();
    throw cause;
  }

  return teardown;
}
