/**
 * The panels' data contract, resolved against GitHub.
 *
 * Panels ask for resources by path string — `/issues?repo=o/r&state=open`,
 * `/comments?repo=o/r&number=5&type=pull`, and so on — and post writes to
 * paths like `/comment` or `/merge`. That vocabulary used to name routes on
 * a server proxy; here it is a typed route table: `planRead` parses a path
 * into a ReadPlan (cache key, poll cadence, and the GitHub calls that
 * produce the normalized response), and `runMutation` maps a write to the
 * corresponding REST call. Keeping the vocabulary means the panel code is
 * untouched; keeping it as a table means every route is one place to read.
 *
 * Lists go through the Search API: it is the only endpoint that expresses
 * free text plus author/label/assignee/milestone qualifiers for BOTH issues
 * and pulls, excludes pulls from issue lists, includes comment counts for
 * pull rows, and returns exact totals. Everything else is plain REST.
 */

import {
  ForgeError,
  LIST_PAGE_SIZE,
  REPO_RE,
  parseListFilters,
  repoFromCloneUrl,
  type ForgeBranch,
  type ForgeCheck,
  type ForgeComment,
  type ForgeCommit,
  type ForgeIssue,
  type ForgeIssueDetail,
  type ForgeLabel,
  type ForgeMilestone,
  type ForgePull,
  type ForgePullDetail,
  type ForgePullFile,
  type ForgeRepo,
  type ForgeReview,
  type ForgeUser,
  type ListFilters,
} from "../types";
import type { BridgeClient, LocalRepository, WhoAmI } from "./bridge";
import {
  toBranch,
  toChecks,
  toComment,
  toCommit,
  toFile,
  toIssue,
  toIssueDetail,
  toLabel,
  toMilestone,
  toPullDetail,
  toPullFromIssue,
  toRepo,
  toReview,
  toUser,
} from "./normalize";

export interface ReadPlan<T> {
  /** Cache identity; includes the bridge so a different machine never shares entries. */
  key: string;
  /** Background refresh interval while some panel is subscribed. */
  pollMs: number;
  run: (signal: AbortSignal) => Promise<T>;
}

/** Ambient cadences. Lists and open details refresh often; reference data rarely. */
export const POLL = {
  list: 45_000,
  detail: 45_000,
  thread: 45_000,
  pullExtras: 60_000,
  reference: 180_000,
  repos: 300_000,
  // Cheap (the bridge caches it) and the only way a newly connected
  // credential is noticed, so keep it brisk.
  whoami: 30_000,
  localRepos: 60_000,
  counts: 120_000,
} as const;

const REPO_PAGE_LIMIT = 5;
const REPO_PICKER_MAX = 50;

// ── Helpers ────────────────────────────────────────────────────────────────

function requireRepo(params: URLSearchParams): string {
  const repo = params.get("repo") ?? "";
  if (!REPO_RE.test(repo)) throw new ForgeError("not_found", 400, "Invalid repository selection.");
  return repo;
}

function requireNumber(params: URLSearchParams): number {
  const n = Number(params.get("number"));
  if (!Number.isInteger(n) || n <= 0) throw new ForgeError("not_found", 400, "Invalid issue number.");
  return n;
}

/** owner/name → /repos/owner/name with each segment encoded. */
function repoPath(repo: string): string {
  const [owner, name] = repo.split("/");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

const quote = (value: string): string => `"${value.replace(/"/g, "")}"`;

/** Search qualifiers shared by the list and its opposite-state count. */
function searchQualifiers(kind: "issue" | "pull", repo: string, f: ListFilters): string {
  const parts = [`repo:${repo}`, kind === "issue" ? "is:issue" : "is:pr"];
  if (f.author) parts.push(`author:${f.author}`);
  if (f.assignee) parts.push(`assignee:${f.assignee}`);
  if (f.milestone) parts.push(`milestone:${quote(f.milestone)}`);
  for (const label of f.labels) parts.push(`label:${quote(label)}`);
  if (f.q.trim()) parts.push(f.q.trim());
  return parts.join(" ");
}

export function buildSearchQuery(kind: "issue" | "pull", repo: string, f: ListFilters): string {
  return `${searchQualifiers(kind, repo, f)} state:${f.state}`;
}

interface SearchResponse {
  total_count?: number;
  items?: unknown[];
}

// ── Opposite-state counts (small cache, refreshed lazily) ──────────────────

const countCache = new Map<string, { at: number; value: number | null; promise: Promise<number | null> | null }>();

async function countFor(client: BridgeClient, q: string, signal: AbortSignal): Promise<number | null> {
  const key = `${client.key}|${q}`;
  const now = Date.now();
  const cached = countCache.get(key);
  if (cached && now - cached.at < POLL.counts) return cached.value;
  if (cached?.promise) return cached.promise;
  const promise = client
    .github<SearchResponse>("GET", "/search/issues", { query: { q, per_page: 1 }, signal })
    .then((r) => (typeof r.total_count === "number" ? r.total_count : null))
    .catch(() => null)
    .then((value) => {
      countCache.set(key, { at: Date.now(), value, promise: null });
      return value;
    });
  countCache.set(key, { at: cached?.at ?? 0, value: cached?.value ?? null, promise });
  return promise;
}

// ── List fetchers ──────────────────────────────────────────────────────────

interface ListResponse<T> {
  items: T[];
  totalOpen: number | null;
  totalClosed: number | null;
}

async function fetchList<T>(
  client: BridgeClient,
  kind: "issue" | "pull",
  repo: string,
  filters: ListFilters,
  normalize: (raw: unknown) => T,
  signal: AbortSignal
): Promise<ListResponse<T>> {
  const q = buildSearchQuery(kind, repo, filters);
  const otherState = filters.state === "open" ? "closed" : "open";
  const otherQ = `${searchQualifiers(kind, repo, filters)} state:${otherState}`;
  const [page, otherCount] = await Promise.all([
    client.github<SearchResponse>("GET", "/search/issues", {
      query: {
        q,
        sort: filters.sort,
        order: "desc",
        per_page: LIST_PAGE_SIZE,
        page: filters.page,
      },
      signal,
    }),
    countFor(client, otherQ, signal),
  ]);
  const total = typeof page.total_count === "number" ? page.total_count : null;
  return {
    items: (page.items ?? []).map(normalize),
    totalOpen: filters.state === "open" ? total : otherCount,
    totalClosed: filters.state === "closed" ? total : otherCount,
  };
}

async function fetchAllPages<T>(
  client: BridgeClient,
  path: string,
  query: Record<string, string | number>,
  pick: (payload: unknown) => unknown[],
  normalize: (raw: unknown) => T | null,
  signal: AbortSignal
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= REPO_PAGE_LIMIT; page++) {
    const payload = await client.github<unknown>("GET", path, { query: { ...query, per_page: 100, page }, signal });
    const rows = pick(payload);
    for (const raw of rows) {
      const item = normalize(raw);
      if (item) out.push(item);
    }
    if (rows.length < 100) break;
  }
  return out;
}

/** Repositories checked out on the workspace machine whose origin is on GitHub. */
async function workspaceRepos(client: BridgeClient, signal: AbortSignal): Promise<ForgeRepo[]> {
  const local = await client.localRepos(signal);
  const seen = new Set<string>();
  const repos: ForgeRepo[] = [];
  for (const { path, origin } of local) {
    const parsed = repoFromCloneUrl(origin);
    if (!parsed || seen.has(parsed.repo.toLowerCase())) continue;
    seen.add(parsed.repo.toLowerCase());
    repos.push({
      id: `local:${path}`,
      fullName: parsed.repo,
      defaultBranch: null,
      private: false,
      webUrl: `https://github.com/${parsed.repo}`,
      localPath: path,
    });
  }
  return repos;
}

async function githubRepos(client: BridgeClient, signal: AbortSignal): Promise<ForgeRepo[]> {
  const who = await client.whoami(signal);
  return who.mode === "installation"
    ? fetchAllPages(
        client,
        "/installation/repositories",
        {},
        (p) => (Array.isArray((p as { repositories?: unknown[] })?.repositories) ? (p as { repositories: unknown[] }).repositories : []),
        toRepo,
        signal
      )
    : fetchAllPages(client, "/user/repos", { sort: "updated", affiliation: "owner,collaborator,organization_member" }, (p) => (Array.isArray(p) ? p : []), toRepo, signal);
}

/**
 * Picker contents: every GitHub repo checked out on this workspace first
 * (they are what the user is most likely working on), then the credential's
 * GitHub-wide list minus duplicates. The workspace scan never depends on
 * GitHub answering, so a rate limit or a permission gap still leaves the
 * local repos selectable.
 */
async function fetchRepos(client: BridgeClient, search: string, signal: AbortSignal): Promise<{ repos: ForgeRepo[] }> {
  const [local, remote] = await Promise.all([
    workspaceRepos(client, signal).catch(() => [] as ForgeRepo[]),
    githubRepos(client, signal).catch(() => [] as ForgeRepo[]),
  ]);
  const localNames = new Set(local.map((r) => r.fullName.toLowerCase()));
  const needle = search.trim().toLowerCase();
  const matches = (r: ForgeRepo) => !needle || r.fullName.toLowerCase().includes(needle);
  return {
    repos: [
      ...local.filter(matches),
      ...remote.filter((r) => !localNames.has(r.fullName.toLowerCase()) && matches(r)).slice(0, REPO_PICKER_MAX),
    ],
  };
}

// ── Route table ────────────────────────────────────────────────────────────

type RouteHandler = (client: BridgeClient, params: URLSearchParams, signal: AbortSignal) => Promise<unknown>;

const READ_ROUTES: Record<string, { pollMs: number; run: RouteHandler }> = {
  "/repos": {
    pollMs: POLL.repos,
    run: (client, params, signal) => fetchRepos(client, params.get("q") ?? "", signal),
  },
  "/issues": {
    pollMs: POLL.list,
    run: (client, params, signal) =>
      fetchList<ForgeIssue>(client, "issue", requireRepo(params), parseListFilters(params), toIssue, signal),
  },
  "/pulls": {
    pollMs: POLL.list,
    run: (client, params, signal) =>
      fetchList<ForgePull>(client, "pull", requireRepo(params), parseListFilters(params), toPullFromIssue, signal),
  },
  "/labels": {
    pollMs: POLL.reference,
    run: async (client, params, signal) => ({
      labels: await fetchAllPages<ForgeLabel>(client, `${repoPath(requireRepo(params))}/labels`, {}, (p) => (Array.isArray(p) ? p : []), toLabel, signal),
    }),
  },
  "/milestones": {
    pollMs: POLL.reference,
    run: async (client, params, signal) => ({
      milestones: await fetchAllPages<ForgeMilestone>(
        client,
        `${repoPath(requireRepo(params))}/milestones`,
        { state: "all" },
        (p) => (Array.isArray(p) ? p : []),
        toMilestone,
        signal
      ),
    }),
  },
  "/assignees": {
    pollMs: POLL.reference,
    run: async (client, params, signal) => ({
      users: await fetchAllPages<ForgeUser>(client, `${repoPath(requireRepo(params))}/assignees`, {}, (p) => (Array.isArray(p) ? p : []), toUser, signal),
    }),
  },
  "/branches": {
    pollMs: POLL.reference,
    run: async (client, params, signal) => ({
      branches: await fetchAllPages<ForgeBranch>(client, `${repoPath(requireRepo(params))}/branches`, {}, (p) => (Array.isArray(p) ? p : []), toBranch, signal),
    }),
  },
  "/issue": {
    pollMs: POLL.detail,
    run: async (client, params, signal): Promise<{ issue: ForgeIssueDetail }> => ({
      issue: toIssueDetail(
        await client.github<unknown>("GET", `${repoPath(requireRepo(params))}/issues/${requireNumber(params)}`, { signal })
      ),
    }),
  },
  "/pull": {
    pollMs: POLL.detail,
    run: async (client, params, signal): Promise<{ pull: ForgePullDetail }> => ({
      pull: toPullDetail(
        await client.github<unknown>("GET", `${repoPath(requireRepo(params))}/pulls/${requireNumber(params)}`, { signal })
      ),
    }),
  },
  "/comments": {
    pollMs: POLL.thread,
    run: async (client, params, signal) => ({
      comments: await fetchAllPages<ForgeComment>(
        client,
        `${repoPath(requireRepo(params))}/issues/${requireNumber(params)}/comments`,
        {},
        (p) => (Array.isArray(p) ? p : []),
        toComment,
        signal
      ),
    }),
  },
  "/pull-files": {
    pollMs: POLL.pullExtras,
    run: async (client, params, signal) => ({
      files: await fetchAllPages<ForgePullFile>(
        client,
        `${repoPath(requireRepo(params))}/pulls/${requireNumber(params)}/files`,
        {},
        (p) => (Array.isArray(p) ? p : []),
        toFile,
        signal
      ),
    }),
  },
  "/reviews": {
    pollMs: POLL.pullExtras,
    run: async (client, params, signal) => ({
      reviews: await fetchAllPages<ForgeReview>(
        client,
        `${repoPath(requireRepo(params))}/pulls/${requireNumber(params)}/reviews`,
        {},
        (p) => (Array.isArray(p) ? p : []),
        toReview,
        signal
      ),
    }),
  },
  "/pull-commits": {
    pollMs: POLL.pullExtras,
    run: async (client, params, signal) => ({
      commits: await fetchAllPages<ForgeCommit>(
        client,
        `${repoPath(requireRepo(params))}/pulls/${requireNumber(params)}/commits`,
        {},
        (p) => (Array.isArray(p) ? p : []),
        toCommit,
        signal
      ),
    }),
  },
  "/checks": {
    pollMs: POLL.pullExtras,
    run: async (client, params, signal) => {
      const base = repoPath(requireRepo(params));
      const pull = await client.github<{ head?: { sha?: string } }>("GET", `${base}/pulls/${requireNumber(params)}`, { signal });
      const sha = pull?.head?.sha;
      if (!sha || !/^[0-9a-f]{7,40}$/.test(sha)) return { checks: [] as ForgeCheck[] };
      // Either API may be unavailable for a repo (permissions); the other
      // still renders, so failures collapse to "no checks from this source".
      const [runs, status] = await Promise.all([
        client.github<unknown>("GET", `${base}/commits/${sha}/check-runs`, { query: { per_page: 100 }, signal }).catch(() => null),
        client.github<unknown>("GET", `${base}/commits/${sha}/status`, { query: { per_page: 100 }, signal }).catch(() => null),
      ]);
      return { checks: toChecks(runs, status) };
    },
  },
};

/** Split "/issues?repo=o/r&state=open" into its route and parameters. */
export function parsePath(path: string): { route: string; params: URLSearchParams } {
  const url = new URL(path, "http://forge.local");
  return { route: url.pathname, params: url.searchParams };
}

export function planRead<T = unknown>(client: BridgeClient, path: string): ReadPlan<T> {
  const { route, params } = parsePath(path);
  const handler = READ_ROUTES[route];
  if (!handler) {
    return {
      key: `${client.key}|${path}`,
      pollMs: POLL.reference,
      run: () => Promise.reject(new ForgeError("forge_error:unknown_route", 400, `Unknown resource ${route}`)),
    };
  }
  return {
    key: `${client.key}|${path}`,
    pollMs: handler.pollMs,
    // async so a validation throw inside a handler surfaces as a rejection,
    // never as a synchronous exception in the caller's render or timer.
    run: async (signal) => (await handler.run(client, params, signal)) as T,
  };
}

export function whoamiPlan(client: BridgeClient): ReadPlan<WhoAmI> {
  return { key: `${client.key}|whoami`, pollMs: POLL.whoami, run: (signal) => client.whoami(signal) };
}

export function localReposPlan(client: BridgeClient): ReadPlan<LocalRepository[]> {
  return { key: `${client.key}|local-repos`, pollMs: POLL.localRepos, run: (signal) => client.localRepos(signal) };
}

// ── Mutations ──────────────────────────────────────────────────────────────

type Body = Record<string, unknown>;

function bodyRepo(body: Body): string {
  const repo = typeof body.repo === "string" ? body.repo : "";
  if (!REPO_RE.test(repo)) throw new ForgeError("not_found", 400, "Invalid repository selection.");
  return repo;
}

function bodyNumber(body: Body): number {
  const n = body.number;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) throw new ForgeError("not_found", 400, "Invalid issue number.");
  return n;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

const MUTATIONS: Record<string, (client: BridgeClient, body: Body) => Promise<unknown>> = {
  "/comment": (client, body) =>
    client.github("POST", `${repoPath(bodyRepo(body))}/issues/${bodyNumber(body)}/comments`, {
      body: { body: text(body.body) ?? "" },
    }),
  "/issues": async (client, body) => ({
    issue: toIssueDetail(
      await client.github("POST", `${repoPath(bodyRepo(body))}/issues`, {
        body: { title: text(body.title) ?? "", ...(text(body.body) ? { body: body.body } : {}) },
      })
    ),
  }),
  "/pulls": async (client, body) => ({
    pull: toPullDetail(
      await client.github("POST", `${repoPath(bodyRepo(body))}/pulls`, {
        body: {
          title: text(body.title) ?? "",
          head: text(body.head) ?? "",
          base: text(body.base) ?? "",
          draft: body.draft === true,
          ...(text(body.body) ? { body: body.body } : {}),
        },
      })
    ),
  }),
  "/issue-state": (client, body) =>
    client.github("PATCH", `${repoPath(bodyRepo(body))}/issues/${bodyNumber(body)}`, {
      body: {
        state: body.state === "closed" ? "closed" : "open",
        ...(body.state === "closed" && (body.stateReason === "completed" || body.stateReason === "not_planned")
          ? { state_reason: body.stateReason }
          : {}),
      },
    }),
  "/pull-state": (client, body) =>
    client.github("PATCH", `${repoPath(bodyRepo(body))}/pulls/${bodyNumber(body)}`, {
      body: { state: body.state === "closed" ? "closed" : "open" },
    }),
  "/labels": (client, body) =>
    client.github("PUT", `${repoPath(bodyRepo(body))}/issues/${bodyNumber(body)}/labels`, {
      body: { labels: Array.isArray(body.labels) ? body.labels.filter((l): l is string => typeof l === "string") : [] },
    }),
  "/merge": (client, body) => {
    const method = body.method === "squash" || body.method === "rebase" ? body.method : "merge";
    return client.github("PUT", `${repoPath(bodyRepo(body))}/pulls/${bodyNumber(body)}/merge`, {
      body: { merge_method: method },
    });
  },
};

export async function runMutation(client: BridgeClient, path: string, body: Body): Promise<unknown> {
  const handler = MUTATIONS[path];
  if (!handler) throw new ForgeError("forge_error:unknown_route", 400, `Unknown action ${path}`);
  const result = await handler(client, body);
  // Every mutation resolves truthy so `if (await mutate(...))` stays valid.
  return result ?? { ok: true };
}
