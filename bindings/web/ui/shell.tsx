/**
 * Panel shell primitives, the manual's Panel Design chapter applied: a
 * tool-panel root on bg.tertiary, a 42px top bar, and a collapsible 224px
 * sidebar with fixed / scrolling / footer regions. Every list and detail
 * panel in the plugin is built from exactly these pieces so the four read
 * as one product.
 *
 * Hover feedback never transitions; only the sidebar collapse animates, and
 * it is gated on prefers-reduced-motion.
 */

import styled, { css } from "styled-components";
import { EDITOR_SPACING, t } from "@soft-machine/sdk";

/** Below this container width the sidebar hides and the breadcrumb takes over. */
export const SIDEBAR_BREAKPOINT = "600px";
/** Below this the top bar stacks its two groups. */
export const TOPBAR_STACK_BREAKPOINT = "420px";

export const Root = styled.div`
  container-type: inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  color: ${t.text.primary};
  background: ${t.bg.tertiary};
  font-size: ${t.typography.base};
`;

export const TopBar = styled.div`
  flex: 0 0 auto;
  min-width: 0;
  min-height: 42px;
  padding: 0 ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: ${t.bg.tertiary};
  border-bottom: ${t.borderWidth} solid ${t.border};

  @container (max-width: ${TOPBAR_STACK_BREAKPOINT}) {
    min-height: 0;
    padding-block: 6px;
    align-items: stretch;
    flex-direction: column;
    gap: 4px;
  }
`;

/**
 * $grow: share the bar's width with the other group (children must be
 * shrinkable: min-width 0, truncation). $end: pack children to the right.
 */
export const ToolbarGroup = styled.div<{ $grow?: boolean; $end?: boolean }>`
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 4px;
  flex: ${({ $grow }) => ($grow ? "1 1 0" : "0 0 auto")};
  justify-content: ${({ $end }) => ($end ? "flex-end" : "flex-start")};

  @container (max-width: ${TOPBAR_STACK_BREAKPOINT}) {
    width: 100%;
    flex: 0 0 auto;
    &:last-child {
      overflow-x: auto;
      scrollbar-width: none;
    }
    &:last-child::-webkit-scrollbar {
      display: none;
    }
  }
`;

/** The slim strip under the top bar: state segment, result count, pager. */
export const FilterRow = styled.div`
  flex: 0 0 auto;
  min-height: 28px;
  min-width: 0;
  padding: 3px ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
`;

export const Workspace = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
`;

export const Main = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

/** Scrolling body region inside Main; hides its scrollbar in narrow panels. */
export const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  & > * {
    flex-shrink: 0;
  }

  @container (max-width: ${TOPBAR_STACK_BREAKPOINT}) {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

/** Sidebar width: the user's preference (default 224px), never more than a
 *  share of the panel, so the main area always keeps ~55% of the width. */
const sidebarWidth = (px: number) => `min(${px}px, 45cqw)`;

export const Sidebar = styled.aside<{ $open: boolean; $width: number; $dragging?: boolean }>`
  position: relative;
  flex: 0 0 ${({ $open, $width }) => ($open ? sidebarWidth($width) : "0px")};
  width: ${({ $open, $width }) => ($open ? sidebarWidth($width) : "0px")};
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: ${({ $dragging }) => ($dragging ? "visible" : "hidden")};
  background: ${t.bg.tertiary};
  border-right: ${({ $open }) =>
    $open ? `${t.borderWidth} solid ${t.border}` : "none"};
  /* Open/close animates; a live drag must track the pointer exactly. */
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : "flex-basis 0.16s cubic-bezier(0.2, 0, 0, 1), width 0.16s cubic-bezier(0.2, 0, 0, 1)"};

  /* Content keeps the sidebar's full width while the aside closes, so the
     moving edge clips it instead of reflowing text; it also fades a touch
     faster than the width, so nothing shows squashed against the edge. */
  & > [data-sidebar-content] {
    width: ${({ $width }) => sidebarWidth($width)};
    min-width: ${({ $width }) => sidebarWidth($width)};
    overflow: hidden;
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    transition: opacity ${({ $open }) => ($open ? "0.16s 0.04s" : "0.1s")} ease;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    & > [data-sidebar-content] {
      transition: none;
    }
  }

  @container (max-width: ${SIDEBAR_BREAKPOINT}) {
    display: none;
  }
`;

/**
 * Drag handle on the sidebar's right edge. Invisible at rest; the border
 * brightens on hover and takes the accent while dragging (an active state).
 */
export const SidebarResizeHandle = styled.div<{ $active?: boolean }>`
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 7px;
  cursor: col-resize;
  z-index: 1;
  touch-action: none;
  &::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: ${t.borderWidth};
    background: ${({ $active }) => ($active ? t.accent.primary : "transparent")};
  }
  &:hover::after {
    background: ${({ $active }) =>
      $active ? t.accent.primary : `color-mix(in srgb, ${t.text.muted} 45%, ${t.border})`};
  }
`;

export const SidebarSection = styled.div`
  flex: 0 0 auto;
  min-height: 0;
  padding: 8px ${EDITOR_SPACING.containerPadding} 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const SidebarGrow = styled(SidebarSection)`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

/** The manual's section-label recipe, laid out as a heading row with room
 *  for a trailing count or action. */
export const sectionLabelCss = css`
  font-size: ${t.typography.xs};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${t.text.muted};
`;

/**
 * Collapsible section heading: the section-label recipe as a button with
 * a rotating chevron. Children: a `.title` span, then a Count or nothing.
 */
export const HeadingButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 22px;
  min-width: 0;
  padding: 0 6px 0 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  user-select: none;
  text-align: left;
  ${sectionLabelCss}
  &:hover {
    color: ${t.text.secondary};
  }
  & > .title {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export const HeadingChevron = styled.span<{ $open: boolean }>`
  display: inline-grid;
  place-items: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg);
  transition: transform 0.15s ease;
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const SidebarHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 22px;
  min-width: 0;
  padding: 0 6px;
  user-select: none;
  ${sectionLabelCss}

  & > span:first-child {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

/** Quiet note inside a sidebar section (empty / loading hints). $nowrap
 *  for one-line hints that should truncate rather than wrap. */
export const SidebarNote = styled.div<{ $nowrap?: boolean }>`
  padding: 4px 6px 8px;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  min-width: 0;
  ${({ $nowrap }) =>
    $nowrap
      ? css`
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `
      : css`
          overflow-wrap: anywhere;
        `}
`;

export const SidebarFooter = styled.div`
  flex: 0 0 auto;
  padding: 10px ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: ${t.borderWidth} solid ${t.border};
  min-width: 0;
`;

export const FooterText = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;

  & > span:first-child {
    font-size: ${t.typography.sm};
    color: ${t.text.primary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  & > span:not(:first-child) {
    font-size: ${t.typography.xs};
    color: ${t.text.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

/** Section header inside a detail body: label + count, 12px inset. */
export const BodySectionHeading = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 8px ${EDITOR_SPACING.containerPadding} 2px;
  user-select: none;
  ${sectionLabelCss}
`;

/** Content block with the standard container inset. */
export const Block = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 ${EDITOR_SPACING.containerPadding} 8px;
  min-width: 0;
`;

export const Spacer = styled.span`
  flex: 1;
  min-width: 0;
`;

/** Breadcrumb separator between the repo and the item number. */
export const CrumbSeparator = styled.span`
  color: ${t.text.muted};
  font-size: ${t.typography.sm};
  flex-shrink: 0;
  user-select: none;
`;

/** The open item's title in the breadcrumb; takes whatever width is left. */
export const CrumbTitle = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  font-size: ${t.typography.sm};
  color: ${t.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
