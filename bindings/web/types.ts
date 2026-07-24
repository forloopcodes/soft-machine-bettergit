/**
 * Wire types and pure helpers for the Forge plugin (GitHub / GitLab pull
 * requests and issues). Shapes mirror the server proxy's normalized
 * responses (server/src/integrations/forgeTypes.ts); the browser never
 * holds a forge token, every request goes through
 * /api/integrations/forge/:provider/*.
 */

export type ForgeProvider = "github" | "gitlab";

/** user_integrations site per provider (Settings -> Integrations). */
export const PROVIDER_SITES: Record<ForgeProvider, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
};

export const PROVIDER_LABELS: Record<ForgeProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

/**
 * owner/name (GitHub) or group/project path (GitLab). Segments must start
 * with an alphanumeric so "../etc" style traversal never validates
 * (neither forge allows leading dots or dashes in names anyway).
 */
export const REPO_RE =
  /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export interface ForgeRepo {
  id: string;
  fullName: string;
  defaultBranch: string | null;
  private: boolean;
  webUrl: string;
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

/** List page size; must match the proxy's per-page for hasMore inference. */
export const LIST_PAGE_SIZE = 30;

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
 * Build the proxy list query string. Defaults are omitted so the polled
 * query key stays stable and cache-friendly; every value is URI-encoded
 * because label names and search text are user-controlled.
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

/**
 * Derive {provider, repo} from a clone URL, so panels can auto-lock onto
 * the repository the workspace was created from (same spirit as the Git
 * panel's repo auto-detection, but from the workspace record instead of
 * a VM round-trip). Handles https and ssh forms of both forges, including
 * credentialed https remotes (VM clones embed the token as userinfo);
 * anything else (self-hosted, subgroup-deep GitLab paths) returns null
 * and leaves the manual picker in charge.
 */
export function repoFromCloneUrl(
  url: string
): { provider: ForgeProvider; repo: string } | null {
  const match =
    /^(?:https?:\/\/(?:[^/@\s]+@)?|git@|ssh:\/\/git@)(github\.com|gitlab\.com)[/:](.+?)(?:\.git)?\/?$/i.exec(
      url.trim()
    );
  if (!match) return null;
  const repo = match[2];
  if (!REPO_RE.test(repo)) return null;
  return {
    provider: match[1].toLowerCase() === "github.com" ? "github" : "gitlab",
    repo,
  };
}

/**
 * From newline-separated `git remote get-url origin` output across every
 * repo under /workspace, return the first origin URL that parses to a
 * GitHub/GitLab repo — skipping dotfile/home repos and non-forge remotes.
 * Null when none qualify. Returns the raw URL (not the parsed pair) so it
 * flows through the same autoSelectFromUrl path as the bootstrap URL.
 */
export function firstForgeRemote(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const url = line.trim();
    if (url && repoFromCloneUrl(url) !== null) return url;
  }
  return null;
}

/** Proxy error codes -> user-facing copy (mirrors the Linear plugin). */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  switch (message) {
    case "invalid_api_key":
      return "The stored token was rejected. Update it in Settings.";
    case "not_found":
      return "Not found. Check the repository selection.";
    case "not_mergeable":
      return "Not mergeable. Resolve conflicts or checks first.";
    case "rate_limited":
      return "Rate limited by the provider. Try again shortly.";
    case "forge_timeout":
      return "The provider timed out. Try again.";
    default:
      return message.startsWith("forge_error")
        ? "The provider returned an error."
        : message;
  }
}
