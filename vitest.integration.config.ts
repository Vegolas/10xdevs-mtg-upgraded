import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration (DB-backed) test config — deliberately separate from
 * `vitest.config.ts` so `npm test` stays fast and DB-free. This config globs
 * only `tests/integration/**` and boots a real `astro dev` server via
 * `globalSetup` (see tests/integration/global-setup.ts).
 *
 * Run with: `npm run test:integration` (requires local Supabase up).
 */

/**
 * Minimal `.env.test` loader (no dotenv dependency). Loads into `process.env`
 * for the main process (global-setup reads it directly); the keys are then
 * forwarded to worker forks via `test.env` below. Existing real env vars win,
 * so CI can override without a file.
 */
function loadEnvTest(): Record<string, string> {
  const file = path.resolve(import.meta.dirname, ".env.test");
  const loaded: Record<string, string> = {};
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
    process.env[key] ??= value;
  }
  return loaded;
}

const envTest = loadEnvTest();

/** Forward only the keys the worker forks need (filtered to defined strings). */
function workerEnv(): Record<string, string> {
  const keys = ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TEST_PORT", "TEST_BASE_URL"];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key] ?? envTest[key];
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    env: workerEnv(),
    // One DB, one dev server: serialize everything so suites never race.
    // `fileParallelism: false` forces `maxWorkers` to 1 (Vitest 4), i.e. a
    // single fork running every file sequentially.
    pool: "forks",
    fileParallelism: false,
    // Server boot + real network round-trips are slower than unit assertions.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
