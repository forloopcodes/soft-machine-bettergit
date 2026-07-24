/**
 * Forge Plugin Toolbar: provider switch (GitHub / GitLab), repository
 * picker (searchable dropdown over the proxy's repo listing), and manual
 * refresh. The selected repo drives every Forge panel.
 */

import { useState } from "react";
import styled from "styled-components";
import {
  ANIMATION,
  Dropdown,
  DropdownItem,
  DropdownSectionLabel,
  Icon,
  t,
  useDebounce,
} from "@soft-machine/sdk";
import { PROVIDER_LABELS, type ForgeProvider, type ForgeRepo } from "./types";
import { useForge } from "./ForgeContext";
import { useForgeQuery } from "./hooks";

export function ForgeToolbar() {
  const {
    provider,
    setProvider,
    repo,
    setRepo,
    isConnected,
    isConnectionPending,
    refresh,
  } = useForge();

  const [repoSearch, setRepoSearch] = useState("");
  const debouncedSearch = useDebounce(repoSearch, 300);
  const repos =
    useForgeQuery<{ repos: ForgeRepo[] }>(
      debouncedSearch.trim()
        ? `/repos?q=${encodeURIComponent(debouncedSearch.trim())}`
        : "/repos"
    ).data?.repos ?? [];

  // Integrations bootstrap still in flight: showing "Not connected" here
  // would flash a lie at every connected user on cold load.
  if (isConnectionPending) {
    return null;
  }

  return (
    <ToolbarContainer>
      <Dropdown
        align="start"
        width={140}
        trigger={({ toggle }) => (
          <ToolbarButton type="button" onClick={toggle}>
            {provider === "github" ? (
              <Icon name="GitBranch" size={11} />
            ) : (
              <Icon name="GitFork" size={11} />
            )}
            {PROVIDER_LABELS[provider]}
            <Icon name="ChevronDown" size={10} />
          </ToolbarButton>
        )}
      >
        {({ close }) => (
          <>
            {(Object.keys(PROVIDER_LABELS) as ForgeProvider[]).map((p) => (
              <DropdownItem
                key={p}
                onClick={() => {
                  setProvider(p);
                  close();
                }}
              >
                {PROVIDER_LABELS[p]}
              </DropdownItem>
            ))}
          </>
        )}
      </Dropdown>

      {!isConnected ? (
        <Badge>Not connected</Badge>
      ) : (
        <>
          <Dropdown
            align="start"
            width={280}
            trigger={({ toggle }) => (
              <ToolbarButton
                type="button"
                onClick={toggle}
                title="Select repository"
              >
                <Icon name="Folder" size={11} />
                {repo ?? "Select repository"}
                <Icon name="ChevronDown" size={10} />
              </ToolbarButton>
            )}
          >
            {({ close }) => (
              <>
                <RepoSearchInput
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Search repositories"
                  aria-label="Search repositories"
                  autoFocus
                  spellCheck={false}
                  // Dropdown items react to clicks; keys must stay in the
                  // input while typing.
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <DropdownSectionLabel>
                  {repos.length === 0 ? "No repositories" : "Repositories"}
                </DropdownSectionLabel>
                {repos.map((r) => (
                  <DropdownItem
                    key={r.id}
                    onClick={() => {
                      setRepo(r.fullName);
                      close();
                    }}
                  >
                    <RepoRow $selected={r.fullName === repo}>
                      {r.private && <Icon name="Lock" size={10} />}
                      {r.fullName}
                    </RepoRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
          <RefreshBtn onClick={refresh} title="Refresh from provider">
            Refresh
          </RefreshBtn>
        </>
      )}
    </ToolbarContainer>
  );
}

const ToolbarContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
`;

const Badge = styled.span`
  font-size: ${t.typography.base};
  color: ${t.text.muted};
`;

const ToolbarButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  font-size: ${t.typography.sm};
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  cursor: pointer;
  color: ${t.text.primary};
  transition: background ${ANIMATION.fast};
  max-width: 240px;
  overflow: hidden;
  white-space: nowrap;

  &:hover {
    background: ${t.bg.secondary};
  }
`;

const RefreshBtn = styled.button`
  padding: 4px 8px;
  font-size: ${t.typography.sm};
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  cursor: pointer;
  color: ${t.text.primary};
  transition: background ${ANIMATION.fast};

  &:hover {
    background: ${t.bg.secondary};
  }
`;

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

const RepoRow = styled.span<{ $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: ${(props) => (props.$selected ? t.accent.primary : "inherit")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
