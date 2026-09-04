/**
 * RepoPicker: the one repository selector, used by the toolbar and by the
 * Issues / Pull Requests panels (header action and empty state). A
 * searchable dropdown in three parts: a typed owner/name to open directly,
 * the GitHub repos checked out on this workspace, then the credential's
 * GitHub-wide list. Picking one sets the shared repo for every panel.
 */

import { useMemo, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Dropdown, DropdownItem, DropdownSectionLabel, Icon, t } from "@soft-machine/sdk";
import { REPO_RE, type ForgeRepo } from "../types";
import { useForge } from "../ForgeContext";
import { filterRepos } from "../github/filterRepos";
import { useForgeQuery } from "../hooks";

/** GitHub rows shown before the user types anything. */
const GITHUB_PREVIEW = 8;
/** GitHub rows shown for a query; beyond this the hint asks for more letters. */
const GITHUB_RESULTS_MAX = 30;
/** Rows visible before the list scrolls (about ten rows). */
const LIST_MAX_HEIGHT = "300px";

interface RepoPickerProps {
  trigger: (args: { toggle: () => void; isOpen: boolean }) => ReactNode;
  align?: "start" | "end";
  width?: number;
}

export function RepoPicker({ trigger, align = "start", width = 280 }: RepoPickerProps) {
  const { repo, setRepo } = useForge();
  const [search, setSearch] = useState("");
  // One cached list for the whole session (it is fetched as soon as a panel
  // mounts, so the menu opens warm); filtering happens here, per keystroke.
  const { data, isLoading } = useForgeQuery<{ repos: ForgeRepo[] }>("/repos");
  const typed = search.trim();
  const matching = useMemo(() => filterRepos(data?.repos ?? [], typed), [data, typed]);

  // Checkouts on this machine lead; the credential's GitHub-wide list follows.
  const workspaceRepos = matching.filter((r) => r.localPath);
  const githubRepos = matching.filter((r) => !r.localPath);
  // Without a query the GitHub list is a short preview, not a wall: the
  // search box is the way to reach the rest.
  const shownGithub = typed ? githubRepos.slice(0, GITHUB_RESULTS_MAX) : githubRepos.slice(0, GITHUB_PREVIEW);
  const hiddenGithub = githubRepos.length - shownGithub.length;
  const customRepo =
    REPO_RE.test(typed) && !matching.some((r) => r.fullName.toLowerCase() === typed.toLowerCase())
      ? typed
      : null;

  return (
    <Dropdown align={align} width={width} trigger={trigger}>
      {({ close }) => {
        const pick = (fullName: string) => {
          setRepo(fullName);
          close();
        };
        return (
          <>
            <RepoSearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or type owner/name"
              aria-label="Search repositories"
              autoFocus
              spellCheck={false}
              // Dropdown items react to clicks; keys must stay in the
              // input while typing.
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && customRepo) pick(customRepo);
              }}
            />
            <RepoList>
            {/* A typed owner/name that isn't in either list is offered as-is,
                so any repository the credential can reach is one keystroke
                away. */}
            {customRepo && (
              <>
                <DropdownSectionLabel>Open</DropdownSectionLabel>
                <DropdownItem onClick={() => pick(customRepo)}>
                  <RepoRow $selected={customRepo === repo}>
                    <Icon name="ArrowRight" size={10} />
                    {customRepo}
                  </RepoRow>
                </DropdownItem>
              </>
            )}
            {workspaceRepos.length > 0 && (
              <>
                <DropdownSectionLabel>In this workspace</DropdownSectionLabel>
                {workspaceRepos.map((r) => (
                  <DropdownItem key={r.id} onClick={() => pick(r.fullName)}>
                    <RepoRow $selected={r.fullName === repo} title={r.localPath ?? undefined}>
                      <Icon name="Folder" size={10} />
                      {r.fullName}
                    </RepoRow>
                  </DropdownItem>
                ))}
              </>
            )}
            <DropdownSectionLabel>
              {githubRepos.length === 0 && workspaceRepos.length === 0 && !customRepo
                ? isLoading
                  ? "Loading repositories…"
                  : typed
                    ? "No matches"
                    : "No repositories"
                : "GitHub"}
            </DropdownSectionLabel>
            {shownGithub.map((r) => (
              <DropdownItem key={r.id} onClick={() => pick(r.fullName)}>
                <RepoRow $selected={r.fullName === repo}>
                  {r.private && <Icon name="Lock" size={10} />}
                  {r.fullName}
                </RepoRow>
              </DropdownItem>
            ))}
            {hiddenGithub > 0 && (
              <MoreHint>
                {typed
                  ? `${hiddenGithub} more match${hiddenGithub === 1 ? "" : "es"} — keep typing`
                  : `${hiddenGithub} more — type to search`}
              </MoreHint>
            )}
            </RepoList>
          </>
        );
      }}
    </Dropdown>
  );
}

const RepoSearchInput = styled.input`
  margin: 4px;
  padding: 4px 8px;
  width: calc(100% - 8px);
  background: ${t.bg.primary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  color: ${t.text.primary};
  font-size: ${t.typography.sm};
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: ${t.accent.primary};
  }
`;

// The search box stays put; only the rows scroll.
const RepoList = styled.div`
  max-height: ${LIST_MAX_HEIGHT};
  overflow-y: auto;
  overflow-x: hidden;
`;

const MoreHint = styled.div`
  padding: 6px 12px 8px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
`;

const RepoRow = styled.span<{ $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: ${(props) => (props.$selected ? t.accent.primary : "inherit")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
