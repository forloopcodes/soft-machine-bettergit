import { describe, expect, it } from "vitest";
import { filterRepos } from "../github/filterRepos";
import type { ForgeRepo } from "../types";

const repo = (fullName: string): ForgeRepo => ({ id: fullName, fullName, defaultBranch: null, private: false, webUrl: "" });
const names = (list: ForgeRepo[]) => list.map((r) => r.fullName);

describe("filterRepos", () => {
  const repos = ["acme/web-timer", "acme/timer", "timerco/site", "acme/old-timer-utils", "acme/unrelated", "tim/er"].map(repo);

  it("returns everything for an empty query, in order", () => {
    expect(names(filterRepos(repos, "  "))).toEqual(names(repos));
  });

  it("ranks exact name, then name prefix, then owner prefix, then name substring, then owner substring", () => {
    expect(names(filterRepos(repos, "timer"))).toEqual([
      "acme/timer", // exact name
      "timerco/site", // owner prefix
      "acme/web-timer", // name substring (shorter first)
      "acme/old-timer-utils",
    ]);
  });

  it("is case-insensitive and drops non-matches", () => {
    expect(names(filterRepos(repos, "ACME/T"))).toEqual(["acme/timer"]);
    expect(filterRepos(repos, "zzz")).toEqual([]);
  });
});
