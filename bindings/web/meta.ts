import type { PluginMeta } from "@soft-machine/sdk";

export const FORGE_META: PluginMeta = {
  id: "bettergit",
  label: "bettergit",
  shortLabel: "BG",
  color: "#3fb950",
  description:
    "Browse, triage, and act on GitHub pull requests and issues through the workspace's GitHub connection, synced live, with full-context handoff to the agent",
  integrations: [
    {
      site: "github.com",
      description:
        "Connect GitHub (the GitHub App or a GH_TOKEN) to load pull requests and issues; the panels use whatever gh is signed in with on the workspace machine",
      placeholder: "ghp_... or github_pat_...",
      docsUrl: "https://github.com/settings/tokens",
    },
  ],
  // Must mirror module.ts panels AND soft-machine.plugin.json exactly
  // (id/title/layout): the manifest feeds panel configs before the module
  // lazy-loads; drift produces different layouts cold vs warm
  // (manifestParity.test.ts pins the JSON side).
  panels: [
    {
      id: "bettergit-pulls",
      title: "Pull Requests",
      layout: { width: 640, minWidth: "large" },
    },
    {
      id: "bettergit-issues",
      title: "Issues",
      layout: { width: 640, minWidth: "large" },
    },
    {
      id: "bettergit-pull-detail",
      title: "Pull Detail",
      layout: { width: 480, minWidth: "large" },
    },
    {
      id: "bettergit-issue-detail",
      title: "Issue Detail",
      layout: { width: 480, minWidth: "large" },
    },
  ],
  panelExtensions: [],
};
