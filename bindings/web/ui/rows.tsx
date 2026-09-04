/**
 * Rows, chips and small text atoms. Selection is the hover fill held;
 * row actions are opacity-revealed with no transition; every truncating
 * span carries the triad and every flex ancestor min-width: 0.
 */

import styled, { css, keyframes } from "styled-components";
import { EDITOR_SPACING, t } from "@soft-machine/sdk";
import type { ForgeLabel } from "../types";

// ── Text atoms ─────────────────────────────────────────────────────────────

/** Count that sits inside a control's label (segment, ghost button): the
 *  label's own sans face, one step smaller, muted, tabular. Mono `Count`
 *  is for identifiers (#123, shas), not for these. */
export const InlineCount = styled.span`
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
`;

/** Mono micro muted numeral (#123, shas). */
export const Count = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  color: ${t.text.muted};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
`;

export const Meta = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

export const Truncate = styled.span`
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// ── Rows ───────────────────────────────────────────────────────────────────

export const rowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  min-width: 0;
  padding: 0 6px;
  border: none;
  border-radius: ${t.radius};
  background: transparent;
  color: ${t.text.primary};
  font: inherit;
  font-size: ${t.typography.base};
  text-align: left;
  cursor: pointer;
  &:hover {
    background: ${t.bg.secondary};
  }
`;

/** Single-line 26px row (sidebar repos, sidebar item list, review rows).
 *  Pass $index to stagger its arrival. */
export const SidebarRow = styled.div<{ $active?: boolean; $index?: number }>`
  ${rowStyles}
  position: relative;
  width: 100%;
  outline: none;
  ${({ $index }) => $index !== undefined && rowEnterCss}
  &:focus-visible {
    background: ${t.bg.secondary};
  }
  ${({ $active }) =>
    $active &&
    css`
      background: ${t.bg.secondary};
    `}
  & > .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const rowEnter = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

/** Rows arrive with a short staggered rise: 20ms steps, capped at 12 rows. */
export const rowEnterCss = css<{ $index?: number }>`
  animation: ${rowEnter} 0.16s cubic-bezier(0.2, 0, 0, 1) both;
  animation-delay: ${({ $index }) => `${Math.min($index ?? 0, 12) * 20}ms`};
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** Two-line list row for issues and pull requests in the main list. */
export const ItemRow = styled.div<{ $active?: boolean; $index?: number }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 6px ${EDITOR_SPACING.containerPadding};
  cursor: pointer;
  outline: none;
  background: ${({ $active }) => ($active ? t.bg.secondary : "transparent")};
  &:hover,
  &:focus-visible {
    background: ${t.bg.secondary};
  }
  ${rowEnterCss}
`;

export const ItemTitleLine = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 18px;
`;

export const ItemTitle = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  font-size: ${t.typography.base};
  color: ${t.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ItemMetaLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 18px;
  overflow: hidden;
`;

/**
 * Right-aligned rail for label chips on a row's meta line. It yields
 * width to the text before it and fades out chips that no longer fit
 * instead of clipping them mid-glyph; below 360px of panel width the rail
 * hides entirely.
 */
export const ChipRail = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent, black 14px);
  & > * {
    flex-shrink: 0;
  }
  @container (max-width: 360px) {
    display: none;
  }
`;

/**
 * Action cluster hidden until its row is hovered or focused. Overlaid on
 * the row's right edge (not in the flex flow) so labels keep the full
 * width; its background is the row's hover fill, so it covers the tail of
 * a long label seamlessly while visible.
 */
export const RowActions = styled.span`
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-left: 6px;
  border-radius: ${t.radius};
  background: ${t.bg.secondary};
  opacity: 0;
  pointer-events: none;
  ${SidebarRow}:hover &,
  ${SidebarRow}:focus-within &,
  ${ItemRow}:hover &,
  ${ItemRow}:focus-within & {
    opacity: 1;
    pointer-events: auto;
  }
`;

export const StateIcon = styled.span<{ $color: string }>`
  display: inline-grid;
  place-items: center;
  width: 12px;
  height: 12px;
  color: ${({ $color }) => $color};
  flex-shrink: 0;
`;

// ── Chips ──────────────────────────────────────────────────────────────────

/** 18px tinted pill for a GitHub label: tint from the label color, a dot
 *  in the label color, and secondary text so dark labels stay legible on
 *  dark themes and light labels on light ones. $active draws the label
 *  color as a ring (the chip is a live filter). */
export const Chip = styled.span<{ $tone: string; $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  max-width: 120px;
  padding: 0 7px;
  border: ${t.borderWidth} solid ${({ $tone, $active }) => ($active ? $tone : "transparent")};
  border-radius: 999px;
  background: color-mix(in srgb, ${({ $tone }) => $tone} 16%, transparent);
  color: ${({ $active }) => ($active ? t.text.primary : t.text.secondary)};
  /* font reset first so the button variant matches the span exactly */
  font: inherit;
  font-size: ${t.typography.xs};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $tone }) => $tone};
    flex-shrink: 0;
  }
`;

/** A label chip that acts (filter by label / remove filter). */
export const ChipButton = styled(Chip).attrs({ type: "button" })`
  cursor: pointer;
  &:hover {
    background: color-mix(in srgb, ${({ $tone }) => $tone} 28%, transparent);
    color: ${t.text.primary};
  }
`;

/** Bordered removable chip for non-label active filters (author, sort…). */
export const FilterChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  max-width: 160px;
  padding: 0 6px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  background: transparent;
  color: ${t.text.secondary};
  font: inherit;
  font-size: ${t.typography.xs};
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
  & > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  & > .key {
    color: ${t.text.muted};
  }
  &:hover {
    color: ${t.text.primary};
    background: ${t.bg.secondary};
  }
`;

/** 18px quiet badge: assignee, milestone, Author/Bot role, verdicts. */
export const MetaChip = styled.span<{ $tone?: "muted" | "danger" | "warning" | "success" }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  max-width: 140px;
  padding: 0 6px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  font-size: ${t.typography.xs};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  color: ${({ $tone }) =>
    $tone === "danger"
      ? t.status.error
      : $tone === "warning"
        ? t.status.warning
        : $tone === "success"
          ? t.status.connected
          : t.text.secondary};
`;

/** Mono branch / ref chip. */
export const RefChip = styled.span`
  display: inline-block;
  box-sizing: border-box;
  height: 18px;
  line-height: 16px;
  max-width: 160px;
  padding: 0 6px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  color: ${t.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  flex-shrink: 0;
`;

/** Open / Closed / Merged / Draft pill in a detail header. */
export const StatePill = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 7px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: 999px;
  color: ${({ $color }) => $color};
  font-size: ${t.typography.xs};
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
`;

const MAX_ROW_LABELS = 3;

export function LabelChips({
  labels,
  max = MAX_ROW_LABELS,
  active,
  onToggle,
}: {
  labels: ForgeLabel[];
  max?: number;
  /** Names currently used as a filter (drawn with a ring). */
  active?: readonly string[];
  /** When given, chips are buttons that toggle the label as a filter. */
  onToggle?: (name: string) => void;
}) {
  return (
    <>
      {labels.slice(0, max).map((label) => {
        const tone = label.color ?? t.text.muted;
        const isActive = active?.includes(label.name) ?? false;
        return onToggle ? (
          <ChipButton
            key={label.name}
            $tone={tone}
            $active={isActive}
            title={isActive ? `Stop filtering by ${label.name}` : `Filter by ${label.name}`}
            aria-pressed={isActive}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(label.name);
            }}
          >
            {label.name}
          </ChipButton>
        ) : (
          <Chip key={label.name} $tone={tone} $active={isActive} title={label.description ?? label.name}>
            {label.name}
          </Chip>
        );
      })}
      {labels.length > max && <Meta>+{labels.length - max}</Meta>}
    </>
  );
}

/** Colored dot for label options inside menus. */
export const ToneDot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;
