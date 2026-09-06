import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { createSignedInOwner } from "./fixtures/auth";
import { OWNER_ID_FILE, STORAGE_STATE } from "./fixtures/env";

/**
 * The `setup` project: sign ONE owner in for the whole run and park the browser state
 * on disk, so every auth-dependent spec starts already signed in.
 *
 * Why once per run rather than once per spec: `supabase/config.toml:191` caps sign-ins
 * at 30 per 5 minutes per IP, and Playwright parallelizes by default. One sign-in per
 * run keeps the suite nowhere near that ceiling no matter how many specs are added,
 * and it is also the only shape that keeps the cost of auth off every spec's clock.
 *
 * Sharing an owner does NOT share state: each spec seeds its own timestamped path
 * (`seedPathWithStep`) and removes it, so tests stay independent and re-runnable. The
 * owner itself is deleted by `global-setup.ts`'s teardown, which reads the id below —
 * a file, because this runs in a worker process that the teardown cannot see into.
 */

setup("sign one owner in and save the browser state", async ({ request }) => {
  const owner = await createSignedInOwner(request, "owner");

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  // Cookies land in the jar from the app's own `Set-Cookie`, so what the browser
  // replays is byte-for-byte what the middleware issued — never a hand-built cookie.
  await request.storageState({ path: STORAGE_STATE });
  fs.writeFileSync(OWNER_ID_FILE, owner.user.id);
});
