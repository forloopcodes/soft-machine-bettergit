/**
 * Local repository filter for the picker: case-insensitive substring on
 * owner/name, ranked so a repo NAME matching at its start beats a match
 * buried in the owner, and shorter names win ties. Stable for equal ranks.
 */

import type { ForgeRepo } from "../types";

export function filterRepos(repos: ForgeRepo[], query: string): ForgeRepo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return repos;
  const rank = (r: ForgeRepo): number => {
    const full = r.fullName.toLowerCase();
    const name = full.slice(full.indexOf("/") + 1);
    if (name === needle || full === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (full.startsWith(needle)) return 2;
    if (name.includes(needle)) return 3;
    return full.includes(needle) ? 4 : -1;
  };
  return repos
    .map((r, index) => ({ r, index, score: rank(r) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.r.fullName.length - b.r.fullName.length || a.index - b.index)
    .map((x) => x.r);
}
