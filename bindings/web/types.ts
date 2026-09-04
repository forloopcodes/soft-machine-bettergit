/**
 * Wire types and pure helpers for the Forge plugin (GitHub pull requests
 * and issues). These shapes are the contract between the panels and the
 * data layer: github/normalize.ts produces them from GitHub REST responses
 * fetched through the plugin's VM bridge, so the browser never holds a
 * GitHub credential.
 */

/** GitHub is the only provider; the type stays so persisted state and
 *  panel code keep one vocabulary. */
export type ForgeProvider = "github";

/** Integration site per provider (Settings -> Integrations). */
export const PROVIDER_SITES: Record<ForgeProvider, string> = {
  github: "github.com",
};

export const PROVIDER_LABELS: Record<ForgeProvider, string> = {
  github: "GitHub",
};

/**
 * owner/name. Segments must start with an alphanumeric so "../etc" style
 * traversal never validates (GitHub disallows leading dots or dashes in
 * names anyway).
 */
export const REPO_RE =
  /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export interface ForgeRepo {
  id: string;
  fullName: string;
  defaultBranch: string | null;
  private: boolean;
  webUrl: string;
  /** Checkout path on the workspace machine when the repo is cloned there. */
  localPath?: string | null;
}

export interface ForgeUser {
  login: string;
  avatarUrl: string | null;
  /** True for bot accounts (dependabot, CI apps); absent means human. */
  isBot?: boolean;
}

/** One commit on a pull request, for the conversation timeline. */
export interface ForgeCommit {
  sha: string;
  title: string;
  author: ForgeUser | null;
  createdAt: string | null;
  webUrl: string | null;
}

/** One repository branch, for the new-PR base/compare pickers. */
export interface ForgeBranch {
  name: string;
}

export type ForgeCheckStatus =
  | "success"
  | "failure"
  | "pending"
  | "skipped"
  | "neutral";

/** One CI check on a pull's head commit (check run / pipeline job). */
export interface ForgeCheck {
  name: string;
  status: ForgeCheckStatus;
  detailsUrl: string | null;
  app: string | null;
  durationSeconds: number | null;
}

/** "in 3m" / "in 45s" duration phrasing, github.com's check-row style. */
export function checkDuration(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return ` in ${seconds}s`;
  return ` in ${Math.round(seconds / 60)}m`;
}

export interface ForgeLabel {
  name: string;
  /** Normalized "#hex" by the proxy, or null when upstream sent junk. */
  color: string | null;
  description?: string | null;
}

export interface ForgeMilestone {
  id: string;
  title: string;
  state: "open" | "closed";
}

export interface ForgeIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  stateReason: string | null;
  author: ForgeUser | null;
  labels: ForgeLabel[];
  assignees: ForgeUser[];
  milestone: ForgeMilestone | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  webUrl: string;
  isPull: boolean;
  draft?: boolean;
}

export interface ForgeIssueDetail extends ForgeIssue {
  body: string | null;
}

export interface ForgePull extends ForgeIssue {
  draft: boolean;
  headRef: string | null;
  baseRef: string | null;
  mergedAt: string | null;
}

export interface ForgePullDetail extends ForgePull {
  body: string | null;
  mergeable: boolean | null;
  mergeableState: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
}

export interface ForgeComment {
  id: string;
  author: ForgeUser | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  webUrl: string | null;
}

export interface ForgePullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified-diff hunks, clamped by the proxy; null for binary files. */
  patch: string | null;
}

export type DiffLineKind = "add" | "del" | "context" | "hunk";

export interface DiffLine {
  kind: DiffLineKind;
  content: string;
}

/**
 * Parse a unified-diff patch (with context lines, as GitHub/GitLab send
 * them) into render-ready lines. File headers (---/+++/index) are
 * dropped; hunk headers become their own line kind so the viewer can
 * style them as separators.
 */
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      lines.push({ kind: "hunk", content: raw });
    } else if (
      raw.startsWith("+++") ||
      raw.startsWith("---") ||
      raw.startsWith("index ") ||
      raw.startsWith("diff --git") ||
      raw.startsWith("\\ No newline")
    ) {
      continue;
    } else if (raw.startsWith("+")) {
      lines.push({ kind: "add", content: raw.slice(1) });
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "del", content: raw.slice(1) });
    } else {
      lines.push({
        kind: "context",
        content: raw.startsWith(" ") ? raw.slice(1) : raw,
      });
    }
  }
  // A patch that ends with a newline split produces one trailing empty
  // context line; drop it rather than render a phantom row.
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.kind === "context" && last.content === "") lines.pop();
    else break;
  }
  return lines;
}

export interface ForgeReview {
  id: string;
  author: ForgeUser | null;
  state: string;
  body: string | null;
  submittedAt: string | null;
}

export type ListState = "open" | "closed";
export type ListSort = "created" | "updated" | "comments";

/**
 * The GitHub-style filter row above the lists: free text plus the
 * qualifier dropdowns. One instance per list (issues and pulls filter
 * independently, like github.com's tabs).
 */
export interface ListFilters {
  state: ListState;
  q: string;
  author: string | null;
  labels: string[];
  assignee: string | null;
  milestone: string | null;
  sort: ListSort;
  page: number;
}

/** List page size; the panels infer hasMore from a full page. */
export const LIST_PAGE_SIZE = 30;

const LIST_SORTS: readonly ListSort[] = ["created", "updated", "comments"];

export const DEFAULT_FILTERS: ListFilters = {
  state: "open",
  q: "",
  author: null,
  labels: [],
  assignee: null,
  milestone: null,
  sort: "created",
  page: 1,
};

/**
 * Encode a list request as the panels' resource path query string. Defaults
 * are omitted so the cache key stays stable; every value is URI-encoded
 * because label names and search text are user-controlled.
 * `parseListFilters` is its inverse.
 */
export function listQueryString(repo: string, f: ListFilters): string {
  const params = new URLSearchParams();
  params.set("repo", repo);
  params.set("state", f.state);
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.author) params.set("author", f.author);
  if (f.labels.length > 0) params.set("labels", f.labels.join(","));
  if (f.assignee) params.set("assignee", f.assignee);
  if (f.milestone) params.set("milestone", f.milestone);
  if (f.sort !== "created") params.set("sort", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  return `?${params.toString()}`;
}

/** Inverse of listQueryString: unknown or malformed values fall back to defaults. */
export function parseListFilters(params: URLSearchParams): ListFilters {
  const sort = params.get("sort");
  const page = Number(params.get("page") ?? "1");
  const labels = params.get("labels");
  return {
    state: params.get("state") === "closed" ? "closed" : "open",
    q: params.get("q") ?? "",
    author: params.get("author") || null,
    labels: labels ? labels.split(",").filter((l) => l.length > 0) : [],
    assignee: params.get("assignee") || null,
    milestone: params.get("milestone") || null,
    sort: LIST_SORTS.includes(sort as ListSort) ? (sort as ListSort) : "created",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/**
 * Derive {provider, repo} from a GitHub clone URL, so panels can auto-lock
 * onto a repository checked out on the workspace machine. Handles https and
 * ssh forms, including credentialed https remotes (VM clones embed the
 * token as userinfo); anything else returns null and leaves the manual
 * picker in charge.
 */
export function repoFromCloneUrl(
  url: string
): { provider: ForgeProvider; repo: string } | null {
  const match =
    /^(?:https?:\/\/(?:[^/@\s]+@)?|git@|ssh:\/\/git@)github\.com[/:](.+?)(?:\.git)?\/?$/i.exec(
      url.trim()
    );
  if (!match) return null;
  const repo = match[1];
  if (!REPO_RE.test(repo)) return null;
  return { provider: "github", repo };
}

/**
 * From newline-separated origin URLs across every repo under /workspace,
 * return the first that parses to a GitHub repo — skipping dotfile/home
 * repos and non-GitHub remotes. Null when none qualify. Returns the raw URL
 * (not the parsed pair) so it flows through autoSelectFromUrl unchanged.
 */
export function firstForgeRemote(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const url = line.trim();
    if (url && repoFromCloneUrl(url) !== null) return url;
  }
  return null;
}

/**
 * A failed data-layer call: `code` is the stable vocabulary describeError
 * maps to copy; `detail` carries GitHub's own message when it has one.
 */
export class ForgeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: string;

  constructor(code: string, status: number, detail = "") {
    super(code);
    this.name = "ForgeError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Error codes -> user-facing copy. GitHub's own message wins when it is specific. */
export function describeError(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err);
  const detail = err instanceof ForgeError ? err.detail.trim() : "";
  switch (code) {
    case "not_connected":
      return "GitHub is not connected on the workspace machine. Connect it in Settings → Integrations.";
    case "bridge_unreachable":
      return "The workspace machine did not answer. It may be waking up; try again.";
    case "bridge_unauthorized":
      return "The workspace refused the panel's session. Reload to reconnect.";
    case "invalid_api_key":
      return "The stored token was rejected. Update it in Settings.";
    case "forbidden":
      return detail
        ? `GitHub refused: ${detail}`
        : "GitHub refused the request for this repository.";
    case "not_found":
      return detail ? `Not found: ${detail}` : "Not found. Check the repository selection.";
    case "repo_moved":
      return `This repository moved to ${detail}. Switching to it…`;
    case "repo_unavailable":
      return `Repository ${detail} was not found, or the connected GitHub credential cannot see it.`;
    case "github_unavailable":
      return "GitHub is having trouble right now. The panels will retry.";
    case "not_mergeable":
      return detail ? `Not mergeable: ${detail}` : "Not mergeable. Resolve conflicts or checks first.";
    case "validation":
      return detail ? `GitHub rejected the request: ${detail}` : "GitHub rejected the request.";
    case "rate_limited":
      return "Rate limited by GitHub. Try again shortly.";
    case "forge_timeout":
      return "GitHub timed out. Try again.";
    default:
      if (code.startsWith("forge_error")) {
        return detail ? `GitHub returned an error: ${detail}` : "GitHub returned an error.";
      }
      return detail ? `${code}: ${detail}` : code;
  }
}
