/**
 * `[api] degraded` channel unit coverage (`swallowed-write-errors` Phase 1).
 *
 * The risk this file defends: the five call sites that use this channel have **no
 * automated proof of their own**. Three of them bump a parent row fire-and-forget
 * with no test seam (`./paths` transitively imports `astro:env/server`, so it
 * cannot load here), one lives in middleware, and one is only reachable through a
 * fault proxy. So the branch selection and the line format are observable in this
 * file or nowhere, which is why `audit.ts` is import-free in the first place.
 *
 * Two branches matter more than the rest and are the reason `auditSideEffect`
 * exists at all:
 *
 * - `count === 0` with `error === null` is the RLS-refusal / row-deleted-mid-request
 *   case. A call site that only destructures `error` discards it silently, which is
 *   the defect class this whole change is about.
 * - `count === null` must stay **silent**. Treating an absent count as a miss turns
 *   every successful write into a line and floods the channel — a log nobody can
 *   read is worse than no log, and this is the only place that rule is enforced.
 *
 * The exact string is asserted rather than matched loosely because
 * `docs/reference/contract-surfaces.md` registers it: a reformat is a contract
 * break and should fail here, not go unnoticed until someone's grep stops matching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditSideEffect, logDegraded } from "./audit";

/**
 * Silence the real `console.error` while capturing calls — the suite's own output
 * stays readable, and the spy is what the assertions read. Wrapped in a function
 * so `errorSpy`'s type is inferred rather than spelled against a `vi.spyOn`
 * generic signature that has changed shape between vitest majors.
 */
function captureConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

let errorSpy: ReturnType<typeof captureConsoleError>;

beforeEach(() => {
  errorSpy = captureConsoleError();
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("logDegraded", () => {
  it("emits the registered line shape, with the detail as a separate argument", () => {
    const cause = { message: "permission denied for table upgrade_paths" };

    logDegraded({
      op: "steps.append.bump",
      subject: { path: "11111111-2222-3333-4444-555555555555" },
      cause: "write-failed",
      detail: cause,
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "[api] degraded op=steps.append.bump path=11111111-2222-3333-4444-555555555555 cause=write-failed",
      cause,
    );
  });

  it("keeps subject keys in insertion order between op and cause", () => {
    logDegraded({
      op: "middleware.getUser",
      subject: { route: "/dashboard", step: "abc" },
      cause: "auth-unavailable",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[api] degraded op=middleware.getUser route=/dashboard step=abc cause=auth-unavailable",
    );
  });

  it("omits the second argument entirely when there is no detail", () => {
    logDegraded({ op: "paths.toPathStep.snapshot", subject: { step: "s-1" }, cause: "snapshot-corrupt" });

    // A bare trailing `undefined` would be noise a reader has to learn to ignore.
    expect(errorSpy.mock.calls[0]).toHaveLength(1);
  });

  it("emits no stray separator when the subject is empty", () => {
    logDegraded({ op: "auth.signOut.revoke", subject: {}, cause: "revoke-failed" });

    expect(errorSpy).toHaveBeenCalledWith("[api] degraded op=auth.signOut.revoke cause=revoke-failed");
  });
});

describe("auditSideEffect", () => {
  const site = { op: "steps.deleteLast.bump", subject: { path: "p-1" } };

  it("reports write-failed when the write errored", () => {
    const error = { message: "could not serialize access" };

    auditSideEffect({ ...site, error, count: null });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[api] degraded op=steps.deleteLast.bump path=p-1 cause=write-failed", error);
  });

  it("reports write-missed when the write matched zero rows without erroring", () => {
    // The RLS refusal / row-deleted-mid-request case: `error` is null, so a call
    // site that only destructures `error` sees nothing at all.
    auditSideEffect({ ...site, error: null, count: 0 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[api] degraded op=steps.deleteLast.bump path=p-1 cause=write-missed");
  });

  it("stays silent when the write matched its row", () => {
    auditSideEffect({ ...site, error: null, count: 1 });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("stays silent when no count was requested, rather than reporting a miss", () => {
    // `null` means "the caller did not ask", not "zero rows". Reporting it would
    // put a line on every successful write and drown the two above.
    auditSideEffect({ ...site, error: null, count: null });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("prefers write-failed over write-missed when a failed write also reports zero rows", () => {
    const error = { message: "deadlock detected" };

    auditSideEffect({ ...site, error, count: 0 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[api] degraded op=steps.deleteLast.bump path=p-1 cause=write-failed", error);
  });
});
