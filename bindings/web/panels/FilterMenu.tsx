/**
 * Filters for the list panels, in three pieces:
 *
 *   SearchField        debounced free-text search in the top bar / sidebar
 *   FilterMenu         the Filter button and its popover: single-choice
 *                      qualifiers (sort, author, assignee, milestone) as
 *                      compact selects, then labels as a checkbox list —
 *                      the kanban plugin's filter grammar (heading, checkbox
 *                      row, count) in a popover anchored to the button
 *   ActiveFilterChips  removable chips for whatever is active
 *
 * Choices land in the shared ListFilters, which the panels encode into the
 * polled query path.
 */

import { useEffect, useState } from "react";
import styled from "styled-components";
import { Checkbox, Dropdown, Icon, Select, t, useDebounce } from "@soft-machine/sdk";
import type { ForgeLabel, ForgeMilestone, ForgeUser, ListFilters, ListSort } from "../types";
import { useForge } from "../ForgeContext";
import { useForgeQuery } from "../hooks";
import { LABEL_SEARCH_MIN, orderLabels, toggleName } from "../labels";
import {
  Badge,
  BadgeAnchor,
  ChipButton,
  FilterChip,
  GhostButton,
  InlineCount,
  SearchBox,
  SearchInput,
  ToneDot,
  sectionLabelCss,
} from "../ui";

const SORT_LABELS: Record<ListSort, string> = {
  created: "Newest",
  updated: "Recently updated",
  comments: "Most commented",
};

/** How many qualifiers are set away from their defaults. */
export function activeFilterCount(f: ListFilters): number {
  return (
    (f.author ? 1 : 0) +
    (f.assignee ? 1 : 0) +
    (f.milestone ? 1 : 0) +
    f.labels.length +
    (f.sort !== "created" ? 1 : 0)
  );
}

const CLEARED: Partial<ListFilters> = {
  author: null,
  assignee: null,
  milestone: null,
  labels: [],
  sort: "created",
};

interface FilterProps {
  filters: ListFilters;
  setFilters: (update: Partial<ListFilters>) => void;
}

/** Labels of the current repo (shared by the popover and the chip row). */
export function useRepoLabels(): ForgeLabel[] {
  const { repo } = useForge();
  return (
    useForgeQuery<{ labels: ForgeLabel[] }>(repo ? `/labels?repo=${encodeURIComponent(repo)}` : null)
      .data?.labels ?? []
  );
}

// ── Search ─────────────────────────────────────────────────────────────────

export function SearchField({
  filters,
  setFilters,
  fill,
  placeholder = "Search",
  onDraftChange,
}: FilterProps & {
  /** Stretch to the container (sidebar) instead of the 160px top-bar size. */
  fill?: boolean;
  placeholder?: string;
  /** Every keystroke, before the debounce: lets the list filter locally
   *  while GitHub's search is still on its way. */
  onDraftChange?: (draft: string) => void;
}) {
  // Local echo so typing stays responsive; the polled query only re-keys
  // after the debounce settles.
  const [draft, setDraftState] = useState(filters.q);
  const setDraft = (next: string) => {
    setDraftState(next);
    onDraftChange?.(next);
  };
  const debounced = useDebounce(draft, 200);
  useEffect(() => {
    if (debounced !== filters.q) setFilters({ q: debounced });
    // filters.q is deliberately not a dep: reacting to it would clobber
    // fresh keystrokes with the stale committed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, setFilters]);

  return (
    <SearchBox $width={fill ? undefined : 160}>
      <Icon name="Search" size={12} />
      <SearchInput
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
      />
      {draft && (
        <ClearGlyph type="button" onClick={() => setDraft("")} aria-label="Clear search">
          <Icon name="X" size={12} />
        </ClearGlyph>
      )}
    </SearchBox>
  );
}

// ── Filter popover ─────────────────────────────────────────────────────────

export function FilterMenu({
  filters,
  setFilters,
  iconOnly,
}: FilterProps & {
  /** Always icon-only (tight places like the sidebar), not just in narrow panels. */
  iconOnly?: boolean;
}) {
  const { repo } = useForge();
  const repoQuery = repo ? `?repo=${encodeURIComponent(repo)}` : null;
  const labels = useRepoLabels();
  const milestones =
    useForgeQuery<{ milestones: ForgeMilestone[] }>(repoQuery && `/milestones${repoQuery}`).data
      ?.milestones ?? [];
  const users =
    useForgeQuery<{ users: ForgeUser[] }>(repoQuery && `/assignees${repoQuery}`).data?.users ?? [];
  const [labelQuery, setLabelQuery] = useState("");

  const active = activeFilterCount(filters);
  const { shown: shownLabels, hidden: hiddenLabels } = orderLabels(labels, filters.labels, labelQuery);

  return (
    <Dropdown
      align="end"
      width={300}
      trigger={({ toggle, isOpen }) => (
        <BadgeAnchor>
          <GhostButton type="button" onClick={toggle} $active={isOpen || active > 0} title="Filter and sort" aria-label="Filter and sort">
            <Icon name="Filter" size={12} />
            {!iconOnly && <FilterLabel>Filter</FilterLabel>}
          </GhostButton>
          {active > 0 && <Badge>{active}</Badge>}
        </BadgeAnchor>
      )}
    >
      {({ close }) => (
        <Popover onKeyDown={(e) => e.stopPropagation()}>
          <Fields>
            <Field>
              <FieldLabel>Sort</FieldLabel>
              <Select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as ListSort })}>
                {(Object.keys(SORT_LABELS) as ListSort[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Author</FieldLabel>
              <Select
                value={filters.author ?? ""}
                onChange={(e) => setFilters({ author: e.target.value || null })}
                disabled={users.length === 0}
              >
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u.login} value={u.login}>
                    {u.login}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Assignee</FieldLabel>
              <Select
                value={filters.assignee ?? ""}
                onChange={(e) => setFilters({ assignee: e.target.value || null })}
                disabled={users.length === 0}
              >
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u.login} value={u.login}>
                    {u.login}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Milestone</FieldLabel>
              <Select
                value={filters.milestone ?? ""}
                onChange={(e) => setFilters({ milestone: e.target.value || null })}
                disabled={milestones.length === 0}
              >
                <option value="">{milestones.length === 0 ? "None in this repo" : "Any"}</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.title}>
                    {m.title}
                  </option>
                ))}
              </Select>
            </Field>
          </Fields>

          <Section>
            <SectionHeading>
              <span>Labels</span>
              {filters.labels.length > 0 && <InlineCount>{filters.labels.length}</InlineCount>}
              {filters.labels.length > 0 && (
                <HeadingAction type="button" onClick={() => setFilters({ labels: [] })}>
                  Clear
                </HeadingAction>
              )}
            </SectionHeading>
            {labels.length > LABEL_SEARCH_MIN && (
              <SearchBox>
                <Icon name="Search" size={12} />
                <SearchInput
                  value={labelQuery}
                  onChange={(e) => setLabelQuery(e.target.value)}
                  placeholder="Filter labels"
                  aria-label="Filter labels"
                  spellCheck={false}
                />
              </SearchBox>
            )}
            {labels.length === 0 ? (
              <Hint>No labels in this repository.</Hint>
            ) : (
              <LabelRows>
                {shownLabels.map((label) => {
                  const checked = filters.labels.includes(label.name);
                  return (
                    <FilterRow key={label.name} title={label.description ?? label.name}>
                      <Checkbox
                        checked={checked}
                        onChange={() => setFilters({ labels: toggleName(filters.labels, label.name) })}
                        aria-label={label.name}
                      />
                      <ToneDot $color={label.color ?? t.text.muted} />
                      <span className="name">{label.name}</span>
                      {label.description && <span className="desc">{label.description}</span>}
                    </FilterRow>
                  );
                })}
                {shownLabels.length === 0 && <Hint>No labels match.</Hint>}
                {hiddenLabels > 0 && <Hint>{hiddenLabels} more — type to filter</Hint>}
              </LabelRows>
            )}
            {repo && (
              <ManageLink href={`https://github.com/${repo}/labels`} target="_blank" rel="noreferrer noopener">
                <Icon name="ExternalLink" size={11} /> Manage labels on GitHub
              </ManageLink>
            )}
          </Section>

          <Footer>
            <GhostButton
              type="button"
              disabled={active === 0}
              onClick={() => {
                setFilters(CLEARED);
                setLabelQuery("");
              }}
            >
              Clear all
            </GhostButton>
            <span style={{ flex: 1 }} />
            <GhostButton type="button" $active onClick={close}>
              Done
            </GhostButton>
          </Footer>
        </Popover>
      )}
    </Dropdown>
  );
}

// ── Active filter chips ────────────────────────────────────────────────────

/**
 * The active qualifiers as removable chips under the top bar, so what is
 * narrowing the list is visible without opening the popover. Label chips
 * carry the label color; the others are quiet bordered chips.
 */
export function ActiveFilterChips({ filters, setFilters }: FilterProps) {
  const labels = useRepoLabels();
  const colorOf = (name: string) => labels.find((l) => l.name === name)?.color ?? t.text.muted;
  const chips: React.ReactNode[] = [];

  for (const name of filters.labels) {
    chips.push(
      <ChipButton
        key={`l-${name}`}
        $tone={colorOf(name)}
        $active
        title={`Stop filtering by ${name}`}
        onClick={() => setFilters({ labels: filters.labels.filter((l) => l !== name) })}
      >
        {name}
        <Icon name="X" size={11} />
      </ChipButton>
    );
  }
  const quiet = (key: string, label: string, value: string, clear: () => void) =>
    chips.push(
      <FilterChip key={key} type="button" onClick={clear} title={`Remove ${label.toLowerCase()} filter`}>
        <span className="key">{label}</span>
        <span>{value}</span>
        <Icon name="X" size={11} />
      </FilterChip>
    );
  if (filters.author) quiet("author", "Author", filters.author, () => setFilters({ author: null }));
  if (filters.assignee) quiet("assignee", "Assignee", filters.assignee, () => setFilters({ assignee: null }));
  if (filters.milestone) quiet("milestone", "Milestone", filters.milestone, () => setFilters({ milestone: null }));
  if (filters.sort !== "created") quiet("sort", "Sort", SORT_LABELS[filters.sort], () => setFilters({ sort: "created" }));

  if (chips.length === 0) return null;
  return <>{chips}</>;
}

// ── Styles ─────────────────────────────────────────────────────────────────

/** The word drops in tight panels; the icon and tooltip carry the meaning. */
const FilterLabel = styled.span`
  @container (max-width: 560px) {
    display: none;
  }
`;

const ClearGlyph = styled.button`
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
  &:hover {
    color: ${t.text.primary};
  }
`;

const Popover = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 8px;
  min-width: 0;
`;

/* Single-choice qualifiers as a two-column label/select grid, the kanban
   settings "FieldRow" grammar at menu density. */
const Fields = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
  row-gap: 6px;
  & select {
    width: 100%;
    min-width: 0;
  }
`;

const Field = styled.label`
  display: contents;
`;

const FieldLabel = styled.span`
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
  white-space: nowrap;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  ${sectionLabelCss}
`;

const HeadingAction = styled.button`
  margin-left: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: ${t.text.muted};
  font: inherit;
  font-size: ${t.typography.xs};
  cursor: pointer;
  &:hover {
    color: ${t.text.primary};
  }
`;

const LabelRows = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow-y: auto;
  margin: 0 -6px;
`;

/** Kanban's filter row: checkbox, dot, name, muted description; 24px. */
const FilterRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  min-width: 0;
  padding: 0 6px;
  border-radius: ${t.radius};
  font-size: ${t.typography.sm};
  color: ${t.text.secondary};
  cursor: pointer;
  user-select: none;
  &:hover {
    background: ${t.bg.tertiary};
    color: ${t.text.primary};
  }
  & > .name {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  & > .desc {
    flex: 1 1 auto;
    min-width: 0;
    font-size: ${t.typography.micro};
    color: ${t.text.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Hint = styled.div`
  padding: 2px 0;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
`;

const ManageLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  text-decoration: none;
  &:hover {
    color: ${t.text.primary};
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 -8px;
  padding-top: 4px;
  border-top: ${t.borderWidth} solid ${t.border};
`;
