/**
 * ListPanel: the Pull Requests and Issues panels, one component. Top bar
 * with breadcrumb / search / filter / new, a sidebar that shows the parent
 * level of whatever the main area shows (repositories while listing, the
 * list while reading one item in same-panel mode), and the main area.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon } from "@soft-machine/sdk";
import styled from "styled-components";
import { LIST_PAGE_SIZE, listQueryString, type ForgeIssue } from "../types";
import { useForge } from "../ForgeContext";
import {
  useForgeQuery,
  useForgeSettings,
  useOpenDetailPanel,
  usePanelView,
  usePollPolicySync,
  useSidebarWidth,
  useVmRepoAutoDetect,
  type ItemKind,
} from "../hooks";
import {
  BareButton,
  Count,
  CreateButton,
  CrumbSeparator,
  CrumbTitle,
  EmptyState,
  Enter,
  EnterBlock,
  EnterInline,
  EnterRow,
  ErrorBanner,
  FilterRow,
  LoadingState,
  Main,
  PickerButton,
  Root,
  SIDEBAR_BREAKPOINT,
  STATE_COLORS,
  Scroll,
  SegmentIcon,
  Segmented,
  InlineCount,
  Sidebar,
  Spacer,
  Spinner,
  ToneDot,
  ToolbarGroup,
  TopBar,
  Workspace,
  type EnterFrom,
} from "../ui";
import { IssueDetailView, PullDetailView } from "./detail";
import { toggleName } from "../labels";
import { filterLocally } from "../search";
import { ActiveFilterChips, FilterMenu, SearchField, activeFilterCount } from "./FilterMenu";
import { IssueComposer } from "./IssueComposer";
import { ItemList } from "./ItemList";
import { ItemPicker } from "./ItemPicker";
import { Pager } from "./Pager";
import { PullComposer } from "./PullComposer";
import { RepoPicker, useRepoDisplayName } from "./RepoPicker";
import { ListSidebar } from "./sidebar/ListSidebar";
import { RepoSidebar } from "./sidebar/RepoSidebar";
import { SidebarResizer } from "./sidebar/SidebarResizer";

interface ListResponse {
  items: ForgeIssue[];
  totalOpen: number;
  totalClosed: number;
}

const NOUN: Record<ItemKind, { one: string; many: string; icon: "GitPullRequest" | "CircleDot" }> = {
  pull: { one: "pull request", many: "pull requests", icon: "GitPullRequest" },
  issue: { one: "issue", many: "issues", icon: "CircleDot" },
};

export function ListPanel({ kind }: { kind: ItemKind }) {
  const forge = useForge();
  const { repo, isConnected, isConnectionPending, refresh } = forge;
  const filters = kind === "pull" ? forge.pullFilters : forge.issueFilters;
  const setFilters = kind === "pull" ? forge.setPullFilters : forge.setIssueFilters;
  const composerOpen = kind === "pull" ? forge.isPrComposerOpen : forge.isComposerOpen;
  const setComposerOpen = kind === "pull" ? forge.setPrComposerOpen : forge.setComposerOpen;

  // Panels sit below the OS capabilities provider, so the VM repo probe
  // runs here; the context dedupes across panels. Same for the refresh
  // policy: the store dedupes identical settings.
  useVmRepoAutoDetect();
  usePollPolicySync();

  const { settings, update } = useForgeSettings();
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useSidebarWidth();
  // Width follows the pointer during a drag; the preference is written once
  // on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const liveWidth = dragWidth ?? sidebarWidth;
  const view = usePanelView(kind);
  const displayName = useRepoDisplayName();
  const detailPanel = useOpenDetailPanel(kind);
  const samePanel = settings.detailOpenMode === "same-panel";

  const resource = kind === "pull" ? "pulls" : "issues";
  const path = repo && isConnected ? `/${resource}${listQueryString(repo, filters)}` : null;
  const list = useForgeQuery<ListResponse>(path);

  // The page reports its own state's total; the other state's count is a
  // separate, slower-polled read so the list never waits on it and the
  // count survives a repo of thousands without re-fetching per page.
  const otherState = filters.state === "open" ? "closed" : "open";
  const countPath =
    repo && isConnected
      ? `/count${listQueryString(repo, { ...filters, state: otherState, page: 1 })}&kind=${kind}`
      : null;
  const otherCount = useForgeQuery<{ count: number | null }>(countPath).data?.count ?? null;
  const totalOpen = filters.state === "open" ? (list.data?.totalOpen ?? null) : otherCount;
  const totalClosed = filters.state === "closed" ? (list.data?.totalClosed ?? null) : otherCount;

  // Instant search: while a query is being typed, filter the unsearched
  // list (same filters, no q) locally and show that until GitHub's answer
  // for the committed query arrives. The base query is the same cache key
  // the list had before typing, so subscribing to it costs nothing extra.
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [repo]);
  const basePath =
    repo && isConnected && (draft.trim() || filters.q.trim())
      ? `/${resource}${listQueryString(repo, { ...filters, q: "", page: 1 })}`
      : null;
  const baseList = useForgeQuery<ListResponse>(basePath);
  const typing = draft.trim() !== "" && (draft.trim() !== filters.q.trim() || list.isStale);
  const items = useMemo(
    () => (typing ? filterLocally(baseList.data?.items ?? [], draft) : list.data?.items ?? []),
    [typing, baseList.data, draft, list.data]
  );
  const searching = typing && (draft.trim() !== filters.q.trim() || list.isStale);
  const hasMore = !typing && items.length >= LIST_PAGE_SIZE;

  const detailNumber = samePanel && repo && view.current.view === "detail" ? view.current.number : null;
  const openItem = (number: number) => (samePanel ? view.openDetail(number) : detailPanel.open(number));

  // Title for the breadcrumb: from the loaded list when the item is on the
  // current page, else from the detail read (the same query the detail view
  // runs, so the store serves one fetch to both).
  const crumbPath =
    repo && detailNumber !== null
      ? `/${kind}?repo=${encodeURIComponent(repo)}&number=${detailNumber}`
      : null;
  const crumbDetail = useForgeQuery<{ pull?: ForgeIssue; issue?: ForgeIssue }>(crumbPath).data;
  const crumbTitle =
    items.find((item) => item.number === detailNumber)?.title ??
    (crumbDetail?.pull ?? crumbDetail?.issue)?.title ??
    null;

  // Direction of the last navigation, so the incoming view slides in from
  // the side it conceptually comes from: deeper = from the right, back =
  // from the left, sibling item = a short rise. First paint just fades.
  const previousDetail = useRef<number | null>(detailNumber);
  const direction = useRef<EnterFrom>("fade");
  if (previousDetail.current !== detailNumber) {
    direction.current =
      detailNumber === null ? "left" : previousDetail.current === null ? "right" : "up";
    previousDetail.current = detailNumber;
  }
  const sidebarMode = detailNumber !== null ? "list" : "repos";
  const activeNumber = detailNumber ?? (samePanel ? null : detailPanel.selected);
  const noun = NOUN[kind];
  const DetailView = kind === "pull" ? PullDetailView : IssueDetailView;

  const clearAll = () =>
    setFilters({ q: "", author: null, assignee: null, milestone: null, labels: [], sort: "created" });
  const hasActiveFilters = filters.q.trim().length > 0 || activeFilterCount(filters) > 0;

  return (
    <Root>
      <TopBar>
        <ToolbarGroup $grow>
          <SidebarToggleSlot>
            <BareButton
              type="button"
              onClick={() => update({ sidebarOpen: !settings.sidebarOpen })}
              title={settings.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-label={settings.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-pressed={settings.sidebarOpen}
            >
              <Icon name={settings.sidebarOpen ? "PanelLeftClose" : "PanelLeft"} size={14} />
            </BareButton>
          </SidebarToggleSlot>
          {detailNumber !== null && (
            <EnterInline $from="pop">
              <BareButton type="button" onClick={view.back} title="Back to list" aria-label="Back to list">
                <Icon name="ArrowLeft" size={14} />
              </BareButton>
            </EnterInline>
          )}
          {isConnected && (
            /* The picker duplicates the repository sidebar, so it hides
               while that sidebar is open; it returns when the sidebar is
               closed, auto-hidden by width, or showing the item list. */
            <RepoCrumbSlot $hidden={settings.sidebarOpen && detailNumber === null}>
              <RepoPicker
                trigger={({ toggle, isOpen }) => (
                  <PickerButton type="button" onClick={toggle} $open={isOpen} $filled={repo !== null} title={repo ?? "Select repository"}>
                    <Icon name="Folder" size={12} />
                    <span>{repo ? displayName(repo) : "Select repository"}</span>
                    <Icon name="ChevronDown" size={12} />
                  </PickerButton>
                )}
              />
            </RepoCrumbSlot>
          )}
          {detailNumber !== null && (
            <EnterInline key={detailNumber} $from="right" $grow>
              <CrumbSeparator>/</CrumbSeparator>
              {/* Plain crumb while the sidebar list is visible; a picker
                  over the list when the sidebar is closed or auto-hidden. */}
              <CrumbSlot $when="sidebar-visible" $sidebarOpen={settings.sidebarOpen}>
                <Count>#{detailNumber}</Count>
                {crumbTitle && <CrumbTitle title={crumbTitle}>{crumbTitle}</CrumbTitle>}
              </CrumbSlot>
              <CrumbSlot $when="sidebar-hidden" $sidebarOpen={settings.sidebarOpen}>
                <ItemPicker
                  kind={kind}
                  items={items}
                  number={detailNumber}
                  title={crumbTitle}
                  hasMore={hasMore}
                  onSelect={view.openDetail}
                />
              </CrumbSlot>
            </EnterInline>
          )}
        </ToolbarGroup>
        {isConnected && repo && detailNumber === null && (
          <ToolbarGroup as={EnterRow} $from="fade" $grow $end>
            {/* Keyed by repo: a repo switch resets the filters, and the
                search draft must reset with it. */}
            <SearchField key={repo} filters={filters} setFilters={setFilters} onDraftChange={setDraft} />
            <FilterMenu filters={filters} setFilters={setFilters} />
            <CreateButton
              type="button"
              onClick={() => setComposerOpen(!composerOpen)}
              aria-pressed={composerOpen}
              title={`New ${noun.one}`}
              aria-label={`New ${noun.one}`}
            >
              <Icon name={composerOpen ? "X" : "Plus"} size={14} />
            </CreateButton>
          </ToolbarGroup>
        )}
      </TopBar>

      <Workspace>
        <Sidebar $open={settings.sidebarOpen} $width={liveWidth} $dragging={dragWidth !== null}>
          {/* Keyed by mode: the list slides in from the right as the
              detail opens, repositories come back from the left. */}
          <Enter key={sidebarMode} $from={direction.current} data-sidebar-content>
            {detailNumber !== null ? (
              <ListSidebar
                kind={kind}
                items={items}
                filters={filters}
                setFilters={setFilters}
                totalOpen={totalOpen}
                totalClosed={totalClosed}
                active={detailNumber}
                onSelect={view.openDetail}
                isLoading={list.isLoading}
                hasMore={hasMore}
                onDraftChange={setDraft}
              />
            ) : (
              <RepoSidebar />
            )}
          </Enter>
          {settings.sidebarOpen && (
            <SidebarResizer
              width={liveWidth}
              dragging={dragWidth !== null}
              onDragStart={() => setDragWidth(sidebarWidth)}
              onDrag={setDragWidth}
              onDragEnd={(px) => {
                setSidebarWidth(px);
                setDragWidth(null);
              }}
            />
          )}
        </Sidebar>

        <Main>
          <Enter key={detailNumber ?? "list"} $from={direction.current}>
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
          ) : !repo ? (
            <EmptyState
              icon="Folder"
              title="No repository selected"
              text={`Pick a repository checked out on this workspace, or any GitHub repository, to load its ${noun.many}.`}
              action={
                <RepoPicker
                  trigger={({ toggle }) => (
                    <Button type="button" $compact $variant="primary" onClick={toggle}>
                      Select repository
                    </Button>
                  )}
                />
              }
            />
          ) : detailNumber !== null ? (
            <DetailView
              repo={repo}
              number={detailNumber}
              headerActions={
                <BareButton
                  type="button"
                  onClick={() => detailPanel.open(detailNumber)}
                  title="Open in new panel"
                  aria-label="Open in new panel"
                >
                  <Icon name="PanelRight" size={12} />
                </BareButton>
              }
            />
          ) : (
            <>
              <FilterRow>
                <Segmented
                  value={filters.state}
                  onChange={(state) => setFilters({ state })}
                  options={[
                    {
                      value: "open",
                      label: (
                        <>
                          <SegmentIcon>
                            <ToneDot $color={STATE_COLORS.open} />
                          </SegmentIcon>
                          Open
                          {totalOpen !== null && <InlineCount>{totalOpen}</InlineCount>}
                        </>
                      ),
                    },
                    {
                      value: "closed",
                      label: (
                        <>
                          <SegmentIcon>
                            <ToneDot $color={STATE_COLORS.done} />
                          </SegmentIcon>
                          Closed
                          {totalClosed !== null && <InlineCount>{totalClosed}</InlineCount>}
                        </>
                      ),
                    },
                  ]}
                />
                <ActiveFilterChips filters={filters} setFilters={setFilters} />
                <Spacer />
                {searching && (
                  <SearchingHint role="status" aria-live="polite">
                    <SpinnerSmall />
                    <InlineCount>Searching GitHub</InlineCount>
                  </SearchingHint>
                )}
                <Pager page={filters.page} hasMore={hasMore} setPage={(page) => setFilters({ page })} />
              </FilterRow>

              {composerOpen && (
                <EnterBlock $from="down">
                  {kind === "pull" ? (
                    <PullComposer onClose={() => setComposerOpen(false)} onCreated={openItem} />
                  ) : (
                    <IssueComposer onClose={() => setComposerOpen(false)} />
                  )}
                </EnterBlock>
              )}

              {list.error && <ErrorBanner message={list.error} onRetry={refresh} />}

              {/* Keyed by state so Open ↔ Closed replays the row stagger. */}
              <Scroll key={`${filters.state}:${filters.page}`}>
                {list.isLoading && items.length === 0 ? (
                  <LoadingState label={`Loading ${noun.many}…`} />
                ) : items.length === 0 && !list.error ? (
                  <EmptyState
                    icon={noun.icon}
                    title={`No ${filters.state} ${noun.many}`}
                    text={
                      hasActiveFilters
                        ? `Nothing matches the current filters in ${repo}.`
                        : `${repo} has no ${filters.state} ${noun.many}.`
                    }
                    action={
                      hasActiveFilters ? (
                        <Button type="button" $compact $variant="secondary" onClick={clearAll}>
                          Clear filters
                        </Button>
                      ) : !composerOpen ? (
                        <Button type="button" $compact $variant="secondary" onClick={() => setComposerOpen(true)}>
                          New {noun.one}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ItemList
                    items={items}
                    activeNumber={activeNumber}
                    onOpen={openItem}
                    onOpenPanel={samePanel ? detailPanel.open : null}
                    activeLabels={filters.labels}
                    onToggleLabel={(name) => setFilters({ labels: toggleName(filters.labels, name) })}
                  />
                )}
              </Scroll>
            </>
          )}
          </Enter>
        </Main>
      </Workspace>
    </Root>
  );
}

export function PullsPanel() {
  return <ListPanel kind="pull" />;
}

export function IssuesPanel() {
  return <ListPanel kind="issue" />;
}

/**
 * Shows its content only when the sidebar is (or is not) actually visible,
 * accounting for both the user's toggle and the width breakpoint that
 * hides the sidebar regardless of the toggle.
 */
const CrumbSlot = styled.span<{ $when: "sidebar-visible" | "sidebar-hidden"; $sidebarOpen: boolean }>`
  display: ${({ $when, $sidebarOpen }) =>
    ($when === "sidebar-visible") === $sidebarOpen ? "inline-flex" : "none"};
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
  @container (max-width: ${SIDEBAR_BREAKPOINT}) {
    display: ${({ $when }) => ($when === "sidebar-hidden" ? "inline-flex" : "none")};
  }
`;

/** Hidden while the repository sidebar is open; the width breakpoint that
 *  hides the sidebar brings the picker back so a repo can always be picked. */
const RepoCrumbSlot = styled.span<{ $hidden: boolean }>`
  display: ${({ $hidden }) => ($hidden ? "none" : "inline-flex")};
  min-width: 0;
  flex: 0 1 auto;
  @container (max-width: ${SIDEBAR_BREAKPOINT}) {
    display: inline-flex;
  }
`;

const SearchingHint = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const SpinnerSmall = styled(Spinner)`
  width: 12px;
  height: 12px;
  border-width: 1.5px;
`;

/** The toggle only makes sense while the sidebar can be shown at all. */
const SidebarToggleSlot = styled.span`
  display: inline-flex;
  @container (max-width: ${SIDEBAR_BREAKPOINT}) {
    display: none;
  }
`;
