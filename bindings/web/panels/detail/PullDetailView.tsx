/**
 * Pull request detail: header block with the merge sentence and diffstat,
 * a segmented Conversation / Files / Reviews switcher, quiet actions (send
 * to agent, labels), the thread ending in the merge-status card, and the
 * pinned reply footer with close / reopen beside "Comment". Same skeleton
 * as IssueDetailView plus the tabs. Rendered inside the Pull Requests
 * panel (same-panel mode) or the Pull Detail panel.
 */

import { useState, type ReactNode } from "react";
import styled from "styled-components";
import { Button, Dropdown, DropdownItem, EDITOR_SPACING, Icon, t } from "@soft-machine/sdk";
import {
  checkDuration,
  type ForgeCheck,
  type ForgeComment,
  type ForgeCommit,
  type ForgePullDetail,
  type ForgePullFile,
  type ForgeReview,
} from "../../types";
import { pullAgentContext } from "../../agentContext";
import { useForge } from "../../ForgeContext";
import { useForgeMutation, useForgeQuery } from "../../hooks";
import {
  Block,
  Count,
  EmptyState,
  Enter,
  EnterBlock,
  ErrorBanner,
  GhostButton,
  LoadingState,
  Meta,
  MetaChip,
  RefChip,
  STATE_COLORS,
  Scroll,
  SegmentIcon,
  Segmented,
  InlineCount,
  SidebarRow,
  StateText,
  StateView,
  checkVisual,
  plural,
  relativeTime,
  reviewVisual,
} from "../../ui";
import { Additions, Deletions, FileDiffList } from "./FileDiffList";
import {
  ActionsRow,
  DetailHeader,
  EventIcon,
  LabelsAction,
  ReplyFooter,
  SendToAgentButton,
  Thread,
} from "./shared";
import type { DetailViewProps } from "./IssueDetailView";

const MERGE_METHODS = [
  { method: "merge", label: "Create a merge commit" },
  { method: "squash", label: "Squash and merge" },
  { method: "rebase", label: "Rebase and merge" },
] as const;

type Tab = "conversation" | "files" | "reviews";

// ── Merge status card ──────────────────────────────────────────────────────

function CheckRow({ check }: { check: ForgeCheck }) {
  const visual = checkVisual(check.status);
  const label = check.app ? `${check.app} / ${check.name}` : check.name;
  const body = (
    <>
      <EventIcon $color={visual.color}>
        <Icon name={visual.icon} size={12} />
      </EventIcon>
      <CheckName title={label}>{label}</CheckName>
      <CheckVerdict>
        {visual.label}
        {check.status === "success" || check.status === "failure"
          ? checkDuration(check.durationSeconds)
          : ""}
      </CheckVerdict>
    </>
  );
  return check.detailsUrl ? (
    <CheckRowLink href={check.detailsUrl} target="_blank" rel="noreferrer noopener">
      {body}
    </CheckRowLink>
  ) : (
    <CheckRowPlain>{body}</CheckRowPlain>
  );
}

function StatusLine({
  color,
  icon,
  title,
  sub,
}: {
  color: string;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  sub: string;
}) {
  return (
    <StatusRow>
      <StatusIcon $color={color}>
        <Icon name={icon} size={12} />
      </StatusIcon>
      <StatusText>
        <StatusTitle>{title}</StatusTitle>
        <StatusSub>{sub}</StatusSub>
      </StatusText>
    </StatusRow>
  );
}

function MergeStatusCard({
  pull,
  reviews,
  checks,
  canMerge,
  isPending,
  onMerge,
}: {
  pull: ForgePullDetail;
  reviews: ForgeReview[];
  checks: ForgeCheck[];
  canMerge: boolean;
  isPending: boolean;
  onMerge: (method: string) => void;
}) {
  const [checksExpanded, setChecksExpanded] = useState(false);
  const approvals = reviews.filter((r) => r.state === "APPROVED").length;
  const changesRequested = reviews.filter((r) => r.state === "CHANGES_REQUESTED").length;
  const failing = checks.filter((c) => c.status === "failure").length;
  const pending = checks.filter((c) => c.status === "pending").length;
  const skipped = checks.filter((c) => c.status === "skipped").length;
  const successful = checks.filter((c) => c.status === "success").length;

  if (pull.mergedAt !== null) {
    return (
      <StatusCard>
        <StatusLine
          color={STATE_COLORS.merged}
          icon="GitMerge"
          title="Pull request merged"
          sub={`Merged into ${pull.baseRef ?? "the base branch"}.`}
        />
      </StatusCard>
    );
  }

  if (pull.state === "closed") {
    return (
      <StatusCard>
        <StatusLine
          color={STATE_COLORS.closed}
          icon="X"
          title="Closed with unmerged commits"
          sub="Reopen from the comment box below."
        />
      </StatusCard>
    );
  }

  return (
    <StatusCard>
      {reviews.length > 0 && (
        <StatusLine
          color={
            changesRequested > 0
              ? STATE_COLORS.closed
              : approvals > 0
                ? STATE_COLORS.open
                : STATE_COLORS.muted
          }
          icon={changesRequested > 0 ? "X" : "Check"}
          title={
            changesRequested > 0
              ? "Changes requested"
              : approvals > 0
                ? plural("approval", approvals)
                : "Review pending"
          }
          sub={`${approvals} approved · ${changesRequested} requested changes`}
        />
      )}

      {pull.draft && (
        <StatusLine
          color={STATE_COLORS.muted}
          icon="Pencil"
          title="Still a work in progress"
          sub="Draft pull requests cannot be merged."
        />
      )}

      {checks.length > 0 && (
        <>
          <ChecksHeaderRow
            type="button"
            onClick={() => setChecksExpanded(!checksExpanded)}
            aria-expanded={checksExpanded}
          >
            <StatusIcon
              $color={
                failing > 0 ? STATE_COLORS.closed : pending > 0 ? STATE_COLORS.pending : STATE_COLORS.open
              }
            >
              <Icon name={failing > 0 ? "X" : pending > 0 ? "Clock" : "Check"} size={12} />
            </StatusIcon>
            <StatusText>
              <StatusTitle>
                {failing > 0
                  ? `${plural("failing check", failing)}`
                  : pending > 0
                    ? "Some checks haven't completed yet"
                    : "All checks have passed"}
              </StatusTitle>
              <StatusSub>
                {[
                  pending > 0 ? `${pending} pending` : null,
                  skipped > 0 ? `${skipped} skipped` : null,
                  `${successful} successful`,
                ]
                  .filter(Boolean)
                  .join(", ")}{" "}
                {checks.length === 1 ? "check" : "checks"}
              </StatusSub>
            </StatusText>
            <ChecksChevron $expanded={checksExpanded}>
              <Icon name="ChevronDown" size={12} />
            </ChecksChevron>
          </ChecksHeaderRow>
          {checksExpanded && (
            <EnterBlock $from="down">
              <CheckList>
                {checks.map((check) => (
                  <CheckRow key={`${check.app}/${check.name}`} check={check} />
                ))}
              </CheckList>
            </EnterBlock>
          )}
        </>
      )}

      <StatusLine
        color={
          pull.mergeable === true
            ? STATE_COLORS.open
            : pull.mergeable === false
              ? STATE_COLORS.closed
              : STATE_COLORS.muted
        }
        icon={pull.mergeable === true ? "Check" : pull.mergeable === false ? "AlertCircle" : "Clock"}
        title={
          pull.mergeable === true
            ? "No conflicts with base branch"
            : pull.mergeable === false
              ? "This branch has conflicts with the base branch"
              : "Checking mergeability…"
        }
        sub={
          pull.mergeable === true
            ? "Merging can be performed automatically."
            : pull.mergeable === false
              ? "Resolve the conflicts before merging."
              : (pull.mergeableState ?? "GitHub is still computing.")
        }
      />

      <MergeFooter>
        <Button
          type="button"
          $compact
          $variant="primary"
          onClick={() => onMerge("merge")}
          disabled={!canMerge || isPending}
          title={canMerge ? "Create a merge commit" : "Not mergeable in its current state"}
        >
          <Icon name="GitMerge" size={12} /> Merge pull request
        </Button>
        {/* Opens upward: the card sits near the bottom of the scroll area. */}
        <Dropdown
          align="start"
          direction="up"
          width={200}
          trigger={({ toggle, isOpen }) => (
            <MethodCaret
              type="button"
              onClick={toggle}
              $active={isOpen}
              disabled={!canMerge || isPending}
              aria-label="Merge method"
              title="Merge method"
            >
              <Icon name="ChevronUp" size={12} />
            </MethodCaret>
          )}
        >
          {({ close }) => (
            <>
              {MERGE_METHODS.map(({ method, label }) => (
                <DropdownItem
                  key={method}
                  onClick={() => {
                    onMerge(method);
                    close();
                  }}
                >
                  {label}
                </DropdownItem>
              ))}
            </>
          )}
        </Dropdown>
      </MergeFooter>
    </StatusCard>
  );
}

// ── The view ───────────────────────────────────────────────────────────────

export function PullDetailView({ repo, number, headerActions }: DetailViewProps) {
  const { provider, refresh } = useForge();
  const { mutate, isPending, error: writeError, clearError } = useForgeMutation();
  const [tab, setTab] = useState<Tab>("conversation");

  const target = `?repo=${encodeURIComponent(repo)}&number=${number}`;
  const detail = useForgeQuery<{ pull: ForgePullDetail }>(`/pull${target}`);
  const comments =
    useForgeQuery<{ comments: ForgeComment[] }>(`/comments${target}&type=pull`).data?.comments ?? [];
  const files = useForgeQuery<{ files: ForgePullFile[] }>(`/pull-files${target}`).data?.files ?? [];
  const reviews = useForgeQuery<{ reviews: ForgeReview[] }>(`/reviews${target}`).data?.reviews ?? [];
  const commits =
    useForgeQuery<{ commits: ForgeCommit[] }>(`/pull-commits${target}`).data?.commits ?? [];
  const checks = useForgeQuery<{ checks: ForgeCheck[] }>(`/checks${target}`).data?.checks ?? [];

  if (detail.error) {
    return (
      <Scroll>
        <ErrorBanner message={detail.error} onRetry={refresh} />
      </Scroll>
    );
  }

  const pull = detail.data?.pull;
  if (!pull) {
    return <LoadingState label={`Loading pull request #${number}…`} />;
  }

  const isMerged = pull.mergedAt !== null;
  const canMerge = pull.state === "open" && !pull.draft && pull.mergeable !== false;
  const now = Date.now();

  const merge = (method: string) => {
    void mutate("/merge", { repo, number: pull.number, method });
  };
  const setState = (state: "open" | "closed") => {
    void mutate("/pull-state", { repo, number: pull.number, state });
  };

  const total = pull.additions + pull.deletions;
  const greenBlocks = total === 0 ? 0 : Math.round((pull.additions / total) * 5);

  return (
    <>
      <DetailHeader
        item={pull}
        actions={headerActions}
        subtitle={
          <MergeSentence>
            <Meta>
              {pull.author?.login ?? "unknown"} wants to merge {plural("commit", pull.commits)} into
            </Meta>
            <RefChip title={pull.baseRef ?? undefined}>{pull.baseRef ?? "?"}</RefChip>
            <Meta>from</Meta>
            <RefChip title={pull.headRef ?? undefined}>{pull.headRef ?? "?"}</RefChip>
            <DiffStat title={`+${pull.additions} -${pull.deletions} across ${plural("file", pull.changedFiles)}`}>
              <Additions>+{pull.additions}</Additions>
              <Deletions>-{pull.deletions}</Deletions>
              <BlockMeter aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <MeterBlock key={i} $filled={i < greenBlocks} />
                ))}
              </BlockMeter>
            </DiffStat>
          </MergeSentence>
        }
      />

      <TabsRow>
        <Segmented<Tab>
          tabs
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "conversation",
              title: "Conversation",
              label: (
                <>
                  <SegmentIcon>
                    <Icon name="MessageSquare" size={12} />
                  </SegmentIcon>
                  <TabLabel>Conversation</TabLabel>
                  {comments.length > 0 && <InlineCount>{comments.length}</InlineCount>}
                </>
              ),
            },
            {
              value: "files",
              title: "Files changed",
              label: (
                <>
                  <SegmentIcon>
                    <Icon name="FileText" size={12} />
                  </SegmentIcon>
                  <TabLabel>Files</TabLabel>
                  {files.length > 0 && <InlineCount>{files.length}</InlineCount>}
                </>
              ),
            },
            {
              value: "reviews",
              title: "Reviews",
              label: (
                <>
                  <SegmentIcon>
                    <Icon name="Eye" size={12} />
                  </SegmentIcon>
                  <TabLabel>Reviews</TabLabel>
                  {reviews.length > 0 && <InlineCount>{reviews.length}</InlineCount>}
                </>
              ),
            },
          ]}
        />
      </TabsRow>

      {/* Keyed by tab: the incoming pane rises in briefly. */}
      <Scroll as={Enter} key={tab} $from="up">
        {tab === "conversation" && (
          <>
            <ActionsRow>
              <SendToAgentButton
                chipLabel={`${repo}#${pull.number}`}
                buildContext={() => pullAgentContext(provider, repo, pull, comments, files, reviews)}
              />
              <LabelsAction
                repo={repo}
                item={pull}
                disabled={isPending}
                onToggle={(labels) => void mutate("/labels", { repo, number: pull.number, labels })}
              />
            </ActionsRow>
            {writeError && <ErrorBanner message={writeError} onRetry={clearError} />}
            <Thread
              item={pull}
              comments={comments}
              commits={commits}
              reviews={reviews}
              trailing={
                <MergeStatusCard
                  pull={pull}
                  reviews={reviews}
                  checks={checks}
                  canMerge={canMerge}
                  isPending={isPending}
                  onMerge={merge}
                />
              }
            />
          </>
        )}

        {tab === "files" &&
          (files.length > 0 ? (
            <TabBlock>
              <FileDiffList files={files} />
            </TabBlock>
          ) : (
            <StateView>
              <StateText>No changed files reported.</StateText>
            </StateView>
          ))}

        {tab === "reviews" &&
          (reviews.length > 0 ? (
            <>
              <ReviewList>
                {reviews.map((review) => {
                  const visual = reviewVisual(review.state);
                  return (
                    <ReviewRow key={review.id}>
                      <EventIcon $color={visual.color}>
                        <Icon name={visual.icon} size={12} />
                      </EventIcon>
                      <span className="label">{review.author?.login ?? "unknown"}</span>
                      <MetaChip
                        $tone={
                          review.state === "APPROVED"
                            ? "success"
                            : review.state === "CHANGES_REQUESTED"
                              ? "danger"
                              : "muted"
                        }
                      >
                        {visual.label}
                      </MetaChip>
                      <Meta>{relativeTime(review.submittedAt, now)}</Meta>
                    </ReviewRow>
                  );
                })}
              </ReviewList>
            </>
          ) : (
            <StateView>
              <StateText>No reviews yet.</StateText>
            </StateView>
          ))}
      </Scroll>

      {tab === "conversation" && (
        <ReplyFooter
          repo={repo}
          number={pull.number}
          type="pull"
          disabled={isPending}
          stateAction={
            pull.state === "open" ? (
              <GhostButton type="button" onClick={() => setState("closed")} disabled={isPending}>
                Close pull request
              </GhostButton>
            ) : !isMerged ? (
              <GhostButton type="button" onClick={() => setState("open")} disabled={isPending}>
                <Icon name="RotateCcw" size={12} /> Reopen
              </GhostButton>
            ) : undefined
          }
        />
      )}
    </>
  );
}

/** Shown by the standalone Pull Detail panel when nothing is selected. */
export function NoPullSelected({ action }: { action?: ReactNode }) {
  return (
    <EmptyState
      icon="GitPullRequest"
      title="No pull request selected"
      text="Pick a pull request in the Pull Requests panel to read it here."
      action={action}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const MergeSentence = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
`;

const DiffStat = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  flex-shrink: 0;
`;

const BlockMeter = styled.span`
  display: inline-flex;
  gap: 1px;
  align-items: center;
`;

const MeterBlock = styled.span<{ $filled: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: ${({ $filled }) => ($filled ? STATE_COLORS.open : STATE_COLORS.closed)};
  opacity: 0.85;
`;

/* Same vertical rhythm as the list panel's filter row: 8px above the
   strip, 2px below, then the actions row's own 6px. */
const TabsRow = styled.div`
  container-type: inline-size;
  display: flex;
  align-items: center;
  padding: 8px ${EDITOR_SPACING.containerPadding} 2px;
  min-width: 0;
`;

const TabLabel = styled.span`
  white-space: nowrap;
  @container (max-width: 340px) {
    display: none;
  }
`;

/* Tab panes start 8px under the tab strip; the tab already names and
   counts the content, so there is no section heading. */
const TabBlock = styled(Block)`
  padding-top: 8px;
`;

const ReviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 6px 12px;
`;

/** Review rows are informational: same geometry as a list row, no pointer. */
const ReviewRow = styled(SidebarRow)`
  cursor: default;
  &:hover {
    background: transparent;
  }
`;

// Merge status card

const StatusCard = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
`;

const StatusRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  min-width: 0;
  & + & {
    border-top: ${t.borderWidth} solid ${t.border};
  }
`;

const StatusIcon = styled.span<{ $color: string }>`
  display: inline-grid;
  place-items: center;
  color: ${({ $color }) => $color};
  flex-shrink: 0;
  padding-top: 2px;
`;

const StatusText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const StatusTitle = styled.span`
  font-size: ${t.typography.sm};
  color: ${t.text.primary};
`;

const StatusSub = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  overflow-wrap: anywhere;
`;

const ChecksHeaderRow = styled.button`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  min-width: 0;
  width: 100%;
  background: transparent;
  border: none;
  border-top: ${t.borderWidth} solid ${t.border};
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:first-child {
    border-top: none;
  }
  &:hover {
    background: ${t.bg.secondary};
  }
`;

const ChecksChevron = styled.span<{ $expanded: boolean }>`
  display: inline-grid;
  place-items: center;
  color: ${t.text.muted};
  margin-left: auto;
  flex-shrink: 0;
  transform: rotate(${({ $expanded }) => ($expanded ? 180 : 0)}deg);
  transition: transform 0.15s ease;
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  max-height: 220px;
  overflow-y: auto;
`;

const checkRowCss = `
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 18px;
  min-width: 0;
  font-size: ${t.typography.micro};
  color: ${t.text.secondary};
  text-decoration: none;
`;

const CheckRowLink = styled.a`
  ${checkRowCss}
  &:hover {
    background: ${t.bg.tertiary};
    color: ${t.text.primary};
  }
`;

const CheckRowPlain = styled.div`
  ${checkRowCss}
`;

const CheckName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const CheckVerdict = styled.span`
  margin-left: auto;
  color: ${t.text.muted};
  white-space: nowrap;
  flex-shrink: 0;
`;

const MergeFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  border-radius: 0 0 calc(${t.radius} * 1.25) calc(${t.radius} * 1.25);
`;

/** Bordered caret beside the merge button, same height as the compact button. */
const MethodCaret = styled(GhostButton)`
  padding: 0 4px;
  border: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.tertiary};
  &:hover:not(:disabled) {
    background: ${t.bg.elevated};
  }
`;
