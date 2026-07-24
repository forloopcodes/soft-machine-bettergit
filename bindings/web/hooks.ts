/**
 * Data hooks for the Forge plugin.
 *
 * Reads go through usePolledQuery (the app's freshness primitive) against
 * the server proxy, so lists and open details keep syncing with GitHub /
 * GitLab in the background without hand-rolled intervals. Writes are plain
 * apiFetch POSTs followed by a context-wide refresh so every panel
 * re-pulls the changed state.
 */

import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  hasElementChipTarget,
  sendElementToComposer,
  usePanelActions,
  usePolledQuery,
  useWorkspaceRepositories,
} from "@soft-machine/sdk";
import { useForge } from "./ForgeContext";
import { describeError, firstForgeRemote } from "./types";

const FORGE_API_BASE = "/api/integrations/forge";

export interface ForgeQuery<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * One polled proxy read. `path` is relative to the provider root and
 * already carries its query string (filters are encoded into it, so a
 * filter change re-keys the query); null disables the read entirely.
 */
export function useForgeQuery<T>(path: string | null): ForgeQuery<T> {
  const { provider, isConnected, refreshToken, notifyNotConnected } =
    useForge();
  const enabled = isConnected && path !== null;

  const query = usePolledQuery<T>({
    queryKey: ["forge", provider, path, refreshToken],
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<T>(`${FORGE_API_BASE}/${provider}${path}`, {
          signal,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "not_connected") {
          notifyNotConnected();
        }
        throw err;
      }
    },
    target: { kind: "control-plane" },
    cadence: "ambient",
    enabled,
  });

  return {
    data: query.data ?? null,
    // A background refetch must not blank an already-rendered list, so
    // loading is only surfaced while there is no data yet.
    isLoading: enabled && query.isPending,
    error:
      enabled && query.error && !query.polled.suspended
        ? describeError(query.error)
        : null,
  };
}

export interface ForgeMutation {
  /**
   * POST to the provider proxy. Resolves the parsed response on success
   * (truthy, so boolean-style `if (await mutate(...))` checks work) and
   * null on failure, with the error already surfaced via `error`.
   */
  mutate: <T = unknown>(
    path: string,
    body: Record<string, unknown>
  ) => Promise<T | null>;
  isPending: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Shared write path: POST to the provider proxy, surface a user-facing
 * error, and re-key every polled query on success so the change is
 * reflected immediately instead of on the next ambient tick.
 */
export function useForgeMutation(): ForgeMutation {
  const { provider, refresh, notifyNotConnected } = useForge();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async <T = unknown>(
      path: string,
      body: Record<string, unknown>
    ): Promise<T | null> => {
      setIsPending(true);
      setError(null);
      try {
        const response = await apiFetch<T>(
          `${FORGE_API_BASE}/${provider}${path}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        refresh();
        return response;
      } catch (err) {
        if (err instanceof Error && err.message === "not_connected") {
          notifyNotConnected();
        }
        setError(describeError(err));
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [provider, refresh, notifyNotConnected]
  );

  const clearError = useCallback(() => setError(null), []);

  return { mutate, isPending, error, clearError };
}

/**
 * Open an issue or pull in its detail panel: set the shared selection and
 * make the panel visible, expanded, and focused (focus drives the mobile
 * layout's auto-navigation; a collapsed panel would make the click look
 * like a no-op on desktop too).
 */
export function useOpenDetail(kind: "issue" | "pull"): {
  open: (number: number) => void;
  selected: number | null;
} {
  const { selectedIssue, setSelectedIssue, selectedPull, setSelectedPull } =
    useForge();
  const { setPanelVisible, setPanelCollapsed, setFocusedPanel } =
    usePanelActions();

  const panelId = kind === "issue" ? "forge-issue-detail" : "forge-pull-detail";
  const setSelected = kind === "issue" ? setSelectedIssue : setSelectedPull;

  const open = useCallback(
    (number: number) => {
      setSelected(number);
      setPanelVisible(panelId, true);
      setPanelCollapsed(panelId, false);
      setFocusedPanel(panelId);
    },
    [setSelected, panelId, setPanelVisible, setPanelCollapsed, setFocusedPanel]
  );

  return {
    open,
    selected: kind === "issue" ? selectedIssue : selectedPull,
  };
}

/**
 * Fallback repo auto-detection for workspaces without a usable bootstrap
 * record (repo cloned into the VM directly): read the workspace's Git
 * repositories through the host's fixed, credential-scrubbed capability
 * (the same auto-lock source the Git panel uses) and select the first
 * GitHub/GitLab origin — dotfile/home repos and non-forge remotes are
 * skipped by firstForgeRemote.
 *
 * Must be called from a PANEL component: panels render below the editor's
 * OSCapabilitiesProvider, while the Forge provider mounts above it and can
 * never see the capability. Retry-until-the-clone-lands and co-mounted-
 * panel dedupe live inside useWorkspaceRepositories; `enabled` keeps the
 * probe from ever starting once a repo is selected or the bootstrap
 * record already answers the question.
 */
export function useVmRepoAutoDetect(): void {
  const { needsRepoAutoDetect, autoSelectFromUrl } = useForge();
  const { repositories } = useWorkspaceRepositories({
    enabled: needsRepoAutoDetect,
  });

  useEffect(() => {
    if (!needsRepoAutoDetect || repositories.length === 0) return;
    const match = firstForgeRemote(
      repositories.map((repository) => repository.origin).join("\n")
    );
    if (match) autoSelectFromUrl(match);
  }, [needsRepoAutoDetect, repositories, autoSelectFromUrl]);
}

/**
 * Deliver a prepared context block to the agent composer as an inline
 * chip (same channel and chip treatment as the browser panel's element
 * selector — a compact "@o/r#313" pill instead of a wall of text; the
 * full context rides in the chip payload). `canSend` gates the button;
 * sending without a registered composer would silently drop the context.
 */
export function useSendToAgent(): {
  canSend: boolean;
  send: (label: string, context: string) => boolean;
} {
  return {
    canSend: hasElementChipTarget(),
    send: (label: string, context: string) =>
      sendElementToComposer({ selector: label, html: context }),
  };
}
