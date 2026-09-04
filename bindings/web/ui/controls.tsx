/**
 * Controls: the manual's control recipe (rest muted, hover primary with a
 * one-step background shift, no transition, disabled 0.5) in the sizes core
 * panels use. `CreateButton` is the single accent-filled action a panel may
 * show; everything else is quiet.
 */

import styled, { css, keyframes } from "styled-components";
import { t } from "@soft-machine/sdk";

const controlReset = css`
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** 24px accent square: the one primary action of a panel. */
export const CreateButton = styled.button`
  ${controlReset}
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: ${t.radius};
  color: ${t.accent.text};
  background: ${t.accent.primary};
  &:hover:not(:disabled) {
    background: color-mix(in srgb, ${t.accent.primary} 82%, black);
  }
`;

/** 24px quiet text button (optionally with a leading icon). */
export const GhostButton = styled.button<{ $active?: boolean; $danger?: boolean }>`
  ${controlReset}
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  white-space: nowrap;
  color: ${({ $active }) => ($active ? t.text.primary : t.text.muted)};
  background: ${({ $active }) => ($active ? t.bg.secondary : "transparent")};
  &:hover:not(:disabled) {
    color: ${({ $danger }) => ($danger ? t.status.error : t.text.primary)};
    background: ${t.bg.secondary};
  }
`;

/** 18px transparent icon button for row actions and heading actions. */
export const BareButton = styled.button<{ $active?: boolean }>`
  ${controlReset}
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: ${t.radius};
  color: ${({ $active }) => ($active ? t.text.primary : t.text.muted)};
  background: ${({ $active }) => ($active ? t.bg.secondary : "transparent")};
  &:hover:not(:disabled) {
    color: ${t.text.primary};
    background: ${t.bg.secondary};
  }
`;

/** Same as BareButton, but rendered as an anchor (opens on github.com). */
export const BareLink = styled.a`
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: ${t.radius};
  color: ${t.text.muted};
  text-decoration: none;
  &:hover {
    color: ${t.text.primary};
    background: ${t.bg.secondary};
  }
`;

/** 26px bordered dropdown trigger: repo picker, branch pickers, filter. */
export const PickerButton = styled.button<{ $filled?: boolean; $open?: boolean }>`
  ${controlReset}
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  max-width: 100%;
  min-width: 0;
  /* Shrinks with its label truncating, never grows past its content. */
  flex: 0 1 auto;
  padding: 0 8px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  white-space: nowrap;
  color: ${({ $filled, $open }) => ($filled || $open ? t.text.primary : t.text.secondary)};
  background: ${({ $open }) => ($open ? t.bg.secondary : t.bg.elevated)};
  &:hover:not(:disabled) {
    color: ${t.text.primary};
    background: ${t.bg.secondary};
  }
  & > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

/** Segmented control: quiet rail, the active segment lifted to elevated. */
export const SegmentGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: ${t.radius};
  background: ${t.bg.secondary};
  min-width: 0;
`;

/* 22px segments in a 2px-padded rail = 26px, the height of every other
   top-bar / filter-row control (picker, search field). */
export const Segment = styled.button<{ $active: boolean; $bare?: boolean }>`
  ${controlReset}
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  line-height: 1;
  white-space: nowrap;
  color: ${({ $active }) => ($active ? t.text.primary : t.text.muted)};
  /* $bare: the Segmented control paints the active pill itself. */
  background: ${({ $active, $bare }) => ($active && !$bare ? t.bg.elevated : "transparent")};
  &:hover:not(:disabled) {
    color: ${t.text.primary};
  }
`;

/** Fixed 12px slot for a segment's leading glyph, so a 7px dot and a 12px
 *  icon start their labels at the same x. */
export const SegmentIcon = styled.span`
  display: inline-grid;
  place-items: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
`;

/** 26px elevated search field; the input inside is bare. With $width it
 *  prefers that width but compresses down to 64px when the bar is tight. */
export const SearchBox = styled.label<{ $width?: number }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  ${({ $width }) =>
    $width
      ? css`
          flex: 1 1 ${$width}px;
          max-width: ${$width}px;
          min-width: 64px;
        `
      : css`
          width: auto;
          min-width: 0;
        `}
  padding: 0 8px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  background: ${t.bg.elevated};
  color: ${t.text.muted};
  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
    color: ${t.text.secondary};
  }
`;

export const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: ${t.text.primary};
  font: inherit;
  font-size: ${t.typography.sm};
  &::placeholder {
    color: ${t.text.muted};
  }
`;

const badgePop = keyframes`
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: none; }
`;

/** Accent counter pinned to a control (active filter count). Pops in. */
export const Badge = styled.span`
  display: inline-grid;
  place-items: center;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: ${t.accent.primary};
  color: ${t.accent.text};
  font-size: ${t.typography.micro};
  font-variant-numeric: tabular-nums;
  line-height: 1;
  animation: ${badgePop} 0.16s cubic-bezier(0.2, 0, 0, 1) both;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** Wraps a control so a Badge can sit on its corner. */
export const BadgeAnchor = styled.span`
  position: relative;
  display: inline-flex;
  & > ${Badge} {
    position: absolute;
    top: -4px;
    right: -4px;
  }
`;

/** A borderless checkbox-like row option inside dropdown menus. */
export const OptionRow = styled.span<{ $selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: ${({ $selected }) => ($selected ? t.text.primary : "inherit")};
  & > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

/** Trailing check glyph slot in an option row, kept fixed-width so
 *  labels align whether or not the option is selected. */
export const OptionCheck = styled.span`
  display: inline-grid;
  place-items: center;
  width: 12px;
  height: 12px;
  margin-left: auto;
  color: ${t.text.muted};
  flex-shrink: 0;
`;

/** Search input at the top of a dropdown (repo picker, branch picker). */
export const MenuSearch = styled.input`
  display: block;
  width: calc(100% - 8px);
  margin: 4px;
  padding: 4px 8px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  background: ${t.bg.elevated};
  color: ${t.text.primary};
  font: inherit;
  font-size: ${t.typography.sm};
  outline: none;
  &::placeholder {
    color: ${t.text.muted};
  }
  &:focus {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
`;

/** Scrolling region below a MenuSearch so the input stays put. */
export const MenuList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
`;

export const MenuHint = styled.div`
  padding: 6px 12px 8px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
`;
