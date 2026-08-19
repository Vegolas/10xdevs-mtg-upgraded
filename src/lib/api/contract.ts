/**
 * The declared `/api/paths/*` wire contract (testing-api-contract-pinning).
 *
 * The single declaration site for the shapes that cross the HTTP boundary, so the
 * handlers, the React islands and the contract suites all state the same thing
 * once. Before this module the contract was convention: `jsonResponse` took
 * `unknown`, the `{error}` envelope was re-declared inline in four places, and the
 * `{path, steps}` composite existed only as an object literal inside a handler.
 *
 * Types only — no runtime imports, no server plumbing — so a browser island can
 * import it as freely as a route handler. Success bodies stay the domain types
 * from `@/lib/path`; this module names the *envelopes* around them and the request
 * shapes the guards in `@/lib/path`'s `request.ts` validate.
 *
 * The authority for every status/body pairing is the decided-contract table in
 * `context/changes/testing-api-contract-pinning/plan.md`, not this file — the
 * table says which shape belongs to which route, this file makes the shape
 * checkable.
 */

import type { PathStep, StepSnapshot, UpgradePath } from "@/lib/path";

/**
 * Re-exported so the wire contract has one import site: a consumer that needs a
 * response body and its envelope pulls both from here.
 */
export type { PathStep, StepSnapshot, UpgradePath };

/** Every non-2xx `/api/paths/*` body: a single human-readable message. */
export interface ApiError {
  error: string;
}

/**
 * A 500 body. `error` is deliberately generic — the cause is logged server-side
 * against `ref`, which is the handle that correlates a failed response to the
 * server log line (see `serverError` in `./paths`).
 */
export interface ApiServerError extends ApiError {
  /** Correlation id, also emitted by the server's `console.error` for this failure. */
  ref: string;
}

/** `GET /api/paths/[id]` — the path plus its `position`-ascending steps. */
export interface PathWithStepsResponse {
  path: UpgradePath;
  steps: PathStep[];
}

/** Request body for `POST /api/paths` and `PATCH /api/paths/[id]`. */
export interface PathTitleRequest {
  title: string;
}

/**
 * Request body for `POST /api/paths/[id]/steps`. `position` is server-owned and
 * ignored if sent. `deltaText` is optional provenance: a blank or absent value
 * collapses to `null` (the full-paste shape) rather than failing validation.
 */
export interface StepCreateRequest {
  name: string;
  listText: string;
  snapshot: StepSnapshot;
  deltaText?: string | null;
}
