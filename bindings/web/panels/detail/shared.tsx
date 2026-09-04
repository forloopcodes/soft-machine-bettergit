/**
 * Shared pieces for the issue and pull detail views, so both read as one
 * surface:
 *
 *   DetailHeader   state pill · #N · author · time · [actions]  / title / chips
 *   ActionsRow     quiet ghost buttons (send to agent, labels)
 *   Thread         opening post, comments and timeline events, trailing slot
 *   ReplyFooter    the composer, pinned under the scroll area, with the
 *                  state action (close / reopen) beside "Comment"
 *
 * All remote content renders inside overflow-guarded wrappers so a
 * 1000-char token or raw HTML string can never blow the panel open.
 */

import { useState, type ReactNode } from "react";
import styled from "styled-components";
import {
  Button,
  Dropdown,
  EDITOR_SPACING,
  Icon,
  Markdown,
  UserAvatar,
  t,
} from "@soft-machine/sdk";
import type { ForgeComment, ForgeCommit, ForgeIssue, ForgeLabel, ForgeReview, ForgeUser } from "../../types";
import { useForgeMutation, useForgeQuery, useSendToAgent } from "../../hooks";
import { normalizeForgeMarkdown } from "../../markdownNormalize";
import { buildTimeline, reviewVerb } from "../../timeline";
import { toggleName } from "../../labels";
import { LabelMenu } from "../LabelMenu";
import {
  BareLink,
  Composer,
  ComposerReplyTextarea,
  ComposerSpacer,
  ComposerToolbar,
  Count,
  EnterInline,
  ErrorBanner,
  GhostButton,
  InlineCount,
  LabelChips,
  MenuList,
  Meta,
  MetaChip,
  Spacer,
  StatePill,
  relativeTime,
  reviewVisual,
  stateVisual,
} from "../../ui";

// Mirrors the bridge's comment body gate.
const BODY_MAX = 65_536;

// ── Header ─────────────────────────────────────────────────────────────────

export function DetailHeader({
  item,
  subtitle,
  actions,
}: {
  item: ForgeIssue;
  /** Extra line under the title (the PR view's "wants to merge" row). */
  subtitle?: ReactNode;
  /** Icon actions on the right of the first line (open in new panel…). */
  actions?: ReactNode;
}) {
  const visual = stateVisual(item);
  const hasChips = item.labels.length > 0 || item.assignees.length > 0 || item.milestone;
  return (
    <HeaderBlock>
      <HeaderLine>
        {/* Keyed by label: a state change (merged, closed, reopened) pops
            the new pill in instead of silently swapping text. */}
        <EnterInline key={visual.label} $from="pop">
          <StatePill $color={visual.color}>
            <Icon name={visual.icon} size={11} />
            {visual.label}
          </StatePill>
        </EnterInline>
        <Count>#{item.number}</Count>
        <Meta>
          {item.author?.login ?? "unknown"} · {relativeTime(item.createdAt, Date.now())}
        </Meta>
        <Spacer />
        {actions}
        <BareLink
          href={item.webUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open on GitHub"
          title="Open on GitHub"
        >
          <Icon name="ExternalLink" size={12} />
        </BareLink>
      </HeaderLine>
      <DetailTitle>{item.title}</DetailTitle>
      {subtitle}
      {hasChips && (
        <HeaderChips>
          {item.assignees.map((a) => (
            <MetaChip key={a.login} title={`Assignee: ${a.login}`}>
              <UserAvatar name={a.login} avatarUrl={a.avatarUrl ?? undefined} size={12} />
              {a.login}
            </MetaChip>
          ))}
          {item.milestone && (
            <MetaChip title={`Milestone: ${item.milestone.title}`}>
              <Icon name="Target" size={11} />
              {item.milestone.title}
            </MetaChip>
          )}
          <LabelChips labels={item.labels} max={8} />
        </HeaderChips>
      )}
    </HeaderBlock>
  );
}

const HeaderBlock = styled.div`
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px ${EDITOR_SPACING.containerPadding} 10px;
  border-bottom: ${t.borderWidth} solid ${t.border};
`;

const HeaderLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 18px;
`;

const DetailTitle = styled.div`
  font-size: ${t.typography.md};
  font-weight: 500;
  line-height: 1.3;
  color: ${t.text.primary};
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const HeaderChips = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
`;

/** Quiet action strip at the top of the scroll area. Inset by 4px, not
 *  12px: the ghost buttons carry 8px of their own padding, so their icons
 *  land on the same 12px edge as the tab strip and header above. */
export const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 4px 2px;
  flex-wrap: wrap;
  min-width: 0;
`;

/**
 * Remote markdown inside a card: long tokens and raw HTML must wrap, never
 * overflow, and headings are capped so a "## Summary" in a comment never
 * outranks the panel's own title (md/500). Images and tables stay inside.
 */
export const MarkdownGuard = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: ${t.typography.sm};

  & h1,
  & h2,
  & h3,
  & h4,
  & h5,
  & h6 {
    font-size: ${t.typography.base};
    font-weight: 600;
    line-height: 1.3;
    margin: 12px 0 4px;
  }
  & h1:first-child,
  & h2:first-child,
  & h3:first-child,
  & h4:first-child {
    margin-top: 0;
  }
  & img {
    max-width: 100%;
    height: auto;
  }
  & table {
    display: block;
    max-width: 100%;
    overflow-x: auto;
  }
`;

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * Delivers the prepared context to the last-focused chat composer as an
 * inline chip (labeled "repo#N"). Disabled when no panel system exists.
 */
export function SendToAgentButton({
  chipLabel,
  buildContext,
}: {
  chipLabel: string;
  buildContext: () => string | null;
}) {
  const { canSend, send } = useSendToAgent();
  const [sent, setSent] = useState(false);

  const onClick = () => {
    const context = buildContext();
    if (context && send(chipLabel, context)) {
      setSent(true);
      window.setTimeout(() => setSent(false), 1500);
    }
  };

  return (
    <GhostButton
      type="button"
      onClick={onClick}
      disabled={!canSend}
      title={canSend ? "Send full context to the agent composer" : "Open a chat panel to send context"}
    >
      <EnterInline key={sent ? "sent" : "send"} $from="pop">
        <Icon name={sent ? "Check" : "Send"} size={12} />
      </EnterInline>
      {sent ? "Sent" : "Send to agent"}
    </GhostButton>
  );
}

/**
 * Label toggler for issues and pull requests alike (GitHub stores PR
 * labels on the underlying issue, so one write path serves both).
 */
export function LabelsAction({
  repo,
  item,
  disabled,
  onToggle,
}: {
  repo: string;
  item: ForgeIssue;
  disabled: boolean;
  onToggle: (labels: string[]) => void;
}) {
  const repoLabels =
    useForgeQuery<{ labels: ForgeLabel[] }>(`/labels?repo=${encodeURIComponent(repo)}`).data
      ?.labels ?? [];
  const current = item.labels.map((l) => l.name);

  return (
    <Dropdown
      align="start"
      width={260}
      trigger={({ toggle: open, isOpen }) => (
        <GhostButton type="button" onClick={open} $active={isOpen} disabled={disabled}>
          <Icon name="Tag" size={12} /> Labels
          {item.labels.length > 0 && <InlineCount>{item.labels.length}</InlineCount>}
        </GhostButton>
      )}
    >
      {() => (
        <MenuList>
          <LabelMenu
            labels={repoLabels}
            selected={current}
            onToggle={(name) => onToggle(toggleName(current, name))}
            repo={repo}
            emptyText="This repository has no labels yet."
          />
        </MenuList>
      )}
    </Dropdown>
  );
}

// ── Thread ─────────────────────────────────────────────────────────────────

// Comments are cards; commits are grouped by consecutive author into one
// "added N commits" entry with a compact sha list; review verdicts are
// colored nodes that show the review text when there is any. The model
// lives in ../../timeline.ts (pure, tested).

const COMMITS_PREVIEW = 5;

function CommitGroup({ author, commits, now }: { author: ForgeUser | null; commits: ForgeCommit[]; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? commits : commits.slice(0, COMMITS_PREVIEW);
  const hidden = commits.length - shown.length;
  const last = commits[commits.length - 1];
  return (
    <>
      <EventLine>
        <EventText>
          <strong>{author?.login ?? "unknown"}</strong> added{" "}
          {commits.length === 1 ? "a commit" : `${commits.length} commits`}
        </EventText>
        <Spacer />
        <Meta>{relativeTime(last?.createdAt ?? null, now)}</Meta>
      </EventLine>
      <CommitList>
        {shown.map((commit) => (
          <CommitRow key={commit.sha}>
            {commit.webUrl ? (
              <ShaLink href={commit.webUrl} target="_blank" rel="noreferrer noopener">
                {commit.sha.slice(0, 7)}
              </ShaLink>
            ) : (
              <Count>{commit.sha.slice(0, 7)}</Count>
            )}
            <CommitTitle title={commit.title}>{commit.title}</CommitTitle>
          </CommitRow>
        ))}
        {hidden > 0 && (
          <GhostButton type="button" onClick={() => setExpanded(true)}>
            <Icon name="ChevronDown" size={12} /> {hidden} more {hidden === 1 ? "commit" : "commits"}
          </GhostButton>
        )}
        {expanded && commits.length > COMMITS_PREVIEW && (
          <GhostButton type="button" onClick={() => setExpanded(false)}>
            <Icon name="ChevronUp" size={12} /> Show fewer
          </GhostButton>
        )}
      </CommitList>
    </>
  );
}


function CommentCard({
  author,
  avatarUrl,
  isBot,
  isAuthor,
  verb,
  time,
  edited,
  children,
}: {
  author: string;
  avatarUrl: string | null;
  isBot?: boolean;
  isAuthor?: boolean;
  verb?: string;
  time: string;
  edited?: boolean;
  children: ReactNode;
}) {
  return (
    <Capsule>
      <CapsuleHeader>
        <UserAvatar name={author} avatarUrl={avatarUrl ?? undefined} size={16} />
        <CommentAuthor>{author}</CommentAuthor>
        {isBot && <MetaChip>Bot</MetaChip>}
        {isAuthor && <MetaChip>Author</MetaChip>}
        {verb && <Meta>{verb}</Meta>}
        <Spacer />
        {edited && <Meta>edited</Meta>}
        <Meta>{time}</Meta>
      </CapsuleHeader>
      <CapsuleBody>{children}</CapsuleBody>
    </Capsule>
  );
}

interface ThreadProps {
  /** The item itself: its body is the first card of the thread. */
  item: ForgeIssue & { body: string | null };
  comments: ForgeComment[];
  /** PR commits; grouped by consecutive author into one entry each. */
  commits?: ForgeCommit[];
  /** PR review verdicts; those with a body show it as a card. */
  reviews?: ForgeReview[];
  /** Rendered after the thread (the PR view's merge status card). */
  trailing?: ReactNode;
}

/**
 * The conversation on a vertical rail: opening post, then comments,
 * commit groups and review verdicts in time order. Each entry owns a
 * node column (icon disc or just the line) and a body column.
 */
export function Thread({ item, comments, commits = [], reviews = [], trailing }: ThreadProps) {
  const now = Date.now();
  const itemAuthor = item.author?.login ?? null;
  const entries = buildTimeline(comments, commits, reviews);
  const total = entries.length + 1;

  const renderComment = (comment: ForgeComment) => (
    <CommentCard
      author={comment.author?.login ?? "unknown"}
      avatarUrl={comment.author?.avatarUrl ?? null}
      isBot={comment.author?.isBot}
      isAuthor={!!itemAuthor && comment.author?.login === itemAuthor}
      time={relativeTime(comment.createdAt, now)}
      edited={!!comment.updatedAt && comment.updatedAt !== comment.createdAt}
    >
      <MarkdownGuard>
        <Markdown content={normalizeForgeMarkdown(comment.body)} maxWidth="100%" fontSize={t.typography.sm} />
      </MarkdownGuard>
    </CommentCard>
  );

  return (
    <ThreadBlock>
      <TimelineEntry $first $last={total === 1}>
        <RailNode />
        <EntryBody>
          <CommentCard
            author={item.author?.login ?? "unknown"}
            avatarUrl={item.author?.avatarUrl ?? null}
            isBot={item.author?.isBot}
            verb="opened"
            time={relativeTime(item.createdAt, now)}
          >
            {item.body?.trim() ? (
              <MarkdownGuard>
                <Markdown content={normalizeForgeMarkdown(item.body)} maxWidth="100%" fontSize={t.typography.sm} />
              </MarkdownGuard>
            ) : (
              <MutedNote>No description provided.</MutedNote>
            )}
          </CommentCard>
        </EntryBody>
      </TimelineEntry>

      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        if (entry.kind === "comment") {
          return (
            <TimelineEntry key={entry.key} $last={last}>
              <RailNode />
              <EntryBody>{renderComment(entry.comment)}</EntryBody>
            </TimelineEntry>
          );
        }
        if (entry.kind === "commits") {
          return (
            <TimelineEntry key={entry.key} $last={last}>
              <RailNode>
                <NodeDisc>
                  <Icon name="GitCommit" size={11} />
                </NodeDisc>
              </RailNode>
              <EntryBody>
                <CommitGroup author={entry.author} commits={entry.commits} now={now} />
              </EntryBody>
            </TimelineEntry>
          );
        }
        const visual = reviewVisual(entry.review.state);
        const body = entry.review.body?.trim();
        return (
          <TimelineEntry key={entry.key} $last={last}>
            <RailNode>
              <NodeDisc $color={visual.color}>
                <Icon name={visual.icon} size={11} />
              </NodeDisc>
            </RailNode>
            <EntryBody>
              <EventLine>
                <EventText>
                  <strong>{entry.review.author?.login ?? "unknown"}</strong> {reviewVerb(entry.review.state)}
                </EventText>
                <Spacer />
                <Meta>{relativeTime(entry.review.submittedAt, now)}</Meta>
              </EventLine>
              {body && (
                <ReviewBody>
                  <MarkdownGuard>
                    <Markdown content={normalizeForgeMarkdown(body)} maxWidth="100%" fontSize={t.typography.sm} />
                  </MarkdownGuard>
                </ReviewBody>
              )}
            </EntryBody>
          </TimelineEntry>
        );
      })}

      {trailing && <Trailing>{trailing}</Trailing>}
    </ThreadBlock>
  );
}

// ── Reply footer ───────────────────────────────────────────────────────────

interface ReplyFooterProps {
  repo: string;
  number: number;
  type: "issue" | "pull";
  disabled: boolean;
  /** The state action (close / reopen) shown beside "Comment". */
  stateAction?: ReactNode;
}

/**
 * The reply composer, pinned below the scroll area like the chat panel's
 * composer: always reachable, same object in both detail views.
 */
export function ReplyFooter({ repo, number, type, disabled, stateAction }: ReplyFooterProps) {
  const { mutate, isPending, error } = useForgeMutation();
  const [draft, setDraft] = useState("");

  const post = async () => {
    const body = draft.trim();
    if (!body || isPending) return;
    const ok = await mutate("/comment", { repo, number, body, type });
    if (ok) setDraft("");
  };

  return (
    <Footer>
      <Composer>
        <ComposerReplyTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment (markdown)"
          rows={2}
          maxLength={BODY_MAX}
          disabled={disabled}
          aria-label="Add a comment"
        />
        <ComposerToolbar>
          {error && <ErrorBanner compact message={error} />}
          <ComposerSpacer />
          {stateAction}
          <Button
            type="button"
            $compact
            $variant="secondary"
            onClick={() => void post()}
            disabled={disabled || isPending || draft.trim().length === 0}
          >
            {isPending ? "Posting…" : "Comment"}
          </Button>
        </ComposerToolbar>
      </Composer>
    </Footer>
  );
}

/* Separated from the thread by spacing only; the thread's last card
   ends 4px above so the two never touch. */
const Footer = styled.div`
  flex: 0 0 auto;
  padding: 4px ${EDITOR_SPACING.containerPadding} ${EDITOR_SPACING.containerPadding};
  min-width: 0;
`;

// ── Styles ─────────────────────────────────────────────────────────────────

const ThreadBlock = styled.div`
  display: flex;
  flex-direction: column;
  padding: 4px ${EDITOR_SPACING.containerPadding} 8px;
  min-width: 0;
`;

const RAIL_WIDTH = 16;

/**
 * One timeline row: node column + body. The rail line is drawn by the
 * node column across the row's full height (including the bottom spacing)
 * so consecutive entries read as one continuous line; the first entry
 * starts at its node, the last ends at its node.
 */
const TimelineEntry = styled.div<{ $first?: boolean; $last?: boolean }>`
  display: grid;
  grid-template-columns: ${RAIL_WIDTH}px minmax(0, 1fr);
  column-gap: 8px;
  min-width: 0;
  /* Row spacing lives on the body so the node column (and its line) spans
     the full row height and the line runs unbroken into the next entry. */
  & > :last-child {
    padding-bottom: ${({ $last }) => ($last ? 0 : 8)}px;
  }
  & > :first-child::before {
    content: "";
    position: absolute;
    left: ${RAIL_WIDTH / 2 - 0.5}px;
    width: ${t.borderWidth};
    top: ${({ $first }) => ($first ? "10px" : 0)};
    bottom: ${({ $last }) => ($last ? "calc(100% - 10px)" : 0)};
    background: ${t.border};
  }
`;

const RailNode = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-width: 0;
`;

/** Icon disc sitting on the rail, centered on a 22px event line. */
const NodeDisc = styled.span<{ $color?: string }>`
  position: relative;
  display: inline-grid;
  place-items: center;
  width: ${RAIL_WIDTH}px;
  height: ${RAIL_WIDTH}px;
  margin-top: 3px;
  border-radius: 50%;
  border: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.tertiary};
  color: ${({ $color }) => $color ?? t.text.muted};
  flex-shrink: 0;
`;

const EntryBody = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const EventLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  min-width: 0;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  & strong {
    font-weight: 500;
    color: ${t.text.secondary};
  }
`;

const CommitList = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  & > button {
    align-self: flex-start;
    margin-left: -8px;
  }
`;

const CommitRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
  min-width: 0;
`;

const CommitTitle = styled.span`
  flex: 1;
  min-width: 0;
  font-size: ${t.typography.sm};
  color: ${t.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/** A review's written body under its verdict line. */
const ReviewBody = styled.div`
  padding: 8px 10px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  background: ${t.bg.secondary};
  min-width: 0;
`;

const Trailing = styled.div`
  margin-top: 8px;
  min-width: 0;
`;

export const Capsule = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  overflow: hidden;
  &:hover {
    border-color: color-mix(in srgb, ${t.text.muted} 35%, ${t.border});
  }
`;

const CapsuleHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  min-width: 0;
`;

const CapsuleBody = styled.div`
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  padding: 8px 10px;
  min-width: 0;
`;

const CommentAuthor = styled.span`
  font-size: ${t.typography.xs};
  color: ${t.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const MutedNote = styled.div`
  color: ${t.text.muted};
  font-size: ${t.typography.sm};
`;

const EventText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

export const EventIcon = styled.span<{ $color?: string }>`
  display: inline-grid;
  place-items: center;
  color: ${({ $color }) => $color ?? "inherit"};
  flex-shrink: 0;
`;

const ShaLink = styled.a`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  color: ${t.text.secondary};
  text-decoration: none;
  flex-shrink: 0;
  &:hover {
    color: ${t.text.primary};
    text-decoration: underline;
  }
`;
