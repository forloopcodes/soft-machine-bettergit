/**
 * Issue detail: header, actions (send to agent, labels), the conversation,
 * and the pinned reply footer with close / reopen beside "Comment".
 * Rendered inside the Issues panel (same-panel mode) or the Issue Detail
 * panel. Mirrors PullDetailView's skeleton exactly, minus the tabs.
 */

import type { ReactNode } from "react";
import { Dropdown, DropdownItem, Icon } from "@soft-machine/sdk";
import type { ForgeComment, ForgeIssueDetail } from "../../types";
import { issueAgentContext } from "../../agentContext";
import { useForge } from "../../ForgeContext";
import { useForgeMutation, useForgeQuery } from "../../hooks";
import { EmptyState, ErrorBanner, GhostButton, LoadingState, Scroll } from "../../ui";
import { ActionsRow, DetailHeader, LabelsAction, ReplyFooter, SendToAgentButton, Thread } from "./shared";

export interface DetailViewProps {
  repo: string;
  number: number;
  /** Header icon actions supplied by the host panel (open in new panel…). */
  headerActions?: ReactNode;
}

export function IssueDetailView({ repo, number, headerActions }: DetailViewProps) {
  const { provider, refresh } = useForge();
  const { mutate, isPending, error: writeError, clearError } = useForgeMutation();

  const target = `?repo=${encodeURIComponent(repo)}&number=${number}`;
  const detail = useForgeQuery<{ issue: ForgeIssueDetail }>(`/issue${target}`);
  const comments =
    useForgeQuery<{ comments: ForgeComment[] }>(`/comments${target}&type=issue`).data?.comments ?? [];

  if (detail.error) {
    return (
      <Scroll>
        <ErrorBanner message={detail.error} onRetry={refresh} />
      </Scroll>
    );
  }

  const issue = detail.data?.issue;
  if (!issue) {
    return <LoadingState label={`Loading issue #${number}…`} />;
  }

  const setState = (state: "open" | "closed", stateReason?: string) => {
    void mutate("/issue-state", {
      repo,
      number: issue.number,
      state,
      ...(stateReason ? { stateReason } : {}),
    });
  };

  return (
    <>
      <DetailHeader item={issue} actions={headerActions} />
      <Scroll>
        <ActionsRow>
          <SendToAgentButton
            chipLabel={`${repo}#${issue.number}`}
            buildContext={() => issueAgentContext(provider, repo, issue, comments)}
          />
          <LabelsAction
            repo={repo}
            item={issue}
            disabled={isPending}
            onToggle={(labels) => void mutate("/labels", { repo, number: issue.number, labels })}
          />
        </ActionsRow>
        {writeError && <ErrorBanner message={writeError} onRetry={clearError} />}
        <Thread item={issue} comments={comments} />
      </Scroll>
      <ReplyFooter
        repo={repo}
        number={issue.number}
        type="issue"
        disabled={isPending}
        stateAction={
          issue.state === "open" ? (
            <Dropdown
              align="end"
              direction="up"
              width={200}
              trigger={({ toggle, isOpen }) => (
                <GhostButton type="button" onClick={toggle} $active={isOpen} disabled={isPending}>
                  <Icon name="Check" size={12} /> Close issue
                </GhostButton>
              )}
            >
              {({ close }) => (
                <>
                  <DropdownItem
                    onClick={() => {
                      setState("closed", "completed");
                      close();
                    }}
                  >
                    Close as completed
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      setState("closed", "not_planned");
                      close();
                    }}
                  >
                    Close as not planned
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          ) : (
            <GhostButton type="button" onClick={() => setState("open")} disabled={isPending}>
              <Icon name="RotateCcw" size={12} /> Reopen
            </GhostButton>
          )
        }
      />
    </>
  );
}

/** Shown by the standalone Issue Detail panel when nothing is selected. */
export function NoIssueSelected({ action }: { action?: ReactNode }) {
  return (
    <EmptyState
      icon="CircleDot"
      title="No issue selected"
      text="Pick an issue in the Issues panel to read it here."
      action={action}
    />
  );
}
