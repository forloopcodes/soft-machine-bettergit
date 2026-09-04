/**
 * ListSidebar: the sidebar's "list" state, shown while the main area holds
 * an item's detail in same-panel mode. One-line rows over the same list
 * query the main list uses, with the open item held active, so switching
 * between items never leaves the panel.
 */

import type { KeyboardEvent } from "react";
import styled from "styled-components";
import { Icon } from "@soft-machine/sdk";
import type { ForgeIssue, ListFilters } from "../../types";
import type { ItemKind } from "../../hooks";
import {
  Count,
  STATE_COLORS,
  SegmentIcon,
  Segmented,
  SidebarFooter,
  SidebarGrow,
  SidebarHeading,
  SidebarNote,
  SidebarRow,
  SidebarSection,
  StateIcon,
  ToneDot,
  stateVisual,
} from "../../ui";
import { ActiveFilterChips, FilterMenu, SearchField, activeFilterCount } from "../FilterMenu";
import { Pager } from "../Pager";

interface ListSidebarProps {
  kind: ItemKind;
  items: ForgeIssue[];
  filters: ListFilters;
  setFilters: (update: Partial<ListFilters>) => void;
  totalOpen: number | null;
  totalClosed: number | null;
  active: number | null;
  onSelect: (number: number) => void;
  isLoading: boolean;
  hasMore: boolean;
  /** Keystrokes from the search field, for the panel's instant filter. */
  onDraftChange?: (draft: string) => void;
}

export function ListSidebar({
  kind,
  items,
  filters,
  setFilters,
  totalOpen,
  totalClosed,
  active,
  onSelect,
  isLoading,
  hasMore,
  onDraftChange,
}: ListSidebarProps) {
  const noun = kind === "pull" ? "pull requests" : "issues";
  const total = filters.state === "open" ? totalOpen : totalClosed;

  const rowKeyDown = (event: KeyboardEvent, number: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(number);
    }
  };

  return (
    <>
      <ListControls>
        <SidebarHeading>
          <span>{kind === "pull" ? "Pull requests" : "Issues"}</span>
          {total !== null && <Count>{total}</Count>}
        </SidebarHeading>
        {/* Same search and filters as the main list (shared ListFilters),
            so what is set here is what the list shows on the way back, and
            results come from GitHub rather than only the loaded page. */}
        <SearchRow>
          <SearchField
            fill
            filters={filters}
            setFilters={setFilters}
            placeholder={`Search ${noun}`}
            onDraftChange={onDraftChange}
          />
          <FilterMenu filters={filters} setFilters={setFilters} iconOnly />
        </SearchRow>
        <Segmented
          fill
          value={filters.state}
          onChange={(state) => setFilters({ state })}
          options={[
            {
              value: "open",
              label: (
                <>
                  <SegmentIcon>
                    <ToneDot $color={STATE_COLORS.open} />
                  </SegmentIcon>
                  Open
                </>
              ),
            },
            {
              value: "closed",
              label: (
                <>
                  <SegmentIcon>
                    <ToneDot $color={STATE_COLORS.done} />
                  </SegmentIcon>
                  Closed
                </>
              ),
            },
          ]}
        />
        {activeFilterCount(filters) > 0 && (
          <ChipsRow>
            <ActiveFilterChips filters={filters} setFilters={setFilters} />
          </ChipsRow>
        )}
      </ListControls>
      {/* Keyed by state / page / query so the rows replay their stagger
          whenever the set changes. */}
      <SidebarGrow role="list" key={`${filters.state}:${filters.page}:${filters.q}`}>
        {items.map((item, index) => {
          const visual = stateVisual(item);
          const isActive = item.number === active;
          return (
            <SidebarRow
              key={item.number}
              role="listitem"
              tabIndex={0}
              $active={isActive}
              $index={index}
              aria-current={isActive || undefined}
              onClick={() => onSelect(item.number)}
              onKeyDown={(e) => rowKeyDown(e, item.number)}
              title={item.title}
            >
              <StateIcon $color={visual.color}>
                <Icon name={visual.icon} size={12} />
              </StateIcon>
              <Count>#{item.number}</Count>
              <span className="label">{item.title}</span>
            </SidebarRow>
          );
        })}
        {items.length === 0 && (
          <SidebarNote $nowrap>
            {isLoading
              ? "Loading…"
              : filters.q.trim()
                ? `No ${noun} match "${filters.q.trim()}".`
                : `No ${filters.state} ${noun}.`}
          </SidebarNote>
        )}
      </SidebarGrow>
      {(filters.page > 1 || hasMore) && (
        <PagerFooter>
          <Pager page={filters.page} hasMore={hasMore} setPage={(page) => setFilters({ page })} />
        </PagerFooter>
      )}
    </>
  );
}

/* Heading, search + filter, segments, chips: one 6px rhythm, with 4px
   more before the rows start so the controls read as one block. */
const ListControls = styled(SidebarSection)`
  gap: 6px;
  padding-bottom: 6px;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  & > label {
    flex: 1 1 auto;
  }
`;

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
`;

const PagerFooter = styled(SidebarFooter)`
  justify-content: center;
  padding-block: 6px;
`;
