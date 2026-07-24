/**
 * Shared building blocks for the Forge panels, styled 1:1 with the Git
 * panel's design language: gray panel surface (t.bg.tertiary), flat
 * borderless rows that highlight on hover, uppercase micro section
 * headers, quiet mono chips, and the Git panel's semantic status palette.
 *
 * Clicking a row opens the item in-app (detail panel via useOpenDetail);
 * the small trailing arrow (hover-revealed, like the Git panel's row
 * actions) leaves for github.com / gitlab.com.
 */

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import styled from "styled-components";
import {
  ANIMATION,
  Button,
  EDITOR_SPACING,
  EDITOR_TYPOGRAPHY,
  Icon,
  t,
  type ButtonProps,
  type IconName,
} from "@soft-machine/sdk";
import type { ForgeIssue, ForgeLabel, ForgePull } from "../types";
import { itemSummaryContext } from "../agentContext";
import { useForge } from "../ForgeContext";
import { useOpenDetail, useSendToAgent } from "../hooks";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const RELATIVE_CUTOFF_DAYS = 30;
const MAX_ROW_LABELS = 3;

// Same semantic palette as the Git panel's getStatusInfo (hardcoded hex,
// not theme tokens): green for open/additions, red for closed/deletions,
// purple for merged/done, gray for muted states.
export const STATE_COLORS = {
  open: "#22c55e",
  merged: "#8b5cf6",
  closed: "#ef4444",
  done: "#8b5cf6",
  muted: "#6b7280",
} as const;

/** Coarse relative timestamp; falls back to a plain date past 30 days. */
export function relativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, nowMs - then);
  if (diff < MS_PER_MINUTE) return "now";
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m`;
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h`;
  const days = Math.floor(diff / MS_PER_DAY);
  if (days <= RELATIVE_CUTOFF_DAYS) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** Icon + color for an issue or pull row / detail header. */
export function stateVisual(item: ForgeIssue): {
  icon: IconName;
  color: string;
  label: string;
} {
  if (item.isPull) {
    const pull = item as ForgePull;
    if (pull.mergedAt) {
      return { icon: "GitMerge", color: STATE_COLORS.merged, label: "Merged" };
    }
    if (item.state === "closed") {
      return { icon: "X", color: STATE_COLORS.closed, label: "Closed" };
    }
    if (pull.draft) {
      return { icon: "GitBranch", color: STATE_COLORS.muted, label: "Draft" };
    }
    return { icon: "GitBranch", color: STATE_COLORS.open, label: "Open" };
  }
  if (item.state === "closed") {
    return item.stateReason === "not_planned"
      ? { icon: "X", color: STATE_COLORS.muted, label: "Closed" }
      : { icon: "Check", color: STATE_COLORS.done, label: "Closed" };
  }
  return { icon: "Circle", color: STATE_COLORS.open, label: "Open" };
}

export function LabelChips({
  labels,
  max = MAX_ROW_LABELS,
}: {
  labels: ForgeLabel[];
  max?: number;
}) {
  return (
    <>
      {labels.slice(0, max).map((label) => (
        <LabelChip key={label.name} title={label.description ?? label.name}>
          <LabelDot $color={label.color ?? t.text.muted} />
          {label.name}
        </LabelChip>
      ))}
      {labels.length > max && <MetaText>+{labels.length - max}</MetaText>}
    </>
  );
}

/**
 * Collapsible section with the Git panel's header treatment: chevron,
 * uppercase micro title, count pill, optional trailing actions.
 */
export function Section({
  title,
  count,
  headerRight,
  defaultExpanded = true,
  children,
}: {
  title: string;
  count?: number;
  headerRight?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <SectionContainer>
      <SectionHeader onClick={() => setIsExpanded(!isExpanded)}>
        <ChevronIcon $isExpanded={isExpanded}>
          <Icon name="ChevronRight" size={12} />
        </ChevronIcon>
        <SectionTitle>{title}</SectionTitle>
        {count !== undefined && count > 0 && (
          <SectionCount>{count}</SectionCount>
        )}
        {headerRight && (
          <SectionHeaderRight onClick={(e) => e.stopPropagation()}>
            {headerRight}
          </SectionHeaderRight>
        )}
      </SectionHeader>
      {isExpanded && <SectionContent>{children}</SectionContent>}
    </SectionContainer>
  );
}

interface ItemListProps {
  items: ForgeIssue[];
  kind: "issue" | "pull";
}

export function ItemList({ items, kind }: ItemListProps) {
  const { open, selected } = useOpenDetail(kind);
  const { provider, repo } = useForge();
  const { canSend, send } = useSendToAgent();
  const now = Date.now();

  const stopRowClick = (event: MouseEvent) => {
    // The anchor leaves the app; the row click opens the in-app detail.
    // Without this the same click would do both.
    event.stopPropagation();
  };

  const sendItem = (event: MouseEvent, item: ForgeIssue) => {
    event.stopPropagation();
    if (repo) {
      send(`${repo}#${item.number}`, itemSummaryContext(provider, repo, item));
    }
  };

  const rowKeyDown = (event: KeyboardEvent, number: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(number);
    }
  };

  return (
    <ListWrap>
      {items.map((item) => {
        const visual = stateVisual(item);
        return (
          <ItemRow
            key={item.number}
            role="button"
            tabIndex={0}
            $active={item.number === selected}
            onClick={() => open(item.number)}
            onKeyDown={(e) => rowKeyDown(e, item.number)}
            title={item.title}
          >
            <RowTitleLine>
              <StateIcon $color={visual.color} title={visual.label}>
                <Icon name={visual.icon} size={13} />
              </StateIcon>
              <RowTitle>{item.title}</RowTitle>
              {item.commentCount > 0 && (
                <CommentCount>
                  <Icon name="MessageSquare" size={10} />
                  {item.commentCount}
                </CommentCount>
              )}
              <RowActions>
                {canSend && (
                  <RowActionButton
                    type="button"
                    onClick={(e) => sendItem(e, item)}
                    aria-label={`Send #${item.number} to the agent chat`}
                    title="Send to chat"
                  >
                    <Icon name="Send" size={11} />
                  </RowActionButton>
                )}
                <ExternalLink
                  href={item.webUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Open #${item.number} on the provider site`}
                  title="Open on provider site"
                  onClick={stopRowClick}
                >
                  <Icon name="ExternalLink" size={11} />
                </ExternalLink>
              </RowActions>
            </RowTitleLine>
            <RowMetaLine>
              <MetaText>
                #{item.number} · {item.author?.login ?? "unknown"} ·{" "}
                {relativeTime(item.createdAt, now)}
              </MetaText>
              <MetaSpacer />
              <LabelChips labels={item.labels} />
            </RowMetaLine>
          </ItemRow>
        );
      })}
    </ListWrap>
  );
}

// ── Panel scaffold (Git panel Container/Content) ───────────────────────────

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${t.bg.tertiary};
  overflow: hidden;
  font-size: ${t.typography.sm};
  color: ${t.text.primary};
`;

export const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
`;

// ── Sections (Git panel CollapsibleSection styling) ────────────────────────

const SectionContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px ${EDITOR_SPACING.containerPadding};
  cursor: pointer;
  user-select: none;
`;

const ChevronIcon = styled.span<{ $isExpanded: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${t.text.muted};
  transform: rotate(${(p) => (p.$isExpanded ? 90 : 0)}deg);
  transition: transform ${ANIMATION.fast};
`;

const SectionTitle = styled.span`
  font-size: ${t.typography.xs};
  font-weight: ${EDITOR_TYPOGRAPHY.sectionLabel.fontWeight};
  text-transform: ${EDITOR_TYPOGRAPHY.sectionLabel.textTransform};
  letter-spacing: ${EDITOR_TYPOGRAPHY.sectionLabel.letterSpacing};
  color: ${t.text.muted};
`;

const SectionCount = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  background: ${t.bg.secondary};
  padding: 1px 5px;
  border-radius: ${t.radius};
  margin-left: 4px;
`;

const SectionHeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
`;

const SectionContent = styled.div`
  display: flex;
  flex-direction: column;
`;

export const Divider = styled.div`
  height: 1px;
  background: ${t.border};
  margin: ${EDITOR_SPACING.dividerMargin};
`;

// ── List rows (flat, Git panel commit-row treatment) ───────────────────────

const ListWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

const ItemRow = styled.div<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px ${EDITOR_SPACING.containerPadding};
  cursor: pointer;
  min-width: 0;
  background: ${(p) => (p.$active ? t.bg.secondary : "transparent")};
  transition: background ${ANIMATION.fast};

  &:hover {
    background: ${t.bg.secondary};
  }
`;

const RowTitleLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 18px;
`;

const RowTitle = styled.span`
  font-size: ${t.typography.base};
  color: ${t.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
`;

const RowMetaLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 19px;
  overflow: hidden;
`;

export const MetaText = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  white-space: nowrap;
`;

const MetaSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const StateIcon = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  color: ${(p) => p.$color};
  flex-shrink: 0;
`;

const CommentCount = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  flex-shrink: 0;
`;

// Hidden until the row is hovered, like the Git panel's commit-row
// actions, so the title keeps its full width until they're usable.
const RowActions = styled.div`
  display: none;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;

  ${ItemRow}:hover & {
    display: flex;
  }
`;

const ExternalLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: ${t.radius};
  color: ${t.text.muted};

  &:hover {
    background: ${t.bg.tertiary};
    color: ${t.text.primary};
  }
`;

const RowActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: ${t.radius};
  background: transparent;
  color: ${t.text.muted};
  cursor: pointer;

  &:hover {
    background: ${t.bg.tertiary};
    color: ${t.text.primary};
  }
`;

// Quiet mono chip, the Git panel's RefChip.
export const RefChip = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
  line-height: 15px;
  color: ${t.text.secondary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  flex-shrink: 0;
`;

const LabelChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: ${t.typography.micro};
  line-height: 15px;
  color: ${t.text.secondary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  padding: 0 4px;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
`;

const LabelDot = styled.span<{ $color: string }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`;

// ── Empty / error states (Git panel NoChanges treatment) ───────────────────

export const Empty = styled.div`
  padding: 16px ${EDITOR_SPACING.containerPadding};
  text-align: center;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
`;

export const EmptyTitle = styled.div`
  font-size: ${t.typography.sm};
  color: ${t.text.secondary};
`;

export const EmptyHint = styled.div`
  max-width: 280px;
`;

/**
 * The one emphatic action of a surface (Create issue / Create pull
 * request / Merge). Built on the SDK Button's glossy accent-gradient
 * primary variant — the same treatment as the Git panel's commit
 * button — with the Git panel's quiet-outline disabled state. The
 * primary+compact defaults are baked in via attrs so call sites are
 * just <AccentButton onClick disabled>.
 */
export const AccentButton = styled(Button).attrs<ButtonProps>({
  $variant: "primary",
  $compact: true,
})`
  &:disabled {
    background: transparent;
    color: ${t.text.muted};
    box-shadow: 0 0 0 1px ${t.border};
    opacity: 1;
  }

  &:disabled::before {
    display: none;
  }
`;

export const ErrorRow = styled.div`
  padding: 8px ${EDITOR_SPACING.containerPadding};
  color: ${t.ansi.red};
  font-size: ${t.typography.xs};
  overflow-wrap: anywhere;
`;
