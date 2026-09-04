/**
 * Repository sidebar / picker model, pure: the three groups (pinned, in
 * this workspace, GitHub), the "most recent work" order, and the
 * persisted pin list and section collapse state with their sanitizers.
 *
 * Pinned repos are removed from the other two groups, and workspace
 * checkouts never appear in the GitHub group, so the GitHub list is only
 * the repositories the user has not already surfaced.
 */

import { filterRepos } from "./github/filterRepos";
import { REPO_RE, type ForgeRepo } from "./types";

/** GitHub rows shown before the user types anything. */
export const GITHUB_PREVIEW = 8;
/** GitHub rows shown for a query; beyond this the hint asks for more letters. */
export const GITHUB_RESULTS_MAX = 30;
/** Pins are a shortlist; past this the sidebar stops being one. */
export const PINNED_MAX = 50;

export interface RepoGroups {
  typed: string;
  /** A typed owner/name that is in no list, offered to open as-is. */
  customRepo: string | null;
  pinned: ForgeRepo[];
  workspace: ForgeRepo[];
  github: ForgeRepo[];
  /** GitHub repos matching but not shown (preview / result cap). */
  hiddenGithub: number;
}

const key = (name: string) => name.toLowerCase();

const pushedMs = (r: ForgeRepo): number => (r.pushedAt ? Date.parse(r.pushedAt) || 0 : 0);

/** Newest push first; unknown dates last; stable for ties. */
export function sortByRecent(repos: ForgeRepo[]): ForgeRepo[] {
  return repos
    .map((r, index) => ({ r, index, ms: pushedMs(r) }))
    .sort((a, b) => b.ms - a.ms || a.index - b.index)
    .map((x) => x.r);
}

export function groupRepos(repos: ForgeRepo[], search: string, pinnedNames: readonly string[]): RepoGroups {
  const typed = search.trim();
  const matching = filterRepos(repos, typed);
  const pinnedIndex = new Map(pinnedNames.map((name, i) => [key(name), i]));
  const isPinned = (r: ForgeRepo) => pinnedIndex.has(key(r.fullName));

  // Pins keep the user's own order (the order they were pinned in).
  const pinned = matching
    .filter(isPinned)
    .sort((a, b) => (pinnedIndex.get(key(a.fullName)) ?? 0) - (pinnedIndex.get(key(b.fullName)) ?? 0));
  const workspace = matching.filter((r) => r.localPath && !isPinned(r));
  const githubAll = matching.filter((r) => !r.localPath && !isPinned(r));
  // Typing ranks by match quality (filterRepos); browsing ranks by recency.
  const githubOrdered = typed ? githubAll : sortByRecent(githubAll);
  const github = githubOrdered.slice(0, typed ? GITHUB_RESULTS_MAX : GITHUB_PREVIEW);

  const customRepo =
    REPO_RE.test(typed) && !matching.some((r) => key(r.fullName) === key(typed)) ? typed : null;

  return {
    typed,
    customRepo,
    pinned,
    workspace,
    github,
    hiddenGithub: githubOrdered.length - github.length,
  };
}

// ── Display names ──────────────────────────────────────────────────────────

/**
 * The owner whose name can be dropped from repository labels: the signed-in
 * user, or (for an App installation, which has no login) the owner of more
 * than half of the visible repositories.
 */
export function inferSelfOwner(repos: readonly ForgeRepo[], login: string | null | undefined): string | null {
  if (login) return login;
  const counts = new Map<string, number>();
  for (const r of repos) {
    const owner = r.fullName.slice(0, r.fullName.indexOf("/")).toLowerCase();
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [owner, count] of counts) {
    if (count > bestCount) {
      best = owner;
      bestCount = count;
    }
  }
  return best !== null && bestCount * 2 > repos.length ? best : null;
}

/** "me/repo" → "repo" when the owner is self; other owners keep their prefix. */
export function displayRepoName(fullName: string, selfOwner: string | null): string {
  const slash = fullName.indexOf("/");
  if (slash < 0 || !selfOwner) return fullName;
  return fullName.slice(0, slash).toLowerCase() === selfOwner.toLowerCase() ? fullName.slice(slash + 1) : fullName;
}

// ── Pins (persisted, user-scoped, shared by every panel) ───────────────────

export const PINNED_KEY = "bettergit/pinned-repos";

export function sanitizePinned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !REPO_RE.test(item)) continue;
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= PINNED_MAX) break;
  }
  return out;
}

/** Pin appends; unpin removes (case-insensitively). */
export function togglePinned(pinned: readonly string[], fullName: string): string[] {
  const k = key(fullName);
  return pinned.some((p) => key(p) === k)
    ? pinned.filter((p) => key(p) !== k)
    : [...pinned, fullName].slice(-PINNED_MAX);
}

export function isPinnedRepo(pinned: readonly string[], fullName: string): boolean {
  const k = key(fullName);
  return pinned.some((p) => key(p) === k);
}

// ── Section collapse state ─────────────────────────────────────────────────

export type SidebarSection = "pinned" | "workspace" | "github";

export const SIDEBAR_SECTIONS_KEY = "bettergit/sidebar-collapsed";

export type CollapsedSections = Record<SidebarSection, boolean>;

const SECTION_NAMES: readonly SidebarSection[] = ["pinned", "workspace", "github"];

export function sanitizeCollapsed(raw: unknown): CollapsedSections {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as CollapsedSections;
  for (const name of SECTION_NAMES) out[name] = source[name] === true;
  return out;
}
