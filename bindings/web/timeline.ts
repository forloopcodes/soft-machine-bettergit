/**
 * Conversation timeline model, pure. Comments, commits and review verdicts
 * are merged into one time-ordered list; runs of commits by the same
 * author collapse into a single "added N commits" entry, the way
 * github.com's conversation groups pushes.
 */

import type { ForgeComment, ForgeCommit, ForgeReview, ForgeUser } from "./types";

export type TimelineEntry =
  | { kind: "comment"; key: string; date: number; comment: ForgeComment }
  | { kind: "commits"; key: string; date: number; author: ForgeUser | null; commits: ForgeCommit[] }
  | { kind: "review"; key: string; date: number; review: ForgeReview };

/** Undated entries sort last. */
export function dateOf(iso: string | null): number {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export function buildTimeline(
  comments: ForgeComment[],
  commits: ForgeCommit[],
  reviews: ForgeReview[]
): TimelineEntry[] {
  const raw: TimelineEntry[] = [
    ...comments.map((comment) => ({
      kind: "comment" as const,
      key: `c-${comment.id}`,
      date: dateOf(comment.createdAt),
      comment,
    })),
    ...commits.map((commit) => ({
      kind: "commits" as const,
      key: `k-${commit.sha}`,
      date: dateOf(commit.createdAt),
      author: commit.author,
      commits: [commit],
    })),
    ...reviews
      .filter((review) => review.submittedAt !== null)
      .map((review) => ({
        kind: "review" as const,
        key: `r-${review.id}`,
        date: dateOf(review.submittedAt),
        review,
      })),
  ].sort((a, b) => a.date - b.date);

  const merged: TimelineEntry[] = [];
  for (const entry of raw) {
    const last = merged[merged.length - 1];
    if (
      entry.kind === "commits" &&
      last?.kind === "commits" &&
      (last.author?.login ?? null) === (entry.author?.login ?? null)
    ) {
      last.commits.push(...entry.commits);
      last.date = entry.date;
      continue;
    }
    merged.push(entry);
  }
  return merged;
}

export function reviewVerb(state: string): string {
  return state === "APPROVED"
    ? "approved these changes"
    : state === "CHANGES_REQUESTED"
      ? "requested changes"
      : "reviewed";
}
