import { describe, expect, it } from "vitest";
import {
  displayRepoName,
  inferSelfOwner,
  GITHUB_PREVIEW,
  groupRepos,
  isPinnedRepo,
  sanitizeCollapsed,
  sanitizePinned,
  sortByRecent,
  togglePinned,
} from "../repoGroups";
import type { ForgeRepo } from "../types";

const repo = (fullName: string, extra: Partial<ForgeRepo> = {}): ForgeRepo => ({
  id: fullName,
  fullName,
  defaultBranch: null,
  private: false,
  webUrl: `https://github.com/${fullName}`,
  pushedAt: null,
  ...extra,
});

describe("sortByRecent", () => {
  it("orders newest push first, unknown last, stable for ties", () => {
    const sorted = sortByRecent([
      repo("o/none"),
      repo("o/old", { pushedAt: "2026-01-01T00:00:00Z" }),
      repo("o/new", { pushedAt: "2026-09-01T00:00:00Z" }),
      repo("o/none2"),
    ]).map((r) => r.fullName);
    expect(sorted).toEqual(["o/new", "o/old", "o/none", "o/none2"]);
  });
});

describe("groupRepos", () => {
  const repos = [
    repo("o/local-a", { localPath: "/workspace/a" }),
    repo("o/local-b", { localPath: "/workspace/b" }),
    repo("o/gh-old", { pushedAt: "2026-01-01T00:00:00Z" }),
    repo("o/gh-new", { pushedAt: "2026-09-01T00:00:00Z" }),
    repo("o/gh-mid", { pushedAt: "2026-05-01T00:00:00Z" }),
  ];

  it("pins come out of the other groups and keep pin order", () => {
    const g = groupRepos(repos, "", ["o/gh-mid", "O/LOCAL-A"]);
    expect(g.pinned.map((r) => r.fullName)).toEqual(["o/gh-mid", "o/local-a"]);
    expect(g.workspace.map((r) => r.fullName)).toEqual(["o/local-b"]);
    expect(g.github.map((r) => r.fullName)).toEqual(["o/gh-new", "o/gh-old"]);
  });

  it("GitHub group is by recency when browsing and by match when typing", () => {
    expect(groupRepos(repos, "", []).github.map((r) => r.fullName)).toEqual([
      "o/gh-new",
      "o/gh-mid",
      "o/gh-old",
    ]);
    const typed = groupRepos(repos, "gh-o", []);
    expect(typed.github.map((r) => r.fullName)).toEqual(["o/gh-old"]);
    expect(typed.hiddenGithub).toBe(0);
  });

  it("previews a capped GitHub list and counts the rest", () => {
    const many = Array.from({ length: 20 }, (_, i) => repo(`o/r${i}`));
    const g = groupRepos(many, "", []);
    expect(g.github).toHaveLength(GITHUB_PREVIEW);
    expect(g.hiddenGithub).toBe(20 - GITHUB_PREVIEW);
  });

  it("offers a typed owner/name that is in no list", () => {
    expect(groupRepos(repos, "someone/else", []).customRepo).toBe("someone/else");
    expect(groupRepos(repos, "o/gh-new", []).customRepo).toBeNull();
    expect(groupRepos(repos, "../x", []).customRepo).toBeNull();
  });
});

describe("pins", () => {
  it("sanitizes to unique valid owner/name strings", () => {
    expect(sanitizePinned(undefined)).toEqual([]);
    expect(sanitizePinned(["o/r", "O/R", 3, "../x", "o/s"])).toEqual(["o/r", "o/s"]);
  });

  it("toggles case-insensitively, appending new pins", () => {
    expect(togglePinned([], "o/r")).toEqual(["o/r"]);
    expect(togglePinned(["o/r"], "o/s")).toEqual(["o/r", "o/s"]);
    expect(togglePinned(["o/r", "o/s"], "O/R")).toEqual(["o/s"]);
    expect(isPinnedRepo(["o/r"], "O/R")).toBe(true);
    expect(isPinnedRepo(["o/r"], "o/s")).toBe(false);
  });
});

describe("sanitizeCollapsed", () => {
  it("defaults every section to expanded and keeps only booleans", () => {
    expect(sanitizeCollapsed(null)).toEqual({ pinned: false, workspace: false, github: false });
    expect(sanitizeCollapsed({ github: true, workspace: "yes", junk: true })).toEqual({
      pinned: false,
      workspace: false,
      github: true,
    });
  });
});

describe("display names", () => {
  const r = (fullName: string): ForgeRepo => ({
    id: fullName,
    fullName,
    defaultBranch: null,
    private: false,
    webUrl: "",
    pushedAt: null,
  });

  it("uses the signed-in login as self", () => {
    expect(inferSelfOwner([r("acme/x")], "me")).toBe("me");
  });

  it("without a login, self is the owner of more than half the repos", () => {
    expect(inferSelfOwner([r("me/a"), r("me/b"), r("acme/c")], null)).toBe("me");
    expect(inferSelfOwner([r("me/a"), r("acme/c")], null)).toBeNull();
    expect(inferSelfOwner([], null)).toBeNull();
  });

  it("drops only the self owner from names, case-insensitively", () => {
    expect(displayRepoName("Me/repo", "me")).toBe("repo");
    expect(displayRepoName("acme/repo", "me")).toBe("acme/repo");
    expect(displayRepoName("me/repo", null)).toBe("me/repo");
    expect(displayRepoName("repo", "me")).toBe("repo");
  });
});
