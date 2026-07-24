/**
 * Issue Detail Panel, Git-panel styled: gray surface, bordered header
 * block, quiet action row, uppercase collapsible sections for the
 * markdown body and comment thread, close/reopen and label editing, and
 * the send-to-agent action that hands the entire issue context to the
 * chat composer.
 */

import styled from "styled-components";
import { Dropdown, DropdownItem, Icon, t } from "@soft-machine/sdk";
import {
  type ForgeComment,
  type ForgeIssueDetail,
  type ForgeLabel,
} from "../types";
import { issueAgentContext } from "../agentContext";
import { useForge } from "../ForgeContext";
import { useForgeMutation, useForgeQuery } from "../hooks";
import {
  Container,
  Content,
  Empty,
  EmptyHint,
  EmptyTitle,
  ErrorRow,
} from "./shared";
import {
  ActionsRow,
  CommentsSection,
  DetailHeader,
  DetailHeaderArea,
  InlineError,
  QuietActionButton,
  SendToAgentButton,
} from "./detailShared";

export function IssueDetailPanel() {
  const { provider, repo, selectedIssue, isConnected } = useForge();
  const { mutate, isPending, error: writeError } = useForgeMutation();

  const target =
    repo && selectedIssue
      ? `?repo=${encodeURIComponent(repo)}&number=${selectedIssue}`
      : null;
  const detail = useForgeQuery<{ issue: ForgeIssueDetail }>(
    target && `/issue${target}`
  );
  const comments =
    useForgeQuery<{ comments: ForgeComment[] }>(
      target && `/comments${target}&type=issue`
    ).data?.comments ?? [];
  const repoLabels =
    useForgeQuery<{ labels: ForgeLabel[] }>(
      repo ? `/labels?repo=${encodeURIComponent(repo)}` : null
    ).data?.labels ?? [];

  if (!isConnected || !repo || !selectedIssue) {
    return (
      <Container>
        <Empty>
          <EmptyTitle>No issue selected</EmptyTitle>
          <EmptyHint>
            Click an issue in the Issues panel to inspect it here.
          </EmptyHint>
        </Empty>
      </Container>
    );
  }

  if (detail.error) {
    return (
      <Container>
        <ErrorRow>{detail.error}</ErrorRow>
      </Container>
    );
  }

  const issue = detail.data?.issue;
  if (!issue) {
    return (
      <Container>
        <Empty>
          <EmptyHint>Loading issue #{selectedIssue}…</EmptyHint>
        </Empty>
      </Container>
    );
  }

  const setState = (state: "open" | "closed", stateReason?: string) => {
    void mutate("/issue-state", {
      repo,
      number: issue.number,
      state,
      ...(stateReason ? { stateReason } : {}),
    });
  };

  const toggleIssueLabel = (name: string) => {
    const current = issue.labels.map((l) => l.name);
    const next = current.includes(name)
      ? current.filter((l) => l !== name)
      : [...current, name];
    void mutate("/labels", { repo, number: issue.number, labels: next });
  };

  return (
    <Container>
      <DetailHeaderArea>
        <DetailHeader item={issue} />
      </DetailHeaderArea>
      <Content>
        <ActionsRow>
          <SendToAgentButton
            chipLabel={`${repo}#${issue.number}`}
            buildContext={() =>
              issueAgentContext(provider, repo, issue, comments)
            }
          />
          {repoLabels.length > 0 && (
            <Dropdown
              align="start"
              width={200}
              trigger={({ toggle }) => (
                <QuietActionButton
                  type="button"
                  onClick={toggle}
                  disabled={isPending}
                >
                  <Icon name="Hash" size={11} /> Labels
                </QuietActionButton>
              )}
            >
              {() => (
                <>
                  {repoLabels.map((label) => {
                    const applied = issue.labels.some(
                      (l) => l.name === label.name
                    );
                    return (
                      <DropdownItem
                        key={label.name}
                        onClick={() => toggleIssueLabel(label.name)}
                      >
                        <LabelOption $applied={applied}>
                          <LabelSwatch $color={label.color ?? t.text.muted} />
                          {label.name}
                          {applied && <Icon name="Check" size={10} />}
                        </LabelOption>
                      </DropdownItem>
                    );
                  })}
                </>
              )}
            </Dropdown>
          )}
        </ActionsRow>
        {writeError && (
          <ErrorNote>
            <InlineError>{writeError}</InlineError>
          </ErrorNote>
        )}

        <CommentsSection
          comments={comments}
          repo={repo}
          number={issue.number}
          type="issue"
          disabled={isPending}
          item={issue}
          itemAuthor={issue.author?.login ?? null}
          // github.com's ending: close/reopen sits beside "Comment".
          trailingActions={
            issue.state === "open" ? (
              <Dropdown
                align="end"
                direction="up"
                width={190}
                trigger={({ toggle }) => (
                  <QuietActionButton
                    type="button"
                    onClick={toggle}
                    disabled={isPending}
                  >
                    <Icon name="Check" size={11} /> Close issue
                  </QuietActionButton>
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
              <QuietActionButton
                type="button"
                onClick={() => setState("open")}
                disabled={isPending}
              >
                <Icon name="RotateCcw" size={11} /> Reopen
              </QuietActionButton>
            )
          }
        />
      </Content>
    </Container>
  );
}

const ErrorNote = styled.div`
  padding: 0 12px 4px;
`;

const LabelOption = styled.span<{ $applied: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${(p) => (p.$applied ? t.accent.primary : "inherit")};
`;

const LabelSwatch = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`;
