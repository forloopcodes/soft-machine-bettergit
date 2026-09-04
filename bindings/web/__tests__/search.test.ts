import { describe, expect, it } from "vitest";
import { filterLocally, matchesQuery, searchTerms } from "../search";
import type { ForgeIssue } from "../types";

const item = (number: number, title: string, login = "ann", labels: string[] = []): ForgeIssue => ({
  number,
  title,
  state: "open",
  stateReason: null,
  author: { login, avatarUrl: null },
  labels: labels.map((name) => ({ name, color: null })),
  assignees: [],
  milestone: null,
  commentCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  closedAt: null,
  webUrl: "",
  isPull: false,
});

describe("searchTerms", () => {
  it("splits words, lowercases, and drops qualifiers", () => {
    expect(searchTerms("  Fix  Path is:open label:bug ")).toEqual(["fix", "path"]);
    expect(searchTerms("")).toEqual([]);
  });
});

describe("matchesQuery", () => {
  const it1 = item(42, "fix: correct path containment", "drq", ["security"]);
  it("matches title words in any order, case-insensitively", () => {
    expect(matchesQuery(it1, "PATH fix")).toBe(true);
    expect(matchesQuery(it1, "path walker")).toBe(false);
  });
  it("matches number, author and labels", () => {
    expect(matchesQuery(it1, "#42")).toBe(true);
    expect(matchesQuery(it1, "42")).toBe(true);
    expect(matchesQuery(it1, "drq")).toBe(true);
    expect(matchesQuery(it1, "security")).toBe(true);
  });
  it("an all-qualifier query matches everything", () => {
    expect(matchesQuery(it1, "is:open")).toBe(true);
  });
});

describe("filterLocally", () => {
  it("returns the same array for an empty query and filters otherwise", () => {
    const items = [item(1, "alpha"), item(2, "beta"), item(3, "alphabet")];
    expect(filterLocally(items, "")).toBe(items);
    expect(filterLocally(items, "alpha").map((i) => i.number)).toEqual([1, 3]);
  });
});
