/**
 * Shared pieces for the Issue Detail and Pull Detail panels, in the Git
 * panel's design language: gray surface, uppercase micro section headers,
 * capsule cards for comments (CapsuleContainer treatment), quiet chips,
 * and the commit-composer style for the reply box. All remote content
 * (titles, bodies, comments) renders inside overflow-guarded wrappers so
 * a 1000-char token or raw HTML string can never blow the panel open.
 */

import { useState, type ReactNode } from "react";
import styled from "styled-components";
import {
  ANIMATION,
  Button,
  EDITOR_SPACING,
  Icon,
  Markdown,
  t,
} from "@soft-machine/sdk";
import type { ForgeComment, ForgeIssue } from "../types";
import { useForgeMutation, useSendToAgent } from "../hooks";
import { normalizeForgeMarkdown } from "../markdownNormalize";
import { relativeTime, stateVisual, LabelChips, Section } from "./shared";

// Mirrors the proxy's comment body gate.
const BODY_MAX = 65_536;

export function DetailHeader({
  item,
  subtitle,
}: {
  item: ForgeIssue;
  /** Extra line under the title (the PR panel's "wants to merge" row). */
  subtitle?: ReactNode;
}) {
  const visual = stateVisual(item);
  return (
    <HeaderBlock>
      <TitleRow>
        <StateBadge $color={visual.color} title={visual.label}>
          <Icon name={visual.icon} size={11} />
          {visual.label}
        </StateBadge>
        <HeaderMeta>
          #{item.number} · {item.author?.login ?? "unknown"} ·{" "}
          {relativeTime(item.createdAt, Date.now())}
        </HeaderMeta>
        <HeaderSpacer />
        <HeaderLink
          href={item.webUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open on provider site"
          title="Open on provider site"
        >
          <Icon name="ExternalLink" size={11} />
        </HeaderLink>
      </TitleRow>
      <DetailTitle>{item.title}</DetailTitle>
      {subtitle}
      {(item.labels.length > 0 ||
        item.assignees.length > 0 ||
        item.milestone) && (
        <HeaderChips>
          <LabelChips labels={item.labels} max={8} />
          {item.assignees.map((a) => (
            <QuietChip key={a.login} title={`Assignee: ${a.login}`}>
              <Icon name="User" size={9} />
              {a.login}
            </QuietChip>
          ))}
          {item.milestone && (
            <QuietChip title={`Milestone: ${item.milestone.title}`}>
              <Icon name="Target" size={9} />
              {item.milestone.title}
            </QuietChip>
          )}
        </HeaderChips>
      )}
    </HeaderBlock>
  );
}

/**
 * A non-comment timeline entry (commit pushed, review verdict) rendered
 * inline between comments in date order, like github.com's conversation.
 */
export interface TimelineEvent {
  id: string;
  createdAt: string | null;
  node: ReactNode;
}

interface CommentsSectionProps {
  comments: ForgeComment[];
  /** Composer target: {repo, number, type} for the POST /comment body. */
  repo: string;
  number: number;
  type: "issue" | "pull";
  disabled: boolean;
  /**
   * The item itself: its body renders as the FIRST capsule of the
   * thread ("author opened <time>"), the way github.com presents the
   * opening post, instead of a separate Description section.
   */
  item: ForgeIssue & { body: string | null };
  /** The issue/PR author's login, for the "Author" pill on their comments. */
  itemAuthor?: string | null;
  /** Timeline events interleaved with the comments by date. */
  events?: TimelineEvent[];
  /**
   * Rendered between the thread and the reply composer — github.com's
   * merge-status box slot on PR pages.
   */
  beforeComposer?: ReactNode;
  /**
   * Extra buttons next to "Comment" in the composer toolbar —
   * github.com's "Close issue" / "Close pull request" placement.
   */
  trailingActions?: ReactNode;
}

/** Comments and events, one thread, ascending by time (undated last). */
function buildTimeline(
  comments: ForgeComment[],
  events: TimelineEvent[]
): Array<
  | { kind: "comment"; key: string; date: number; comment: ForgeComment }
  | { kind: "event"; key: string; date: number; node: ReactNode }
> {
  const dateOf = (iso: string | null) => {
    const ms = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
  };
  return [
    ...comments.map((comment) => ({
      kind: "comment" as const,
      key: `c-${comment.id}`,
      date: dateOf(comment.createdAt),
      comment,
    })),
    ...events.map((event) => ({
      kind: "event" as const,
      key: `e-${event.id}`,
      date: dateOf(event.createdAt),
      node: event.node,
    })),
  ].sort((a, b) => a.date - b.date);
}

export function CommentsSection({
  comments,
  repo,
  number,
  type,
  disabled,
  item,
  itemAuthor,
  events = [],
  beforeComposer,
  trailingActions,
}: CommentsSectionProps) {
  const { mutate, isPending, error } = useForgeMutation();
  const [draft, setDraft] = useState("");
  const now = Date.now();

  const post = async () => {
    const body = draft.trim();
    if (!body || isPending) return;
    const ok = await mutate("/comment", { repo, number, body, type });
    if (ok) setDraft("");
  };

  return (
    <Section title="Conversation" count={comments.length}>
      <SectionBody>
        <CommentList>
          {/* The opening post, github.com style: always first, headed
              "author opened <time>", body or the italic no-description
              note. */}
          <CommentCapsule>
            <CommentHeader>
              {item.author?.avatarUrl ? (
                <Avatar src={item.author.avatarUrl} alt="" loading="lazy" />
              ) : (
                <AvatarFallback>
                  <Icon name="User" size={9} />
                </AvatarFallback>
              )}
              <CommentAuthor>{item.author?.login ?? "unknown"}</CommentAuthor>
              {item.author?.isBot && <RoleBadge>Bot</RoleBadge>}
              <MetaMicro>opened</MetaMicro>
              <CommentHeaderSpacer />
              <MetaMicro>{relativeTime(item.createdAt, now)}</MetaMicro>
            </CommentHeader>
            <CommentBody>
              {item.body?.trim() ? (
                <MarkdownGuard>
                  <Markdown
                    content={normalizeForgeMarkdown(item.body)}
                    maxWidth="100%"
                    fontSize={t.typography.sm}
                  />
                </MarkdownGuard>
              ) : (
                <MutedNote>No description provided.</MutedNote>
              )}
            </CommentBody>
          </CommentCapsule>

          {buildTimeline(comments, events).map((entry) =>
            entry.kind === "event" ? (
              <EventRow key={entry.key}>{entry.node}</EventRow>
            ) : (
              <CommentCapsule key={entry.key}>
                <CommentHeader>
                  {entry.comment.author?.avatarUrl ? (
                    <Avatar
                      src={entry.comment.author.avatarUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <AvatarFallback>
                      <Icon name="User" size={9} />
                    </AvatarFallback>
                  )}
                  <CommentAuthor>
                    {entry.comment.author?.login ?? "unknown"}
                  </CommentAuthor>
                  {entry.comment.author?.isBot && <RoleBadge>Bot</RoleBadge>}
                  {itemAuthor && entry.comment.author?.login === itemAuthor && (
                    <RoleBadge>Author</RoleBadge>
                  )}
                  <CommentHeaderSpacer />
                  {entry.comment.updatedAt &&
                    entry.comment.updatedAt !== entry.comment.createdAt && (
                      <MetaMicro>edited</MetaMicro>
                    )}
                  <MetaMicro>
                    {relativeTime(entry.comment.createdAt, now)}
                  </MetaMicro>
                </CommentHeader>
                <CommentBody>
                  <MarkdownGuard>
                    <Markdown
                      content={normalizeForgeMarkdown(entry.comment.body)}
                      maxWidth="100%"
                      fontSize={t.typography.sm}
                    />
                  </MarkdownGuard>
                </CommentBody>
              </CommentCapsule>
            )
          )}
        </CommentList>

        {beforeComposer}

        <ReplyComposer>
          <ReplyTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment (markdown)"
            rows={2}
            maxLength={BODY_MAX}
            disabled={disabled}
            aria-label="Add a comment"
          />
          <ReplyToolbar>
            {error && <InlineError>{error}</InlineError>}
            <ReplySpacer />
            {trailingActions}
            <Button
              type="button"
              $compact
              onClick={() => void post()}
              disabled={disabled || isPending || draft.trim().length === 0}
            >
              {isPending ? "Posting…" : "Comment"}
            </Button>
          </ReplyToolbar>
        </ReplyComposer>
      </SectionBody>
    </Section>
  );
}

/**
 * "Send to agent" action: delivers the prepared context to the
 * last-focused chat composer as an inline chip (labeled "@repo#N"),
 * exactly like the browser panel's element selector. Disabled when no
 * composer is open.
 */
export function SendToAgentButton({
  chipLabel,
  buildContext,
}: {
  /** Chip pill text in the composer, e.g. "o/r#313". */
  chipLabel: string;
  buildContext: () => string | null;
}) {
  const { canSend, send } = useSendToAgent();
  const [sent, setSent] = useState(false);

  const onClick = () => {
    const context = buildContext();
    if (context && send(chipLabel, context)) {
      setSent(true);
      // Brief confirmation, then back to the actionable label.
      window.setTimeout(() => setSent(false), 1500);
    }
  };

  return (
    <QuietActionButton
      type="button"
      onClick={onClick}
      disabled={!canSend}
      title={
        canSend
          ? "Send full context to the agent composer"
          : "Open a chat panel to send context to the agent"
      }
    >
      <Icon name="Send" size={11} /> {sent ? "Sent" : "Send to agent"}
    </QuietActionButton>
  );
}

// ── Detail scaffold ────────────────────────────────────────────────────────

export const DetailHeaderArea = styled.div`
  padding: 6px ${EDITOR_SPACING.containerPadding} 8px;
  border-bottom: ${t.borderWidth} solid ${t.border};
`;

export const SectionBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 ${EDITOR_SPACING.containerPadding} 8px;
  min-width: 0;
`;

/** Long tokens and raw HTML in remote markdown must wrap, never overflow. */
export const MarkdownGuard = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: ${t.typography.sm};
`;

export const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px ${EDITOR_SPACING.containerPadding};
  flex-wrap: wrap;
`;

/** Quiet toolbar-style action, the Git panel's transparent chip buttons. */
export const QuietActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  background: transparent;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  color: ${t.text.secondary};
  font-size: ${t.typography.sm};
  font-family: inherit;
  cursor: pointer;
  transition:
    background ${ANIMATION.fast},
    color ${ANIMATION.fast};

  &:hover:not(:disabled) {
    background: ${t.bg.secondary};
    color: ${t.text.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const InlineError = styled.span`
  color: ${t.ansi.red};
  font-size: ${t.typography.micro};
  overflow-wrap: anywhere;
`;

// ── Header ─────────────────────────────────────────────────────────────────

const HeaderBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const DetailTitle = styled.div`
  font-size: ${t.typography.base};
  color: ${t.text.primary};
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const StateBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: 999px;
  color: ${(p) => p.$color};
  font-size: ${t.typography.micro};
  flex-shrink: 0;
`;

const HeaderMeta = styled.span`
  color: ${t.text.muted};
  font-size: ${t.typography.micro};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const HeaderSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const HeaderLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: ${t.radius};
  color: ${t.text.muted};
  flex-shrink: 0;

  &:hover {
    background: ${t.bg.secondary};
    color: ${t.text.primary};
  }
`;

const HeaderChips = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
`;

export const QuietChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: ${t.typography.micro};
  line-height: 15px;
  color: ${t.text.secondary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  padding: 0 4px;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MutedNote = styled.div`
  color: ${t.text.muted};
  font-size: ${t.typography.xs};
`;

export const MetaMicro = styled.span`
  color: ${t.text.muted};
  font-size: ${t.typography.micro};
  flex-shrink: 0;
`;

// ── Comments (Git panel capsule treatment) ─────────────────────────────────

const CommentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const CommentCapsule = styled.div`
  display: flex;
  flex-direction: column;
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  overflow: hidden;
  transition: border-color ${ANIMATION.fast};

  &:hover {
    border-color: color-mix(in srgb, ${t.text.muted} 35%, ${t.border});
  }
`;

const CommentHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  min-width: 0;
`;

const CommentAuthor = styled.span`
  font-size: ${t.typography.xs};
  color: ${t.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CommentHeaderSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
`;

const AvatarFallback = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${t.bg.secondary};
  color: ${t.text.muted};
  flex-shrink: 0;
`;

/** "Author" / "Bot" pill, github.com's comment-header badges. */
const RoleBadge = styled.span`
  font-size: ${t.typography.micro};
  line-height: 14px;
  color: ${t.text.muted};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: 999px;
  padding: 0 5px;
  flex-shrink: 0;
`;

/** Compact timeline entry between comment capsules (commit, review). */
const EventRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  min-width: 0;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
`;

const CommentBody = styled.div`
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  padding: 8px 10px;
  min-width: 0;
`;

// ── Reply composer (Git panel commit-composer treatment) ───────────────────

const ReplyComposer = styled.div`
  display: flex;
  flex-direction: column;
  background: ${t.bg.elevated};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.5);
  transition: border-color 0.15s;

  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
`;

const ReplyTextarea = styled.textarea`
  padding: 8px 10px 0;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  color: ${t.text.primary};
  font-size: ${t.typography.sm};
  font-family: inherit;
  line-height: 1.4;
  max-height: 160px;

  &::placeholder {
    color: ${t.text.muted};
  }
`;

const ReplyToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 6px;
  min-width: 0;
`;

const ReplySpacer = styled.span`
  flex: 1;
  min-width: 0;
`;
