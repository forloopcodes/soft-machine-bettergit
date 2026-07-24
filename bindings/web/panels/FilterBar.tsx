/**
 * FilterBar: the list header shared by the Issues and Pull Requests
 * panels, formatted like github.com's list header: Open/Closed count
 * tabs on the left, then one quiet dropdown per qualifier (Author,
 * Label, Milestone, Assignee, Sort) that wraps in narrow panels. All
 * controls use the Git panel's quiet-chip treatment. Choices land in
 * the shared ListFilters, which the panels encode into the polled
 * query path.
 */

import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import {
  ANIMATION,
  Dropdown,
  DropdownItem,
  DropdownSectionLabel,
  EDITOR_SPACING,
  Icon,
  t,
  useDebounce,
} from "@soft-machine/sdk";
import {
  type ForgeLabel,
  type ForgeMilestone,
  type ForgeUser,
  type ListFilters,
  type ListSort,
} from "../types";
import { useForgeQuery } from "../hooks";
import { useForge } from "../ForgeContext";
import { STATE_COLORS } from "./shared";

const SORT_LABELS: Record<ListSort, string> = {
  created: "Newest",
  updated: "Recently updated",
  comments: "Most commented",
};

interface FilterBarProps {
  filters: ListFilters;
  setFilters: (update: Partial<ListFilters>) => void;
  totalOpen: number | null;
  totalClosed: number | null;
}

/** One qualifier dropdown: quiet trigger with a caret, accent when active. */
function QualifierDropdown({
  label,
  active,
  width = 200,
  children,
}: {
  label: string;
  active: boolean;
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <Dropdown
      align="end"
      width={width}
      trigger={({ toggle, isOpen }) => (
        <QualifierTrigger
          type="button"
          onClick={toggle}
          $open={isOpen}
          $active={active}
        >
          {label}
          <Icon name="ChevronDown" size={9} />
        </QualifierTrigger>
      )}
    >
      {({ close }) => <>{children(close)}</>}
    </Dropdown>
  );
}

export function FilterBar({
  filters,
  setFilters,
  totalOpen,
  totalClosed,
}: FilterBarProps) {
  const { repo } = useForge();

  // Local echo of the search text so typing stays responsive; the polled
  // query only re-keys after the debounce settles.
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const debouncedSearch = useDebounce(searchDraft, 300);
  useEffect(() => {
    if (debouncedSearch !== filters.q) {
      setFilters({ q: debouncedSearch });
    }
    // filters.q is deliberately not a dep: it only changes through this
    // effect or a full reset, and reacting to it would clobber fresh
    // keystrokes with the stale committed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, setFilters]);

  // Dropdown option sources. Small per-repo collections; polled at the
  // ambient cadence like everything else so label/milestone edits made on
  // the provider site show up without a manual refresh.
  const repoQuery = repo ? `?repo=${encodeURIComponent(repo)}` : null;
  const labels =
    useForgeQuery<{ labels: ForgeLabel[] }>(repoQuery && `/labels${repoQuery}`)
      .data?.labels ?? [];
  const milestones =
    useForgeQuery<{ milestones: ForgeMilestone[] }>(
      repoQuery && `/milestones${repoQuery}`
    ).data?.milestones ?? [];
  const users =
    useForgeQuery<{ users: ForgeUser[] }>(repoQuery && `/assignees${repoQuery}`)
      .data?.users ?? [];

  const toggleLabel = (name: string) => {
    setFilters({
      labels: filters.labels.includes(name)
        ? filters.labels.filter((l) => l !== name)
        : [...filters.labels, name],
    });
  };

  return (
    <Bar>
      <SearchRow>
        <SearchIconSlot>
          <Icon name="Search" size={12} />
        </SearchIconSlot>
        <SearchInput
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search"
          aria-label="Search"
          spellCheck={false}
        />
        {searchDraft && (
          <ClearButton
            type="button"
            onClick={() => setSearchDraft("")}
            aria-label="Clear search"
          >
            <Icon name="X" size={11} />
          </ClearButton>
        )}

        {/* github.com's "Labels 9 / Milestones 0" chips beside the search
            box: counted browsers over the repo's sets; picking an entry
            applies it as a filter. */}
        {labels.length > 0 && (
          <Dropdown
            align="end"
            width={230}
            trigger={({ toggle }) => (
              <HeaderChip type="button" onClick={toggle}>
                <Icon name="Hash" size={10} />
                Labels
                <ChipCount>{labels.length}</ChipCount>
              </HeaderChip>
            )}
          >
            {() => (
              <>
                {labels.map((label) => (
                  <DropdownItem
                    key={label.name}
                    onClick={() => toggleLabel(label.name)}
                  >
                    <LabelBrowseRow>
                      <OptionRow
                        $selected={filters.labels.includes(label.name)}
                      >
                        <OptionDot $color={label.color ?? t.text.muted} />
                        {label.name}
                        {filters.labels.includes(label.name) && (
                          <Icon name="Check" size={10} />
                        )}
                      </OptionRow>
                      {label.description && (
                        <LabelDescription>{label.description}</LabelDescription>
                      )}
                    </LabelBrowseRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
        )}
        {milestones.length > 0 && (
          <Dropdown
            align="end"
            width={220}
            trigger={({ toggle }) => (
              <HeaderChip type="button" onClick={toggle}>
                <Icon name="Target" size={10} />
                Milestones
                <ChipCount>{milestones.length}</ChipCount>
              </HeaderChip>
            )}
          >
            {({ close }) => (
              <>
                {milestones.map((m) => (
                  <DropdownItem
                    key={m.id}
                    onClick={() => {
                      setFilters({
                        milestone:
                          filters.milestone === m.title ? null : m.title,
                      });
                      close();
                    }}
                  >
                    <LabelBrowseRow>
                      <OptionRow $selected={filters.milestone === m.title}>
                        {m.title}
                      </OptionRow>
                      <LabelDescription>
                        {m.state === "open" ? "Open" : "Closed"}
                      </LabelDescription>
                    </LabelBrowseRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
        )}
      </SearchRow>

      <ControlsRow>
        <StateTab
          type="button"
          $active={filters.state === "open"}
          onClick={() => setFilters({ state: "open" })}
        >
          <TabDot $color={STATE_COLORS.open} />
          Open{totalOpen !== null ? ` ${totalOpen}` : ""}
        </StateTab>
        <StateTab
          type="button"
          $active={filters.state === "closed"}
          onClick={() => setFilters({ state: "closed" })}
        >
          <TabDot $color={STATE_COLORS.done} />
          Closed{totalClosed !== null ? ` ${totalClosed}` : ""}
        </StateTab>
        <ControlsSpacer />

        {users.length > 0 && (
          <QualifierDropdown label="Author" active={filters.author !== null}>
            {(close) => (
              <>
                <DropdownItem
                  onClick={() => {
                    setFilters({ author: null });
                    close();
                  }}
                >
                  <OptionRow $selected={filters.author === null}>
                    Anyone
                  </OptionRow>
                </DropdownItem>
                {users.map((user) => (
                  <DropdownItem
                    key={user.login}
                    onClick={() => {
                      setFilters({ author: user.login });
                      close();
                    }}
                  >
                    <OptionRow $selected={filters.author === user.login}>
                      {user.login}
                    </OptionRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </QualifierDropdown>
        )}

        {labels.length > 0 && (
          <QualifierDropdown label="Label" active={filters.labels.length > 0}>
            {() => (
              <>
                <DropdownSectionLabel>
                  Toggle labels
                  {filters.labels.length > 0
                    ? ` (${filters.labels.length})`
                    : ""}
                </DropdownSectionLabel>
                {labels.map((label) => (
                  <DropdownItem
                    key={label.name}
                    onClick={() => toggleLabel(label.name)}
                  >
                    <OptionRow $selected={filters.labels.includes(label.name)}>
                      <OptionDot $color={label.color ?? t.text.muted} />
                      {label.name}
                      {filters.labels.includes(label.name) && (
                        <Icon name="Check" size={10} />
                      )}
                    </OptionRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </QualifierDropdown>
        )}

        {milestones.length > 0 && (
          <QualifierDropdown
            label="Milestone"
            active={filters.milestone !== null}
          >
            {(close) => (
              <>
                <DropdownItem
                  onClick={() => {
                    setFilters({ milestone: null });
                    close();
                  }}
                >
                  <OptionRow $selected={filters.milestone === null}>
                    Any
                  </OptionRow>
                </DropdownItem>
                {milestones.map((m) => (
                  <DropdownItem
                    key={m.id}
                    onClick={() => {
                      setFilters({ milestone: m.title });
                      close();
                    }}
                  >
                    <OptionRow $selected={filters.milestone === m.title}>
                      {m.title}
                    </OptionRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </QualifierDropdown>
        )}

        {users.length > 0 && (
          <QualifierDropdown
            label="Assignee"
            active={filters.assignee !== null}
          >
            {(close) => (
              <>
                <DropdownItem
                  onClick={() => {
                    setFilters({ assignee: null });
                    close();
                  }}
                >
                  <OptionRow $selected={filters.assignee === null}>
                    Anyone
                  </OptionRow>
                </DropdownItem>
                {users.map((user) => (
                  <DropdownItem
                    key={user.login}
                    onClick={() => {
                      setFilters({ assignee: user.login });
                      close();
                    }}
                  >
                    <OptionRow $selected={filters.assignee === user.login}>
                      {user.login}
                    </OptionRow>
                  </DropdownItem>
                ))}
              </>
            )}
          </QualifierDropdown>
        )}

        <QualifierDropdown
          label="Sort"
          active={filters.sort !== "created"}
          width={180}
        >
          {(close) => (
            <>
              {(Object.keys(SORT_LABELS) as ListSort[]).map((sort) => (
                <DropdownItem
                  key={sort}
                  onClick={() => {
                    setFilters({ sort });
                    close();
                  }}
                >
                  <OptionRow $selected={filters.sort === sort}>
                    {SORT_LABELS[sort]}
                  </OptionRow>
                </DropdownItem>
              ))}
            </>
          )}
        </QualifierDropdown>
      </ControlsRow>
    </Bar>
  );
}

const Bar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px ${EDITOR_SPACING.containerPadding} 4px;
`;

// Borderless inline search, the Git panel's quiet-control treatment: no
// box until interaction, bg.secondary surface on hover/focus.
const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 6px;
  border-radius: ${t.radius};
  background: transparent;
  transition: background ${ANIMATION.fast};

  &:hover,
  &:focus-within {
    background: ${t.bg.secondary};
  }
`;

const SearchIconSlot = styled.span`
  display: inline-flex;
  color: ${t.text.muted};
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 4px 0;
  background: transparent;
  border: none;
  outline: none;
  color: ${t.text.primary};
  font-size: ${t.typography.sm};
  font-family: inherit;

  &::placeholder {
    color: ${t.text.muted};
  }
`;

const ClearButton = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 2px;
  background: transparent;
  border: none;
  border-radius: ${t.radius};
  color: ${t.text.muted};
  cursor: pointer;

  &:hover {
    color: ${t.text.primary};
  }
`;

const HeaderChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  background: transparent;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: 999px;
  color: ${t.text.muted};
  font-size: ${t.typography.micro};
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background ${ANIMATION.fast},
    color ${ANIMATION.fast};

  &:hover {
    background: ${t.bg.secondary};
    color: ${t.text.primary};
  }
`;

const ChipCount = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  background: ${t.bg.tertiary};
  padding: 0 5px;
  border-radius: 999px;
`;

const LabelBrowseRow = styled.span`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const LabelDescription = styled.span`
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Tabs on the left, qualifier dropdowns on the right; wraps in narrow
// panels instead of clipping (github.com's list header row).
const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex-wrap: wrap;
`;

// Quiet chips, the Git panel BranchChip treatment: transparent with a
// transparent border, surfacing bg + border on hover/active.
const StateTab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  background: ${(p) => (p.$active ? t.bg.secondary : "transparent")};
  border: ${t.borderWidth} solid
    ${(p) => (p.$active ? t.border : "transparent")};
  border-radius: ${t.radius};
  color: ${(p) => (p.$active ? t.text.primary : t.text.muted)};
  font-size: ${t.typography.sm};
  font-family: inherit;
  cursor: pointer;
  transition:
    background ${ANIMATION.fast},
    border-color ${ANIMATION.fast},
    color ${ANIMATION.fast};

  &:hover {
    background: ${t.bg.secondary};
    color: ${t.text.primary};
  }
`;

const TabDot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(p) => p.$color};
`;

const ControlsSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const QualifierTrigger = styled.button<{ $open: boolean; $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  background: ${(p) => (p.$open ? t.bg.secondary : "transparent")};
  border: none;
  border-radius: ${t.radius};
  color: ${(p) => (p.$active ? t.accent.primary : t.text.muted)};
  font-size: ${t.typography.micro};
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background ${ANIMATION.fast},
    color ${ANIMATION.fast};

  &:hover {
    background: ${t.bg.secondary};
    color: ${(p) => (p.$active ? t.accent.primary : t.text.primary)};
  }
`;

const OptionRow = styled.span<{ $selected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${(p) => (p.$selected ? t.accent.primary : "inherit")};
`;

const OptionDot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`;
