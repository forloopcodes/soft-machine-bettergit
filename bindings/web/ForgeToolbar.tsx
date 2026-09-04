/**
 * Forge Plugin Toolbar: provider label, repository picker (shared
 * RepoPicker), and manual refresh. The selected repo drives every Forge
 * panel.
 */

import styled from "styled-components";
import { ANIMATION, Dropdown, DropdownItem, Icon, t } from "@soft-machine/sdk";
import { PROVIDER_LABELS, type ForgeProvider } from "./types";
import { useForge } from "./ForgeContext";
import { RepoPicker } from "./panels/RepoPicker";

export function ForgeToolbar() {
  const { provider, setProvider, repo, isConnected, isConnectionPending, refresh } = useForge();

  // Connection check still in flight: showing "Not connected" here would
  // flash a lie at every connected user on cold load.
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
            <Icon name="GitBranch" size={11} />
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
          <RepoPicker
            trigger={({ toggle }) => (
              <ToolbarButton type="button" onClick={toggle} title="Select repository">
                <Icon name="Folder" size={11} />
                {repo ?? "Select repository"}
                <Icon name="ChevronDown" size={10} />
              </ToolbarButton>
            )}
          />
          <RefreshBtn onClick={refresh} title="Refresh from GitHub">
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
