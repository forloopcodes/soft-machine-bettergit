/**
 * Data hooks for the Forge plugin.
 *
 * Reads resolve panel path strings through the route table (github/routes)
 * into GitHub calls made by the VM bridge, cached and polled by the query
 * store so lists and open details keep syncing in the background. Writes
 * go through the same bridge and then refresh every subscribed query in
 * place, so each panel re-pulls the changed state without blanking.
 *
 * Panel interop uses the host's documented surfaces only: useOpenPanel to
 * reveal a detail panel, and the chat panel's "chat-send" signal to hand
 * context to the agent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOpenPanelSafe } from "@soft-machine/sdk";
import { useForge } from "./ForgeContext";
import { chatMessageFor } from "./agentContext";
import { localReposPlan, planRead, runMutation } from "./github/routes";
import { useQuery } from "./query/useQuery";
import { describeError, firstForgeRemote } from "./types";

export interface ForgeQuery<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * One cached, polled read. `path` is the resource plus its query string
 * (filters are encoded into it, so a filter change is a new cache entry);
 * null disables the read entirely.
 */
export function useForgeQuery<T>(path: string | null): ForgeQuery<T> {
  const { client, isConnected } = useForge();
  const plan = useMemo(
    () => (client && isConnected && path !== null ? planRead<T>(client, path) : null),
    [client, isConnected, path]
  );
  const query = useQuery<T>(plan);

  return {
    data: query.data ?? null,
    // A background refetch must not blank an already-rendered list, so
    // loading is only surfaced while there is no data yet.
    isLoading: plan !== null && query.data === undefined && query.error === null,
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

/**
 * Open an issue or pull in its detail panel: set the shared selection and
 * reveal the panel (findOrOpen reuses the existing detail panel, creating
 * one only if none is open, and focuses it either way).
 */
export function useOpenDetail(kind: "issue" | "pull"): {
  open: (number: number) => void;
  selected: number | null;
} {
  const { selectedIssue, setSelectedIssue, selectedPull, setSelectedPull } = useForge();
  const openPanel = useOpenPanelSafe();

  const panelId = kind === "issue" ? "forge-issue-detail" : "forge-pull-detail";
  const setSelected = kind === "issue" ? setSelectedIssue : setSelectedPull;

  const open = useCallback(
    (number: number) => {
      setSelected(number);
      openPanel?.({ panelTypeId: panelId, mode: "findOrOpen" });
    },
    [setSelected, panelId, openPanel]
  );

  return {
    open,
    selected: kind === "issue" ? selectedIssue : selectedPull,
  };
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
