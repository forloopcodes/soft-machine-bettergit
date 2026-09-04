/**
 * GitHub REST → Forge wire types. Pure, total functions: any field GitHub
 * may omit degrades to null/empty instead of throwing, because these run on
 * remote content and the panels render whatever comes back.
 */

import type {
  ForgeBranch,
  ForgeCheck,
  ForgeCheckStatus,
  ForgeComment,
  ForgeCommit,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeLabel,
  ForgeMilestone,
  ForgePull,
  ForgePullDetail,
  ForgePullFile,
  ForgeRepo,
  ForgeReview,
  ForgeUser,
} from "../types";

/** Patches above this size are dropped (the viewer shows a binary/oversized note). */
export const PATCH_MAX_CHARS = 200_000;

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec => (value && typeof value === "object" ? (value as Rec) : {});
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function toUser(raw: unknown): ForgeUser | null {
  const r = rec(raw);
  const login = str(r.login);
  if (!login) return null;
  const user: ForgeUser = { login, avatarUrl: str(r.avatar_url) };
  if (r.type === "Bot" || login.endsWith("[bot]")) user.isBot = true;
  return user;
}

export function toLabel(raw: unknown): ForgeLabel | null {
  const r = rec(raw);
  const name = str(r.name);
  if (!name) return null;
  const color = str(r.color);
  return {
    name,
    color: color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : null,
    description: str(r.description),
  };
}

export function toMilestone(raw: unknown): ForgeMilestone | null {
  const r = rec(raw);
  const title = str(r.title);
  if (!title) return null;
  return {
    id: String(r.number ?? r.id ?? title),
    title,
    state: r.state === "closed" ? "closed" : "open",
  };
}

const labels = (raw: unknown): ForgeLabel[] => list(raw).map(toLabel).filter((l): l is ForgeLabel => l !== null);
const users = (raw: unknown): ForgeUser[] => list(raw).map(toUser).filter((u): u is ForgeUser => u !== null);

/** Issue-shaped record: /issues, /issues/N, and search hits (PRs included). */
export function toIssue(raw: unknown): ForgeIssue {
  const r = rec(raw);
  const pullRef = r.pull_request ? rec(r.pull_request) : null;
  return {
    number: num(r.number),
    title: str(r.title) ?? "",
    state: r.state === "closed" ? "closed" : "open",
    stateReason: str(r.state_reason),
    author: toUser(r.user),
    labels: labels(r.labels),
    assignees: users(r.assignees),
    milestone: toMilestone(r.milestone),
    commentCount: num(r.comments),
    createdAt: str(r.created_at) ?? "",
    updatedAt: str(r.updated_at) ?? "",
    closedAt: str(r.closed_at),
    webUrl: str(r.html_url) ?? "",
    isPull: pullRef !== null,
    ...(pullRef !== null ? { draft: r.draft === true } : {}),
  };
}

export function toIssueDetail(raw: unknown): ForgeIssueDetail {
  return { ...toIssue(raw), body: str(rec(raw).body) };
}

/**
 * Pull row from an issue-shaped record (search hit or /issues item). Head
 * and base refs only exist on /pulls responses; rows don't show them.
 */
export function toPullFromIssue(raw: unknown): ForgePull {
  const r = rec(raw);
  const pullRef = rec(r.pull_request);
  const base = toIssue(raw);
  return {
    ...base,
    isPull: true,
    draft: r.draft === true,
    headRef: str(rec(r.head).ref),
    baseRef: str(rec(r.base).ref),
    mergedAt: str(pullRef.merged_at) ?? str(r.merged_at),
  };
}

/** Full pull from /pulls/N (also accepts the POST /pulls creation response). */
export function toPullDetail(raw: unknown): ForgePullDetail {
  const r = rec(raw);
  return {
    ...toIssue({ ...r, pull_request: r.pull_request ?? {} }),
    isPull: true,
    body: str(r.body),
    draft: r.draft === true,
    headRef: str(rec(r.head).ref),
    baseRef: str(rec(r.base).ref),
    mergedAt: str(r.merged_at),
    mergeable: typeof r.mergeable === "boolean" ? r.mergeable : null,
    mergeableState: str(r.mergeable_state),
    additions: num(r.additions),
    deletions: num(r.deletions),
    changedFiles: num(r.changed_files),
    commits: num(r.commits),
  };
}

export function toComment(raw: unknown): ForgeComment {
  const r = rec(raw);
  return {
    id: String(r.id ?? ""),
    author: toUser(r.user),
    body: str(r.body) ?? "",
    createdAt: str(r.created_at) ?? "",
    updatedAt: str(r.updated_at),
    webUrl: str(r.html_url),
  };
}

export function toFile(raw: unknown): ForgePullFile {
  const r = rec(raw);
  const patch = str(r.patch);
  return {
    filename: str(r.filename) ?? "",
    status: str(r.status) ?? "modified",
    additions: num(r.additions),
    deletions: num(r.deletions),
    patch: patch !== null && patch.length <= PATCH_MAX_CHARS ? patch : null,
  };
}

export function toReview(raw: unknown): ForgeReview {
  const r = rec(raw);
  return {
    id: String(r.id ?? ""),
    author: toUser(r.user),
    state: str(r.state) ?? "COMMENTED",
    body: str(r.body),
    submittedAt: str(r.submitted_at),
  };
}

export function toCommit(raw: unknown): ForgeCommit {
  const r = rec(raw);
  const commit = rec(r.commit);
  const message = str(commit.message) ?? "";
  return {
    sha: str(r.sha) ?? "",
    title: message.split("\n", 1)[0],
    author: toUser(r.author) ?? toUser(r.committer),
    createdAt: str(rec(commit.author).date) ?? str(rec(commit.committer).date),
    webUrl: str(r.html_url),
  };
}

export function toRepo(raw: unknown): ForgeRepo | null {
  const r = rec(raw);
  const fullName = str(r.full_name);
  if (!fullName) return null;
  return {
    id: String(r.id ?? fullName),
    fullName,
    defaultBranch: str(r.default_branch),
    private: r.private === true,
    webUrl: str(r.html_url) ?? `https://github.com/${fullName}`,
    pushedAt: str(r.pushed_at) ?? str(r.updated_at),
  };
}

export function toBranch(raw: unknown): ForgeBranch | null {
  const name = str(rec(raw).name);
  return name ? { name } : null;
}

function checkRunStatus(status: string | null, conclusion: string | null): ForgeCheckStatus {
  if (status !== "completed") return "pending";
  switch (conclusion) {
    case "success":
      return "success";
    case "skipped":
      return "skipped";
    case "neutral":
      return "neutral";
    default:
      // failure, timed_out, cancelled, action_required, stale
      return "failure";
  }
}

function seconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null;
}

/** Merge check runs (Checks API) and commit statuses (Status API) into one list. */
export function toChecks(checkRunsPayload: unknown, combinedStatusPayload: unknown): ForgeCheck[] {
  const checks: ForgeCheck[] = [];
  for (const raw of list(rec(checkRunsPayload).check_runs)) {
    const r = rec(raw);
    const name = str(r.name);
    if (!name) continue;
    checks.push({
      name,
      status: checkRunStatus(str(r.status), str(r.conclusion)),
      detailsUrl: str(r.details_url) ?? str(r.html_url),
      app: str(rec(r.app).name),
      durationSeconds: seconds(str(r.started_at), str(r.completed_at)),
    });
  }
  for (const raw of list(rec(combinedStatusPayload).statuses)) {
    const r = rec(raw);
    const name = str(r.context);
    if (!name) continue;
    const state = str(r.state);
    checks.push({
      name,
      status: state === "success" ? "success" : state === "pending" ? "pending" : "failure",
      detailsUrl: str(r.target_url),
      app: null,
      durationSeconds: seconds(str(r.created_at), str(r.updated_at)),
    });
  }
  return checks;
}
