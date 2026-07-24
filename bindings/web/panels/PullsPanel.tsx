/**
 * Pull Requests Panel: PRs (GitHub) / MRs (GitLab) for the selected
 * repository, in the Git panel's layout: fixed filter toolbar on the
 * gray surface, then a scrolling flat list with draft/merged/closed
 * state icons. Rows open the in-app Pull Detail panel.
 */

import { Icon, IconButton } from "@soft-machine/sdk";
import {
  LIST_PAGE_SIZE,
  listQueryString,
  PROVIDER_LABELS,
  type ForgePull,
} from "../types";
import { useForge } from "../ForgeContext";
import { useForgeQuery, useVmRepoAutoDetect } from "../hooks";
import { FilterBar } from "./FilterBar";
import { PullComposer } from "./PullComposer";
import {
  Container,
  Content,
  Divider,
  Empty,
  EmptyHint,
  EmptyTitle,
  ErrorRow,
  ItemList,
} from "./shared";
import { PagerRow } from "./Pager";

/** Rendered by the panel header (right side): new PR + refresh. */
export function PullsHeaderActions() {
  const { isConnected, repo, isPrComposerOpen, setPrComposerOpen, refresh } =
    useForge();

  if (!isConnected) return null;

  return (
    <>
      <IconButton
        onClick={() => setPrComposerOpen(!isPrComposerOpen)}
        $active={isPrComposerOpen}
        disabled={!repo}
        title="New pull request"
        aria-label="New pull request"
      >
        <Icon name="Plus" size={12} />
      </IconButton>
      <IconButton onClick={refresh} title="Refresh" aria-label="Refresh">
        <Icon name="RefreshCw" size={12} />
      </IconButton>
    </>
  );
}

interface PullListResponse {
  items: ForgePull[];
  totalOpen: number;
  totalClosed: number;
}

export function PullsPanel() {
  const {
    provider,
    repo,
    isConnected,
    isConnectionPending,
    pullFilters,
    setPullFilters,
    isPrComposerOpen,
    setPrComposerOpen,
  } = useForge();
  // Same VM repo probe as the Issues panel; the context dedupes to one.
  useVmRepoAutoDetect();

  const path = repo ? `/pulls${listQueryString(repo, pullFilters)}` : null;
  const { data, isLoading, error } = useForgeQuery<PullListResponse>(path);

  if (isConnectionPending) {
    return (
      <Container>
        <Empty>
          <EmptyHint>Loading pull requests…</EmptyHint>
        </Empty>
      </Container>
    );
  }

  if (!isConnected) {
    return (
      <Container>
        <Empty>
          <EmptyTitle>Not connected</EmptyTitle>
          <EmptyHint>
            Add your {PROVIDER_LABELS[provider]} token in Settings →
            Integrations to load pull requests here.
          </EmptyHint>
        </Empty>
      </Container>
    );
  }

  if (!repo) {
    return (
      <Container>
        <Empty>
          <EmptyTitle>No repository selected</EmptyTitle>
          <EmptyHint>
            Pick a repository from the Forge toolbar to load its pull requests.
          </EmptyHint>
        </Empty>
      </Container>
    );
  }

  const items = data?.items ?? [];

  return (
    <Container>
      {isPrComposerOpen && (
        <PullComposer onClose={() => setPrComposerOpen(false)} />
      )}
      {/* Keyed like the Issues panel: repo switches reset the search draft. */}
      <FilterBar
        key={`${provider}:${repo}`}
        filters={pullFilters}
        setFilters={setPullFilters}
        totalOpen={data?.totalOpen ?? null}
        totalClosed={data?.totalClosed ?? null}
      />
      <Divider />
      <Content>
        {error ? (
          <ErrorRow>{error}</ErrorRow>
        ) : isLoading && items.length === 0 ? (
          <Empty>
            <EmptyHint>Loading pull requests…</EmptyHint>
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyTitle>No pull requests found</EmptyTitle>
            <EmptyHint>
              Nothing matches the current filters in {repo}.
            </EmptyHint>
          </Empty>
        ) : (
          <>
            <ItemList items={items} kind="pull" />
            <PagerRow
              page={pullFilters.page}
              hasMore={items.length >= LIST_PAGE_SIZE}
              setPage={(page) => setPullFilters({ page })}
            />
          </>
        )}
      </Content>
    </Container>
  );
}
