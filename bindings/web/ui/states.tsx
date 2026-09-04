/**
 * The three states every panel needs. Loading is a ring + accent arc
 * spinner; errors are inline banners on a 12% status.error wash with a
 * bordered Retry; empty states are centered, quiet, and actionable.
 */

import type { ReactNode } from "react";
import styled, { keyframes } from "styled-components";
import { Button, EDITOR_SPACING, Icon, t, type IconName } from "@soft-machine/sdk";

export const StateView = styled.div`
  flex: 1 1 auto !important;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
  color: ${t.text.muted};
`;

export const StateTitle = styled.div`
  font-size: ${t.typography.md};
  font-weight: 500;
  color: ${t.text.secondary};
`;

export const StateText = styled.div`
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  max-width: 300px;
  overflow-wrap: anywhere;
`;

const StateIconWrap = styled.span`
  display: inline-grid;
  place-items: center;
  color: ${t.text.muted};
  opacity: 0.5;
`;

const forgeSpin = keyframes`
  to { transform: rotate(360deg); }
`;

export const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid ${t.border};
  border-top-color: ${t.accent.primary};
  border-radius: 50%;
  animation: ${forgeSpin} 0.8s linear infinite;
  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2s;
  }
`;

export function LoadingState({ label }: { label: string }) {
  return (
    <StateView role="status" aria-live="polite">
      <Spinner />
      <StateText>{label}</StateText>
    </StateView>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <StateView>
      <StateIconWrap>
        <Icon name={icon} size={24} />
      </StateIconWrap>
      <StateTitle>{title}</StateTitle>
      {text && <StateText>{text}</StateText>}
      {action}
    </StateView>
  );
}

// ── Inline error banner ────────────────────────────────────────────────────

const Banner = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: ${({ $compact }) => ($compact ? "0" : `6px ${EDITOR_SPACING.containerPadding}`)};
  padding: 6px 8px;
  border-radius: ${t.radius};
  background: color-mix(in srgb, ${t.status.error} 12%, transparent);
  color: ${t.text.primary};
  font-size: ${t.typography.sm};
  min-width: 0;
`;

const BannerIcon = styled.span`
  display: inline-grid;
  place-items: center;
  color: ${t.status.error};
  flex-shrink: 0;
  padding-top: 2px;
`;

const BannerText = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export function ErrorBanner({
  message,
  onRetry,
  compact,
}: {
  message: string;
  onRetry?: () => void;
  /** No outer margin: for use inside composers and action rows. */
  compact?: boolean;
}) {
  return (
    <Banner role="alert" $compact={compact}>
      <BannerIcon>
        <Icon name="AlertCircle" size={12} />
      </BannerIcon>
      <BannerText>{message}</BannerText>
      {onRetry && (
        <Button type="button" $compact $variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Banner>
  );
}
