/**
 * PagerRow: Previous / page N / Next controls under the lists, styled as
 * the Git panel's quiet load-more sentinel (micro muted text, transparent
 * buttons). "Has more" is inferred from a full page, so the last page can
 * show a dead Next that returns an empty page (same tradeoff GitHub's own
 * REST pagination makes without a total count).
 */

import styled from "styled-components";
import { ANIMATION, EDITOR_SPACING, Icon, t } from "@soft-machine/sdk";

interface PagerRowProps {
  page: number;
  hasMore: boolean;
  setPage: (page: number) => void;
}

export function PagerRow({ page, hasMore, setPage }: PagerRowProps) {
  if (page === 1 && !hasMore) return null;

  return (
    <Row>
      <PagerButton
        type="button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
        aria-label="Previous page"
      >
        <Icon name="ChevronLeft" size={11} />
        Prev
      </PagerButton>
      <PageIndicator>Page {page}</PageIndicator>
      <PagerButton
        type="button"
        disabled={!hasMore}
        onClick={() => setPage(page + 1)}
        aria-label="Next page"
      >
        Next
        <Icon name="ChevronRight" size={11} />
      </PagerButton>
    </Row>
  );
}

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 ${EDITOR_SPACING.containerPadding};
`;

const PagerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: transparent;
  border: none;
  border-radius: ${t.radius};
  color: ${t.text.muted};
  font-size: ${t.typography.micro};
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
    opacity: 0.4;
    cursor: default;
  }
`;

const PageIndicator = styled.span`
  color: ${t.text.muted};
  font-size: ${t.typography.micro};
`;
