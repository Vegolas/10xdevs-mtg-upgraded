import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolved environment + on-disk locations for the browser suite.
 *
 * The integration suite gets these from `vitest.integration.config.ts`, which loads
 * `.env.test` into `process.env` and forwards the keys to its worker forks
 * (`tests/integration/helpers/env.ts` then just reads them back). Playwright has no
 * equivalent hook, so the parse happens HERE, at module load, and every process that
 * imports this file — the runner, each worker, `playwright.config.ts` itself — gets
 * the same values.
 *
 * `process.env` deliberately wins over the file so CI, which has no `.env.test` and
 * exports the keys from the running stack into `$GITHUB_ENV`, needs no special case.
 *
 * Note what this file does NOT do: it never writes into `process.env`. The
 * service-role key must not reach the dev server, and the dev server inherits the
 * runner's `process.env` (see `webServer.env` in `playwright.config.ts`, which blanks
 * the key explicitly for the CI case where it genuinely is in the environment).
 */

/** This file's own directory, resolved the one way that survives both of Playwright's
 *  module modes (native ESM and its CJS fallback). */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Minimal `.env.test` reader — same shape as `vitest.integration.config.ts`'s, no dotenv dependency. */
function loadEnvTest(): Partial<Record<string, string>> {
  const file = path.resolve(HERE, "..", "..", "..", ".env.test");
  const loaded: Partial<Record<string, string>> = {};
  if (!fs.existsSync(file)) {
    return loaded;
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    loaded[key] = value;
  }
  return loaded;
}

const fileEnv = loadEnvTest();

function resolve(key: string, fallback = ""): string {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}

/** Dedicated port. NOT 4321: the integration harness defaults there
 *  (`tests/integration/helpers/env.ts`) with no collision handling, and Astro inherits
 *  Vite's `strictPort: false`, so a taken port silently binds the next one. */
export const E2E_PORT = Number(resolve("E2E_PORT", "4323"));

/** Base URL of the `astro dev` server Playwright owns. Also the `Origin` the app's
 *  own routes require: Astro answers a plain-text 403 to a same-shape POST that
 *  arrives without a matching Origin, before the handler runs. */
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Local Supabase API gateway — handed to the dev server via `webServer.env`. */
export const SUPABASE_URL = resolve("SUPABASE_URL", "http://127.0.0.1:54321");

/** Local anon key — handed to the dev server so its client matches production shape. */
export const SUPABASE_KEY = resolve("SUPABASE_KEY");

/** Local service_role key — test-process ONLY (owner create/delete). Never the dev server's. */
export const SUPABASE_SERVICE_ROLE_KEY = resolve("SUPABASE_SERVICE_ROLE_KEY");

const AUTH_DIR = path.resolve(HERE, "..", ".auth");

/** Where the `setup` project parks the signed-in browser state. Gitignored; good for
 *  ONE run — `supabase/config.toml:158` sets `jwt_expiry = 3600` and the server client
 *  forces `autoRefreshToken: false`, so it must never be cached across jobs. */
export const STORAGE_STATE = path.join(AUTH_DIR, "owner.json");

/** Sidecar holding the run's owner id, so `global-setup.ts`'s teardown can delete the
 *  owner (which cascades to every path and step the specs seeded) without the setup
 *  project and the teardown having to share a process. */
export const OWNER_ID_FILE = path.join(AUTH_DIR, "owner.id");
