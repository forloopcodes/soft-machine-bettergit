/**
 * Label list ordering for pickers, pure: selected labels first (in the
 * order they were selected), then the rest in the repository's order; a
 * query narrows by name or description; a cap keeps menus short and
 * reports how many were left out.
 */

import type { ForgeLabel } from "./types";

/** Above this many labels a picker shows a search box. */
export const LABEL_SEARCH_MIN = 8;
/** Rows shown while browsing / while typing. */
export const LABEL_PREVIEW = 12;
export const LABEL_RESULTS_MAX = 40;

export interface LabelList {
  shown: ForgeLabel[];
  hidden: number;
}

export function orderLabels(labels: ForgeLabel[], selected: readonly string[], query: string): LabelList {
  const needle = query.trim().toLowerCase();
  const matching = needle
    ? labels.filter(
        (l) =>
          l.name.toLowerCase().includes(needle) ||
          (l.description ?? "").toLowerCase().includes(needle)
      )
    : labels;
  const rank = new Map(selected.map((name, i) => [name.toLowerCase(), i]));
  const ordered = matching
    .map((l, index) => ({ l, index, sel: rank.get(l.name.toLowerCase()) }))
    .sort((a, b) => {
      if (a.sel !== undefined && b.sel !== undefined) return a.sel - b.sel;
      if (a.sel !== undefined) return -1;
      if (b.sel !== undefined) return 1;
      return a.index - b.index;
    })
    .map((x) => x.l);
  const cap = needle ? LABEL_RESULTS_MAX : LABEL_PREVIEW;
  return { shown: ordered.slice(0, cap), hidden: Math.max(0, ordered.length - cap) };
}

/** Toggle a name in a selection (case-sensitive: GitHub label names are). */
export function toggleName(selected: readonly string[], name: string): string[] {
  return selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
}
