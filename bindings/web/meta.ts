import type { PluginMeta } from "@soft-machine/sdk";

export const FORGE_META: PluginMeta = {
  id: "forge",
  label: "PRs & Issues",
  shortLabel: "PRI",
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
      id: "forge-pulls",
      title: "Pull Requests",
      layout: { width: 380, minWidth: 280 },
    },
    {
      id: "forge-issues",
      title: "Issues",
      layout: { width: 380, minWidth: 280 },
    },
    {
      id: "forge-pull-detail",
      title: "Pull Detail",
      layout: { width: 420, minWidth: 300 },
    },
    {
      id: "forge-issue-detail",
      title: "Issue Detail",
      layout: { width: 420, minWidth: 300 },
    },
  ],
  panelExtensions: [],
};
