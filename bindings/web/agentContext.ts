/**
 * Send-to-agent context builders. Pure functions that turn a loaded issue
 * or pull request (plus its thread) into one self-contained markdown block
 * the agent can act on without any panel state, delivered through the
 * composer bridge (same channel as the browser panel's element selector).
 *
 * Bodies and comments are user-controlled remote content, so everything is
 * length-capped: a hostile 200KB issue body must not flood the composer.
 */

import type {
  ForgeComment,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeProvider,
  ForgePullDetail,
  ForgePullFile,
  ForgeReview,
} from "./types";
import { PROVIDER_LABELS } from "./types";

const BODY_MAX = 20_000;
const COMMENT_MAX = 4_000;
const COMMENTS_MAX = 30;
const FILES_MAX = 100;
const REVIEWS_MAX = 50;

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n... (truncated)` : text;
}

function headerLines(
  provider: ForgeProvider,
  repo: string,
  item: ForgeIssueDetail,
  kind: "Issue" | "Pull request"
): string[] {
  const labels = item.labels.map((l) => l.name).join(", ");
  const assignees = item.assignees.map((a) => a.login).join(", ");
  return [
    `## ${kind} ${repo}#${item.number}: ${item.title}`,
    "",
    `- Provider: ${PROVIDER_LABELS[provider]}`,
    `- URL: ${item.webUrl}`,
    `- State: ${item.state}${item.stateReason ? ` (${item.stateReason})` : ""}`,
    `- Author: ${item.author?.login ?? "unknown"}`,
    `- Created: ${item.createdAt}`,
    `- Updated: ${item.updatedAt}`,
    ...(labels ? [`- Labels: ${labels}`] : []),
    ...(assignees ? [`- Assignees: ${assignees}`] : []),
    ...(item.milestone ? [`- Milestone: ${item.milestone.title}`] : []),
  ];
}

function bodySection(body: string | null): string[] {
  return [
    "",
    "### Description",
    "",
    body?.trim() ? clamp(body, BODY_MAX) : "(no description)",
  ];
}

function commentsSection(comments: ForgeComment[]): string[] {
  if (comments.length === 0) return [];
  const shown = comments.slice(0, COMMENTS_MAX);
  const lines = ["", `### Comments (${comments.length})`];
  for (const c of shown) {
    lines.push(
      "",
      `**${c.author?.login ?? "unknown"}** (${c.createdAt}):`,
      clamp(c.body, COMMENT_MAX)
    );
  }
  if (comments.length > shown.length) {
    lines.push("", `... ${comments.length - shown.length} more comments`);
  }
  return lines;
}

/**
 * Compact context for a LIST row's send-to-chat action: metadata only,
 * plus the URL so the agent can pull anything deeper itself. The detail
 * panels send the full body/thread version instead.
 */
export function itemSummaryContext(
  provider: ForgeProvider,
  repo: string,
  item: ForgeIssue
): string {
  return [
    ...headerLines(
      provider,
      repo,
      { ...item, body: null },
      item.isPull ? "Pull request" : "Issue"
    ),
    "",
    "(Sent from the list view; open the URL for the full body, comments, and diff.)",
  ].join("\n");
}

/** Full issue context: metadata, description, and the comment thread. */
export function issueAgentContext(
  provider: ForgeProvider,
  repo: string,
  issue: ForgeIssueDetail,
  comments: ForgeComment[]
): string {
  return [
    ...headerLines(provider, repo, issue, "Issue"),
    ...bodySection(issue.body),
    ...commentsSection(comments),
  ].join("\n");
}

/**
 * Full pull request context: metadata, branches, diffstat, changed files,
 * reviews, description, and the comment thread.
 */
export function pullAgentContext(
  provider: ForgeProvider,
  repo: string,
  pull: ForgePullDetail,
  comments: ForgeComment[],
  files: ForgePullFile[],
  reviews: ForgeReview[]
): string {
  const lines = [
    ...headerLines(provider, repo, pull, "Pull request"),
    `- Branches: ${pull.headRef ?? "?"} -> ${pull.baseRef ?? "?"}`,
    `- Draft: ${pull.draft ? "yes" : "no"}`,
    `- Mergeable: ${pull.mergeable === null ? "unknown" : pull.mergeable ? "yes" : "no"}${pull.mergeableState ? ` (${pull.mergeableState})` : ""}`,
    `- Diff: +${pull.additions} -${pull.deletions} across ${pull.changedFiles} files, ${pull.commits} commits`,
    ...(pull.mergedAt ? [`- Merged: ${pull.mergedAt}`] : []),
  ];

  if (files.length > 0) {
    const shown = files.slice(0, FILES_MAX);
    lines.push("", `### Changed files (${files.length})`, "");
    for (const f of shown) {
      lines.push(
        `- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`
      );
    }
    if (files.length > shown.length) {
      lines.push(`- ... ${files.length - shown.length} more files`);
    }
  }

  if (reviews.length > 0) {
    const shown = reviews.slice(0, REVIEWS_MAX);
    lines.push("", `### Reviews (${reviews.length})`, "");
    for (const r of shown) {
      lines.push(
        `- ${r.author?.login ?? "unknown"}: ${r.state}${r.body?.trim() ? ` - ${clamp(r.body, COMMENT_MAX)}` : ""}`
      );
    }
    if (reviews.length > shown.length) {
      lines.push(`- ... ${reviews.length - shown.length} more reviews`);
    }
  }

  lines.push(...bodySection(pull.body), ...commentsSection(comments));
  return lines.join("\n");
}
