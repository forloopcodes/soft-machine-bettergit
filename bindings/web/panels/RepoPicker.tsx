/**
 * RepoPicker: the repository dropdown used by the top-bar breadcrumb and
 * the empty state. Same groups as the sidebar (repoGroups): a typed
 * owner/name to open directly, pinned repos, the GitHub repos checked out
 * on this workspace, then the credential's GitHub-wide list by recent
 * work. Picking one sets the shared repo for every panel.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Dropdown, DropdownItem, DropdownSectionLabel, Icon } from "@soft-machine/sdk";
import type { ForgeRepo } from "../types";
import { useForge } from "../ForgeContext";
import { useForgeQuery, usePinnedRepos } from "../hooks";
import { displayRepoName, groupRepos, inferSelfOwner } from "../repoGroups";
import { MenuHint, MenuList, MenuSearch, OptionCheck, OptionRow } from "../ui";

export function useRepoList(): { repos: ForgeRepo[]; isLoading: boolean } {
  // One cached list for the whole session (it is fetched as soon as a panel
  // mounts, so menus open warm); filtering happens per keystroke.
  const { data, isLoading } = useForgeQuery<{ repos: ForgeRepo[] }>("/repos");
  return { repos: data?.repos ?? [], isLoading };
}

/**
 * Repository label with the user's own owner dropped ("me/repo" → "repo");
 * organizations and other users keep their prefix so it is clear whose
 * repository it is. Full names stay in tooltips and in the data.
 */
export function useRepoDisplayName(): (fullName: string) => string {
  const { connection } = useForge();
  const { repos } = useRepoList();
  const login = connection?.mode === "user" ? connection.login : null;
  const selfOwner = useMemo(() => inferSelfOwner(repos, login), [repos, login]);
  return useCallback((fullName: string) => displayRepoName(fullName, selfOwner), [selfOwner]);
}

interface RepoPickerProps {
  trigger: (args: { toggle: () => void; isOpen: boolean }) => ReactNode;
  align?: "start" | "end";
  width?: number;
}

export function RepoPicker({ trigger, align = "start", width = 280 }: RepoPickerProps) {
  const { repo, setRepo } = useForge();
  const { pinned } = usePinnedRepos();
  const [search, setSearch] = useState("");
  const { repos, isLoading } = useRepoList();
  const displayName = useRepoDisplayName();
  const groups = useMemo(() => groupRepos(repos, search, pinned), [repos, search, pinned]);
  const { typed, customRepo, workspace, github, hiddenGithub } = groups;
  const nothing = github.length === 0 && workspace.length === 0 && groups.pinned.length === 0 && !customRepo;

  const row = (fullName: string, icon: ReactNode) => (
    <OptionRow $selected={fullName === repo} title={fullName}>
      {icon}
      <span>{displayName(fullName)}</span>
      <OptionCheck>{fullName === repo && <Icon name="Check" size={12} />}</OptionCheck>
    </OptionRow>
  );
  const iconFor = (r: ForgeRepo) => (
    <Icon name={r.localPath ? "Folder" : r.private ? "Lock" : "Globe"} size={12} />
  );

  return (
    <Dropdown align={align} width={width} trigger={trigger}>
      {({ close }) => {
        const pick = (fullName: string) => {
          setRepo(fullName);
          close();
        };
        return (
          <>
            <MenuSearch
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or type owner/name"
              aria-label="Search repositories"
              autoFocus
              spellCheck={false}
              // Dropdown items react to keys; they must stay in the input.
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && customRepo) pick(customRepo);
              }}
            />
            <MenuList>
              {customRepo && (
                <>
                  <DropdownSectionLabel>Open</DropdownSectionLabel>
                  <DropdownItem onClick={() => pick(customRepo)}>
                    {row(customRepo, <Icon name="ArrowRight" size={12} />)}
                  </DropdownItem>
                </>
              )}
              {groups.pinned.length > 0 && (
                <>
                  <DropdownSectionLabel>Pinned</DropdownSectionLabel>
                  {groups.pinned.map((r) => (
                    <DropdownItem key={r.id} onClick={() => pick(r.fullName)}>
                      {row(r.fullName, iconFor(r))}
                    </DropdownItem>
                  ))}
                </>
              )}
              {workspace.length > 0 && (
                <>
                  <DropdownSectionLabel>In this workspace</DropdownSectionLabel>
                  {workspace.map((r) => (
                    <DropdownItem key={r.id} onClick={() => pick(r.fullName)}>
                      {row(r.fullName, <Icon name="Folder" size={12} />)}
                    </DropdownItem>
                  ))}
                </>
              )}
              <DropdownSectionLabel>
                {nothing
                  ? isLoading
                    ? "Loading repositories…"
                    : typed
                      ? "No matches"
                      : "No repositories"
                  : "GitHub"}
              </DropdownSectionLabel>
              {github.map((r) => (
                <DropdownItem key={r.id} onClick={() => pick(r.fullName)}>
                  {row(r.fullName, iconFor(r))}
                </DropdownItem>
              ))}
              {hiddenGithub > 0 && (
                <MenuHint>
                  {typed
                    ? `${hiddenGithub} more match${hiddenGithub === 1 ? "" : "es"} — keep typing`
                    : `${hiddenGithub} more — type to search`}
                </MenuHint>
              )}
            </MenuList>
          </>
        );
      }}
    </Dropdown>
  );
}
