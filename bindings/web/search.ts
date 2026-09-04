/**
 * Local search over already-loaded issues and pulls, used to answer a
 * query instantly while GitHub's search is in flight. Every whitespace-
 * separated word must match somewhere: title, `#number`, author login or
 * a label name. GitHub qualifiers (`is:open`, `label:x`) are left to the
 * server and ignored here.
 */

import type { ForgeIssue } from "./types";

export function searchTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0 && !term.includes(":"));
}

export function matchesQuery(item: ForgeIssue, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = [
    item.title,
    `#${item.number}`,
    String(item.number),
    item.author?.login ?? "",
    ...item.labels.map((l) => l.name),
  ]
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function filterLocally(items: ForgeIssue[], query: string): ForgeIssue[] {
  if (searchTerms(query).length === 0) return items;
  return items.filter((item) => matchesQuery(item, query));
}
