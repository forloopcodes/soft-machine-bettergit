/**
 * GitHub REST → Forge types. These run on remote payloads, so the contract
 * under test is totality: every optional field degrades, nothing throws.
 */

import { describe, expect, it } from "vitest";
import {
  PATCH_MAX_CHARS,
  toChecks,
  toCommit,
  toFile,
  toIssue,
  toLabel,
  toMilestone,
  toPullDetail,
  toPullFromIssue,
  toRepo,
  toUser,
} from "../github/normalize";

const issueRaw = {
  number: 7,
  title: "Flaky test",
  state: "open",
  state_reason: null,
  user: { login: "octocat", avatar_url: "https://a/o.png", type: "User" },
  labels: [{ name: "bug", color: "d73a4a", description: "Something broke" }],
  assignees: [{ login: "hubot", avatar_url: null, type: "Bot" }],
  milestone: { number: 3, title: "v1.0", state: "open" },
  comments: 4,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  closed_at: null,
  html_url: "https://github.com/o/r/issues/7",
  body: "details",
};

describe("toUser / toLabel / toMilestone", () => {
  it("flags bots by type or [bot] suffix", () => {
    expect(toUser({ login: "hubot", type: "Bot" })?.isBot).toBe(true);
    expect(toUser({ login: "dependabot[bot]" })?.isBot).toBe(true);
    expect(toUser({ login: "octocat", type: "User" })?.isBot).toBeUndefined();
    expect(toUser({})).toBeNull();
  });

  it("normalizes label colors to #hex and rejects junk", () => {
    expect(toLabel({ name: "bug", color: "D73A4A" })).toEqual({ name: "bug", color: "#d73a4a", description: null });
    expect(toLabel({ name: "odd", color: "not-a-color" })?.color).toBeNull();
    expect(toLabel({ color: "d73a4a" })).toBeNull();
  });

  it("keys milestones by number and normalizes state", () => {
    expect(toMilestone({ number: 3, title: "v1.0", state: "closed" })).toEqual({ id: "3", title: "v1.0", state: "closed" });
    expect(toMilestone(null)).toBeNull();
  });
});

describe("toIssue", () => {
  it("maps an issue and tells it apart from a pull request", () => {
    const issue = toIssue(issueRaw);
    expect(issue).toMatchObject({
      number: 7,
      title: "Flaky test",
      state: "open",
      author: { login: "octocat", avatarUrl: "https://a/o.png" },
      labels: [{ name: "bug", color: "#d73a4a", description: "Something broke" }],
      assignees: [{ login: "hubot", avatarUrl: null, isBot: true }],
      milestone: { id: "3", title: "v1.0", state: "open" },
      commentCount: 4,
      isPull: false,
    });
    expect("draft" in issue).toBe(false);

    const pullish = toIssue({ ...issueRaw, pull_request: { merged_at: null }, draft: true });
    expect(pullish.isPull).toBe(true);
    expect(pullish.draft).toBe(true);
  });

  it("degrades missing fields instead of throwing", () => {
    expect(toIssue({})).toMatchObject({ number: 0, title: "", state: "open", author: null, labels: [], commentCount: 0 });
    expect(toIssue(null)).toMatchObject({ number: 0 });
  });
});

describe("toPullFromIssue / toPullDetail", () => {
  it("reads merged state from the search hit's pull_request stub", () => {
    const pull = toPullFromIssue({ ...issueRaw, pull_request: { merged_at: "2026-02-01T00:00:00Z" }, draft: false });
    expect(pull.isPull).toBe(true);
    expect(pull.mergedAt).toBe("2026-02-01T00:00:00Z");
    expect(pull.headRef).toBeNull();
    expect(pull.baseRef).toBeNull();
  });

  it("maps the full /pulls/N payload including mergeability", () => {
    const detail = toPullDetail({
      ...issueRaw,
      draft: true,
      head: { ref: "feature", sha: "abc" },
      base: { ref: "main" },
      merged_at: null,
      mergeable: null,
      mergeable_state: "unknown",
      additions: 10,
      deletions: 2,
      changed_files: 3,
      commits: 1,
    });
    expect(detail).toMatchObject({
      isPull: true,
      draft: true,
      headRef: "feature",
      baseRef: "main",
      mergeable: null,
      mergeableState: "unknown",
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      commits: 1,
      body: "details",
    });
  });
});

describe("toCommit / toFile / toRepo", () => {
  it("uses the first message line as the title and falls back to the committer", () => {
    const commit = toCommit({
      sha: "fcad147",
      commit: { message: "Fix thing\n\nLonger body", author: { date: "2026-01-08T10:25:21Z" } },
      author: null,
      committer: { login: "web-flow" },
      html_url: "https://github.com/o/r/commit/fcad147",
    });
    expect(commit).toEqual({
      sha: "fcad147",
      title: "Fix thing",
      author: { login: "web-flow", avatarUrl: null },
      createdAt: "2026-01-08T10:25:21Z",
      webUrl: "https://github.com/o/r/commit/fcad147",
    });
  });

  it("drops oversized patches so the viewer shows the binary/oversized note", () => {
    expect(toFile({ filename: "a.bin", status: "added", additions: 0, deletions: 0 }).patch).toBeNull();
    expect(toFile({ filename: "a.ts", status: "modified", patch: "@@ -1 +1 @@\n+x" }).patch).toBe("@@ -1 +1 @@\n+x");
    expect(toFile({ filename: "big.ts", status: "modified", patch: "x".repeat(PATCH_MAX_CHARS + 1) }).patch).toBeNull();
  });

  it("maps repositories and synthesizes a web URL", () => {
    expect(toRepo({ id: 1, full_name: "o/r", default_branch: "main", private: true })).toEqual({
      id: "1",
      fullName: "o/r",
      defaultBranch: "main",
      private: true,
      webUrl: "https://github.com/o/r",
      pushedAt: null,
    });
    expect(toRepo({ full_name: "o/r", pushed_at: "2026-09-01T00:00:00Z" }).pushedAt).toBe("2026-09-01T00:00:00Z");
    expect(toRepo({ full_name: "o/r", updated_at: "2026-08-01T00:00:00Z" }).pushedAt).toBe("2026-08-01T00:00:00Z");
    expect(toRepo({})).toBeNull();
  });
});

describe("toChecks", () => {
  it("merges check runs and commit statuses into one verdict list", () => {
    const checks = toChecks(
      {
        check_runs: [
          { name: "build", status: "completed", conclusion: "success", details_url: "https://ci/1", app: { name: "GitHub Actions" }, started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:02:30Z" },
          { name: "lint", status: "in_progress", conclusion: null, app: { name: "GitHub Actions" } },
          { name: "e2e", status: "completed", conclusion: "timed_out" },
          { name: "docs", status: "completed", conclusion: "skipped" },
          { name: "scan", status: "completed", conclusion: "neutral" },
        ],
      },
      {
        statuses: [
          { context: "vercel", state: "success", target_url: "https://vercel/x", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:45Z" },
          { context: "netlify", state: "pending" },
          { context: "codecov", state: "error" },
        ],
      }
    );
    expect(checks.map((c) => [c.name, c.status, c.app, c.durationSeconds])).toEqual([
      ["build", "success", "GitHub Actions", 150],
      ["lint", "pending", "GitHub Actions", null],
      ["e2e", "failure", null, null],
      ["docs", "skipped", null, null],
      ["scan", "neutral", null, null],
      ["vercel", "success", null, 45],
      ["netlify", "pending", null, null],
      ["codecov", "failure", null, null],
    ]);
  });

  it("tolerates either source being unavailable", () => {
    expect(toChecks(null, null)).toEqual([]);
    expect(toChecks({ check_runs: [{ name: "x", status: "queued" }] }, undefined)).toHaveLength(1);
  });
});
