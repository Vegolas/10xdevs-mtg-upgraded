/**
 * The `[api] degraded` evidence channel — the second of this project's two server
 * log contracts, and the only one for failures the caller is never told about.
 *
 * `serverError` (`./paths`) is the first: it answers a `500` whose body carries the
 * same correlation `ref` as its log line. That pairing is what makes `ref` useful,
 * and it is exactly what these sites cannot have — a `201`, a `204` or a redirect
 * has no body to put a handle in, so a `ref` here would correlate to nothing. This
 * channel is therefore keyed on the **entity** instead: the subject keys are the
 * handle, and a reader greps for the path or step id rather than for a UUID that
 * appears in one place.
 *
 * Emitted line shape — registered in `docs/reference/contract-surfaces.md`, so it
 * is a contract and not a formatting preference:
 *
 * ```
 * [api] degraded op=<op> <k>=<v>… cause=<cause>
 * ```
 *
 * A line on this channel **never** implies a non-2xx answer. Its whole purpose is
 * to record a failure the handler deliberately absorbed.
 *
 * Deliberately import-free. It lives here rather than beside `serverError` because
 * `./paths` transitively reaches `astro:env/server` through `@/lib/supabase`, which
 * cannot load under `vitest.config.ts` — and the branch selection below is the only
 * layer of this change that can be tested automatically at all. Adding any import
 * that reaches `astro:*` or `@/lib/supabase` to this file silently deletes
 * `audit.test.ts`.
 */

/**
 * The closed set of reasons a handler absorbs a failure. Closed on purpose: a new
 * member is a new class of swallowed result and should be a deliberate edit here
 * plus a row in the registry, not a free-text string invented at a call site.
 *
 * - `write-failed` — the write returned an error and the handler answered anyway.
 * - `write-missed` — the write reported success but matched **zero rows** (an RLS
 *   refusal, or a row deleted mid-request). Distinct from `write-failed` because
 *   `error === null` here; see `auditSideEffect`.
 * - `snapshot-corrupt` — a stored snapshot failed to parse and the read path fell
 *   back to an empty one.
 * - `auth-unavailable` — the auth backend could not answer, so the request
 *   degraded to anonymous.
 * - `revoke-failed` — a token revoke failed and the session was cleared locally
 *   instead.
 */
export type DegradedCause = "write-failed" | "write-missed" | "snapshot-corrupt" | "auth-unavailable" | "revoke-failed";

/** One absorbed failure: what was attempted, on which entity, and why it degraded. */
export interface DegradedEvent {
  /** Dotted operation id, e.g. `steps.append.bump`. Stable enough to grep for. */
  op: string;
  /** Entity keys that stand in for `serverError`'s `ref` — e.g. `{ path: id }`. */
  subject: Record<string, string>;
  cause: DegradedCause;
  /** The raw cause, logged as `console.error`'s second argument and never sent to the wire. */
  detail?: unknown;
}

/**
 * Emit one line on the channel.
 *
 * The primitive every call site ultimately reaches, and the single place the line
 * is formatted. `detail` is passed as `console.error`'s second argument rather than
 * interpolated, matching `serverError` (`./paths`) — a `PostgrestError` names
 * tables, columns and constraints, and structured output keeps it readable in the
 * dev server's stdout without it ever touching a response body.
 */
export function logDegraded(event: DegradedEvent): void {
  const subject = Object.entries(event.subject)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const line = `[api] degraded op=${event.op}${subject === "" ? "" : ` ${subject}`} cause=${event.cause}`;
  // Spread rather than two calls so the single exemption below covers the whole
  // channel: a `write-missed` has no cause object, and logging a bare `undefined`
  // second argument is noise a reader has to learn to ignore.
  const args: [string] | [string, unknown] = event.detail === undefined ? [line] : [line, event.detail];
  // The only channel that carries these failures at all — see the module docstring.
  // eslint-disable-next-line no-console -- deliberate: this IS the evidence channel, mirroring `serverError`
  console.error(...args);
}

/** A Supabase write result, typed structurally so this module stays import-free. */
export interface SideEffectResult {
  op: string;
  subject: Record<string, string>;
  /** `PostgrestError`-shaped, or `null` on success. */
  error: { message: string } | null;
  /**
   * Rows matched, from `update(values, { count: "exact" })`. `null` means the
   * caller did not ask for a count — see the silence rule below.
   */
  count: number | null;
}

/**
 * Map a fire-and-forget write's result onto the channel: `write-failed` when it
 * errored, `write-missed` when it matched zero rows, silence otherwise.
 *
 * Both branches exist because they are genuinely different failures and only one
 * of them sets `error`. An RLS refusal, or a parent deleted between the primary
 * write and the bump, matches **zero rows with `error === null`** — so a call site
 * that only destructures `error` still discards that case. Requesting the count is
 * what makes it observable.
 *
 * `count === null` is **silence, not a miss.** A caller who forgot
 * `{ count: "exact" }`, or a client build that does not support it, would otherwise
 * turn every successful write into a `write-missed` line and flood the channel into
 * uselessness — the failure mode that makes a log worse than no log.
 */
export function auditSideEffect(result: SideEffectResult): void {
  if (result.error !== null) {
    logDegraded({
      op: result.op,
      subject: result.subject,
      cause: "write-failed",
      detail: result.error,
    });
    return;
  }
  if (result.count === 0) {
    logDegraded({ op: result.op, subject: result.subject, cause: "write-missed" });
  }
}
