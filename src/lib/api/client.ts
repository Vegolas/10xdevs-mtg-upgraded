/**
 * The browser's one typed seam for `/api/*` JSON calls (testing-api-contract-pinning).
 *
 * Every island used to hand-roll the same five lines — `fetch`, `!response.ok`, an
 * inline `{ error?: string }` re-declaration of the error envelope, then an
 * unchecked `as SomeDomainType` on the success body. The cast is the problem: it
 * asserts the contract instead of stating it, so a handler that starts returning a
 * different shape still compiles on both sides. Here the success type is a type
 * parameter that flows from `./contract`, and the error envelope is read once.
 *
 * Browser-safe: imports `./contract` (types only) and nothing from `./paths`, which
 * is server plumbing. Never throws — a transport failure is a result variant, so
 * call sites branch instead of wrapping every call in try/catch.
 */

import type { ApiError } from "./contract";

/** A call that reached the server and came back non-2xx. */
export interface HttpFailure {
  ok: false;
  kind: "http";
  status: number;
  /** The server's {@link ApiError} message when the body carried one, else a generic fallback. */
  error: string;
  /**
   * `false` when `error` is the generic fallback (the body was absent or not an
   * `ApiError`). A caller with its own phrasing for "the request failed" should
   * prefer that phrasing when this is `false`, and the server's message when it is
   * `true` — the server knows things the caller does not.
   */
  fromBody: boolean;
}

/**
 * No usable payload arrived: the request never completed, or the response body was
 * not JSON. One variant because the caller's recovery is the same for both — retry
 * or tell the user the app could not reach the server.
 */
export interface TransportFailure {
  ok: false;
  kind: "transport";
  error: string;
}

/** A successful call, carrying the declared response body. */
export interface RequestSuccess<T> {
  ok: true;
  data: T;
}

/** The outcome of a {@link requestJson} call — discriminated on `ok`, then on `kind`. */
export type RequestResult<T> = RequestSuccess<T> | HttpFailure | TransportFailure;

/**
 * Call a JSON API route and return its declared body as `T`.
 *
 * `T` is the contract, so write it explicitly: `requestJson<UpgradePath>(…)`. A
 * `204` (or any empty body) resolves to `data: null`, so a route declared to answer
 * with no content is called as `requestJson<null>(…)`.
 */
export async function requestJson<T>(input: string, init?: RequestInit): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    return { ok: false, kind: "transport", error: "Could not reach the server." };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Partial<ApiError> | null;
    const message = typeof body?.error === "string" && body.error.trim() !== "" ? body.error : null;
    return {
      ok: false,
      kind: "http",
      status: response.status,
      error: message ?? `Request failed (${response.status}).`,
      fromBody: message !== null,
    };
  }

  const text = await response.text();
  if (text.trim() === "") {
    return { ok: true, data: null as T };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, kind: "transport", error: "The server sent an unreadable response." };
  }
}
