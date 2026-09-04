/**
 * Per-panel-instance navigation state for the list panels in same-panel
 * mode: which repository the view belongs to and whether the panel is
 * showing the list or one item's detail. Pure functions; the React hook in
 * hooks.ts persists the state per panel instance.
 *
 * The repo is stored alongside so a persisted "detail #42" from last
 * session never re-applies to a different repository: resolving against
 * the current repo falls back to the list.
 */

import { REPO_RE } from "./types";

export interface PanelViewState {
  repo: string | null;
  view: "list" | "detail";
  number: number | null;
}

export const LIST_VIEW: PanelViewState = { repo: null, view: "list", number: null };

/** What the panel should actually render given the currently selected repo. */
export function resolveView(
  state: PanelViewState,
  repo: string | null
): { view: "list" } | { view: "detail"; number: number } {
  if (
    state.view === "detail" &&
    state.number !== null &&
    repo !== null &&
    state.repo !== null &&
    state.repo.toLowerCase() === repo.toLowerCase()
  ) {
    return { view: "detail", number: state.number };
  }
  return { view: "list" };
}

export function openDetailView(repo: string, number: number): PanelViewState {
  return { repo, view: "detail", number };
}

export function listView(repo: string | null): PanelViewState {
  return { repo, view: "list", number: null };
}

export function sanitizePanelView(raw: unknown): PanelViewState {
  if (!raw || typeof raw !== "object") return LIST_VIEW;
  const s = raw as Record<string, unknown>;
  const repo = typeof s.repo === "string" && REPO_RE.test(s.repo) ? s.repo : null;
  const number =
    typeof s.number === "number" && Number.isInteger(s.number) && s.number > 0 ? s.number : null;
  if (s.view === "detail" && repo && number !== null) {
    return { repo, view: "detail", number };
  }
  return { repo, view: "list", number: null };
}
