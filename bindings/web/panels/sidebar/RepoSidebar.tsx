/**
 * RepoSidebar: the sidebar's default state. Three collapsible sections:
 * pinned repositories (the user's shortlist, shared by every panel),
 * repositories checked out on this workspace, and the credential's GitHub
 * list ordered by most recent push, minus anything already pinned or
 * checked out. A search box filters all three; the footer shows who GitHub
 * thinks we are. Picking a row sets the shared repo for every panel.
 */

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import styled from "styled-components";
import { Icon, UserAvatar, t } from "@soft-machine/sdk";
import { useForge } from "../../ForgeContext";
import { usePinnedRepos, useSidebarSections } from "../../hooks";
import { groupRepos, type SidebarSection } from "../../repoGroups";
import type { ForgeRepo } from "../../types";
import {
  BareButton,
  BareLink,
  Count,
  EnterBlock,
  FooterText,
  HeadingButton,
  HeadingChevron,
  RowActions,
  SearchBox,
  SearchInput,
  SidebarFooter,
  SidebarGrow,
  SidebarNote,
  SidebarRow,
  SidebarSection as SidebarSectionBox,
} from "../../ui";
import { useRepoDisplayName, useRepoList } from "../RepoPicker";

type IconName = Parameters<typeof Icon>[0]["name"];

function Section({
  id,
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  id: SidebarSection;
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: (id: SidebarSection) => void;
  children: ReactNode;
}) {
  return (
    <>
      <HeadingButton type="button" onClick={() => onToggle(id)} aria-expanded={!collapsed}>
        <HeadingChevron $open={!collapsed}>
          <Icon name="ChevronRight" size={12} />
        </HeadingChevron>
        <span className="title">{title}</span>
        {count !== undefined && count > 0 && <Count>{count}</Count>}
      </HeadingButton>
      {!collapsed && <EnterBlock $from="down">{children}</EnterBlock>}
    </>
  );
}

export function RepoSidebar() {
  const { repo, setRepo, connection, isConnected } = useForge();
  const { pinned, isPinned, toggle: togglePin } = usePinnedRepos();
  const { collapsed, toggle: toggleSection } = useSidebarSections();
  const [search, setSearch] = useState("");
  const { repos, isLoading } = useRepoList();
  const displayName = useRepoDisplayName();
  const groups = useMemo(() => groupRepos(repos, search, pinned), [repos, search, pinned]);
  const { typed, customRepo, workspace, github, hiddenGithub } = groups;

  const rowKeyDown = (event: KeyboardEvent, fullName: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setRepo(fullName);
    }
  };

  // Rows stagger in across all sections, in visual order.
  let rowIndex = 0;
  const row = (r: ForgeRepo, icon: IconName) => {
    const active = repo !== null && repo.toLowerCase() === r.fullName.toLowerCase();
    const pinnedNow = isPinned(r.fullName);
    return (
      <SidebarRow
        key={r.fullName}
        role="listitem"
        tabIndex={0}
        $active={active}
        $index={rowIndex++}
        aria-current={active || undefined}
        onClick={() => setRepo(r.fullName)}
        onKeyDown={(e) => rowKeyDown(e, r.fullName)}
        title={r.localPath ?? r.fullName}
      >
        <RowIcon>
          <Icon name={icon} size={12} />
        </RowIcon>
        <span className="label">{displayName(r.fullName)}</span>
        <RowActions>
          <BareButton
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePin(r.fullName);
            }}
            aria-label={pinnedNow ? `Unpin ${r.fullName}` : `Pin ${r.fullName}`}
            title={pinnedNow ? "Unpin" : "Pin"}
          >
            <Icon name={pinnedNow ? "PinOff" : "Pin"} size={12} />
          </BareButton>
          <BareLink
            href={r.webUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${r.fullName} on GitHub`}
            title="Open on GitHub"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="ExternalLink" size={12} />
          </BareLink>
        </RowActions>
      </SidebarRow>
    );
  };

  const githubIcon = (r: ForgeRepo): IconName => (r.private ? "Lock" : "Globe");
  const anyIcon = (r: ForgeRepo): IconName => (r.localPath ? "Folder" : githubIcon(r));

  return (
    <>
      <SidebarSectionBox>
        <SearchBox>
          <Icon name="Search" size={12} />
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find repository"
            aria-label="Find repository"
            spellCheck={false}
            disabled={!isConnected}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customRepo) setRepo(customRepo);
            }}
          />
        </SearchBox>
      </SidebarSectionBox>

      <SidebarGrow role="list">
        {!isConnected ? (
          <SidebarNote>Connect GitHub to list repositories.</SidebarNote>
        ) : (
          <>
            {customRepo && (
              <SidebarRow
                role="listitem"
                tabIndex={0}
                $index={rowIndex++}
                onClick={() => setRepo(customRepo)}
                onKeyDown={(e) => rowKeyDown(e, customRepo)}
                title={`Open ${customRepo}`}
              >
                <RowIcon>
                  <Icon name="ArrowRight" size={12} />
                </RowIcon>
                <span className="label">Open {customRepo}</span>
              </SidebarRow>
            )}

            {groups.pinned.length > 0 && (
              <Section id="pinned" title="Pinned" count={groups.pinned.length} collapsed={collapsed.pinned} onToggle={toggleSection}>
                {groups.pinned.map((r) => row(r, anyIcon(r)))}
              </Section>
            )}

            <Section
              id="workspace"
              title="In this workspace"
              count={workspace.length}
              collapsed={collapsed.workspace}
              onToggle={toggleSection}
            >
              {workspace.length > 0 ? (
                workspace.map((r) => row(r, "Folder"))
              ) : (
                <SidebarNote $nowrap>
                  {isLoading
                    ? "Looking for checkouts…"
                    : typed
                      ? "No matching checkout."
                      : groups.pinned.some((r) => r.localPath)
                        ? "All checkouts are pinned."
                        : "No GitHub checkouts under /workspace."}
                </SidebarNote>
              )}
            </Section>

            <Section
              id="github"
              title="GitHub"
              count={github.length + hiddenGithub}
              collapsed={collapsed.github}
              onToggle={toggleSection}
            >
              {github.length > 0 ? (
                github.map((r) => row(r, githubIcon(r)))
              ) : (
                <SidebarNote>
                  {isLoading
                    ? "Loading repositories…"
                    : typed
                      ? "No matches. Type owner/name to open any repository."
                      : "No other repositories visible to this credential."}
                </SidebarNote>
              )}
              {hiddenGithub > 0 && (
                <SidebarNote $nowrap>
                  {typed ? `${hiddenGithub} more — keep typing` : `${hiddenGithub} more — type to search`}
                </SidebarNote>
              )}
            </Section>
          </>
        )}
      </SidebarGrow>

      <SidebarFooter>
        {connection?.mode === "user" ? (
          <>
            <UserAvatar name={connection.login ?? "GitHub"} size={16} />
            <FooterText>
              <span>{connection.login ?? "GitHub user"}</span>
              <span>Signed in with gh</span>
            </FooterText>
          </>
        ) : connection?.mode === "installation" ? (
          <>
            <FooterIcon>
              <Icon name="GitBranch" size={14} />
            </FooterIcon>
            <FooterText>
              <span>
                {typeof connection.repositoryCount === "number"
                  ? `${connection.repositoryCount} repositories`
                  : "Installation access"}
              </span>
            </FooterText>
          </>
        ) : (
          <>
            <FooterIcon>
              <Icon name="GitBranch" size={14} />
            </FooterIcon>
            <FooterText>
              <span>Not connected</span>
              <span>Settings → Integrations</span>
            </FooterText>
          </>
        )}
      </SidebarFooter>
    </>
  );
}

const RowIcon = styled.span`
  display: inline-grid;
  place-items: center;
  width: 12px;
  height: 12px;
  color: ${t.text.muted};
  flex-shrink: 0;
`;

const FooterIcon = styled.span`
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  color: ${t.text.muted};
  flex-shrink: 0;
`;
