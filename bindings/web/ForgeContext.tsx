/**
 * Forge Plugin Context
 *
 * Shared state for the GitHub / GitLab panels: which provider and repo the
 * panels look at, the per-list filters, the open detail selections, and
 * connection state. Data fetching itself lives in hooks.ts (polled queries
 * against the server proxy); this context only owns selection and the
 * cross-panel refresh signal.
 *
 * Connection state comes from useIntegration per provider site: saving or
 * removing a token in Settings flips isConnected and re-keys every polled
 * query via refreshToken.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useIntegration,
  useIntegrations,
  useQueryClient,
  useWorkspaceIdentity,
} from "@soft-machine/sdk";
import {
  DEFAULT_FILTERS,
  PROVIDER_SITES,
  REPO_RE,
  repoFromCloneUrl,
  type ForgeProvider,
  type ListFilters,
} from "./types";

interface ForgeContextValue {
  provider: ForgeProvider;
  setProvider: (provider: ForgeProvider) => void;
  repo: string | null;
  setRepo: (repo: string | null) => void;
  isConnected: boolean;
  /** True while the integrations bootstrap can't yet tell "no key" from
   *  "haven't looked"; panels show a quiet pending state instead of
   *  asserting "Not connected". */
  isConnectionPending: boolean;
  issueFilters: ListFilters;
  setIssueFilters: (update: Partial<ListFilters>) => void;
  pullFilters: ListFilters;
  setPullFilters: (update: Partial<ListFilters>) => void;
  /** Issue number open in the Issue Detail panel. */
  selectedIssue: number | null;
  setSelectedIssue: (n: number | null) => void;
  /** PR/MR number open in the Pull Detail panel. */
  selectedPull: number | null;
  setSelectedPull: (n: number | null) => void;
  isComposerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  /** The Pull Requests panel's new-PR composer (compare flow). */
  isPrComposerOpen: boolean;
  setPrComposerOpen: (open: boolean) => void;
  /** Re-keys every polled query (manual refresh, after writes). */
  refreshToken: string;
  refresh: () => void;
  /** Read paths call this when the proxy reports not_connected. */
  notifyNotConnected: () => void;
  isReady: boolean;
  setIsReady: (ready: boolean) => void;
  clear: () => void;
  getState: () => unknown;
  restoreState: (state: unknown) => void;
  /**
   * True while repo auto-detection is still warranted: nothing selected
   * and no parseable bootstrap URL. The detection itself runs panel-side
   * (useVmRepoAutoDetect in hooks.ts) because the host's repository
   * capability lives BELOW the editor's OSCapabilitiesProvider, which this
   * provider mounts above; the SDK hook dedupes co-mounted panels.
   */
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
  return raw === "github" || raw === "gitlab" ? raw : null;
}

function sanitizeRepo(raw: unknown): string | null {
  return typeof raw === "string" && REPO_RE.test(raw) ? raw : null;
}

function sanitizeNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0
    ? raw
    : null;
}

export function ForgeProviderComponent({ children }: { children: ReactNode }) {
  const [provider, setProviderState] = useState<ForgeProvider>("github");
  const [repo, setRepoState] = useState<string | null>(null);
  const [issueFilters, setIssueFiltersState] =
    useState<ListFilters>(DEFAULT_FILTERS);
  const [pullFilters, setPullFiltersState] =
    useState<ListFilters>(DEFAULT_FILTERS);
  const [selectedIssue, setSelectedIssueState] = useState<number | null>(null);
  const [selectedPull, setSelectedPullState] = useState<number | null>(null);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isPrComposerOpen, setPrComposerOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const queryClient = useQueryClient();

  const github = useIntegration(PROVIDER_SITES.github);
  const gitlab = useIntegration(PROVIDER_SITES.gitlab);
  const { isLoading: integrationsLoading, refresh: refreshIntegrations } =
    useIntegrations();

  const active = provider === "github" ? github : gitlab;
  const isConnected = active.isConnected;
  const isConnectionPending = !isConnected && integrationsLoading;

  // The workspace host fingerprints via getState() in the same commit it
  // calls restoreState(), before React re-renders, so getState must read
  // synchronously-updated refs (same discipline as the Linear plugin).
  const stateRef = useRef({
    provider: "github" as ForgeProvider,
    repo: null as string | null,
    selectedIssue: null as number | null,
    selectedPull: null as number | null,
  });

  const setProvider = useCallback((next: ForgeProvider) => {
    stateRef.current.provider = next;
    // Repo paths are provider-scoped; carrying one across providers would
    // poll a repo that likely doesn't exist there.
    stateRef.current.repo = null;
    stateRef.current.selectedIssue = null;
    stateRef.current.selectedPull = null;
    setProviderState(next);
    setRepoState(null);
    setSelectedIssueState(null);
    setSelectedPullState(null);
    setIssueFiltersState(DEFAULT_FILTERS);
    setPullFiltersState(DEFAULT_FILTERS);
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
    setIssueFiltersState((prev) => ({
      ...prev,
      page: 1,
      ...update,
    }));
  }, []);

  const setPullFilters = useCallback((update: Partial<ListFilters>) => {
    setPullFiltersState((prev) => ({
      ...prev,
      page: 1,
      ...update,
    }));
  }, []);

  // Auto-select the repository the workspace was created from (same
  // auto-lock behavior as the Git panel, but from the workspace record's
  // repoBootstrap clone URL, so it works before any VM is awake). Fires
  // at most once per clone URL and only while nothing is selected, so a
  // manual pick, a restored session selection, or a deliberate provider
  // switch (which clears the repo) is never fought.
  const { repoBootstrap } = useWorkspaceIdentity();
  const autoSelectedUrlRef = useRef<string | null>(null);

  const applyDetected = useCallback(
    (url: string, detected: { provider: ForgeProvider; repo: string }) => {
      autoSelectedUrlRef.current = url;
      stateRef.current.provider = detected.provider;
      stateRef.current.repo = detected.repo;
      setProviderState(detected.provider);
      setRepoState(detected.repo);
    },
    []
  );

  useEffect(() => {
    const url = repoBootstrap?.url;
    if (repo !== null || !url || autoSelectedUrlRef.current === url) return;
    const detected = repoFromCloneUrl(url);
    if (detected) applyDetected(url, detected);
  }, [repo, repoBootstrap?.url, applyDetected]);

  // Repo detection runs in panel components (below OSCapabilitiesProvider —
  // see the ForgeContextValue doc comment); the provider only says whether
  // it is still warranted. A bootstrap URL only suppresses detection when
  // it actually PARSES: an unusable record (self-hosted mirror, odd format)
  // must not strand the panels on the manual picker.
  const bootstrapUsable =
    !!repoBootstrap?.url && repoFromCloneUrl(repoBootstrap.url) !== null;
  const needsRepoAutoDetect = repo === null && !bootstrapUsable;

  const autoSelectFromUrl = useCallback(
    (url: string) => {
      const detected = repoFromCloneUrl(url);
      // Re-check the ref: the user may have picked a repo mid-probe.
      if (detected && stateRef.current.repo === null) {
        applyDetected(url, detected);
      }
    },
    [applyDetected]
  );

  // Refetch in place, not via a query-key bump: invalidateQueries marks
  // the existing "forge" queries stale and refetches them while keeping
  // their rendered data (isFetching, not isPending), so a write doesn't
  // flash "Loading…" over every open panel. Re-keying (the old
  // fetchGeneration approach) would reset data to undefined instead.
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["forge"] });
  }, [queryClient]);

  // Token vanished server-side after our integrations snapshot (revoked
  // from another session): re-sync so isConnected flips and panels show
  // the real "Not connected" state.
  const notifyNotConnected = useCallback(() => {
    refreshIntegrations();
  }, [refreshIntegrations]);

  const clear = useCallback(() => {
    setSelectedIssue(null);
    setSelectedPull(null);
    setComposerOpen(false);
    setPrComposerOpen(false);
    setIssueFiltersState(DEFAULT_FILTERS);
    setPullFiltersState(DEFAULT_FILTERS);
    // Server-backed plugin: a refetch IS the reset.
    void queryClient.invalidateQueries({ queryKey: ["forge"] });
  }, [setSelectedIssue, setSelectedPull, queryClient]);

  const getState = useCallback(() => ({ ...stateRef.current }), []);

  const restoreState = useCallback(
    (state: unknown) => {
      if (!state || typeof state !== "object") return;
      const s = state as Record<string, unknown>;
      const restoredProvider = sanitizeProvider(s.provider);
      const restoredRepo = sanitizeRepo(s.repo);
      // The host restores after mount, so auto-selection may already have
      // locked onto the workspace's bootstrap repo. An explicit restored
      // repo wins (it IS last session's selection, autodetected or manual),
      // but an empty restore must not blank that fresh auto-selection.
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

  // Only the connection identity keys the queries; manual/write refreshes
  // go through invalidateQueries (refresh/clear) so they don't re-key and
  // blank rendered panels. A key change here means the token itself
  // changed (connect/disconnect), which SHOULD refetch from scratch.
  const refreshToken = active.keySetAt ?? "none";

  const value = useMemo<ForgeContextValue>(
    () => ({
      provider,
      setProvider,
      repo,
      setRepo,
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
      refreshToken,
      refresh,
      notifyNotConnected,
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
      refreshToken,
      refresh,
      notifyNotConnected,
      isReady,
      clear,
      getState,
      restoreState,
      needsRepoAutoDetect,
      autoSelectFromUrl,
    ]
  );

  return (
    <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>
  );
}
