/**
 * The one composer capsule: an elevated, bordered container at the major-
 * input radius, with a borderless title input and textarea and a bottom
 * toolbar. Used for new issues, new pull requests and comment replies so
 * every text-entry surface in the plugin is the same object.
 */

import styled from "styled-components";
import { EDITOR_SPACING, t } from "@soft-machine/sdk";

/** Outer inset when the composer is docked in a panel body. */
export const ComposerDock = styled.div`
  padding: 6px ${EDITOR_SPACING.containerPadding};
  flex: 0 0 auto;
`;

export const Composer = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: ${t.bg.elevated};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.5);
  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
`;

/** Optional row above the inputs (branch pickers for a new PR). */
export const ComposerHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 10px 0;
  min-width: 0;
  flex-wrap: wrap;
`;

export const ComposerInput = styled.input`
  padding: 8px 10px 4px;
  background: transparent;
  border: none;
  outline: none;
  color: ${t.text.primary};
  font: inherit;
  font-size: ${t.typography.base};
  min-width: 0;
  &::placeholder {
    color: ${t.text.muted};
  }
`;

export const ComposerTextarea = styled.textarea`
  padding: 0 10px;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  color: ${t.text.primary};
  font: inherit;
  font-size: ${t.typography.sm};
  line-height: 1.4;
  max-height: 160px;
  min-width: 0;
  &::placeholder {
    color: ${t.text.muted};
  }
`;

/** Reply variant: the textarea carries the top padding itself. */
export const ComposerReplyTextarea = styled(ComposerTextarea)`
  padding-top: 8px;
`;

export const ComposerToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 6px;
  min-width: 0;
  flex-wrap: wrap;
`;

export const ComposerSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

/** Hint / draft label sitting in the toolbar. */
export const ComposerHint = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${t.text.muted};
  font-size: ${t.typography.xs};
  cursor: pointer;
  user-select: none;
`;
