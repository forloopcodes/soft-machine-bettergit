/**
 * ItemPicker: the breadcrumb's "#46 title ▾" dropdown for switching to
 * another pull request or issue while reading one. Shown when the sidebar
 * list is not visible (closed, or auto-hidden by width); it offers the
 * current list page with a local filter over number and title.
 */

import { useMemo, useState } from "react";
import styled from "styled-components";
import { Dropdown, DropdownItem, DropdownSectionLabel, Icon, t } from "@soft-machine/sdk";
import type { ForgeIssue } from "../types";
import type { ItemKind } from "../hooks";
import {
  Count,
  MenuHint,
  MenuList,
  MenuSearch,
  OptionCheck,
  OptionRow,
  PickerButton,
  StateIcon,
  stateVisual,
} from "../ui";

interface ItemPickerProps {
  kind: ItemKind;
  items: ForgeIssue[];
  number: number;
  title: string | null;
  hasMore: boolean;
  onSelect: (number: number) => void;
}

export function ItemPicker({ kind, items, number, title, hasMore, onSelect }: ItemPickerProps) {
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    const asNumber = needle.replace(/^#/, "");
    return items.filter(
      (item) =>
        String(item.number).startsWith(asNumber) || item.title.toLowerCase().includes(needle)
    );
  }, [items, search]);
  const noun = kind === "pull" ? "pull requests" : "issues";

  return (
    <Dropdown
      align="start"
      width={320}
      trigger={({ toggle, isOpen }) => (
        <PickerButton
          type="button"
          onClick={toggle}
          $open={isOpen}
          $filled
          title={title ? `#${number} ${title}` : `#${number}`}
          aria-label={`Switch ${kind === "pull" ? "pull request" : "issue"}`}
        >
          <Count>#{number}</Count>
          {title && <span>{title}</span>}
          <Icon name="ChevronDown" size={12} />
        </PickerButton>
      )}
    >
      {({ close }) => (
        <>
          <MenuSearch
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Filter ${noun}`}
            aria-label={`Filter ${noun}`}
            autoFocus
            spellCheck={false}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <MenuList>
            <DropdownSectionLabel>
              {shown.length === 0 ? "No matches" : kind === "pull" ? "Pull requests" : "Issues"}
            </DropdownSectionLabel>
            {shown.map((item) => {
              const visual = stateVisual(item);
              const active = item.number === number;
              return (
                <DropdownItem
                  key={item.number}
                  onClick={() => {
                    onSelect(item.number);
                    close();
                  }}
                >
                  <OptionRow $selected={active}>
                    <StateIcon $color={visual.color} title={visual.label}>
                      <Icon name={visual.icon} size={12} />
                    </StateIcon>
                    <Count>#{item.number}</Count>
                    <ItemTitle>{item.title}</ItemTitle>
                    <OptionCheck>{active && <Icon name="Check" size={12} />}</OptionCheck>
                  </OptionRow>
                </DropdownItem>
              );
            })}
            {hasMore && !search && <MenuHint>Showing this page — filter to narrow, or page the list.</MenuHint>}
          </MenuList>
        </>
      )}
    </Dropdown>
  );
}

const ItemTitle = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${t.text.primary};
`;
