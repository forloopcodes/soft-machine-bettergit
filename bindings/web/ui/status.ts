/**
 * Semantic status colors and the pure helpers that map GitHub state onto
 * icon + color + label. These are the ONLY literal colors the panels use:
 * the manual's Git/diff conventions (green open, red closed, purple merged,
 * amber pending, gray neutral), theme-independent so red never stops
 * meaning red.
 */

import type { IconName } from "@soft-machine/sdk";
import type { ForgeCheckStatus, ForgeIssue, ForgePull } from "../types";

export const STATE_COLORS = {
  open: "#22c55e",
  merged: "#8b5cf6",
  closed: "#ef4444",
  done: "#8b5cf6",
  pending: "#f59e0b",
  muted: "#6b7280",
} as const;

/** Diff line washes and text, exactly the core Git panel's values. */
export const DIFF_COLORS = {
  addWash: "rgba(34, 197, 94, 0.15)",
  delWash: "rgba(239, 68, 68, 0.15)",
  addText: "#86efac",
  delText: "#fca5a5",
} as const;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const RELATIVE_CUTOFF_DAYS = 30;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 1", or "Aug 1, 2025" when the year differs from now's. */
export function shortDate(iso: string, nowMs: number): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(nowMs).getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

/** Coarse relative timestamp ("now", "5m", "3h", "12d"); past 30 days a
 *  short date in the same voice ("Aug 1"), never a locale-formatted one. */
export function relativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, nowMs - then);
  if (diff < MS_PER_MINUTE) return "now";
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m`;
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h`;
  const days = Math.floor(diff / MS_PER_DAY);
  if (days <= RELATIVE_CUTOFF_DAYS) return `${days}d`;
  return shortDate(iso, nowMs);
}

export interface StatusVisual {
  icon: IconName;
  color: string;
  label: string;
}

/** Icon + color + label for an issue or pull row / detail header. */
export function stateVisual(item: ForgeIssue): StatusVisual {
  if (item.isPull) {
    const pull = item as ForgePull;
    if (pull.mergedAt) {
      return { icon: "GitMerge", color: STATE_COLORS.merged, label: "Merged" };
    }
    if (item.state === "closed") {
      return { icon: "X", color: STATE_COLORS.closed, label: "Closed" };
    }
    if (pull.draft) {
      return { icon: "GitBranch", color: STATE_COLORS.muted, label: "Draft" };
    }
    return { icon: "GitBranch", color: STATE_COLORS.open, label: "Open" };
  }
  if (item.state === "closed") {
    return item.stateReason === "not_planned"
      ? { icon: "X", color: STATE_COLORS.muted, label: "Closed" }
      : { icon: "Check", color: STATE_COLORS.done, label: "Closed" };
  }
  return { icon: "Circle", color: STATE_COLORS.open, label: "Open" };
}

/** Per-check row visual, github.com's check list vocabulary. */
export function checkVisual(status: ForgeCheckStatus): StatusVisual {
  switch (status) {
    case "success":
      return { icon: "Check", color: STATE_COLORS.open, label: "Successful" };
    case "failure":
      return { icon: "X", color: STATE_COLORS.closed, label: "Failed" };
    case "skipped":
      return { icon: "Minus", color: STATE_COLORS.muted, label: "Skipped" };
    case "neutral":
      return { icon: "Circle", color: STATE_COLORS.muted, label: "Neutral" };
    default:
      return { icon: "Clock", color: STATE_COLORS.pending, label: "In progress" };
  }
}

/** Review verdict visual (APPROVED / CHANGES_REQUESTED / everything else). */
export function reviewVisual(state: string): StatusVisual {
  if (state === "APPROVED") {
    return { icon: "Check", color: STATE_COLORS.open, label: "Approved" };
  }
  if (state === "CHANGES_REQUESTED") {
    return { icon: "X", color: STATE_COLORS.closed, label: "Changes requested" };
  }
  if (state === "COMMENTED") {
    return { icon: "MessageSquare", color: STATE_COLORS.muted, label: "Commented" };
  }
  return { icon: "Eye", color: STATE_COLORS.muted, label: "Reviewed" };
}

/** Single-letter file status badge for the changed-files list. */
export function fileStatusVisual(status: string): { label: string; color: string } {
  switch (status) {
    case "added":
      return { label: "A", color: STATE_COLORS.open };
    case "removed":
      return { label: "D", color: STATE_COLORS.closed };
    case "renamed":
      return { label: "R", color: STATE_COLORS.merged };
    default:
      return { label: "M", color: STATE_COLORS.pending };
  }
}

/** Plural helper: count("check", 2) -> "2 checks". */
export function plural(noun: string, count: number): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
