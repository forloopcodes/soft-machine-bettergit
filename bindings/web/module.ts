/**
 * bettergit Plugin Module
 *
 * Registration for the GitHub pull-request and issue panels. Data flows
 * from the plugin's VM bridge (a machine service declared in the manifest,
 * using the workspace's GitHub connection) through ForgeContext and the
 * query hooks into the panels; no GitHub credential reaches the browser.
 */

import { createElement, useCallback, useMemo } from "react";
import { Icon } from "@soft-machine/sdk";
import type {
  PluginModule,
  PluginLoadingState,
  PluginPersistence,
  PluginSimulation,
  PluginInitialization,
} from "@soft-machine/sdk";
import manifest from "../../soft-machine.plugin.json";
import { FORGE_META } from "./meta";
import { ForgeProviderComponent, useForge } from "./ForgeContext";
import { SETTINGS_DECLARATIONS } from "./settings";
import {
  DetailHeaderActions,
  IssueDetailPanel,
  IssuesPanel,
  ListHeaderActions,
  PullDetailPanel,
  PullsPanel,
} from "./panels";

// The module is plain JS with no WASM dependency, and data problems
// (missing credential, rate limit, network) are recoverable and rendered
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
  const { getState, restoreState, isReady, setIsReady, repo, provider } = useForge();

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
        /* no-op: no simulation loop */
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

// Layouts must mirror meta.ts and soft-machine.plugin.json exactly
// (manifestParity.test.ts pins the JSON side). The list panels host a
// sidebar and default wide enough to show it; the details are narrower.
const LIST_LAYOUT = { width: 640, minWidth: "large" } as const;
const DETAIL_LAYOUT = { width: 480, minWidth: "large" } as const;

export const forgeModule: PluginModule = {
  id: "bettergit",
  meta: FORGE_META,
  // The bridge is the plugin's only compute demand; the Provider consumes
  // the machine-services layer to start it and learn its URL.
  machine: manifest.machine as PluginModule["machine"],
  providerCapabilities: ["os"],

  Provider: ForgeProviderComponent,
  panels: [
    {
      id: "bettergit-pulls",
      title: "Pull Requests",
      description: "Pull requests for the selected repository, with an in-panel detail view.",
      icon: createElement(Icon, { name: "GitPullRequest", size: 16 }),
      component: PullsPanel,
      headerActions: ListHeaderActions,
      isCanvas: false,
      layout: LIST_LAYOUT,
    },
    {
      id: "bettergit-issues",
      title: "Issues",
      description: "Issues for the selected repository, with an in-panel detail view.",
      icon: createElement(Icon, { name: "CircleDot", size: 16 }),
      component: IssuesPanel,
      headerActions: ListHeaderActions,
      isCanvas: false,
      layout: LIST_LAYOUT,
    },
    {
      id: "bettergit-pull-detail",
      title: "Pull Detail",
      description: "One pull request: conversation, checks, files and reviews.",
      icon: createElement(Icon, { name: "GitMerge", size: 16 }),
      component: PullDetailPanel,
      headerActions: DetailHeaderActions,
      isCanvas: false,
      layout: DETAIL_LAYOUT,
    },
    {
      id: "bettergit-issue-detail",
      title: "Issue Detail",
      description: "One issue: description, comments and labels.",
      icon: createElement(Icon, { name: "FileText", size: 16 }),
      component: IssueDetailPanel,
      headerActions: DetailHeaderActions,
      isCanvas: false,
      layout: DETAIL_LAYOUT,
    },
  ] as PluginModule["panels"],
  panelExtensions: [],
  // Everything a toolbar would hold lives in each panel's own top bar.
  toolbar: { component: () => null },
  // Host-rendered under Settings → Plugins → bettergit; read back with
  // usePluginSettings (needs the "os" provider tier declared above).
  settings: { declarations: [...SETTINGS_DECLARATIONS] } as PluginModule["settings"],

  useLoadingState: useForgeLoadingState,
  usePersistence: useForgePersistence,
  useSimulation: useForgeSimulation,
  useInitialization: useForgeInitialization,
};

// Workspace-local and store loads bind the default export (its id must
// match the manifest); nothing else is consulted.
export default forgeModule;
