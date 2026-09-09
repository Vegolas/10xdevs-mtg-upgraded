import http from "node:http";
import { SUPABASE_URL, TEST_PORT } from "./env";

/**
 * A transparent reverse proxy in front of local Supabase, plus an armable
 * failure for one route.
 *
 * Why this exists at all: the integration suite runs a real local stack, and
 * nothing sits between the Worker and Supabase — so there is no seam to make a
 * write or a revoke fail on demand (frame: "There is no seam to inject a
 * Supabase failure"). `POST /auth/v1/logout` is the one place where the failure
 * changes *behavior* rather than just observability, so it is the only failure
 * this harness buys.
 *
 * Two design constraints, both load-bearing:
 *
 * 1. **Control is over HTTP, not in-process.** `global-setup.ts` starts this
 *    server in vitest's main process while specs run in a worker fork, so a
 *    module-level `armed` flag set by a spec would be set in the wrong process.
 *    The spec arms and reads stats through {@link armLogoutFailure} /
 *    {@link faultStats}, which are ordinary `fetch` calls.
 *
 * 2. **It counts what it saw.** The proxy is only reached if the fault dev
 *    server actually resolved `SUPABASE_URL` to {@link FAULT_PROXY_URL} — and
 *    that resolution is fragile (see `global-setup.ts`, which writes the local
 *    `.dev.vars` *after* this server boots; an `astro dev` config reload would
 *    silently repoint it at real Supabase). A spec that never routed through
 *    here would then exercise nothing and pass, which is exactly the vacuous
 *    shape `context/foundation/lessons.md` warns about. So every
 *    `/auth/v1/logout` is counted and the spec asserts the count moved.
 *
 * Default state is fully transparent: the sign-in that specs do during setup
 * behaves exactly as it does against the main server.
 */

/** Port of the second, fault-injecting `astro dev` server. */
export const FAULT_PORT = TEST_PORT + 1;

/** Base URL of the fault dev server — the one whose Supabase calls are proxied. */
export const FAULT_BASE_URL = `http://127.0.0.1:${FAULT_PORT}`;

/** Port of this proxy. */
export const FAULT_PROXY_PORT = TEST_PORT + 2;

/**
 * Origin the fault dev server is told to use as its `SUPABASE_URL`.
 *
 * Derived from `TEST_PORT` rather than read from its own env var on purpose:
 * both the main process (global-setup) and the worker fork (the spec) compute
 * these three ports, and only `TEST_PORT` is forwarded to the fork by
 * `vitest.integration.config.ts`. A separate `FAULT_PORT` override would be
 * visible to one process and not the other.
 */
export const FAULT_PROXY_URL = `http://127.0.0.1:${FAULT_PROXY_PORT}`;

/** Paths under this prefix are the control surface; Supabase uses no such prefix. */
const CONTROL_PREFIX = "/__fault/";

/** The one route this harness can fail. Matched on pathname — auth-js appends `?scope=global`. */
const LOGOUT_PATH = "/auth/v1/logout";

/**
 * Hop-by-hop and body-framing request headers that must not be forwarded.
 *
 * `accept-encoding` is dropped deliberately: `fetch` transparently decompresses,
 * so forwarding it would hand us a decoded body still labelled
 * `content-encoding: gzip`. Asking upstream for plain bytes avoids re-encoding.
 */
const REQUEST_SKIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

/** Response headers we re-frame ourselves; `set-cookie` is copied via `getSetCookie()`. */
const RESPONSE_SKIP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
  "set-cookie",
]);

/** What the proxy has seen, and what it is currently rigged to do. */
export interface FaultStats {
  /** Every `POST /auth/v1/logout` the proxy handled, armed or not. The anti-vacuity signal. */
  logoutHits: number;
  /** Status the next logout will be answered with, or `null` when transparent. */
  armedLogoutStatus: number | null;
}

/** A running proxy plus its teardown thunk. */
export interface FaultProxy {
  stop: () => Promise<void>;
}

/**
 * Start the proxy on {@link FAULT_PROXY_PORT}.
 *
 * Called from `global-setup.ts` before the fault dev server boots, so the
 * server's very first Supabase call already has somewhere to land.
 */
export function startFaultProxy(): Promise<FaultProxy> {
  let logoutHits = 0;
  let armedLogoutStatus: number | null = null;

  function stats(): FaultStats {
    return { logoutHits, armedLogoutStatus };
  }

  function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function handleControl(res: http.ServerResponse, url: URL): void {
    const route = url.pathname.slice(CONTROL_PREFIX.length);
    if (route === "stats") {
      sendJson(res, 200, stats());
      return;
    }
    if (route === "arm-logout") {
      // Never 401/403/404: auth-js swallows exactly those three and clears the
      // session anyway (`GoTrueClient._signOut`), so arming one of them would
      // reproduce the happy path and the spec would cover nothing.
      const requested = Number(url.searchParams.get("status") ?? "500");
      armedLogoutStatus = Number.isFinite(requested) ? requested : 500;
      sendJson(res, 200, stats());
      return;
    }
    if (route === "disarm") {
      armedLogoutStatus = null;
      sendJson(res, 200, stats());
      return;
    }
    sendJson(res, 404, { error: `unknown fault-proxy control route: ${route}` });
  }

  async function forward(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (REQUEST_SKIP.has(name) || value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          headers.append(name, entry);
        }
      } else {
        headers.append(name, value);
      }
    }

    const target = new URL(`${url.pathname}${url.search}`, SUPABASE_URL);
    const upstream = await fetch(target, {
      method: req.method ?? "GET",
      headers,
      body: await readBody(req),
      // Pass a redirect through verbatim rather than resolving it here — the
      // caller (auth-js, PostgREST clients) decides what to do with it.
      redirect: "manual",
    });

    const outHeaders: Record<string, string | string[]> = {};
    upstream.headers.forEach((value, name) => {
      if (!RESPONSE_SKIP.has(name)) {
        outHeaders[name] = value;
      }
    });
    const setCookies = upstream.headers.getSetCookie();
    if (setCookies.length > 0) {
      outHeaders["set-cookie"] = setCookies;
    }

    res.writeHead(upstream.status, outHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", FAULT_PROXY_URL);

    if (url.pathname.startsWith(CONTROL_PREFIX)) {
      handleControl(res, url);
      return;
    }

    if (url.pathname === LOGOUT_PATH) {
      logoutHits += 1;
      if (armedLogoutStatus !== null) {
        sendJson(res, armedLogoutStatus, {
          code: armedLogoutStatus,
          message: "fault-proxy: injected logout failure",
        });
        return;
      }
    }

    await forward(req, res, url);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((cause: unknown) => {
      // A forward failure must not take the proxy down mid-suite; answer 502 so
      // the caller sees a transport error it can report.
      if (!res.headersSent) {
        sendJson(res, 502, {
          error: "fault-proxy forward failed",
          message: cause instanceof Error ? cause.message : "unknown cause",
        });
        return;
      }
      res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAULT_PROXY_PORT, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve({
        stop: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

/**
 * Read the request body as bytes; `undefined` for a bodyless method or an empty body.
 *
 * Copied into a plain `Uint8Array` rather than handed over as a `Buffer`: a
 * `Buffer` is backed by `ArrayBufferLike`, and `fetch`'s `BodyInit` requires an
 * `ArrayBuffer`-backed view.
 */
function readBody(req: http.IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(chunks.length === 0 ? undefined : new Uint8Array(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

/** Control-surface call, with the proxy's unreachability reported as itself rather than as a spec failure. */
async function control(route: string): Promise<FaultStats> {
  let res: Response;
  try {
    res = await fetch(`${FAULT_PROXY_URL}${CONTROL_PREFIX}${route}`, { method: "POST" });
  } catch {
    throw new Error(
      `fault proxy is not reachable at ${FAULT_PROXY_URL} — global-setup did not start it, or the port is taken.`,
    );
  }
  if (!res.ok) {
    throw new Error(`fault proxy control route ${route} answered ${res.status}`);
  }
  return (await res.json()) as FaultStats;
}

/**
 * Make the next `POST /auth/v1/logout` fail.
 *
 * Defaults to `500` because auth-js treats 401/403/404 as "already signed out"
 * and clears the session, which is the behavior under test rather than the
 * failure under test.
 */
export function armLogoutFailure(status = 500): Promise<FaultStats> {
  return control(`arm-logout?status=${status}`);
}

/** Return the proxy to fully transparent. */
export function disarmFaults(): Promise<FaultStats> {
  return control("disarm");
}

/** Read the hit counters — the proof that a spec's request actually went through the proxy. */
export function faultStats(): Promise<FaultStats> {
  return control("stats");
}
