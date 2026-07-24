/**
 * Pull Detail Panel, Git-panel styled: gray surface, bordered header
 * block with branch RefChips and diffstat, quiet action row (merge with
 * method picker, close/reopen, send-to-agent), and uppercase collapsible
 * sections for reviews, changed files, description, and comments.
 */

import { useState } from "react";
import styled from "styled-components";
import {
  ANIMATION,
  Dropdown,
  DropdownItem,
  EDITOR_SPACING,
  Icon,
  t,
} from "@soft-machine/sdk";
import {
  checkDuration,
  type ForgeCheck,
  type ForgeComment,
  type ForgeCommit,
  type ForgeProvider,
  type ForgePullDetail,
  type ForgePullFile,
  type ForgeReview,
} from "../types";
import { pullAgentContext } from "../agentContext";
import { useForge } from "../ForgeContext";
import { useForgeMutation, useForgeQuery } from "../hooks";
import { FileDiffList } from "./FileDiffList";
import {
  AccentButton,
  Container,
  Content,
  Empty,
  EmptyHint,
  EmptyTitle,
  ErrorRow,
  MetaText,
  RefChip,
  Section,
  STATE_COLORS,
} from "./shared";
import {
  ActionsRow,
  CommentsSection,
  DetailHeader,
  DetailHeaderArea,
  InlineError,
  MetaMicro,
  QuietActionButton,
  SectionBody,
  SendToAgentButton,
} from "./detailShared";

const MERGE_METHODS = [
  { method: "merge", label: "Create a merge commit" },
  { method: "squash", label: "Squash and merge" },
  // GitLab's merge endpoint has no rebase mode (the proxy refuses it),
  // so this option is GitHub-only.
  { method: "rebase", label: "Rebase and merge", githubOnly: true },
] as const;

/**
 * github.com's merge-status box, panel-sized: stacked status rows
 * (reviews, draft, conflicts) with a merge split-button footer for open
 * PRs, or a single merged/closed verdict row otherwise. Rendered between
 * the thread and the comment composer, exactly where github.com puts it.
 */
/** github.com's per-check row: status icon, name, verdict + duration. */
function CheckRow({ check }: { check: ForgeCheck }) {
  const visual =
    check.status === "success"
      ? {
          icon: "Check" as const,
          color: STATE_COLORS.open,
          verdict: "Successful",
        }
      : check.status === "failure"
        ? {
            icon: "X" as const,
            color: STATE_COLORS.closed,
            verdict: "Failed",
          }
        : check.status === "skipped"
          ? {
              icon: "Minus" as const,
              color: STATE_COLORS.muted,
              verdict: "Skipped",
            }
          : check.status === "neutral"
            ? {
                icon: "Circle" as const,
                color: STATE_COLORS.muted,
                verdict: "Neutral",
              }
            : {
                icon: "Clock" as const,
                color: "#f59e0b",
                verdict: "In progress",
              };

  const label = check.app ? `${check.app} / ${check.name}` : check.name;
  const body = (
    <>
      <EventIcon $color={visual.color}>
        <Icon name={visual.icon} size={11} />
      </EventIcon>
      <CheckName title={label}>{label}</CheckName>
      <CheckVerdict>
        {visual.verdict}
        {check.status === "success" || check.status === "failure"
          ? checkDuration(check.durationSeconds)
          : ""}
      </CheckVerdict>
    </>
  );

  return check.detailsUrl ? (
    <CheckRowLink
      href={check.detailsUrl}
      target="_blank"
      rel="noreferrer noopener"
    >
      {body}
    </CheckRowLink>
  ) : (
    <CheckRowPlain>{body}</CheckRowPlain>
  );
}

function MergeStatusBox({
  provider,
  pull,
  reviews,
  checks,
  canMerge,
  isPending,
  onMerge,
}: {
  provider: ForgeProvider;
  pull: ForgePullDetail;
  reviews: ForgeReview[];
  checks: ForgeCheck[];
  canMerge: boolean;
  isPending: boolean;
  onMerge: (method: string) => void;
}) {
  const [checksExpanded, setChecksExpanded] = useState(false);
  const approvals = reviews.filter((r) => r.state === "APPROVED").length;
  const changesRequested = reviews.filter(
    (r) => r.state === "CHANGES_REQUESTED"
  ).length;

  const failing = checks.filter((c) => c.status === "failure").length;
  const pending = checks.filter((c) => c.status === "pending").length;
  const skipped = checks.filter((c) => c.status === "skipped").length;
  const successful = checks.filter((c) => c.status === "success").length;

  if (pull.mergedAt !== null) {
    return (
      <StatusBox>
        <StatusRow>
          <StatusIcon $color={STATE_COLORS.merged}>
            <Icon name="GitMerge" size={13} />
          </StatusIcon>
          <StatusText>
            <StatusTitle>Pull request merged</StatusTitle>
            <StatusSub>
              Merged into {pull.baseRef ?? "the base branch"}.
            </StatusSub>
          </StatusText>
        </StatusRow>
      </StatusBox>
    );
  }

  if (pull.state === "closed") {
    return (
      <StatusBox>
        <StatusRow>
          <StatusIcon $color={STATE_COLORS.closed}>
            <Icon name="X" size={13} />
          </StatusIcon>
          <StatusText>
            <StatusTitle>Closed with unmerged commits</StatusTitle>
            <StatusSub>Reopen from the comment box below.</StatusSub>
          </StatusText>
        </StatusRow>
      </StatusBox>
    );
  }

  return (
    <StatusBox>
      {reviews.length > 0 && (
        <StatusRow>
          <StatusIcon
            $color={
              changesRequested > 0
                ? STATE_COLORS.closed
                : approvals > 0
                  ? STATE_COLORS.open
                  : STATE_COLORS.muted
            }
          >
            <Icon name={changesRequested > 0 ? "X" : "Check"} size={13} />
          </StatusIcon>
          <StatusText>
            <StatusTitle>
              {changesRequested > 0
                ? "Changes requested"
                : approvals > 0
                  ? `${approvals} approval${approvals === 1 ? "" : "s"}`
                  : "Review pending"}
            </StatusTitle>
            <StatusSub>
              {approvals} approved · {changesRequested} requested changes
            </StatusSub>
          </StatusText>
        </StatusRow>
      )}

      {pull.draft && (
        <StatusRow>
          <StatusIcon $color={STATE_COLORS.muted}>
            <Icon name="Pencil" size={13} />
          </StatusIcon>
          <StatusText>
            <StatusTitle>Still a work in progress</StatusTitle>
            <StatusSub>Draft pull requests cannot be merged.</StatusSub>
          </StatusText>
        </StatusRow>
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
                failing > 0
                  ? STATE_COLORS.closed
                  : pending > 0
                    ? "#f59e0b"
                    : STATE_COLORS.open
              }
            >
              <Icon
                name={failing > 0 ? "X" : pending > 0 ? "Clock" : "Check"}
                size={13}
              />
            </StatusIcon>
            <StatusText>
              <StatusTitle>
                {failing > 0
                  ? `${failing} failing check${failing === 1 ? "" : "s"}`
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
                check{checks.length === 1 ? "" : "s"}
              </StatusSub>
            </StatusText>
            <ChecksChevron $expanded={checksExpanded}>
              <Icon name="ChevronDown" size={11} />
            </ChecksChevron>
          </ChecksHeaderRow>
          {checksExpanded && (
            <CheckList>
              {checks.map((check) => (
                <CheckRow key={`${check.app}/${check.name}`} check={check} />
              ))}
            </CheckList>
          )}
        </>
      )}

      <StatusRow>
        <StatusIcon
          $color={
            pull.mergeable === true
              ? STATE_COLORS.open
              : pull.mergeable === false
                ? STATE_COLORS.closed
                : STATE_COLORS.muted
          }
        >
          <Icon
            name={
              pull.mergeable === true
                ? "Check"
                : pull.mergeable === false
                  ? "AlertCircle"
                  : "Clock"
            }
            size={13}
          />
        </StatusIcon>
        <StatusText>
          <StatusTitle>
            {pull.mergeable === true
              ? "No conflicts with base branch"
              : pull.mergeable === false
                ? "This branch has conflicts with the base branch"
                : "Checking mergeability…"}
          </StatusTitle>
          <StatusSub>
            {pull.mergeable === true
              ? "Merging can be performed automatically."
              : pull.mergeable === false
                ? "Resolve the conflicts before merging."
                : (pull.mergeableState ?? "The provider is still computing.")}
          </StatusSub>
        </StatusText>
      </StatusRow>

      <MergeFooter>
        <MergeButton
          type="button"
          onClick={() => onMerge("merge")}
          disabled={!canMerge || isPending}
          title={
            canMerge
              ? "Create a merge commit"
              : "Not mergeable in its current state"
          }
        >
          <Icon name="GitMerge" size={11} /> Merge pull request
        </MergeButton>
        {/* Opens upward: the box sits at the bottom of a scroll container,
            so a downward panel would be clipped by the content edge. */}
        <Dropdown
          align="start"
          direction="up"
          width={200}
          trigger={({ toggle }) => (
            <MergeCaret
              type="button"
              onClick={toggle}
              disabled={!canMerge || isPending}
              aria-label="Merge method"
            >
              {/* Up arrow: the method menu opens upward. Sized to the sm
                  text line box so the caret matches the merge button's
                  height (the anchor wrapper blocks flex stretch). */}
              <Icon name="ChevronUp" size={16} />
            </MergeCaret>
          )}
        >
          {({ close }) => (
            <>
              {MERGE_METHODS.filter(
                (m) => provider === "github" || !("githubOnly" in m)
              ).map(({ method, label }) => (
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
    </StatusBox>
  );
}

export function PullDetailPanel() {
  const { provider, repo, selectedPull, isConnected } = useForge();
  const { mutate, isPending, error: writeError } = useForgeMutation();
  const [tab, setTab] = useState<"conversation" | "files" | "reviews">(
    "conversation"
  );

  const target =
    repo && selectedPull
      ? `?repo=${encodeURIComponent(repo)}&number=${selectedPull}`
      : null;
  const detail = useForgeQuery<{ pull: ForgePullDetail }>(
    target && `/pull${target}`
  );
  const comments =
    useForgeQuery<{ comments: ForgeComment[] }>(
      target && `/comments${target}&type=pull`
    ).data?.comments ?? [];
  const files =
    useForgeQuery<{ files: ForgePullFile[] }>(target && `/pull-files${target}`)
      .data?.files ?? [];
  const reviews =
    useForgeQuery<{ reviews: ForgeReview[] }>(target && `/reviews${target}`)
      .data?.reviews ?? [];
  const commits =
    useForgeQuery<{ commits: ForgeCommit[] }>(
      target && `/pull-commits${target}`
    ).data?.commits ?? [];
  const checks =
    useForgeQuery<{ checks: ForgeCheck[] }>(target && `/checks${target}`).data
      ?.checks ?? [];

  if (!isConnected || !repo || !selectedPull) {
    return (
      <Container>
        <Empty>
          <EmptyTitle>No pull request selected</EmptyTitle>
          <EmptyHint>
            Click a pull request in the Pull Requests panel to inspect it here.
          </EmptyHint>
        </Empty>
      </Container>
    );
  }

  if (detail.error) {
    return (
      <Container>
        <ErrorRow>{detail.error}</ErrorRow>
      </Container>
    );
  }

  const pull = detail.data?.pull;
  if (!pull) {
    return (
      <Container>
        <Empty>
          <EmptyHint>Loading pull request #{selectedPull}…</EmptyHint>
        </Empty>
      </Container>
    );
  }

  const isMerged = pull.mergedAt !== null;
  const canMerge =
    pull.state === "open" && !pull.draft && pull.mergeable !== false;

  const merge = (method: string) => {
    void mutate("/merge", { repo, number: pull.number, method });
  };

  const setState = (state: "open" | "closed") => {
    void mutate("/pull-state", { repo, number: pull.number, state });
  };

  const total = pull.additions + pull.deletions;
  const greenBlocks =
    total === 0 ? 0 : Math.round((pull.additions / total) * 5);

  return (
    <Container>
      <DetailHeaderArea>
        <DetailHeader
          item={pull}
          subtitle={
            // github.com's merge sentence: "author wants to merge N
            // commits into base from head", with the diffstat meter.
            <MergeSentence>
              <MetaText>
                {pull.author?.login ?? "unknown"} wants to merge {pull.commits}{" "}
                commit{pull.commits === 1 ? "" : "s"} into
              </MetaText>
              <RefChip title={pull.baseRef ?? undefined}>
                {pull.baseRef ?? "?"}
              </RefChip>
              <MetaText>from</MetaText>
              <RefChip title={pull.headRef ?? undefined}>
                {pull.headRef ?? "?"}
              </RefChip>
              <DiffStat
                title={`+${pull.additions} -${pull.deletions} across ${pull.changedFiles} files`}
              >
                <Additions>+{pull.additions}</Additions>
                <Deletions>-{pull.deletions}</Deletions>
                <BlockMeter aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Block key={i} $filled={i < greenBlocks} />
                  ))}
                </BlockMeter>
              </DiffStat>
            </MergeSentence>
          }
        />
      </DetailHeaderArea>

      {/* github.com's PR tabs, panel-sized: Conversation / Files / Reviews.
          In narrow panels the labels drop and the tabs become icon+count
          (container query on the strip). */}
      <TabStripWrap>
        <TabStrip>
          <Tab
            type="button"
            $active={tab === "conversation"}
            onClick={() => setTab("conversation")}
            title="Conversation"
          >
            <Icon name="MessageSquare" size={11} />
            <TabLabel>Conversation</TabLabel>
            {comments.length > 0 && <TabCount>{comments.length}</TabCount>}
          </Tab>
          <Tab
            type="button"
            $active={tab === "files"}
            onClick={() => setTab("files")}
            title="Files changed"
          >
            <Icon name="FileText" size={11} />
            <TabLabel>Files changed</TabLabel>
            {files.length > 0 && <TabCount>{files.length}</TabCount>}
          </Tab>
          <Tab
            type="button"
            $active={tab === "reviews"}
            onClick={() => setTab("reviews")}
            title="Reviews"
          >
            <Icon name="Eye" size={11} />
            <TabLabel>Reviews</TabLabel>
            {reviews.length > 0 && <TabCount>{reviews.length}</TabCount>}
          </Tab>
        </TabStrip>
      </TabStripWrap>

      <Content>
        <ActionsRow>
          <SendToAgentButton
            chipLabel={`${repo}#${pull.number}`}
            buildContext={() =>
              pullAgentContext(provider, repo, pull, comments, files, reviews)
            }
          />
        </ActionsRow>
        {writeError && (
          <ErrorNote>
            <InlineError>{writeError}</InlineError>
          </ErrorNote>
        )}

        {tab === "conversation" && (
          <>
            <CommentsSection
              comments={comments}
              repo={repo}
              number={pull.number}
              type="pull"
              disabled={isPending}
              item={pull}
              itemAuthor={pull.author?.login ?? null}
              // Commits and review verdicts thread into the conversation
              // by date, like github.com's timeline.
              events={[
                ...commits.map((commit) => ({
                  id: `commit-${commit.sha}`,
                  createdAt: commit.createdAt,
                  node: (
                    <>
                      <Icon name="GitBranch" size={10} />
                      <EventText title={commit.title}>
                        {commit.author?.login ?? "unknown"} pushed{" "}
                        {commit.title}
                      </EventText>
                      {commit.webUrl ? (
                        <ShaLink
                          href={commit.webUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {commit.sha.slice(0, 7)}
                        </ShaLink>
                      ) : (
                        <ShaText>{commit.sha.slice(0, 7)}</ShaText>
                      )}
                    </>
                  ),
                })),
                ...reviews
                  .filter((review) => review.submittedAt !== null)
                  .map((review) => ({
                    id: `review-${review.id}`,
                    createdAt: review.submittedAt,
                    node: (
                      <>
                        <EventIcon
                          $color={
                            review.state === "APPROVED"
                              ? STATE_COLORS.open
                              : review.state === "CHANGES_REQUESTED"
                                ? STATE_COLORS.closed
                                : STATE_COLORS.muted
                          }
                        >
                          <Icon
                            name={
                              review.state === "CHANGES_REQUESTED"
                                ? "X"
                                : review.state === "APPROVED"
                                  ? "Check"
                                  : "Eye"
                            }
                            size={10}
                          />
                        </EventIcon>
                        <EventText>
                          {review.author?.login ?? "unknown"}{" "}
                          {review.state === "APPROVED"
                            ? "approved these changes"
                            : review.state === "CHANGES_REQUESTED"
                              ? "requested changes"
                              : "reviewed"}
                        </EventText>
                      </>
                    ),
                  })),
              ]}
              beforeComposer={
                <MergeStatusBox
                  provider={provider}
                  pull={pull}
                  reviews={reviews}
                  checks={checks}
                  canMerge={canMerge}
                  isPending={isPending}
                  onMerge={merge}
                />
              }
              trailingActions={
                pull.state === "open" ? (
                  <QuietActionButton
                    type="button"
                    onClick={() => setState("closed")}
                    disabled={isPending}
                  >
                    Close pull request
                  </QuietActionButton>
                ) : !isMerged ? (
                  <QuietActionButton
                    type="button"
                    onClick={() => setState("open")}
                    disabled={isPending}
                  >
                    <Icon name="RotateCcw" size={11} /> Reopen
                  </QuietActionButton>
                ) : undefined
              }
            />
          </>
        )}

        {tab === "files" &&
          (files.length > 0 ? (
            <Section title="Changed files" count={files.length}>
              <SectionBody>
                <FileDiffList files={files} />
              </SectionBody>
            </Section>
          ) : (
            <Empty>
              <EmptyHint>No changed files reported.</EmptyHint>
            </Empty>
          ))}

        {tab === "reviews" &&
          (reviews.length > 0 ? (
            <Section title="Reviews" count={reviews.length}>
              <SectionBody>
                {reviews.map((review) => (
                  <ReviewRow key={review.id}>
                    <ReviewState $state={review.state}>
                      {review.state}
                    </ReviewState>
                    <ReviewAuthor>
                      {review.author?.login ?? "unknown"}
                    </ReviewAuthor>
                  </ReviewRow>
                ))}
              </SectionBody>
            </Section>
          ) : (
            <Empty>
              <EmptyHint>No reviews yet.</EmptyHint>
            </Empty>
          ))}
      </Content>
    </Container>
  );
}

const ErrorNote = styled.div`
  padding: 0 ${EDITOR_SPACING.containerPadding} 4px;
`;

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

// line-height 1 tightens the text boxes so flex centering lines the
// numbers up with the block meter instead of floating above it.
const Additions = styled.span`
  color: ${STATE_COLORS.open};
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
  line-height: 1;
`;

const Deletions = styled.span`
  color: ${STATE_COLORS.closed};
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
  line-height: 1;
`;

// ── Merge status box (github.com's merge area, capsule treatment) ─────────

// No overflow: hidden here — it would clip the merge-method dropdown
// panel; the footer rounds its own bottom corners instead.
const StatusBox = styled.div`
  display: flex;
  flex-direction: column;
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
  display: inline-flex;
  align-items: center;
  color: ${(p) => p.$color};
  flex-shrink: 0;
  padding-top: 1px;
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

// ── Checks (github.com's expandable checks section) ────────────────────────

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
  font-family: inherit;
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
  display: inline-flex;
  align-items: center;
  color: ${t.text.muted};
  margin-left: auto;
  flex-shrink: 0;
  transform: rotate(${(p) => (p.$expanded ? 180 : 0)}deg);
  transition: transform ${ANIMATION.fast};
`;

const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  max-height: 220px;
  overflow-y: auto;
`;

const checkRowStyles = `
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
  ${checkRowStyles}

  &:hover {
    background: ${t.bg.elevated};
    color: ${t.text.primary};
  }
`;

const CheckRowPlain = styled.div`
  ${checkRowStyles}
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
  align-items: stretch;
  gap: 4px;
  padding: 8px 10px;
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  border-radius: 0 0 calc(${t.radius} * 1.25) calc(${t.radius} * 1.25);
`;

// Standalone method-picker button beside the merge button (two separate
// buttons, not a fused split control). The SDK Dropdown wraps its
// trigger in an align-self: center anchor, so stretch can't reach here —
// the height is matched explicitly: the merge button's compact vertical
// padding (6px) plus a 16px icon that equals the sm-text line box, so
// the icon-only and text buttons come out the same height. The
// box-shadow ring (not a border) shares the SDK secondary variant's
// geometry so the edges line up.
const MergeCaret = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  margin-left: 4px;
  background: ${t.bg.tertiary};
  border: none;
  border-radius: ${t.radius};
  box-shadow: 0 0 0 1px ${t.border};
  color: ${t.text.secondary};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${t.bg.elevated};
    color: ${t.text.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

// Merge is the one emphatic action on the panel; the shared accent
// treatment (also Create issue / Create pull request) covers it.
const MergeButton = AccentButton;

const ReviewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const ReviewState = styled.span<{ $state: string }>`
  font-size: ${t.typography.micro};
  line-height: 15px;
  padding: 0 4px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  flex-shrink: 0;
  color: ${(p) =>
    p.$state === "APPROVED"
      ? STATE_COLORS.open
      : p.$state === "CHANGES_REQUESTED"
        ? STATE_COLORS.closed
        : t.text.muted};
`;

const ReviewAuthor = styled(MetaMicro)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// ── Timeline event pieces (commit pushes, review verdicts) ─────────────────

const EventText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const EventIcon = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  color: ${(p) => p.$color};
  flex-shrink: 0;
`;

const ShaLink = styled.a`
  font-family: ${t.fontMono};
  color: ${t.text.secondary};
  flex-shrink: 0;

  &:hover {
    color: ${t.text.primary};
    text-decoration: underline;
  }
`;

const ShaText = styled.span`
  font-family: ${t.fontMono};
  flex-shrink: 0;
`;

// github.com's diffstat meter: five squares, green for the additions
// share, red for the rest.
const BlockMeter = styled.span`
  display: inline-flex;
  gap: 1px;
  align-items: center;
`;

const Block = styled.span<{ $filled: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: ${(p) => (p.$filled ? STATE_COLORS.open : STATE_COLORS.closed)};
  opacity: 0.85;
`;

// Panel-sized version of github.com's PR tab strip: quiet tabs with an
// accent underline on the active one.

// Container-query anchor: lets the strip react to the PANEL's width
// (floats, splits) rather than the viewport's.
const TabStripWrap = styled.div`
  container-type: inline-size;
`;

const TabLabel = styled.span`
  white-space: nowrap;
`;

const TabStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 ${EDITOR_SPACING.containerPadding};
  border-bottom: ${t.borderWidth} solid ${t.border};
  overflow-x: auto;

  /* Too narrow for three labeled tabs: collapse to icon + count pill
     (titles keep the names discoverable on hover). */
  @container (max-width: 340px) {
    ${TabLabel} {
      display: none;
    }
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${(p) => (p.$active ? t.accent.primary : "transparent")};
  color: ${(p) => (p.$active ? t.text.primary : t.text.muted)};
  font-size: ${t.typography.sm};
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: color ${ANIMATION.fast};

  &:hover {
    color: ${t.text.primary};
  }
`;

const TabCount = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  background: ${t.bg.secondary};
  padding: 0 5px;
  border-radius: 999px;
`;
