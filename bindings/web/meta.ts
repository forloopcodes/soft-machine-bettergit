import type { PluginMeta } from "@soft-machine/sdk";

export const FORGE_META: PluginMeta = {
  id: "forge",
  label: "PRs & Issues",
  shortLabel: "PRI",
  color: "#3fb950",
  description:
    "Browse, triage, and act on GitHub and GitLab pull requests and issues, synced live, with full-context handoff to the agent",
  integrations: [
    {
      site: "gitlab.com",
      description:
        "Connect a GitLab personal access token (api scope) to load merge requests and issues",
      placeholder: "glpat-...",
      docsUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
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
};
