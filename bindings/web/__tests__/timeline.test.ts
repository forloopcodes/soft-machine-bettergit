import { describe, expect, it } from "vitest";
import { buildTimeline, reviewVerb } from "../timeline";
import type { ForgeComment, ForgeCommit, ForgeReview, ForgeUser } from "../types";

const user = (login: string): ForgeUser => ({ login, avatarUrl: null });
const commit = (sha: string, login: string, at: string): ForgeCommit => ({
  sha,
  title: `commit ${sha}`,
  author: user(login),
  createdAt: at,
  webUrl: null,
});
const comment = (id: string, at: string): ForgeComment => ({
  id,
  author: user("c"),
  body: "hi",
  createdAt: at,
  updatedAt: null,
  webUrl: null,
});
const review = (id: string, at: string | null, state = "APPROVED"): ForgeReview => ({
  id,
  author: user("r"),
  state,
  body: null,
  submittedAt: at,
});

describe("buildTimeline", () => {
  it("groups consecutive commits by the same author and keeps others apart", () => {
    const entries = buildTimeline(
      [comment("1", "2026-01-03T00:00:00Z")],
      [
        commit("a", "ann", "2026-01-01T00:00:00Z"),
        commit("b", "ann", "2026-01-02T00:00:00Z"),
        commit("c", "bob", "2026-01-04T00:00:00Z"),
        commit("d", "ann", "2026-01-05T00:00:00Z"),
      ],
      []
    );
    expect(entries.map((e) => e.kind)).toEqual(["commits", "comment", "commits", "commits"]);
    expect(entries[0].kind === "commits" && entries[0].commits.map((c) => c.sha)).toEqual(["a", "b"]);
    expect(entries[2].kind === "commits" && entries[2].author?.login).toBe("bob");
  });

  it("a comment between two pushes by one author splits the group", () => {
    const entries = buildTimeline(
      [comment("1", "2026-01-02T00:00:00Z")],
      [commit("a", "ann", "2026-01-01T00:00:00Z"), commit("b", "ann", "2026-01-03T00:00:00Z")],
      []
    );
    expect(entries.map((e) => e.kind)).toEqual(["commits", "comment", "commits"]);
  });

  it("orders by time, drops unsubmitted reviews, and puts undated items last", () => {
    const entries = buildTimeline(
      [comment("1", "2026-01-02T00:00:00Z")],
      [commit("a", "ann", "not a date")],
      [review("r1", "2026-01-01T00:00:00Z"), review("r2", null)]
    );
    expect(entries.map((e) => e.kind)).toEqual(["review", "comment", "commits"]);
  });

  it("group date follows its latest commit", () => {
    const [group] = buildTimeline(
      [],
      [commit("a", "ann", "2026-01-01T00:00:00Z"), commit("b", "ann", "2026-01-09T00:00:00Z")],
      []
    );
    expect(group.date).toBe(Date.parse("2026-01-09T00:00:00Z"));
  });
});

describe("reviewVerb", () => {
  it("phrases the three verdicts", () => {
    expect(reviewVerb("APPROVED")).toBe("approved these changes");
    expect(reviewVerb("CHANGES_REQUESTED")).toBe("requested changes");
    expect(reviewVerb("COMMENTED")).toBe("reviewed");
  });
});
