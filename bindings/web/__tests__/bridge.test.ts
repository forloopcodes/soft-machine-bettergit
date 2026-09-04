/**
 * Browser bridge client: URL construction against the host's token-gated
 * service URL, dual token delivery, and failure classification.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyFailure, createBridgeClient, githubDetail, parseBridgeBaseUrl } from "../github/bridge";

const BASE = "https://sm-ws-x.fly.dev/svc/forge/github-bridge/?token=sc_abcDEF123_-xyz";

describe("parseBridgeBaseUrl", () => {
  it("splits origin, prefix, and token, and keys the endpoint without the token", () => {
    expect(parseBridgeBaseUrl(BASE)).toEqual({
      origin: "https://sm-ws-x.fly.dev",
      prefix: "/svc/forge/github-bridge/",
      token: "sc_abcDEF123_-xyz",
      key: "https://sm-ws-x.fly.dev/svc/forge/github-bridge/",
    });
    expect(parseBridgeBaseUrl("https://h/svc/forge/github-bridge?token=t")?.prefix).toBe("/svc/forge/github-bridge/");
  });

  it("rejects URLs without a token or that do not parse", () => {
    expect(parseBridgeBaseUrl("https://h/svc/forge/github-bridge/")).toBeNull();
    expect(parseBridgeBaseUrl("not a url")).toBeNull();
  });
});

describe("classifyFailure", () => {
  it("maps bridge-level errors", () => {
    expect(classifyFailure(401, { error: "unauthorized" }, false).code).toBe("bridge_unauthorized");
    expect(classifyFailure(503, { error: "gh_not_authenticated" }, false).code).toBe("not_connected");
    expect(classifyFailure(502, { error: "github_timeout" }, false).code).toBe("forge_timeout");
    expect(classifyFailure(403, { error: "route_not_allowed" }, false).code).toBe("forge_error:route");
  });

  it("maps GitHub statuses and keeps GitHub's message as detail", () => {
    expect(classifyFailure(401, { message: "Bad credentials" }, true).code).toBe("invalid_api_key");
    expect(classifyFailure(403, { message: "API rate limit exceeded for installation" }, true).code).toBe("rate_limited");
    const forbidden = classifyFailure(403, { message: "Resource not accessible by integration" }, true);
    expect(forbidden.code).toBe("forbidden");
    expect(forbidden.detail).toBe("Resource not accessible by integration");
    expect(classifyFailure(404, { message: "Not Found" }, true).code).toBe("not_found");
    expect(classifyFailure(405, { message: "Pull Request is not mergeable" }, true).code).toBe("not_mergeable");
    expect(classifyFailure(422, { message: "Validation Failed" }, true).code).toBe("validation");
    expect(classifyFailure(429, {}, true).code).toBe("rate_limited");
    expect(classifyFailure(500, {}, true).code).toBe("github_unavailable");
    expect(classifyFailure(301, {}, true).code).toBe("not_found");
    expect(classifyFailure(418, {}, true).code).toBe("forge_error:418");
  });

  it("surfaces the per-field reasons GitHub buries in errors[]", () => {
    const error = classifyFailure(
      422,
      {
        message: "Validation Failed",
        errors: [
          { message: "The listed users and repositories cannot be searched either because the resources do not exist or you do not have permission to view them.", resource: "Search", field: "q", code: "invalid" },
          "duplicate-free string entry",
        ],
      },
      true
    );
    expect(error.code).toBe("validation");
    expect(error.detail).toContain("Validation Failed");
    expect(error.detail).toContain("cannot be searched");
    expect(error.detail).toContain("duplicate-free string entry");
    expect(githubDetail({ message: "x", errors: [{ message: "x" }] })).toBe("x");
  });
});

describe("createBridgeClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    }) as typeof fetch;
    return calls;
  }

  it("sends the token in the query for the proxy and as a bearer for the bridge", async () => {
    const calls = mockFetch(200, [{ number: 1 }]);
    const client = createBridgeClient(BASE)!;
    const result = await client.github("GET", "/repos/o/r/issues", { query: { state: "open", per_page: 30, skip: undefined, empty: "" } });

    expect(result).toEqual([{ number: 1 }]);
    expect(calls[0].url).toBe(
      "https://sm-ws-x.fly.dev/svc/forge/github-bridge/gh/repos/o/r/issues?state=open&per_page=30&token=sc_abcDEF123_-xyz"
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sc_abcDEF123_-xyz");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("serializes JSON bodies for writes", async () => {
    const calls = mockFetch(201, { id: 1 });
    const client = createBridgeClient(BASE)!;
    await client.github("POST", "/repos/o/r/issues", { body: { title: "x" } });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe('{"title":"x"}');
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("turns GitHub failures into ForgeErrors using the bridge's upstream tag", async () => {
    mockFetch(403, { message: "Resource not accessible by integration" }, { "x-forge-upstream": "github" });
    const client = createBridgeClient(BASE)!;
    await expect(client.github("GET", "/repos/o/r/issues")).rejects.toMatchObject({
      code: "forbidden",
      detail: "Resource not accessible by integration",
    });
  });

  it("turns bridge failures into ForgeErrors and network errors into bridge_unreachable", async () => {
    mockFetch(401, { error: "unauthorized" });
    const client = createBridgeClient(BASE)!;
    await expect(client.whoami()).rejects.toMatchObject({ code: "bridge_unauthorized" });

    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const offline = createBridgeClient(BASE)!;
    await expect(offline.localRepos()).rejects.toMatchObject({ code: "bridge_unreachable" });
  });

  it("targets the bridge's own routes for whoami and local repos", async () => {
    const calls = mockFetch(200, { repositories: [{ path: "/workspace/x", origin: "https://github.com/o/r" }] });
    const client = createBridgeClient(BASE)!;
    expect(await client.localRepos()).toEqual([{ path: "/workspace/x", origin: "https://github.com/o/r" }]);
    expect(calls[0].url).toBe("https://sm-ws-x.fly.dev/svc/forge/github-bridge/local/repos?token=sc_abcDEF123_-xyz");
  });
});
