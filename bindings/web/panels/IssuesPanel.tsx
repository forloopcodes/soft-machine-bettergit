/**
 * Issues Panel: GitHub / GitLab issues for the selected repository, in
 * the Git panel's layout: fixed filter toolbar on the gray surface, then
 * a scrolling flat list. The header "+" opens the inline new-issue
 * composer; rows open the in-app Issue Detail panel.
 */

import { Icon, IconButton } from "@soft-machine/sdk";
import {
  LIST_PAGE_SIZE,
  listQueryString,
  PROVIDER_LABELS,
  type ForgeIssue,
} from "../types";
import { useForge } from "../ForgeContext";
import { useForgeQuery, useVmRepoAutoDetect } from "../hooks";
import { FilterBar } from "./FilterBar";
import { IssueComposer } from "./IssueComposer";
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

/** Rendered by the panel header (right side): new issue + refresh. */
export function IssuesHeaderActions() {
  const { isConnected, repo, isComposerOpen, setComposerOpen, refresh } =
    useForge();

  if (!isConnected) return null;

  return (
    <>
      <IconButton
        onClick={() => setComposerOpen(!isComposerOpen)}
        $active={isComposerOpen}
        disabled={!repo}
        title="New issue"
        aria-label="New issue"
      >
        <Icon name="Plus" size={12} />
      </IconButton>
      <IconButton onClick={refresh} title="Refresh" aria-label="Refresh">
        <Icon name="RefreshCw" size={12} />
      </IconButton>
    </>
  );
}

interface IssueListResponse {
  items: ForgeIssue[];
  totalOpen: number;
  totalClosed: number;
}

export function IssuesPanel() {
  const {
    provider,
    repo,
    isConnected,
    isConnectionPending,
    issueFilters,
    setIssueFilters,
    isComposerOpen,
  } = useForge();
  // Panels sit below OSCapabilitiesProvider, so the VM repo probe runs
  // here rather than in the provider (which mounts above it).
  useVmRepoAutoDetect();

  const path = repo ? `/issues${listQueryString(repo, issueFilters)}` : null;
  const { data, isLoading, error } = useForgeQuery<IssueListResponse>(path);

  if (isConnectionPending) {
    return (
      <Container>
        <Empty>
          <EmptyHint>Loading issues…</EmptyHint>
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
            Integrations to load issues here.
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
            Pick a repository from the Forge toolbar to load its issues.
          </EmptyHint>
        </Empty>
      </Container>
    );
  }

  const items = data?.items ?? [];

  // Once connected, the composer stays mounted across every sub-state:
  // loading flips and transient errors must not unmount it and eat the
  // user's draft.
  return (
    <Container>
      {isComposerOpen && <IssueComposer />}
      {/* Keyed by provider+repo: a repo switch resets the filter set, and
          the search draft must reset with it (a lingering draft would
          re-apply the old query to the new repo via the debounce). */}
      <FilterBar
        key={`${provider}:${repo}`}
        filters={issueFilters}
        setFilters={setIssueFilters}
        totalOpen={data?.totalOpen ?? null}
        totalClosed={data?.totalClosed ?? null}
      />
      <Divider />
      <Content>
        {error ? (
          <ErrorRow>{error}</ErrorRow>
        ) : isLoading && items.length === 0 ? (
          <Empty>
            <EmptyHint>Loading issues…</EmptyHint>
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyTitle>No issues found</EmptyTitle>
            <EmptyHint>
              Nothing matches the current filters in {repo}.
            </EmptyHint>
          </Empty>
        ) : (
          <>
            <ItemList items={items} kind="issue" />
            <PagerRow
              page={issueFilters.page}
              hasMore={items.length >= LIST_PAGE_SIZE}
              setPage={(page) => setIssueFilters({ page })}
            />
          </>
        )}
      </Content>
    </Container>
  );
}
