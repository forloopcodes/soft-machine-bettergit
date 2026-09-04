/**
 * ItemList: the two-line issue / pull rows of the main list. Clicking a row
 * opens the item the way the user's setting says; the hover-revealed
 * actions always offer send-to-agent, open in a new panel, and github.com.
 */

import type { KeyboardEvent, MouseEvent } from "react";
import { Icon } from "@soft-machine/sdk";
import type { ForgeIssue } from "../types";
import { itemSummaryContext } from "../agentContext";
import { useForge } from "../ForgeContext";
import { useSendToAgent } from "../hooks";
import {
  BareButton,
  BareLink,
  ChipRail,
  Count,
  ItemMetaLine,
  ItemRow,
  ItemTitle,
  ItemTitleLine,
  LabelChips,
  Meta,
  RowActions,
  Spacer,
  StateIcon,
  relativeTime,
  stateVisual,
} from "../ui";

interface ItemListProps {
  items: ForgeIssue[];
  activeNumber: number | null;
  onOpen: (number: number) => void;
  /** Pop-out into the dedicated detail panel (hidden when null). */
  onOpenPanel: ((number: number) => void) | null;
  /** Label names currently filtering the list; clicking a chip toggles. */
  activeLabels: readonly string[];
  onToggleLabel: (name: string) => void;
}

export function ItemList({ items, activeNumber, onOpen, onOpenPanel, activeLabels, onToggleLabel }: ItemListProps) {
  const { provider, repo } = useForge();
  const { canSend, send } = useSendToAgent();
  const now = Date.now();

  const stop = (event: MouseEvent) => event.stopPropagation();

  const sendItem = (event: MouseEvent, item: ForgeIssue) => {
    event.stopPropagation();
    if (repo) send(`${repo}#${item.number}`, itemSummaryContext(provider, repo, item));
  };

  const rowKeyDown = (event: KeyboardEvent, number: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(number);
    }
  };

  return (
    <div role="list">
      {items.map((item, index) => {
        const visual = stateVisual(item);
        const active = item.number === activeNumber;
        return (
          <ItemRow
            key={item.number}
            role="listitem"
            tabIndex={0}
            $active={active}
            $index={index}
            aria-current={active || undefined}
            onClick={() => onOpen(item.number)}
            onKeyDown={(e) => rowKeyDown(e, item.number)}
          >
            <ItemTitleLine>
              <StateIcon $color={visual.color} title={visual.label}>
                <Icon name={visual.icon} size={12} />
              </StateIcon>
              <ItemTitle title={item.title}>{item.title}</ItemTitle>
              <RowActions>
                {canSend && (
                  <BareButton
                    type="button"
                    onClick={(e) => sendItem(e, item)}
                    aria-label={`Send #${item.number} to the agent`}
                    title="Send to agent"
                  >
                    <Icon name="Send" size={12} />
                  </BareButton>
                )}
                {onOpenPanel && (
                  <BareButton
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPanel(item.number);
                    }}
                    aria-label={`Open #${item.number} in a new panel`}
                    title="Open in new panel"
                  >
                    <Icon name="PanelRight" size={12} />
                  </BareButton>
                )}
                <BareLink
                  href={item.webUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Open #${item.number} on GitHub`}
                  title="Open on GitHub"
                  onClick={stop}
                >
                  <Icon name="ExternalLink" size={12} />
                </BareLink>
              </RowActions>
            </ItemTitleLine>
            <ItemMetaLine>
              <Count>#{item.number}</Count>
              <Meta>
                {item.author?.login ?? "unknown"} · {relativeTime(item.createdAt, now)}
              </Meta>
              {item.commentCount > 0 && (
                <Meta title={`${item.commentCount} comments`}>
                  <Icon name="MessageSquare" size={11} /> {item.commentCount}
                </Meta>
              )}
              <Spacer />
              {item.labels.length > 0 && (
                <ChipRail>
                  <LabelChips labels={item.labels} active={activeLabels} onToggle={onToggleLabel} />
                </ChipRail>
              )}
            </ItemMetaLine>
          </ItemRow>
        );
      })}
    </div>
  );
}
