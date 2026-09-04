/**
 * Data and navigation hooks for the Forge plugin.
 *
 * Reads resolve panel path strings through the route table (github/routes)
 * into GitHub calls made by the VM bridge, cached and polled by the query
 * store so lists and open details keep syncing in the background. Writes
 * go through the same bridge and then refresh every subscribed query in
 * place, so each panel re-pulls the changed state without blanking.
 *
 * Navigation uses the host's documented surfaces only: useOpenPanel to
 * reveal a detail panel, usePersistedState for per-instance view state,
 * usePluginSettings for the host-declared plugin settings, and the chat
 * panel's "chat-send" signal to hand context to the agent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useGlobalPersistedState,
  useOpenPanelSafe,
  usePersistedState,
  usePluginSettings,
} from "@soft-machine/sdk";
import { PLUGIN_ID, useForge } from "./ForgeContext";
import { chatMessageFor } from "./agentContext";
import { localReposPlan, planRead, runMutation } from "./github/routes";
import {
  LIST_VIEW,
  listView,
  openDetailView,
  resolveView,
  sanitizePanelView,
  type PanelViewState,
} from "./panelView";
import { useQuery } from "./query/useQuery";
import {
  PINNED_KEY,
  SIDEBAR_SECTIONS_KEY,
  isPinnedRepo,
  sanitizeCollapsed,
  sanitizePinned,
  togglePinned,
  type CollapsedSections,
  type SidebarSection,
} from "./repoGroups";
import { queryStore } from "./query/store";
import { pollPolicyFor, settingsFromValues, valuesFromPatch, type ForgeSettings } from "./settings";
import { ForgeError, REPO_RE, describeError, firstForgeRemote } from "./types";

export type ItemKind = "issue" | "pull";

export const DETAIL_PANEL_ID: Record<ItemKind, string> = {
  issue: "bettergit-issue-detail",
  pull: "bettergit-pull-detail",
};

export const LIST_PANEL_ID: Record<ItemKind, string> = {
  issue: "bettergit-issues",
  pull: "bettergit-pulls",
};

export interface ForgeQuery<T> {
  data: T | null;
  isLoading: boolean;
  /** True while `data` is carried over from the previous key (a filter or
   *  page changed and the new answer has not arrived yet). */
  isStale: boolean;
  error: string | null;
}

/** Resource + repo + state: the boundary within which stale data may be
 *  shown while a new key loads. */
function carryScope(path: string | null): string {
  if (!path) return "";
  const q = path.indexOf("?");
  const params = new URLSearchParams(q >= 0 ? path.slice(q) : "");
  return `${q >= 0 ? path.slice(0, q) : path}|${params.get("repo") ?? ""}|${params.get("state") ?? ""}`;
}

/**
 * One cached, polled read. `path` is the resource plus its query string
 * (filters are encoded into it, so a filter change is a new cache entry);
 * null disables the read entirely.
 */
export function useForgeQuery<T>(path: string | null): ForgeQuery<T> {
  const { client, isConnected, repo, setRepo } = useForge();
  const plan = useMemo(
    () => (client && isConnected && path !== null ? planRead<T>(client, path) : null),
    [client, isConnected, path]
  );
  const query = useQuery<T>(plan);

  // Keep the previous answer on screen while a NEW key (filter change, next
  // page) is in flight, so the list never flashes between two populated
  // states — but only within the same repository and state: another repo's
  // rows, or open rows under "Closed", would be a lie, so those switches
  // show the loading state instead. Cleared when the read is disabled.
  const scope = carryScope(path);
  const previous = useRef<{ key: string; scope: string; data: T } | null>(null);
  if (plan && query.data !== undefined) previous.current = { key: plan.key, scope, data: query.data };
  if (!plan) previous.current = null;
  const carried =
    plan && query.data === undefined && query.error === null && previous.current?.scope === scope
      ? previous.current?.data
      : undefined;

  // A renamed or transferred repository: GitHub told us where it lives now,
  // so follow it instead of leaving every panel on a dead name. Idempotent
  // across co-mounted panels (all compare against the same selection).
  const moved = query.error instanceof ForgeError && query.error.code === "repo_moved" ? query.error.detail : null;
  useEffect(() => {
    if (moved && repo && REPO_RE.test(moved) && moved.toLowerCase() !== repo.toLowerCase()) {
      setRepo(moved);
    }
  }, [moved, repo, setRepo]);

  return {
    data: query.data ?? carried ?? null,
    // A background refetch must not blank an already-rendered list, so
    // loading is only surfaced while there is nothing to show at all.
    isLoading: plan !== null && query.data === undefined && carried === undefined && query.error === null,
    isStale: plan !== null && query.data === undefined && carried !== undefined,
    error: plan !== null && query.error !== null ? describeError(query.error) : null,
  };
}

export interface ForgeMutation {
  /**
   * Perform a write. Resolves the parsed response on success (truthy, so
   * boolean-style `if (await mutate(...))` checks work) and null on
   * failure, with the error already surfaced via `error`.
   */
  mutate: <T = unknown>(path: string, body: Record<string, unknown>) => Promise<T | null>;
  isPending: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Shared write path: run the GitHub call, surface a user-facing error, and
 * refresh every polled query on success so the change is reflected
 * immediately instead of on the next ambient tick.
 */
export function useForgeMutation(): ForgeMutation {
  const { client, refresh } = useForge();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async <T = unknown>(path: string, body: Record<string, unknown>): Promise<T | null> => {
      setIsPending(true);
      setError(null);
      try {
        if (!client) throw new Error("not_connected");
        const response = (await runMutation(client, path, body)) as T;
        refresh();
        return response;
      } catch (err) {
        setError(describeError(err));
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [client, refresh]
  );

  const clearError = useCallback(() => setError(null), []);

  return { mutate, isPending, error, clearError };
}

// ── Settings ───────────────────────────────────────────────────────────────

/**
 * The user's plugin settings (detail open mode, sidebar), as declared on
 * the module and rendered by the host under Settings → Plugins →
 * bettergit. Read through usePluginSettings so the host page and the
 * panels always agree; the in-panel sidebar toggle writes the same key.
 *
 * usePluginSettings throws when no SettingsProvider is above the caller
 * (a misconfigured provider tier). That must never take a panel down, so
 * the hook degrades to defaults and logs once instead.
 */
export function useForgeSettings(): {
  settings: ForgeSettings;
  update: (patch: Partial<ForgeSettings>) => void;
} {
  let host: { values?: Record<string, unknown>; setValues?: (patch: Record<string, unknown>) => void } | null =
    null;
  let hostError: unknown = null;
  try {
    host = usePluginSettings(PLUGIN_ID) as typeof host;
  } catch (err) {
    hostError = err;
  }
  const reported = useRef(false);
  useEffect(() => {
    if (hostError && !reported.current) {
      reported.current = true;
      console.warn("[bettergit] plugin settings unavailable; using defaults", hostError);
    }
  }, [hostError]);

  const values = host?.values;
  const setValues = host?.setValues;
  const settings = useMemo(() => settingsFromValues(values), [values]);
  const update = useCallback(
    (patch: Partial<ForgeSettings>) => {
      setValues?.(valuesFromPatch(patch));
    },
    [setValues]
  );
  return { settings, update };
}

/**
 * Push the auto-refresh settings into the query store. Any mounted panel
 * may call it; the store ignores a policy equal to the current one, so
 * several callers are harmless and the last setting change wins.
 */
export function usePollPolicySync(): void {
  const { settings } = useForgeSettings();
  const { enabled, scale } = pollPolicyFor(settings);
  useEffect(() => {
    queryStore.setPollPolicy({ enabled, scale });
  }, [enabled, scale]);
}

// ── Pinned repositories and sidebar sections (user-scoped, all panels) ─────

/**
 * The user's pinned repositories: one user-scoped key for the workspace,
 * so the Pull Requests and Issues panels (and every instance of each)
 * show the same pins, and they follow the person across devices.
 */
export function usePinnedRepos(): {
  pinned: string[];
  isPinned: (fullName: string) => boolean;
  toggle: (fullName: string) => void;
} {
  const [raw, setRaw] = useGlobalPersistedState<string[]>(PINNED_KEY, [], { scope: "user" });
  const pinned = useMemo(() => sanitizePinned(raw), [raw]);
  const toggle = useCallback(
    (fullName: string) => setRaw((prev: string[]) => togglePinned(sanitizePinned(prev), fullName)),
    [setRaw]
  );
  const isPinned = useCallback((fullName: string) => isPinnedRepo(pinned, fullName), [pinned]);
  return { pinned, isPinned, toggle };
}

export const SIDEBAR_WIDTH_KEY = "bettergit/sidebar-width";
export const SIDEBAR_WIDTH_DEFAULT = 224;
export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 420;

export function clampSidebarWidth(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, n));
}

/** The user's preferred sidebar width (px), shared by every list panel. */
export function useSidebarWidth(): { width: number; setWidth: (px: number) => void } {
  const [raw, setRaw] = useGlobalPersistedState<number>(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_DEFAULT, {
    scope: "user",
  });
  const width = clampSidebarWidth(raw);
  const setWidth = useCallback((px: number) => setRaw(clampSidebarWidth(px)), [setRaw]);
  return { width, setWidth };
}

/** Which repository sidebar sections are collapsed; shared like the pins. */
export function useSidebarSections(): {
  collapsed: CollapsedSections;
  toggle: (section: SidebarSection) => void;
} {
  const [raw, setRaw] = useGlobalPersistedState<Record<string, boolean>>(SIDEBAR_SECTIONS_KEY, {}, {
    scope: "user",
  });
  const collapsed = useMemo(() => sanitizeCollapsed(raw), [raw]);
  const toggle = useCallback(
    (section: SidebarSection) =>
      setRaw((prev: Record<string, boolean>) => {
        const current = sanitizeCollapsed(prev);
        return { ...current, [section]: !current[section] };
      }),
    [setRaw]
  );
  return { collapsed, toggle };
}

// ── Per-instance view state (same-panel mode) ──────────────────────────────

export interface PanelView {
  /** What to render right now, resolved against the current repo. */
  current: { view: "list" } | { view: "detail"; number: number };
  openDetail: (number: number) => void;
  back: () => void;
}

/**
 * The list panel's own list-or-detail state, persisted per panel instance
 * (auto-scoped by the host) so two Pull Requests panels can show different
 * items and a remount does not lose the place. Resolved against the shared
 * repo: switching repositories always lands on the list.
 */
export function usePanelView(kind: ItemKind): PanelView {
  const { repo } = useForge();
  const [raw, setRaw] = usePersistedState<PanelViewState>(`view:${kind}`, LIST_VIEW, {
    scope: "user",
  });
  const state = useMemo(() => sanitizePanelView(raw), [raw]);
  const current = useMemo(() => resolveView(state, repo), [state, repo]);

  // A repository switch is a navigation, not a filter: forget the detail
  // that belonged to the previous repo, or it would reopen by itself when
  // the user comes back to that repo later. A null repo is "not known
  // yet" (restore/auto-detect still in flight), so it must not wipe the
  // remembered place.
  useEffect(() => {
    if (
      repo !== null &&
      state.view === "detail" &&
      state.repo !== null &&
      state.repo.toLowerCase() !== repo.toLowerCase()
    ) {
      setRaw(listView(repo));
    }
  }, [repo, state, setRaw]);

  const openDetail = useCallback(
    (number: number) => {
      if (repo) setRaw(openDetailView(repo, number));
    },
    [repo, setRaw]
  );
  const back = useCallback(() => setRaw(listView(repo)), [repo, setRaw]);

  return { current, openDetail, back };
}

// ── Cross-panel navigation ─────────────────────────────────────────────────

/**
 * Open an issue or pull in its dedicated detail panel: set the shared
 * selection and reveal the panel (findOrOpen reuses the existing detail
 * panel, creating one only if none is open, and focuses it either way).
 */
export function useOpenDetailPanel(kind: ItemKind): {
  open: (number: number) => void;
  selected: number | null;
} {
  const { selectedIssue, setSelectedIssue, selectedPull, setSelectedPull } = useForge();
  const openPanel = useOpenPanelSafe();
  const setSelected = kind === "issue" ? setSelectedIssue : setSelectedPull;

  const open = useCallback(
    (number: number) => {
      setSelected(number);
      openPanel?.({ panelTypeId: DETAIL_PANEL_ID[kind], mode: "findOrOpen" });
    },
    [setSelected, kind, openPanel]
  );

  return { open, selected: kind === "issue" ? selectedIssue : selectedPull };
}

/** Reveal (or create) the list panel for a kind, from a detail panel. */
export function useOpenListPanel(kind: ItemKind): (() => void) | null {
  const openPanel = useOpenPanelSafe();
  return useMemo(
    () =>
      openPanel
        ? () => openPanel({ panelTypeId: LIST_PANEL_ID[kind], mode: "findOrOpen" })
        : null,
    [openPanel, kind]
  );
}

/**
 * Repo auto-detection: the bridge lists git origins under /workspace, and
 * the first GitHub remote wins (dotfile/home repos and non-GitHub remotes
 * are skipped by firstForgeRemote). The probe is only enabled while nothing
 * is selected, and it keeps polling so a clone that lands later is picked
 * up; any panel may call it — the query store dedupes co-mounted panels.
 */
export function useVmRepoAutoDetect(): void {
  const { client, needsRepoAutoDetect, autoSelectFromUrl } = useForge();
  const plan = useMemo(
    () => (client && needsRepoAutoDetect ? localReposPlan(client) : null),
    [client, needsRepoAutoDetect]
  );
  const { data: repositories } = useQuery(plan);

  useEffect(() => {
    if (!needsRepoAutoDetect || !repositories || repositories.length === 0) return;
    const match = firstForgeRemote(repositories.map((repository) => repository.origin).join("\n"));
    if (match) autoSelectFromUrl(match);
  }, [needsRepoAutoDetect, repositories, autoSelectFromUrl]);
}

/**
 * Deliver a prepared context block to the agent through the chat panel's
 * "chat-send" signal — the host's supported way for a plugin to message
 * the agent. findOrOpen reuses the most recent chat panel (creating one if
 * none exists), and the payload is delivered even to a panel created by
 * the same call. `canSend` is false only outside a panel system.
 */
export function useSendToAgent(): {
  canSend: boolean;
  send: (label: string, context: string) => boolean;
} {
  const openPanel = useOpenPanelSafe();
  return {
    canSend: openPanel !== null,
    send: (label: string, context: string) => {
      if (!openPanel) return false;
      openPanel({
        panelTypeId: "soft-bot",
        mode: "findOrOpen",
        signal: { kind: "chat-send", payload: { text: chatMessageFor(label, context) } },
      });
      return true;
    },
  };
}
