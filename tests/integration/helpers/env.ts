/**
 * Resolved integration-test environment, read once from `process.env`.
 *
 * `vitest.integration.config.ts` loads `.env.test` into `process.env` (main
 * process) and forwards these keys to the worker forks via `test.env`, so both
 * the dev-server lifecycle (global-setup) and the test files read the same
 * values here.
 */

/** Port the integration dev server listens on (overridable for CI / collisions). */
export const TEST_PORT = Number(process.env.TEST_PORT ?? 4321);

/** Base URL of the running `astro dev` server under test. */
export const BASE_URL = process.env.TEST_BASE_URL ?? `http://127.0.0.1:${TEST_PORT}`;

/** Local Supabase API gateway (also injected into the dev server's env). */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

/** Local anon key — handed to the dev server so its client matches production shape. */
export const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "";

/** Local service_role key — test-process only (admin seeding/teardown, DB read-back). */
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
