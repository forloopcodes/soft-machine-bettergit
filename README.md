# Forge — PRs & Issues plugin for Soft-Machine

Browse, triage, and act on GitHub and GitLab pull requests and issues from
inside a Soft-Machine workspace: live-synced list panels, detail panels with
diffs/checks/comments, composers for new issues and PRs, and full-context
handoff to the workspace agent.

This repository is the plugin's source of truth. It is a **workspace-local
Soft-Machine plugin**: the VM's plugin-service discovers it from
`/soft-machine/plugins/forge`, bundles it with esbuild, and the client mounts
it against the host SDK. Publishing to the community store happens from the
Plugin Manager once the plugin is enabled.

## Requirements

- A Soft-Machine host with **plugin host ABI v2** (the `@soft-machine/sdk`
  host bridges: `usePolledQuery`, `useQueryClient`, `usePanelActions`,
  `useIntegrations`, `useWorkspaceRepositories`, the Dropdown family, and the
  composer bridge). Hosts older than this refuse the plugin with a "needs a
  newer Soft-Machine" notice instead of mounting it.
- The server-side forge proxy (`/api/integrations/forge/*`) — ships with the
  same host release. Tokens stay server-side; the plugin never sees them.

## Install into a workspace (agent instructions)

Run inside the workspace VM:

```bash
gh repo clone forloopcodes/soft-machine-plugin-forge /soft-machine/plugins/forge
```

(or `git clone https://github.com/forloopcodes/soft-machine-plugin-forge.git /soft-machine/plugins/forge`)

The directory name **must** be `forge` — the plugin-service requires the
directory to match the manifest id.

Then verify discovery and bundle health:

```bash
curl -s localhost:6850/plugins
```

Expect an entry with `"id":"forge"` and `"bundleError":null`. If the service
reports a missing SDK export, the host predates ABI v2 — see Requirements.

In the client: open the **Plugins** window, enable **PRs & Issues**, and
connect a GitHub or GitLab token under Settings → Integrations if none is
connected yet. The four panels (Pull Requests, Issues, Pull Detail, Issue
Detail) mount immediately.

## Updating

```bash
git -C /soft-machine/plugins/forge pull
```

The plugin-service versions the tree by newest file mtime, so every pull (or
edit) rebuilds and hot-swaps the module on the next poll — no restarts.

## Publishing

1. Enable the plugin in the workspace (healthy bundle required).
2. The VM publisher auto-publishes the built artifact to your account
   library on its next cycle — the "Account" cell fills in on the plugin's
   settings page.
3. The **publish** button on that settings page submits it to the community
   store: one click opens (or updates) the rolling review PR against the
   registry repo. Review gates everything; nothing auto-merges.

The published tarball carries this whole tree (source included) so the store
supports fork-for-development.

## Layout

```
soft-machine.plugin.json    cold manifest: id, label, panels, integrations,
                            module entry (bindings/web/module.ts)
bindings/web/
  module.ts                 registration + default export (cache recovery)
  meta.ts                   FORGE_META — must mirror the manifest exactly
  ForgeContext.tsx          provider: selection, filters, connection state
  ForgeToolbar.tsx          provider/repo picker, auto-detect, refresh
  hooks.ts                  polled reads, mutations, panel-open, agent handoff
  types.ts                  API types + pure helpers (parsing, remotes)
  agentContext.ts           context-block builders for agent handoff
  markdownNormalize.ts      forge-flavored markdown cleanup
  panels/                   the four panels + composers + shared pieces
  __tests__/                unit tests (see below)
```

Only `react`, `styled-components`, and `@soft-machine/sdk` may be imported —
anything else will not resolve on the VM bundler.

## Tests

The tests are written against the Soft-Machine repo's vitest toolchain
(`@plugins/*` aliases, sdk resolution). To run them, clone this repo into a
Soft-Machine checkout as `plugins/forge` and run `bunx vitest run plugins/forge`
from the repo root. Note: while the tree sits inside the app repo, the client
auto-bundles it as a core plugin (useful for `bun run dev` iteration), and a
same-id workspace-local import is skipped as a duplicate for that dev client.
