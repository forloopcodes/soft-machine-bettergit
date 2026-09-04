/**
 * Browser-side client for the plugin's VM bridge (bindings/vm/github-bridge.js).
 *
 * The host hands the plugin a token-gated service URL of the form
 * `https://<machine>/svc/forge/github-bridge/?token=sc_...`. Every request
 * carries that token twice: in the query string, because the /svc proxy
 * authenticates CORS preflights from it, and as `Authorization: Bearer`,
 * which the proxy forwards to the bridge for its own validation. No GitHub
 * credential ever reaches this code.
 */

import { ForgeError } from "../types";

export interface BridgeEndpoint {
  origin: string;
  /** Path prefix including the trailing slash, e.g. "/svc/forge/github-bridge/". */
  prefix: string;
  token: string;
  /** Identity for cache keys: the endpoint without its token. */
  key: string;
}

export type WhoAmI =
  | { mode: "user"; login: string | null }
  | { mode: "installation"; login: null; repositoryCount: number | null }
  | { mode: "none"; error: string };

export interface LocalRepository {
  path: string;
  origin: string;
}

export type GithubMethod = "GET" | "POST" | "PATCH" | "PUT";

export interface GithubRequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface BridgeClient {
  readonly key: string;
  whoami(signal?: AbortSignal): Promise<WhoAmI>;
  localRepos(signal?: AbortSignal): Promise<LocalRepository[]>;
  github<T>(method: GithubMethod, path: string, options?: GithubRequestOptions): Promise<T>;
}

export function parseBridgeBaseUrl(baseUrl: string): BridgeEndpoint | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const token = url.searchParams.get("token");
  if (!token) return null;
  const prefix = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return { origin: url.origin, prefix, token, key: `${url.origin}${prefix}` };
}

function bridgeUrl(endpoint: BridgeEndpoint, route: string, query?: GithubRequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(name, String(value));
  }
  params.set("token", endpoint.token);
  return `${endpoint.origin}${endpoint.prefix}${route.replace(/^\//, "")}?${params.toString()}`;
}

/**
 * Turn a non-2xx response into a ForgeError whose `code` the UI can map to
 * copy. Bridge-originated errors carry `{ error }`; GitHub errors carry
 * `{ message }` and are tagged by the bridge with x-forge-upstream.
 */
export function classifyFailure(
  status: number,
  body: unknown,
  fromGithub: boolean
): ForgeError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message : "";
  const bridgeCode = typeof record.error === "string" ? record.error : null;

  if (!fromGithub) {
    switch (bridgeCode) {
      case "unauthorized":
        return new ForgeError("bridge_unauthorized", status, "The bridge rejected the service token.");
      case "gh_not_authenticated":
      case "gh_unavailable":
        return new ForgeError("not_connected", status, message || "gh is not signed in on the workspace machine.");
      case "github_unreachable":
      case "github_timeout":
        return new ForgeError("forge_timeout", status, message || "GitHub did not answer.");
      case "route_not_allowed":
        return new ForgeError("forge_error:route", status, "The bridge refused that GitHub route.");
      default:
        return new ForgeError(bridgeCode ? `forge_error:${bridgeCode}` : `forge_error:${status}`, status, message);
    }
  }

  if (status === 401) return new ForgeError("invalid_api_key", status, message);
  if (status === 404) return new ForgeError("not_found", status, message);
  if (status === 429 || (status === 403 && /rate limit/i.test(message))) {
    return new ForgeError("rate_limited", status, message);
  }
  if (status === 403) return new ForgeError("forbidden", status, message);
  if (status === 405 || status === 409) return new ForgeError("not_mergeable", status, message);
  if (status === 422) return new ForgeError("validation", status, message);
  return new ForgeError(`forge_error:${status}`, status, message);
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 200) };
  }
}

export function createBridgeClient(baseUrl: string): BridgeClient | null {
  const endpoint = parseBridgeBaseUrl(baseUrl);
  if (!endpoint) return null;

  async function call<T>(
    method: GithubMethod,
    route: string,
    query: GithubRequestOptions["query"],
    body: unknown,
    signal: AbortSignal | undefined
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${endpoint!.token}`,
    };
    const init: RequestInit = { method, headers, cache: "no-store", signal };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await fetch(bridgeUrl(endpoint!, route, query), init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ForgeError("bridge_unreachable", 0, "The workspace machine did not answer.");
    }
    const payload = await parseJson(response);
    if (!response.ok) {
      throw classifyFailure(response.status, payload, response.headers.get("x-forge-upstream") === "github");
    }
    return payload as T;
  }

  // whoami is cheap but answers the same for a minute; every panel asks.
  let whoamiCache: { at: number; promise: Promise<WhoAmI> } | null = null;

  return {
    key: endpoint.key,
    whoami(signal) {
      const now = Date.now();
      if (whoamiCache && now - whoamiCache.at < 60_000) return whoamiCache.promise;
      const promise = call<WhoAmI>("GET", "whoami", undefined, undefined, signal);
      whoamiCache = { at: now, promise };
      promise.catch(() => {
        whoamiCache = null;
      });
      return promise;
    },
    async localRepos(signal) {
      const result = await call<{ repositories?: LocalRepository[] }>("GET", "local/repos", undefined, undefined, signal);
      return Array.isArray(result?.repositories) ? result.repositories : [];
    },
    github<T>(method: GithubMethod, path: string, options: GithubRequestOptions = {}) {
      return call<T>(method, `gh${path}`, options.query, options.body, options.signal);
    },
  };
}
