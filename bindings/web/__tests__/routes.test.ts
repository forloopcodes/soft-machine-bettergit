/**
 * The route table: panel path strings → GitHub calls → normalized
 * responses, and panel writes → REST mutations. A recording fake stands in
 * for the bridge client so every assertion is about WHAT was asked of
 * GitHub, with what parameters, and how the answer was shaped.
 */

import { describe, expect, it } from "vitest";
import type { BridgeClient, GithubMethod, GithubRequestOptions, WhoAmI } from "../github/bridge";
import { buildSearchQuery, parsePath, planRead, runMutation } from "../github/routes";
import { DEFAULT_FILTERS, ForgeError } from "../types";

interface Call {
  method: GithubMethod;
  path: string;
  query?: GithubRequestOptions["query"];
  body?: unknown;
}

type Responder = unknown | ((call: Call) => unknown);

function fakeClient(
  responses: Record<string, Responder>,
  whoami: WhoAmI = { mode: "user", login: "octocat" },
  localRepos: Array<{ path: string; origin: string }> = []
) {
  const calls: Call[] = [];
  const client: BridgeClient = {
    key: "https://m.example/svc/bettergit/github-bridge/",
    whoami: async () => whoami,
    localRepos: async () => localRepos,
    github: async <T,>(method: GithubMethod, path: string, options: GithubRequestOptions = {}) => {
      const call: Call = { method, path, query: options.query, body: options.body };
      calls.push(call);
      const responder = responses[`${method} ${path}`];
      if (responder === undefined) throw new ForgeError("not_found", 404, `no fake for ${method} ${path}`);
      return (typeof responder === "function" ? (responder as (c: Call) => unknown)(call) : responder) as T;
    },
  };
  return { client, calls };
}

const signal = new AbortController().signal;

const searchHit = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Item ${number}`,
  state: "open",
  user: { login: "octocat" },
  labels: [],
  assignees: [],
  comments: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  html_url: `https://github.com/o/r/issues/${number}`,
  ...extra,
});

describe("buildSearchQuery", () => {
  it("scopes to the repo and kind and quotes multi-word qualifiers", () => {
    expect(
      buildSearchQuery("issue", "o/r", {
        ...DEFAULT_FILTERS,
        state: "closed",
        author: "octocat",
        assignee: "hubot",
        milestone: 'v1 "final"',
        labels: ["bug", "help wanted"],
        q: "flaky test",
      })
    ).toBe('repo:o/r is:issue author:octocat assignee:hubot milestone:"v1 final" label:"bug" label:"help wanted" flaky test state:closed');
    expect(buildSearchQuery("pull", "o/r", DEFAULT_FILTERS)).toBe("repo:o/r is:pr state:open");
  });
});

describe("parsePath", () => {
  it("splits a resource path into route and parameters", () => {
    const { route, params } = parsePath("/issues?repo=o%2Fr&state=open&labels=bug,help%20wanted");
    expect(route).toBe("/issues");
    expect(params.get("repo")).toBe("o/r");
    expect(params.get("labels")).toBe("bug,help wanted");
  });
});

describe("planRead: lists", () => {
  it("asks the Search API for issues with the panel's filters, one request, own total only", async () => {
    const { client, calls } = fakeClient({
      "GET /search/issues": { total_count: 3, items: [searchHit(1), searchHit(2, { pull_request: { merged_at: null } })] },
    });
    const plan = planRead<{ items: Array<{ number: number; isPull: boolean }>; totalOpen: number | null; totalClosed: number | null }>(
      client,
      "/issues?repo=o%2Fr&state=open&labels=bug&q=flaky"
    );
    expect(plan.key).toBe(`${client.key}|/issues?repo=o%2Fr&state=open&labels=bug&q=flaky`);

    const result = await plan.run(signal);

    const searchCalls = calls.filter((c) => c.path === "/search/issues");
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0].query).toMatchObject({
      q: 'repo:o/r is:issue label:"bug" flaky state:open',
      sort: "created",
      order: "desc",
      per_page: 30,
      page: 1,
    });
    expect(result.items.map((i) => i.number)).toEqual([1, 2]);
    expect(result.totalOpen).toBe(3);
    // The other state's count is the /count route's job, not the list's.
    expect(result.totalClosed).toBeNull();
  });

  it("/count asks for the other state under the same qualifiers, one result per page", async () => {
    const { client, calls } = fakeClient({
      "GET /search/issues": { total_count: 12, items: [] },
    });
    const plan = planRead<{ count: number | null }>(client, "/count?repo=o%2Fr&state=closed&labels=bug&q=flaky&kind=issue");
    const result = await plan.run(signal);
    const call = calls.find((c) => c.path === "/search/issues");
    expect(call?.query).toMatchObject({ q: 'repo:o/r is:issue label:"bug" flaky state:closed', per_page: 1 });
    expect(result.count).toBe(12);
  });

  it("/count does not remember a failure as null", async () => {
    let fail = true;
    const { client } = fakeClient({
      "GET /search/issues": () => {
        if (fail) throw new Error("secondary rate limit");
        return { total_count: 7, items: [] };
      },
    });
    const plan = planRead<{ count: number | null }>(client, "/count?repo=o%2Fr2&state=closed&kind=pull");
    await expect(plan.run(signal)).rejects.toThrow();
    fail = false;
    expect((await plan.run(signal)).count).toBe(7);
  });

  it("lists pulls as is:pr and marks every row as a pull", async () => {
    const { client, calls } = fakeClient({
      "GET /search/issues": { total_count: 1, items: [searchHit(9, { pull_request: { merged_at: "2026-02-01T00:00:00Z" }, draft: false })] },
    });
    const result = await planRead<{ items: Array<{ isPull: boolean; mergedAt: string | null }> }>(
      client,
      "/pulls?repo=o%2Fr&state=closed&sort=comments&page=2"
    ).run(signal);
    expect(calls[0].query).toMatchObject({ q: "repo:o/r is:pr state:closed", sort: "comments", page: 2 });
    expect(result.items[0]).toMatchObject({ isPull: true, mergedAt: "2026-02-01T00:00:00Z" });
  });

  it("reports a renamed repository as moved, with its new name", async () => {
    const searchFailure = new ForgeError(
      "validation",
      422,
      "Validation Failed The listed users and repositories cannot be searched either because the resources do not exist or you do not have permission to view them."
    );
    const { client } = fakeClient({
      "GET /search/issues": () => {
        throw searchFailure;
      },
      // The bridge followed GitHub's redirect; the payload names the new home.
      "GET /repos/o/old": { full_name: "o/new" },
    });
    await expect(planRead(client, "/issues?repo=o%2Fold&state=open").run(signal)).rejects.toMatchObject({
      code: "repo_moved",
      detail: "o/new",
    });
  });

  it("reports a repository the credential cannot see as unavailable", async () => {
    const { client } = fakeClient({
      "GET /search/issues": () => {
        throw new ForgeError("validation", 422, "Validation Failed The listed users and repositories cannot be searched");
      },
      // GET /repos/o/gone is absent: the fake answers 404.
    });
    await expect(planRead(client, "/pulls?repo=o%2Fgone&state=open").run(signal)).rejects.toMatchObject({
      code: "repo_unavailable",
      detail: "o/gone",
    });
    // Same name back from GitHub means "exists, but search can't see it".
    const { client: same } = fakeClient({
      "GET /search/issues": () => {
        throw new ForgeError("validation", 422, "cannot be searched");
      },
      "GET /repos/o/r": { full_name: "O/R" },
    });
    await expect(planRead(same, "/issues?repo=o%2Fr&state=open").run(signal)).rejects.toMatchObject({ code: "repo_unavailable" });
  });

  it("passes other validation failures through untouched", async () => {
    const { client } = fakeClient({
      "GET /search/issues": () => {
        throw new ForgeError("validation", 422, "Validation Failed: q is too long");
      },
    });
    await expect(planRead(client, "/issues?repo=o%2Fr&state=open").run(signal)).rejects.toMatchObject({
      code: "validation",
      detail: "Validation Failed: q is too long",
    });
  });

  it("rejects an unsafe repo before any request is made", async () => {
    const { client, calls } = fakeClient({});
    await expect(planRead(client, "/issues?repo=..%2Fetc&state=open").run(signal)).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toHaveLength(0);
  });

  it("rejects unknown resources", async () => {
    const { client } = fakeClient({});
    await expect(planRead(client, "/nope?repo=o%2Fr").run(signal)).rejects.toMatchObject({ code: "forge_error:unknown_route" });
  });
});

describe("planRead: repos", () => {
  it("lists installation repositories for a GitHub App credential and filters client-side", async () => {
    const { client, calls } = fakeClient(
      {
        "GET /installation/repositories": (call) =>
          call.query?.page === 1
            ? {
                total_count: 2,
                repositories: [
                  { id: 1, full_name: "o/web-timer", private: false },
                  { id: 2, full_name: "o/other", private: true },
                ],
              }
            : { total_count: 2, repositories: [] },
      },
      { mode: "installation", login: null, repositoryCount: 2 }
    );
    const result = await planRead<{ repos: Array<{ fullName: string }> }>(client, "/repos?q=timer").run(signal);
    // Pages 1 and 2 are requested together; the total says no third page.
    const pages = calls.filter((c) => c.path === "/installation/repositories").map((c) => c.query?.page);
    expect(pages).toEqual([1, 2]);
    expect(result.repos.map((r) => r.fullName)).toEqual(["o/web-timer"]);
  });

  it("lists the user's repositories for a personal token", async () => {
    const { client, calls } = fakeClient({ "GET /user/repos": [{ id: 1, full_name: "me/a" }] });
    const result = await planRead<{ repos: Array<{ fullName: string }> }>(client, "/repos").run(signal);
    expect(calls[0].path).toBe("/user/repos");
    expect(result.repos).toHaveLength(1);
  });

  it("puts workspace checkouts first, dedupes them from the GitHub list, and skips non-GitHub origins", async () => {
    const { client } = fakeClient(
      { "GET /user/repos": [{ id: 1, full_name: "Me/A", private: true }, { id: 2, full_name: "me/b" }] },
      { mode: "user", login: "me" },
      [
        { path: "/workspace/a", origin: "https://github.com/me/a.git" },
        { path: "/workspace/c", origin: "git@github.com:me/c.git" },
        { path: "/workspace/home", origin: "https://gitea.internal/dotfiles.git" },
      ]
    );
    const result = await planRead<{ repos: Array<{ fullName: string; localPath?: string | null }> }>(client, "/repos").run(signal);
    expect(result.repos.map((r) => [r.fullName, r.localPath ?? null])).toEqual([
      ["me/a", "/workspace/a"],
      ["me/c", "/workspace/c"],
      ["me/b", null],
    ]);
  });

  it("still lists workspace checkouts when GitHub refuses the repo listing", async () => {
    const { client } = fakeClient({}, { mode: "installation", login: null, repositoryCount: 0 }, [
      { path: "/workspace/x", origin: "https://github.com/o/x" },
    ]);
    const result = await planRead<{ repos: Array<{ fullName: string }> }>(client, "/repos?q=x").run(signal);
    expect(result.repos.map((r) => r.fullName)).toEqual(["o/x"]);
  });
});

describe("planRead: details", () => {
  it("fetches a pull's checks via its head sha and survives one source failing", async () => {
    const { client, calls } = fakeClient({
      "GET /repos/o/r/pulls/7": { head: { sha: "fcad147f7176d8974f7dcd36d10958c675379776" } },
      "GET /repos/o/r/commits/fcad147f7176d8974f7dcd36d10958c675379776/status": {
        statuses: [{ context: "vercel", state: "success" }],
      },
      // check-runs deliberately absent: the fake throws 404 for it.
    });
    const result = await planRead<{ checks: Array<{ name: string; status: string }> }>(client, "/checks?repo=o%2Fr&number=7").run(signal);
    expect(calls.map((c) => c.path)).toEqual([
      "/repos/o/r/pulls/7",
      "/repos/o/r/commits/fcad147f7176d8974f7dcd36d10958c675379776/check-runs",
      "/repos/o/r/commits/fcad147f7176d8974f7dcd36d10958c675379776/status",
    ]);
    expect(result.checks).toEqual([{ name: "vercel", status: "success", detailsUrl: null, app: null, durationSeconds: null }]);
  });

  it("wraps issue detail and comments in the panel's envelope shapes", async () => {
    const { client } = fakeClient({
      "GET /repos/o/r/issues/5": { ...searchHit(5), body: "hello" },
      "GET /repos/o/r/issues/5/comments": [{ id: 1, user: { login: "x" }, body: "hi", created_at: "2026-01-01T00:00:00Z" }],
    });
    const detail = await planRead<{ issue: { number: number; body: string | null } }>(client, "/issue?repo=o%2Fr&number=5").run(signal);
    expect(detail.issue).toMatchObject({ number: 5, body: "hello" });
    const comments = await planRead<{ comments: Array<{ id: string }> }>(client, "/comments?repo=o%2Fr&number=5&type=issue").run(signal);
    expect(comments.comments).toEqual([{ id: "1", author: { login: "x", avatarUrl: null }, body: "hi", createdAt: "2026-01-01T00:00:00Z", updatedAt: null, webUrl: null }]);
  });

  it("encodes owner and repo segments", async () => {
    const { client, calls } = fakeClient({ "GET /repos/o.wn/r_1/labels": [] });
    await planRead(client, "/labels?repo=o.wn%2Fr_1").run(signal);
    expect(calls[0].path).toBe("/repos/o.wn/r_1/labels");
  });
});

describe("runMutation", () => {
  it("closes an issue with a reason and reopens without one", async () => {
    const { client, calls } = fakeClient({ "PATCH /repos/o/r/issues/5": { ok: 1 } });
    await runMutation(client, "/issue-state", { repo: "o/r", number: 5, state: "closed", stateReason: "not_planned" });
    await runMutation(client, "/issue-state", { repo: "o/r", number: 5, state: "open", stateReason: "not_planned" });
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { state: "closed", state_reason: "not_planned" } });
    expect(calls[1].body).toEqual({ state: "open" });
  });

  it("merges with an allowlisted method only", async () => {
    const { client, calls } = fakeClient({ "PUT /repos/o/r/pulls/3/merge": { merged: true } });
    await runMutation(client, "/merge", { repo: "o/r", number: 3, method: "rebase" });
    await runMutation(client, "/merge", { repo: "o/r", number: 3, method: "delete-everything" });
    expect(calls[0].body).toEqual({ merge_method: "rebase" });
    expect(calls[1].body).toEqual({ merge_method: "merge" });
  });

  it("replaces labels with strings only and posts comments", async () => {
    const { client, calls } = fakeClient({
      "PUT /repos/o/r/issues/5/labels": [],
      "POST /repos/o/r/issues/5/comments": { id: 9 },
    });
    await runMutation(client, "/labels", { repo: "o/r", number: 5, labels: ["a", 1, "b", null] });
    const posted = await runMutation(client, "/comment", { repo: "o/r", number: 5, body: "hello", type: "pull" });
    expect(calls[0].body).toEqual({ labels: ["a", "b"] });
    expect(calls[1]).toMatchObject({ method: "POST", body: { body: "hello" } });
    expect(posted).toBeTruthy();
  });

  it("creates a pull request and returns it normalized for the redirect", async () => {
    const { client, calls } = fakeClient({
      "POST /repos/o/r/pulls": { ...searchHit(42), head: { ref: "feat" }, base: { ref: "main" }, draft: true, merged_at: null },
    });
    const result = (await runMutation(client, "/pulls", {
      repo: "o/r",
      title: "Feat",
      head: "feat",
      base: "main",
      draft: true,
      body: "why",
    })) as { pull: { number: number; draft: boolean; headRef: string | null } };
    expect(calls[0].body).toEqual({ title: "Feat", head: "feat", base: "main", draft: true, body: "why" });
    expect(result.pull).toMatchObject({ number: 42, draft: true, headRef: "feat" });
  });

  it("refuses unknown actions and unsafe repos", async () => {
    const { client, calls } = fakeClient({});
    await expect(runMutation(client, "/rm-rf", { repo: "o/r" })).rejects.toMatchObject({ code: "forge_error:unknown_route" });
    await expect(runMutation(client, "/comment", { repo: "o/r/x", number: 1, body: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(runMutation(client, "/comment", { repo: "o/r", number: "1", body: "x" })).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toHaveLength(0);
  });
});
