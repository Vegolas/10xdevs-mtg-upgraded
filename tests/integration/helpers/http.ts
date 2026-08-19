/**
 * Status assertion that surfaces the response body on mismatch.
 *
 * A bare `expect(res.status).toBe(200)` throws away the body — the one part of the
 * response that explains the failure — which makes a CI-only failure
 * undiagnosable from the log. Route every "expected status" check through here
 * instead.
 *
 * The `4xx` bodies carry the message directly (`{error: "Not found"}` and friends).
 * A `500` no longer does: since the contract-pinning change it is redacted to
 * `{error: "Internal error", ref: <uuid>}`, because the raw
 * `PostgrestError.message` it used to return named tables, columns and
 * constraints. So on a 500 the diagnosis is two-step — read `ref` out of this
 * message, then find the matching `[api] 500 ref=…` line in the dev server's
 * stderr, which `../global-setup.ts` pipes to the parent process.
 *
 * Consumes the body, so call it before reading `res.json()` yourself only on the
 * success path (the happy path never reads it here).
 */
export async function assertStatus(res: Response, expected: number, label: string): Promise<void> {
  if (res.status === expected) {
    return;
  }

  let detail: string;
  try {
    detail = (await res.text()).trim();
  } catch {
    detail = "<body unreadable>";
  }
  if (detail.length > 800) {
    detail = `${detail.slice(0, 800)}…`;
  }

  const suffix = detail.length > 0 ? ` — body: ${detail}` : " — empty body";
  throw new Error(`${label} expected ${expected}, got ${res.status}${suffix}`);
}
