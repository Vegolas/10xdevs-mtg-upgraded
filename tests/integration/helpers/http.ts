/**
 * Status assertion that surfaces the response body on mismatch.
 *
 * The `/api/paths/*` handlers return `{ error: <postgres/postgrest message> }`
 * on 500, so a bare `expect(res.status).toBe(200)` throws away the one line that
 * explains the failure — which makes a CI-only failure undiagnosable from the
 * log. Route every "expected status" check through here instead.
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
