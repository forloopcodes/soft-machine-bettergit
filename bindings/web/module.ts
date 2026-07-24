/**
 * Forge Plugin Module
 *
 * Registration for the GitHub / GitLab pull-request and issue panels.
 * Data flows from the server-side proxy (/api/integrations/forge/*)
 * through ForgeContext and the polled hooks into the panels; tokens
 * never reach the browser.
 */

import { createElement, useCallback, useMemo } from "react";
import { Icon, registerPluginModule } from "@soft-machine/sdk";
import type {
  PluginModule,
  PluginLoadingState,
  PluginPersistence,
  PluginSimulation,
  PluginInitialization,
} from "@soft-machine/sdk";
import { FORGE_META } from "./meta";
import { ForgeProviderComponent, useForge } from "./ForgeContext";
import { ForgeToolbar } from "./ForgeToolbar";
import {
  IssuesPanel,
  IssuesHeaderActions,
  PullsPanel,
  PullsHeaderActions,
  IssueDetailPanel,
  PullDetailPanel,
} from "./panels";

// The Forge module is plain JS with no WASM/OS dependency, and data
// problems (bad token, rate limit, network) are recoverable and rendered
// inside the panels; they must never escalate to the editor-level boot
// error page, so this is intentionally constant.
const FORGE_LOADING_STATE: PluginLoadingState = {
  isLoading: false,
  error: null,
};

function useForgeLoadingState(): PluginLoadingState {
  return FORGE_LOADING_STATE;
}

function useForgePersistence(): PluginPersistence {
  const { getState, restoreState, isReady, setIsReady, repo, provider } =
    useForge();

  const getMetrics = useCallback(
    () => ({
      primaryCount: repo ? 1 : 0,
      primaryLabel: "Repository",
      secondaryCount: 0,
      secondaryLabel: "",
      generation: 0,
    }),
    [repo]
  );

  return useMemo(
    () => ({
      getState,
      restoreState,
      getMetrics,
      generation: 0,
      isReady,
      setReady: setIsReady,
    }),
    // getState reads refs and is identity-stable; repo/provider are deps
    // purely to refresh this object's identity so the host's autosave
    // debounce sees selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getState, restoreState, getMetrics, isReady, setIsReady, repo, provider]
  );
}

function useForgeSimulation(): PluginSimulation {
  return useMemo(
    () => ({
      isRunning: false,
      run: () => {
        /* no-op: Forge has no simulation loop */
      },
      stop: () => {
        /* no-op */
      },
      step: () => {
        /* no-op */
      },
      reset: () => {
        /* no-op */
      },
    }),
    []
  );
}

function useForgeInitialization(): PluginInitialization {
  const { clear, refresh } = useForge();
  return useMemo(() => ({ clear, refresh }), [clear, refresh]);
}

export const forgeModule: PluginModule = {
  id: "forge",
  meta: FORGE_META,
  requiresOperatingSystem: false,

  Provider: ForgeProviderComponent,
  panels: [
    {
      id: "forge-pulls",
      title: "Pull Requests",
      icon: createElement(Icon, { name: "GitMerge", size: 16 }),
      component: PullsPanel,
      headerActions: PullsHeaderActions,
      isCanvas: false,
      layout: { width: 380, minWidth: 280 },
    },
    {
      id: "forge-issues",
      title: "Issues",
      icon: createElement(Icon, { name: "AlertCircle", size: 16 }),
      component: IssuesPanel,
      headerActions: IssuesHeaderActions,
      isCanvas: false,
      layout: { width: 380, minWidth: 280 },
    },
    {
      id: "forge-pull-detail",
      title: "Pull Detail",
      icon: createElement(Icon, { name: "GitBranch", size: 16 }),
      component: PullDetailPanel,
      isCanvas: false,
      layout: { width: 420, minWidth: 300 },
    },
    {
      id: "forge-issue-detail",
      title: "Issue Detail",
      icon: createElement(Icon, { name: "FileText", size: 16 }),
      component: IssueDetailPanel,
      isCanvas: false,
      layout: { width: 420, minWidth: 300 },
    },
  ],
  toolbar: { component: ForgeToolbar },

  useLoadingState: useForgeLoadingState,
  usePersistence: useForgePersistence,
  useSimulation: useForgeSimulation,
  useInitialization: useForgeInitialization,
};

registerPluginModule(forgeModule);

// The default export lets loaders recover registration from the browser's
// module cache when the same URL is re-imported after an unregister (see
// registerImportedPluginModule in plugins/registry.ts).
export default forgeModule;
