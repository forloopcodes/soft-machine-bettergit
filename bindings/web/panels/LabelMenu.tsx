/**
 * LabelMenu: the label list used inside both dropdowns (the list filter and
 * the detail editor). Search box past eight labels, selected first, name
 * with its color dot, description beneath, a check for applied ones, and a
 * "manage on GitHub" link because labels cannot be created here.
 */

import { useState } from "react";
import styled from "styled-components";
import { DropdownItem, Icon, t } from "@soft-machine/sdk";
import type { ForgeLabel } from "../types";
import { LABEL_SEARCH_MIN, orderLabels } from "../labels";
import { MenuHint, MenuSearch, OptionCheck, OptionRow, ToneDot } from "../ui";

interface LabelMenuProps {
  labels: ForgeLabel[];
  selected: readonly string[];
  onToggle: (name: string) => void;
  /** owner/name, for the manage link. */
  repo: string;
  /** Rendered when the repository has no labels at all. */
  emptyText?: string;
  /** Optional trailing item (e.g. "Clear labels"). */
  footer?: React.ReactNode;
}

export function LabelMenu({
  labels,
  selected,
  onToggle,
  repo,
  emptyText = "No labels in this repository.",
  footer,
}: LabelMenuProps) {
  const [query, setQuery] = useState("");
  if (labels.length === 0) {
    return (
      <>
        <MenuHint>{emptyText}</MenuHint>
        <ManageRow repo={repo} />
      </>
    );
  }
  const { shown, hidden } = orderLabels(labels, selected, query);
  return (
    <>
      {labels.length > LABEL_SEARCH_MIN && (
        <MenuSearch
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter labels"
          aria-label="Filter labels"
          spellCheck={false}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
      {shown.map((label) => {
        const applied = selected.includes(label.name);
        return (
          <DropdownItem key={label.name} onClick={() => onToggle(label.name)}>
            <LabelOption>
              <OptionRow $selected={applied}>
                <ToneDot $color={label.color ?? t.text.muted} />
                <span>{label.name}</span>
                <OptionCheck>{applied && <Icon name="Check" size={12} />}</OptionCheck>
              </OptionRow>
              {label.description && <Description>{label.description}</Description>}
            </LabelOption>
          </DropdownItem>
        );
      })}
      {shown.length === 0 && <MenuHint>No labels match.</MenuHint>}
      {hidden > 0 && <MenuHint>{hidden} more — type to filter</MenuHint>}
      {footer}
      <ManageRow repo={repo} />
    </>
  );
}

function ManageRow({ repo }: { repo: string }) {
  return (
    <ManageLink href={`https://github.com/${repo}/labels`} target="_blank" rel="noreferrer noopener">
      <Icon name="ExternalLink" size={11} /> Manage labels on GitHub
    </ManageLink>
  );
}

const LabelOption = styled.span`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const Description = styled.span`
  padding-left: 13px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ManageLink = styled.a`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px 8px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  text-decoration: none;
  &:hover {
    color: ${t.text.primary};
  }
`;
