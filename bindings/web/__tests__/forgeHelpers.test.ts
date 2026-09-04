/**
 * Tests for the Forge plugin's pure helpers: the list query builder and its
 * inverse, clone-URL parsing, error copy, and the send-to-agent context
 * builders. Adversarial focus: user-controlled repo names, label names, and
 * remote bodies must be encoded or capped, never passed through raw.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  ForgeError,
  describeError,
  firstForgeRemote,
  listQueryString,
  parseListFilters,
  parsePatch,
  REPO_RE,
  repoFromCloneUrl,
  type ListFilters,
} from "../types";
import {
  chatMessageFor,
  issueAgentContext,
  itemSummaryContext,
  pullAgentContext,
} from "../agentContext";
import type { ForgeComment, ForgeIssueDetail, ForgePullDetail } from "../types";

function issue(overrides: Partial<ForgeIssueDetail> = {}): ForgeIssueDetail {
  return {
    number: 5,
    title: "nuke .cursor?",
    state: "open",
    stateReason: null,
    author: { login: "andrewgazelka", avatarUrl: null },
    labels: [{ name: "bug", color: "#d73a4a" }],
    assignees: [{ login: "forloopcodes", avatarUrl: null }],
    milestone: null,
    commentCount: 2,
    createdAt: "2026-01-03T00:00:00Z",
    updatedAt: "2026-01-04T00:00:00Z",
    closedAt: null,
    webUrl: "https://github.com/o/r/issues/5",
    isPull: false,
    body: "and old files too there are a lot",
    ...overrides,
  };
}

function pull(overrides: Partial<ForgePullDetail> = {}): ForgePullDetail {
  return {
    ...issue({ isPull: true }),
    draft: false,
    headRef: "fix/sof-475-firefox-blur",
    baseRef: "main",
    mergedAt: null,
    mergeable: true,
    mergeableState: "clean",
    additions: 32,
    deletions: 6,
    changedFiles: 1,
    commits: 1,
    ...overrides,
  } as ForgePullDetail;
}

describe("listQueryString", () => {
  it("encodes repo and defaults to state only", () => {
    expect(listQueryString("owner/repo", DEFAULT_FILTERS)).toBe("?repo=owner%2Frepo&state=open");
  });

  it("encodes every active filter and skips defaults", () => {
    const qs = listQueryString("o/r", {
      state: "closed",
      q: "flaky test",
      author: "andrewgazelka",
      labels: ["bug", "help wanted"],
      assignee: "me",
      milestone: "v1.0",
      sort: "comments",
      page: 3,
    });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("state")).toBe("closed");
    expect(params.get("q")).toBe("flaky test");
    expect(params.get("author")).toBe("andrewgazelka");
    expect(params.get("labels")).toBe("bug,help wanted");
    expect(params.get("assignee")).toBe("me");
    expect(params.get("milestone")).toBe("v1.0");
    expect(params.get("sort")).toBe("comments");
    expect(params.get("page")).toBe("3");
  });

  it("URI-encodes hostile search text instead of splicing it raw", () => {
    const qs = listQueryString("o/r", { ...DEFAULT_FILTERS, q: "a&state=all#inject" });
    expect(qs).not.toContain("&state=all#");
    expect(new URLSearchParams(qs.slice(1)).get("q")).toBe("a&state=all#inject");
    expect(new URLSearchParams(qs.slice(1)).get("state")).toBe("open");
  });

  it("omits page 1 so cache keys stay stable", () => {
    expect(listQueryString("o/r", { ...DEFAULT_FILTERS, page: 1 })).not.toContain("page=");
  });
});

describe("parseListFilters", () => {
  it("round-trips every filter through listQueryString", () => {
    const filters: ListFilters = {
      state: "closed",
      q: "flaky test",
      author: "andrewgazelka",
      labels: ["bug", "help wanted"],
      assignee: "me",
      milestone: "v1.0",
      sort: "comments",
      page: 3,
    };
    const params = new URLSearchParams(listQueryString("o/r", filters).slice(1));
    expect(parseListFilters(params)).toEqual(filters);
  });

  it("falls back to defaults for missing or malformed values", () => {
    const parsed = parseListFilters(new URLSearchParams("repo=o%2Fr&sort=bogus&page=-2&state=weird"));
    expect(parsed).toEqual(DEFAULT_FILTERS);
  });
});

describe("REPO_RE", () => {
  it("accepts owner/name shapes", () => {
    expect(REPO_RE.test("Soft-Machine-io/soft-machine")).toBe(true);
    expect(REPO_RE.test("a.b/c_d-e")).toBe(true);
  });

  it("rejects traversal and over-deep paths", () => {
    expect(REPO_RE.test("../etc")).toBe(false);
    expect(REPO_RE.test("a/b/c")).toBe(false);
    expect(REPO_RE.test("a")).toBe(false);
    expect(REPO_RE.test("a/b?x=1")).toBe(false);
    expect(REPO_RE.test("")).toBe(false);
  });
});

describe("repoFromCloneUrl", () => {
  it("parses https and ssh GitHub clone URLs", () => {
    expect(repoFromCloneUrl("https://github.com/Soft-Machine-io/soft-machine.git")).toEqual({
      provider: "github",
      repo: "Soft-Machine-io/soft-machine",
    });
    expect(repoFromCloneUrl("https://github.com/o/r")).toEqual({ provider: "github", repo: "o/r" });
    expect(repoFromCloneUrl("git@github.com:o/r.git")).toEqual({ provider: "github", repo: "o/r" });
    expect(repoFromCloneUrl("ssh://git@github.com/o/r")).toEqual({ provider: "github", repo: "o/r" });
  });

  it("parses credentialed https remotes (VM clones embed the token)", () => {
    expect(repoFromCloneUrl("https://x-access-token:ghp_abc123@github.com/o/r.git")).toEqual({
      provider: "github",
      repo: "o/r",
    });
    // Userinfo must not let a hostile host impersonate GitHub.
    expect(repoFromCloneUrl("https://github.com@evil.test/o/r")).toBeNull();
    expect(repoFromCloneUrl("https://a@github.com.evil.test/o/r")).toBeNull();
  });

  it("returns null for other hosts, deep paths, and junk", () => {
    expect(repoFromCloneUrl("https://gitlab.com/group/proj.git")).toBeNull();
    expect(repoFromCloneUrl("https://bitbucket.org/o/r.git")).toBeNull();
    expect(repoFromCloneUrl("https://github.com/a/b/c.git")).toBeNull();
    expect(repoFromCloneUrl("https://github.com/only-owner")).toBeNull();
    expect(repoFromCloneUrl("https://evil.test/github.com/o/r")).toBeNull();
    expect(repoFromCloneUrl("")).toBeNull();
  });
});

describe("firstForgeRemote", () => {
  it("picks the first GitHub origin, skipping dotfile/home repos", () => {
    const stdout = [
      "https://gitea.internal/dotfiles/home.git",
      "git@bitbucket.org:me/apphome.git",
      "https://github.com/soft-machine-io/soft-machine",
    ].join("\n");
    expect(firstForgeRemote(stdout)).toBe("https://github.com/soft-machine-io/soft-machine");
  });

  it("returns the credentialed https remote a VM clone leaves", () => {
    expect(firstForgeRemote("https://x-access-token:ghp_z@github.com/o/r.git\n")).toBe(
      "https://x-access-token:ghp_z@github.com/o/r.git"
    );
  });

  it("returns null when no line is a GitHub remote", () => {
    expect(firstForgeRemote("https://bitbucket.org/o/r\n\n")).toBeNull();
    expect(firstForgeRemote("")).toBeNull();
  });
});

describe("parsePatch", () => {
  it("classifies hunks, adds, dels, and context; drops file headers", () => {
    const patch = [
      "diff --git a/x.ts b/x.ts",
      "index abc..def 100644",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1,3 +1,3 @@ fn main",
      " unchanged line",
      "-old line",
      "+new line",
      "\\ No newline at end of file",
    ].join("\n");
    expect(parsePatch(patch)).toEqual([
      { kind: "hunk", content: "@@ -1,3 +1,3 @@ fn main" },
      { kind: "context", content: "unchanged line" },
      { kind: "del", content: "old line" },
      { kind: "add", content: "new line" },
    ]);
  });

  it("does not misread +++/--- headers as add/del lines", () => {
    const lines = parsePatch("--- a/x\n+++ b/x\n@@ -1 +1 @@\n+only add");
    expect(lines.filter((l) => l.kind === "del")).toHaveLength(0);
    expect(lines.filter((l) => l.kind === "add")).toEqual([{ kind: "add", content: "only add" }]);
  });

  it("drops the phantom trailing empty context line", () => {
    const lines = parsePatch("@@ -1 +1 @@\n+x\n");
    expect(lines[lines.length - 1]).toEqual({ kind: "add", content: "x" });
  });
});

describe("describeError", () => {
  it("maps error codes to actionable copy", () => {
    expect(describeError(new Error("invalid_api_key"))).toContain("Settings");
    expect(describeError(new Error("rate_limited"))).toContain("Rate limited");
    expect(describeError(new Error("not_mergeable"))).toContain("mergeable");
    expect(describeError(new Error("not_connected"))).toContain("Integrations");
    expect(describeError(new Error("forge_error:500"))).toBe("GitHub returned an error.");
  });

  it("surfaces GitHub's own detail for permission and validation failures", () => {
    expect(describeError(new ForgeError("forbidden", 403, "Resource not accessible by integration"))).toBe(
      "GitHub refused: Resource not accessible by integration"
    );
    expect(describeError(new ForgeError("validation", 422, "No commits between main and main"))).toContain(
      "No commits between"
    );
    expect(describeError(new ForgeError("forbidden", 403))).toBe(
      "GitHub refused the request for this repository."
    );
  });

  it("explains moved and unavailable repositories and keeps GitHub's reason on generic failures", () => {
    expect(describeError(new ForgeError("repo_moved", 301, "o/new"))).toContain("moved to o/new");
    expect(describeError(new ForgeError("repo_unavailable", 404, "o/gone"))).toContain("o/gone");
    expect(describeError(new ForgeError("github_unavailable", 502))).toContain("retry");
    expect(describeError(new ForgeError("forge_error:418", 418, "I'm a teapot"))).toBe(
      "GitHub returned an error: I'm a teapot"
    );
    expect(describeError(new ForgeError("not_found", 404, "Branch missing"))).toBe("Not found: Branch missing");
  });
});

describe("chatMessageFor", () => {
  it("names the item and carries the context verbatim", () => {
    const message = chatMessageFor("o/r#5", "## Issue o/r#5: title");
    expect(message.startsWith("Shared from the bettergit panel: o/r#5")).toBe(true);
    expect(message).toContain("## Issue o/r#5: title");
  });
});

describe("itemSummaryContext", () => {
  it("carries metadata and the URL without pretending to have the body", () => {
    const ctx = itemSummaryContext("github", "o/r", issue());
    expect(ctx).toContain("Issue o/r#5: nuke .cursor?");
    expect(ctx).toContain("https://github.com/o/r/issues/5");
    expect(ctx).toContain("Labels: bug");
    expect(ctx).toContain("Sent from the list view");
    expect(ctx).not.toContain("and old files too");
  });
});

describe("issueAgentContext", () => {
  it("contains everything the agent needs to act standalone", () => {
    const comments: ForgeComment[] = [
      {
        id: "1",
        author: { login: "vmfunc", avatarUrl: null },
        body: "workflow ref",
        createdAt: "2026-01-05T00:00:00Z",
        updatedAt: null,
        webUrl: null,
      },
    ];
    const ctx = issueAgentContext("github", "o/r", issue(), comments);
    expect(ctx).toContain("Issue o/r#5: nuke .cursor?");
    expect(ctx).toContain("Provider: GitHub");
    expect(ctx).toContain("State: open");
    expect(ctx).toContain("Assignees: forloopcodes");
    expect(ctx).toContain("and old files too");
    expect(ctx).toContain("**vmfunc**");
    expect(ctx).toContain("workflow ref");
  });

  it("caps a hostile oversized body instead of flooding the chat", () => {
    const ctx = issueAgentContext("github", "o/r", issue({ body: "x".repeat(200_000) }), []);
    expect(ctx.length).toBeLessThan(30_000);
    expect(ctx).toContain("(truncated)");
  });

  it("caps the comment thread at 30 and says how many were dropped", () => {
    const comments: ForgeComment[] = Array.from({ length: 45 }, (_, i) => ({
      id: String(i),
      author: null,
      body: `comment ${i}`,
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: null,
      webUrl: null,
    }));
    const ctx = issueAgentContext("github", "o/r", issue(), comments);
    expect(ctx).toContain("comment 29");
    expect(ctx).not.toContain("comment 30");
    expect(ctx).toContain("15 more comments");
  });
});

describe("pullAgentContext", () => {
  it("includes branches, diffstat, files, and reviews", () => {
    const ctx = pullAgentContext(
      "github",
      "o/r",
      pull(),
      [],
      [{ filename: "src/a.ts", status: "modified", additions: 30, deletions: 4, patch: null }],
      [{ id: "r1", author: { login: "lukalot1", avatarUrl: null }, state: "APPROVED", body: null, submittedAt: null }]
    );
    expect(ctx).toContain("Pull request o/r#5");
    expect(ctx).toContain("fix/sof-475-firefox-blur -> main");
    expect(ctx).toContain("+32 -6 across 1 files, 1 commits");
    expect(ctx).toContain("src/a.ts (modified, +30 -4)");
    expect(ctx).toContain("lukalot1: APPROVED");
    expect(ctx).toContain("Mergeable: yes (clean)");
  });

  it("caps the reviews list at 50 with an overflow note", () => {
    const reviews = Array.from({ length: 70 }, (_, i) => ({
      id: `r${i}`,
      author: { login: `rev${i}`, avatarUrl: null },
      state: "APPROVED",
      body: null,
      submittedAt: "2026-01-05T00:00:00Z",
    }));
    const ctx = pullAgentContext("github", "o/r", pull(), [], [], reviews);
    expect(ctx).toContain("rev49: APPROVED");
    expect(ctx).not.toContain("rev50: APPROVED");
    expect(ctx).toContain("20 more reviews");
  });

  it("caps the changed-file list at 100 entries", () => {
    const files = Array.from({ length: 130 }, (_, i) => ({
      filename: `f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      patch: null,
    }));
    const ctx = pullAgentContext("github", "o/r", pull(), [], files, []);
    expect(ctx).toContain("f99.ts");
    expect(ctx).not.toContain("- f100.ts (");
    expect(ctx).toContain("30 more files");
  });
});
