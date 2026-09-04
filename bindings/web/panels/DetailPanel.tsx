/**
 * DetailPanel: the standalone Pull Detail and Issue Detail panels. A thin
 * shell (top bar with breadcrumb and a "Show list" action) around the
 * shared detail view, driven by the plugin-wide selection that the list
 * panels set when the user opens an item in a new panel.
 */

import { Button, Icon } from "@soft-machine/sdk";
import styled from "styled-components";
import type { ForgeIssue } from "../types";
import { useForge } from "../ForgeContext";
import { useForgeQuery, useOpenListPanel, usePollPolicySync, type ItemKind } from "../hooks";
import {
  Count,
  CrumbSeparator,
  CrumbTitle,
  EmptyState,
  Enter,
  EnterInline,
  GhostButton,
  LoadingState,
  Main,
  PickerButton,
  Root,
  ToolbarGroup,
  TopBar,
} from "../ui";
import { IssueDetailView, NoIssueSelected, NoPullSelected, PullDetailView } from "./detail";
import { RepoPicker, useRepoDisplayName } from "./RepoPicker";

export function DetailPanel({ kind }: { kind: ItemKind }) {
  const { repo, isConnected, isConnectionPending, selectedIssue, selectedPull, refresh } = useForge();
  const number = kind === "pull" ? selectedPull : selectedIssue;
  const openList = useOpenListPanel(kind);
  const displayName = useRepoDisplayName();
  usePollPolicySync();
  // Same read the detail view performs; the store serves both from one fetch.
  const crumbPath =
    repo && number !== null && isConnected
      ? `/${kind}?repo=${encodeURIComponent(repo)}&number=${number}`
      : null;
  const crumbDetail = useForgeQuery<{ pull?: ForgeIssue; issue?: ForgeIssue }>(crumbPath).data;
  const crumbTitle = (crumbDetail?.pull ?? crumbDetail?.issue)?.title ?? null;
  const listTitle = kind === "pull" ? "Pull Requests" : "Issues";
  const DetailView = kind === "pull" ? PullDetailView : IssueDetailView;
  const NoSelection = kind === "pull" ? NoPullSelected : NoIssueSelected;

  const listAction = openList ? (
    <Button type="button" $compact $variant="secondary" onClick={openList}>
      Open {listTitle}
    </Button>
  ) : undefined;

  return (
    <Root>
      <TopBar>
        <ToolbarGroup $grow>
          {isConnected && (
            <RepoPicker
              trigger={({ toggle, isOpen }) => (
                <PickerButton type="button" onClick={toggle} $open={isOpen} $filled={repo !== null} title={repo ?? "Select repository"}>
                  <Icon name="Folder" size={12} />
                  <span>{repo ? displayName(repo) : "Select repository"}</span>
                  <Icon name="ChevronDown" size={12} />
                </PickerButton>
              )}
            />
          )}
          {repo && number !== null && (
            <EnterInline key={number} $from="right" $grow>
              <CrumbSeparator>/</CrumbSeparator>
              <Count>#{number}</Count>
              {crumbTitle && <CrumbTitle title={crumbTitle}>{crumbTitle}</CrumbTitle>}
            </EnterInline>
          )}
        </ToolbarGroup>
        <ToolbarGroup $end>
          {openList && (
            <GhostButton type="button" onClick={openList} title={`Show the ${listTitle} panel`} aria-label={`Show the ${listTitle} panel`}>
              <Icon name="List" size={12} />
              <ShowListLabel>Show list</ShowListLabel>
            </GhostButton>
          )}
        </ToolbarGroup>
      </TopBar>
      <Main>
        {/* Keyed by item: a new selection rises in; first paint fades. */}
        <Enter key={number ?? "none"} $from={number === null ? "fade" : "up"}>
        {isConnectionPending ? (
          <LoadingState label="Connecting to GitHub…" />
        ) : !isConnected ? (
          <EmptyState
            icon="GitBranch"
            title="GitHub is not connected"
            text="Connect GitHub in Settings → Integrations, then retry."
            action={
              <Button type="button" $compact $variant="secondary" onClick={refresh}>
                Retry
              </Button>
            }
          />
        ) : !repo || number === null ? (
          <NoSelection action={listAction} />
        ) : (
          <DetailView repo={repo} number={number} />
        )}
        </Enter>
      </Main>
    </Root>
  );
}

const ShowListLabel = styled.span`
  @container (max-width: 420px) {
    display: none;
  }
`;

export function PullDetailPanel() {
  return <DetailPanel kind="pull" />;
}

export function IssueDetailPanel() {
  return <DetailPanel kind="issue" />;
}
