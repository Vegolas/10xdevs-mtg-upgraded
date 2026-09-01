/**
 * PostToolUse hook: run the unit tests related to a file the agent just wrote.
 *
 * Layer 1 of test-plan.md §5's local quality stack (per-edit). Scoped to the
 * hot, unit-covered logic behind risks #4-#6 — measured 1.9s there, against
 * 11.9s for `eslint` on a single file and 25.7s for `astro check`, which is
 * why those two stay at the commit gate and only this one runs per edit.
 *
 * Contract with the harness:
 *   - the PostToolUse payload arrives as JSON on stdin (`tool_input.file_path`);
 *     `command` handlers get no `${...}` interpolation, so it is parsed here
 *   - exit 0  => silent, nothing enters the agent's context
 *   - exit 2  => blocking, and the harness shows *stderr* to the agent
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No payload (manual run, or a harness that changed shape): stay out of the way.
  process.exit(0);
}

const file = payload?.tool_input?.file_path;
if (typeof file !== "string") {
  process.exit(0);
}

const relative = path.relative(root, file).replaceAll("\\", "/");

/**
 * Scope = test-plan §2 rows #4-#6: the churny, unit-covered logic
 * (`src/lib/path` 23 commits/30d, `card-data` 23, `deck` 29) plus the deck
 * component helpers that carry their own unit tests. Everything else is
 * defended at the integration or E2E layer, which boots Supabase and an
 * `astro dev` server and has no business inside a per-edit hook.
 *
 * The filter is not just an optimisation: the dominant edit in this repo is a
 * markdown file under `context/`, and `vitest related` still costs ~2s to
 * discover that a plan file has no related tests.
 */
const IN_SCOPE = /^src\/(lib\/(path|card-data|deck)|components\/deck)\/.*\.tsx?$/;
if (!IN_SCOPE.test(relative)) {
  process.exit(0);
}

// The local bin directly, not `npx` — npx resolution costs ~1.3s of the 3.2s.
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(process.execPath, [vitest, "related", relative, "--run"], {
  cwd: root,
  encoding: "utf8",
});

if (result.status === 0) {
  process.exit(0);
}

// Vitest reports to stdout, which on exit 2 reaches the debug log only. Without
// this re-route the agent is blocked with no idea what broke — the one line that
// earns the hook. Never add `-u`: the `*.golden.test.ts` snapshots are risk #6's
// protection, and an auto-updating hook would bless exactly the drift they catch.
//
// Capped because Vitest 4.1.9 has no compact/agent reporter (`AI_AGENT` does not
// appear anywhere in its dist tree, so the usual tip is a no-op here): one broken
// engine function already prints ~190 lines. The head keeps the failed-file
// summary, the tail keeps the assertion diffs; only the repetitive middle goes.
const LIMIT = 16_000;
const report = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const dropped = report.length - LIMIT;

process.stderr.write(
  dropped <= 0
    ? report
    : [
        report.slice(0, LIMIT / 2),
        `[... ${dropped} characters of vitest output dropped. Re-run the full report with:`,
        `      npx vitest related ${relative} --run ...]`,
        report.slice(-LIMIT / 2),
      ].join("\n\n"),
);
process.exit(2);
