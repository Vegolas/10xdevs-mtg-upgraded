import { describe, it, expect } from "vitest";
import { createLatestRun } from "./latestRun";

/**
 * The guard's algebra, proved at the cheapest layer.
 *
 * This is the whole reason the primitive is React-free: every browser spec for
 * risk #9 costs a signed-in session, a seeded path and a parked request, and
 * none of them should be spending that to establish that a second run
 * supersedes a first. What the browser specs prove is the *wiring* — which
 * event invalidates which lane. What is proved here is that supersession works
 * at all.
 *
 * The drop path in every consumer is a silent `return`, so a broken guard has
 * no symptom until rendered content contradicts the input. These cases are the
 * only place the mechanism is observed directly.
 */
describe("createLatestRun", () => {
  it("treats the only outstanding run as current", () => {
    const lane = createLatestRun();

    const token = lane.begin();

    expect(lane.isCurrent(token)).toBe(true);
  });

  it("supersedes an outstanding run when a newer one begins", () => {
    const lane = createLatestRun();

    const first = lane.begin();
    const second = lane.begin();

    expect(lane.isCurrent(first)).toBe(false);
    expect(lane.isCurrent(second)).toBe(true);
  });

  it("supersedes an outstanding run without starting one", () => {
    const lane = createLatestRun();
    const token = lane.begin();

    lane.invalidate();

    expect(lane.isCurrent(token)).toBe(false);
  });

  it("invalidates safely when nothing is outstanding", () => {
    const lane = createLatestRun();

    lane.invalidate();
    const token = lane.begin();

    // An invalidation before any run must not poison the next one — the
    // textarea's `onChange` fires long before the first Check is ever clicked.
    expect(lane.isCurrent(token)).toBe(true);
  });

  it("keeps lanes independent", () => {
    const preview = createLatestRun();
    const add = createLatestRun();

    const previewToken = preview.begin();
    add.begin();
    add.invalidate();

    // An add starting, or being invalidated, says nothing about a Check in
    // flight. Cross-lane invalidation is an explicit call at the call site, not
    // a side effect of sharing a counter.
    expect(preview.isCurrent(previewToken)).toBe(true);
  });

  it("never reads another lane's token as current", () => {
    const preview = createLatestRun();
    const add = createLatestRun();

    const previewToken = preview.begin();
    add.begin();

    // The property that makes lane isolation structural: tokens are opaque and
    // identity-compared, so passing the wrong lane's token cannot accidentally
    // pass. Two counters would both be at 1 here and this would read `true`.
    expect(add.isCurrent(previewToken)).toBe(false);
  });

  it("answers false for a token no run was ever issued", () => {
    const lane = createLatestRun();
    const foreign = createLatestRun().begin();

    expect(lane.isCurrent(foreign)).toBe(false);
  });

  it("is stable across repeated reads", () => {
    const lane = createLatestRun();

    const token = lane.begin();

    expect(lane.isCurrent(token)).toBe(true);
    expect(lane.isCurrent(token)).toBe(true);
  });
});
