/**
 * The VM bridge's pure parts: the GitHub route allowlist, path hygiene,
 * bearer parsing, and the /workspace origin scan (with credential scrub).
 * The server itself only starts under `node -e`, so requiring the file here
 * yields its internals without opening a port.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const bridge = require("../../vm/github-bridge.js") as {
  bearerToken: (req: { headers: Record<string, unknown> }) => string | null;
  isCleanPath: (p: string) => boolean;
  readOriginUrl: (dir: string) => string | null;
  resolveRedirect: (method: string, location: unknown) => string | null;
  routeAllowed: (method: string, p: string) => boolean;
  scrubUrl: (url: string) => string;
};

describe("resolveRedirect", () => {
  it("follows a renamed repository within the API and the allowlist", () => {
    // GitHub redirects a renamed repo's routes to the id-addressed form.
    expect(bridge.resolveRedirect("GET", "https://api.github.com/repositories/123/labels?per_page=100")).toBe(
      "/repositories/123/labels?per_page=100"
    );
    expect(bridge.resolveRedirect("GET", "https://api.github.com/repositories/123")).toBe("/repositories/123");
    expect(bridge.resolveRedirect("GET", "https://api.github.com/repos/o/new-name/labels?per_page=100")).toBe(
      "/repos/o/new-name/labels?per_page=100"
    );
    expect(bridge.resolveRedirect("PATCH", "/repos/o/new-name/issues/4")).toBe("/repos/o/new-name/issues/4");
  });

  it("refuses other hosts, unclean paths, and routes outside the allowlist", () => {
    expect(bridge.resolveRedirect("GET", "https://evil.example/repos/o/r/labels")).toBeNull();
    expect(bridge.resolveRedirect("GET", "https://api.github.com/repos/o/r%2Fx/labels")).toBeNull();
    expect(bridge.resolveRedirect("GET", "https://api.github.com/repos/o/r/actions/secrets")).toBeNull();
    expect(bridge.resolveRedirect("GET", "https://api.github.com/repositories/123/actions/secrets")).toBeNull();
    expect(bridge.resolveRedirect("DELETE", "https://api.github.com/repositories/123")).toBeNull();
    expect(bridge.resolveRedirect("DELETE", "https://api.github.com/repos/o/r")).toBeNull();
    expect(bridge.resolveRedirect("GET", undefined)).toBeNull();
    expect(bridge.resolveRedirect("GET", "")).toBeNull();
  });
});

describe("routeAllowed", () => {
  it("permits exactly the routes the panels use", () => {
    const allowed: Array<[string, string]> = [
      ["GET", "/user"],
      ["GET", "/user/repos"],
      ["GET", "/installation/repositories"],
      ["GET", "/search/issues"],
      ["GET", "/repos/o/r"],
      ["GET", "/repos/o/r/issues"],
      ["GET", "/repos/o/r/pulls"],
      ["GET", "/repos/o/r/labels"],
      ["GET", "/repos/o/r/milestones"],
      ["GET", "/repos/o/r/assignees"],
      ["GET", "/repos/o/r/branches"],
      ["GET", "/repos/o/r/issues/12"],
      ["GET", "/repos/o/r/issues/12/comments"],
      ["GET", "/repos/o/r/pulls/12"],
      ["GET", "/repos/o/r/pulls/12/files"],
      ["GET", "/repos/o/r/pulls/12/reviews"],
      ["GET", "/repos/o/r/pulls/12/commits"],
      ["GET", "/repos/o/r/commits/fcad147/check-runs"],
      ["GET", "/repos/o/r/commits/fcad147f7176d8974f7dcd36d10958c675379776/status"],
      ["POST", "/repos/o/r/issues"],
      ["POST", "/repos/o/r/pulls"],
      ["POST", "/repos/o/r/issues/12/comments"],
      ["PATCH", "/repos/o/r/issues/12"],
      ["PATCH", "/repos/o/r/pulls/12"],
      ["PUT", "/repos/o/r/issues/12/labels"],
      ["PUT", "/repos/o/r/pulls/12/merge"],
    ];
    for (const [method, path] of allowed) expect(bridge.routeAllowed(method, path), `${method} ${path}`).toBe(true);
  });

  it("refuses everything else, including method escalation", () => {
    const denied: Array<[string, string]> = [
      ["DELETE", "/repos/o/r"],
      ["DELETE", "/repos/o/r/issues/12/comments"],
      ["PATCH", "/repos/o/r"],
      ["POST", "/repos/o/r/issues/12/labels"],
      ["GET", "/repos/o/r/contents/README.md"],
      ["GET", "/repos/o/r/actions/secrets"],
      ["GET", "/orgs/o/members"],
      ["GET", "/user/emails"],
      ["GET", "/repos/o/r/pulls/12/merge"],
      ["GET", "/repos/o/r/issues/12/comments/3"],
      ["GET", "/repos/o/r/commits/nothex/status"],
      ["GET", "/repos/o/r/issues/"],
      ["GET", "/search/code"],
    ];
    for (const [method, path] of denied) expect(bridge.routeAllowed(method, path), `${method} ${path}`).toBe(false);
  });
});

describe("isCleanPath", () => {
  it("accepts name characters only and rejects dot segments and encodings", () => {
    expect(bridge.isCleanPath("/repos/o.wn/r_1-x/issues/3")).toBe(true);
    expect(bridge.isCleanPath("/repos/../user")).toBe(false);
    expect(bridge.isCleanPath("/repos/./x")).toBe(false);
    expect(bridge.isCleanPath("/repos/o%2Fr")).toBe(false);
    expect(bridge.isCleanPath("/repos/o r")).toBe(false);
    expect(bridge.isCleanPath("repos")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extracts a bearer token and ignores other schemes", () => {
    expect(bridge.bearerToken({ headers: { authorization: "Bearer sc_abc" } })).toBe("sc_abc");
    expect(bridge.bearerToken({ headers: { authorization: "bearer sc_abc" } })).toBe("sc_abc");
    expect(bridge.bearerToken({ headers: { authorization: "Basic dXNlcjpwYXNz" } })).toBeNull();
    expect(bridge.bearerToken({ headers: {} })).toBeNull();
  });
});

describe("scrubUrl / readOriginUrl", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function repo(config: string, { worktree = false } = {}): string {
    const dir = mkdtempSync(join(tmpdir(), "forge-bridge-"));
    dirs.push(dir);
    if (worktree) {
      const gitDir = join(dir, "real-gitdir");
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, "config"), config);
      writeFileSync(join(dir, ".git"), `gitdir: ${gitDir}\n`);
    } else {
      mkdirSync(join(dir, ".git"));
      writeFileSync(join(dir, ".git", "config"), config);
    }
    return dir;
  }

  it("strips userinfo from https remotes", () => {
    expect(bridge.scrubUrl("https://x-access-token:ghs_secret@github.com/o/r.git")).toBe("https://github.com/o/r.git");
    expect(bridge.scrubUrl("git@github.com:o/r.git")).toBe("git@github.com:o/r.git");
  });

  it("reads the origin url from .git/config and scrubs credentials", () => {
    const dir = repo(
      [
        "[core]",
        "\trepositoryformatversion = 0",
        '[remote "upstream"]',
        "\turl = https://github.com/other/thing.git",
        '[remote "origin"]',
        "\turl = https://oauth2:token123@github.com/o/r.git",
        "\tfetch = +refs/heads/*:refs/remotes/origin/*",
      ].join("\n")
    );
    expect(bridge.readOriginUrl(dir)).toBe("https://github.com/o/r.git");
  });

  it("follows a gitdir pointer file (worktrees, submodules)", () => {
    const dir = repo('[remote "origin"]\n\turl = git@github.com:o/wt.git\n', { worktree: true });
    expect(bridge.readOriginUrl(dir)).toBe("git@github.com:o/wt.git");
  });

  it("returns null without an origin remote or without a repository", () => {
    expect(bridge.readOriginUrl(repo('[remote "upstream"]\n\turl = x\n'))).toBeNull();
    const plain = mkdtempSync(join(tmpdir(), "forge-plain-"));
    dirs.push(plain);
    expect(bridge.readOriginUrl(plain)).toBeNull();
  });
});
