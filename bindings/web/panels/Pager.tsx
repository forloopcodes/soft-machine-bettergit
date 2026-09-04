/**
 * Pager: compact Prev / Page N / Next controls for the list filter row and
 * the sidebar list. "Has more" is inferred from a full page, so the last
 * page can show a dead Next that returns an empty page (the same tradeoff
 * GitHub's REST pagination makes without a total count).
 */

import { Icon } from "@soft-machine/sdk";
import styled from "styled-components";
import { BareButton, Count } from "../ui";

interface PagerProps {
  page: number;
  hasMore: boolean;
  setPage: (page: number) => void;
}

export function Pager({ page, hasMore, setPage }: PagerProps) {
  if (page === 1 && !hasMore) return null;
  return (
    <Wrap>
      <BareButton
        type="button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
        aria-label="Previous page"
        title="Previous page"
      >
        <Icon name="ChevronLeft" size={12} />
      </BareButton>
      <Count>p.{page}</Count>
      <BareButton
        type="button"
        disabled={!hasMore}
        onClick={() => setPage(page + 1)}
        aria-label="Next page"
        title="Next page"
      >
        <Icon name="ChevronRight" size={12} />
      </BareButton>
    </Wrap>
  );
}

const Wrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;
