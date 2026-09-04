/**
 * Forge Plugin Context
 *
 * Shared state for the GitHub panels: which repo the panels look at, the
 * per-list filters, the open detail selections, and connection state. Data
 * fetching itself lives in hooks.ts; this context owns selection, the
 * bridge client, and the cross-panel refresh signal.
 *
 * Connection state comes from the plugin's VM bridge: the host starts it on
 * demand (usePluginService) and the bridge reports what GitHub credential
 * `gh` holds on the machine — the workspace's GitHub App connection or a
 * GH_TOKEN from Settings → Integrations. Nothing here touches a token.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePluginService } from "@soft-machine/sdk";
import { createBridgeClient, type BridgeClient, type WhoAmI } from "./github/bridge";
import { whoamiPlan } from "./github/routes";
import { queryStore } from "./query/store";
import { useQuery } from "./query/useQuery";
import {
  DEFAULT_FILTERS,
  REPO_RE,
  repoFromCloneUrl,
  type ForgeProvider,
  type ListFilters,
} from "./types";

export const PLUGIN_ID = "bettergit";
export const BRIDGE_SERVICE_ID = "github-bridge";

interface ForgeContextValue {
  provider: ForgeProvider;
  setProvider: (provider: ForgeProvider) => void;
  repo: string | null;
  setRepo: (repo: string | null) => void;
  /** Bridge client once the host reports the service ready; null before. */
  client: BridgeClient | null;
  /** What the bridge found `gh` signed in as; null until answered. */
  connection: WhoAmI | null;
  isConnected: boolean;
  /** True while the bridge is starting or its first credential check is in
   *  flight; panels show a quiet pending state instead of asserting "Not
   *  connected". */
  isConnectionPending: boolean;
  issueFilters: ListFilters;
  setIssueFilters: (update: Partial<ListFilters>) => void;
  pullFilters: ListFilters;
  setPullFilters: (update: Partial<ListFilters>) => void;
  /** Issue number open in the Issue Detail panel. */
  selectedIssue: number | null;
  setSelectedIssue: (n: number | null) => void;
  /** PR number open in the Pull Detail panel. */
  selectedPull: number | null;
  setSelectedPull: (n: number | null) => void;
  isComposerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  /** The Pull Requests panel's new-PR composer (compare flow). */
  isPrComposerOpen: boolean;
  setPrComposerOpen: (open: boolean) => void;
  /** Refetch every live query in place (manual refresh, after writes). */
  refresh: () => void;
  isReady: boolean;
  setIsReady: (ready: boolean) => void;
  clear: () => void;
  getState: () => unknown;
  restoreState: (state: unknown) => void;
  /** True while repo auto-detection is still warranted (nothing selected). */
  needsRepoAutoDetect: boolean;
  /** Apply a detected origin URL; no-op if it doesn't parse or a repo got
   *  selected while detection ran. */
  autoSelectFromUrl: (url: string) => void;
}

const ForgeContext = createContext<ForgeContextValue | null>(null);

export function useForge(): ForgeContextValue {
  const ctx = useContext(ForgeContext);
  if (!ctx) {
    throw new Error("useForge must be used within ForgeProvider");
  }
  return ctx;
}

/** Persisted blobs are hostile input; only restore shapes we recognize. */
function sanitizeProvider(raw: unknown): ForgeProvider | null {
  return raw === "github" ? raw : null;
}

function sanitizeRepo(raw: unknown): string | null {
  return typeof raw === "string" && REPO_RE.test(raw) ? raw : null;
}

function sanitizeNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

/** The slice of usePluginService's result this plugin relies on. */
interface BridgeServiceState {
  status?: string;
  baseUrl?: string | null;
  error?: unknown;
}

export function ForgeProviderComponent({ children }: { children: ReactNode }) {
  const [provider, setProviderState] = useState<ForgeProvider>("github");
  const [repo, setRepoState] = useState<string | null>(null);
  const [issueFilters, setIssueFiltersState] = useState<ListFilters>(DEFAULT_FILTERS);
  const [pullFilters, setPullFiltersState] = useState<ListFilters>(DEFAULT_FILTERS);
  const [selectedIssue, setSelectedIssueState] = useState<number | null>(null);
  const [selectedPull, setSelectedPullState] = useState<number | null>(null);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isPrComposerOpen, setPrComposerOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // The host provisions and starts the bridge on the workspace machine and
  // hands back a token-gated URL once it is reachable.
  const service = usePluginService(PLUGIN_ID, BRIDGE_SERVICE_ID) as BridgeServiceState;
  const baseUrl = typeof service.baseUrl === "string" ? service.baseUrl : null;
  // Every cache key embeds the bridge identity (origin + service path), so a
  // different machine never serves another's cached answers and no explicit
  // reset is needed when the client changes.
  const client = useMemo(() => (baseUrl ? createBridgeClient(baseUrl) : null), [baseUrl]);

  const whoami = useQuery(useMemo(() => (client ? whoamiPlan(client) : null), [client]));
  const connection = whoami.data ?? null;
  const isConnected = connection !== null && connection.mode !== "none";
  const serviceFailed = service.error !== undefined && service.error !== null;
  const isConnectionPending =
    !isConnected &&
    !serviceFailed &&
    (client === null || (whoami.data === undefined && whoami.error === null));

  // The workspace host fingerprints via getState() in the same commit it
  // calls restoreState(), before React re-renders, so getState must read
  // synchronously-updated refs.
  const stateRef = useRef({
    provider: "github" as ForgeProvider,
    repo: null as string | null,
    selectedIssue: null as number | null,
    selectedPull: null as number | null,
  });

  const setProvider = useCallback((next: ForgeProvider) => {
    stateRef.current.provider = next;
    setProviderState(next);
  }, []);

  const setRepo = useCallback((next: string | null) => {
    stateRef.current.repo = next;
    stateRef.current.selectedIssue = null;
    stateRef.current.selectedPull = null;
    setRepoState(next);
    setSelectedIssueState(null);
    setSelectedPullState(null);
    setIssueFiltersState(DEFAULT_FILTERS);
    setPullFiltersState(DEFAULT_FILTERS);
  }, []);

  const setSelectedIssue = useCallback((n: number | null) => {
    stateRef.current.selectedIssue = n;
    setSelectedIssueState(n);
  }, []);

  const setSelectedPull = useCallback((n: number | null) => {
    stateRef.current.selectedPull = n;
    setSelectedPullState(n);
  }, []);

  // Filter edits reset pagination: page N of the previous filter set is
  // meaningless under the new one.
  const setIssueFilters = useCallback((update: Partial<ListFilters>) => {
    setIssueFiltersState((prev) => ({ ...prev, page: 1, ...update }));
  }, []);

  const setPullFilters = useCallback((update: Partial<ListFilters>) => {
    setPullFiltersState((prev) => ({ ...prev, page: 1, ...update }));
  }, []);

  // Repo auto-detection runs panel-side (useVmRepoAutoDetect in hooks.ts,
  // fed by the bridge's scan of /workspace); the provider only says whether
  // it is still warranted. Fires at most once per detected URL and only
  // while nothing is selected, so a manual pick or a restored session
  // selection is never fought.
  const autoSelectedUrlRef = useRef<string | null>(null);
  const needsRepoAutoDetect = repo === null;

  const autoSelectFromUrl = useCallback((url: string) => {
    if (autoSelectedUrlRef.current === url) return;
    const detected = repoFromCloneUrl(url);
    // Re-check the ref: the user may have picked a repo mid-probe.
    if (detected && stateRef.current.repo === null) {
      autoSelectedUrlRef.current = url;
      stateRef.current.provider = detected.provider;
      stateRef.current.repo = detected.repo;
      setProviderState(detected.provider);
      setRepoState(detected.repo);
    }
  }, []);

  // Refetch in place: every live query re-runs while keeping its rendered
  // data, so a write doesn't flash "Loading…" over every open panel.
  const refresh = useCallback(() => {
    queryStore.invalidateAll();
  }, []);

  const clear = useCallback(() => {
    setSelectedIssue(null);
    setSelectedPull(null);
    setComposerOpen(false);
    setPrComposerOpen(false);
    setIssueFiltersState(DEFAULT_FILTERS);
    setPullFiltersState(DEFAULT_FILTERS);
    // GitHub is the source of truth: a refetch IS the reset.
    queryStore.invalidateAll();
  }, [setSelectedIssue, setSelectedPull]);

  const getState = useCallback(() => ({ ...stateRef.current }), []);

  const restoreState = useCallback(
    (state: unknown) => {
      if (!state || typeof state !== "object") return;
      const s = state as Record<string, unknown>;
      const restoredProvider = sanitizeProvider(s.provider);
      const restoredRepo = sanitizeRepo(s.repo);
      // The host restores after mount, so auto-selection may already have
      // locked onto a detected repo. An explicit restored repo wins (it IS
      // last session's selection, autodetected or manual), but an empty
      // restore must not blank that fresh auto-selection.
      if (restoredRepo === null && autoSelectedUrlRef.current !== null) {
        setSelectedIssue(sanitizeNumber(s.selectedIssue));
        setSelectedPull(sanitizeNumber(s.selectedPull));
        return;
      }
      if (restoredProvider) {
        stateRef.current.provider = restoredProvider;
        setProviderState(restoredProvider);
      }
      stateRef.current.repo = restoredRepo;
      setRepoState(restoredRepo);
      setSelectedIssue(sanitizeNumber(s.selectedIssue));
      setSelectedPull(sanitizeNumber(s.selectedPull));
    },
    [setSelectedIssue, setSelectedPull]
  );

  const value = useMemo<ForgeContextValue>(
    () => ({
      provider,
      setProvider,
      repo,
      setRepo,
      client,
      connection,
      isConnected,
      isConnectionPending,
      issueFilters,
      setIssueFilters,
      pullFilters,
      setPullFilters,
      selectedIssue,
      setSelectedIssue,
      selectedPull,
      setSelectedPull,
      isComposerOpen,
      setComposerOpen,
      isPrComposerOpen,
      setPrComposerOpen,
      refresh,
      isReady,
      setIsReady,
      clear,
      getState,
      restoreState,
      needsRepoAutoDetect,
      autoSelectFromUrl,
    }),
    [
      provider,
      setProvider,
      repo,
      setRepo,
      client,
      connection,
      isConnected,
      isConnectionPending,
      issueFilters,
      setIssueFilters,
      pullFilters,
      setPullFilters,
      selectedIssue,
      setSelectedIssue,
      selectedPull,
      setSelectedPull,
      isComposerOpen,
      isPrComposerOpen,
      refresh,
      isReady,
      clear,
      getState,
      restoreState,
      needsRepoAutoDetect,
      autoSelectFromUrl,
    ]
  );

  return <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>;
}
