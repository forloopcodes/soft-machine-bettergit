/**
 * FileDiffList: the Pull Detail panel's changed-files viewer, in the Git
 * panel's file-capsule treatment: one bordered capsule per file with a
 * chevron header (status letter, name, +/- counts) that expands into the
 * unified diff (green/red lines, muted context, hunk separators).
 */

import { useState } from "react";
import styled from "styled-components";
import { ANIMATION, Icon, t } from "@soft-machine/sdk";
import { parsePatch, type ForgePullFile } from "../types";
import { STATE_COLORS } from "./shared";

function statusInfo(status: string): { label: string; color: string } {
  switch (status) {
    case "added":
      return { label: "A", color: STATE_COLORS.open };
    case "removed":
      return { label: "D", color: STATE_COLORS.closed };
    case "renamed":
      return { label: "R", color: STATE_COLORS.merged };
    default:
      return { label: "M", color: "#f59e0b" };
  }
}

function FileCapsule({ file }: { file: ForgePullFile }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const info = statusInfo(file.status);
  const canExpand = file.patch !== null;

  return (
    <Capsule>
      <CapsuleHeader
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        $expandable={canExpand}
      >
        <CapsuleChevron $isExpanded={isExpanded} $visible={canExpand}>
          <Icon name="ChevronRight" size={11} />
        </CapsuleChevron>
        <StatusBadge style={{ color: info.color }}>{info.label}</StatusBadge>
        <FileName title={file.filename}>{file.filename}</FileName>
        <CapsuleSpacer />
        {(file.additions > 0 || file.deletions > 0) && (
          <FileStat>
            <Additions>+{file.additions}</Additions>
            <Deletions>-{file.deletions}</Deletions>
          </FileStat>
        )}
      </CapsuleHeader>
      {isExpanded && file.patch !== null && (
        <CapsuleDiff>
          <DiffBlock>
            {parsePatch(file.patch).map((line, i) =>
              line.kind === "hunk" ? (
                <HunkLine key={i}>{line.content}</HunkLine>
              ) : line.kind === "context" ? (
                <ContextLine key={i}>
                  <LinePrefix> </LinePrefix>
                  <LineContent>{line.content}</LineContent>
                </ContextLine>
              ) : (
                <ChangedLine key={i} $type={line.kind}>
                  <LinePrefix>{line.kind === "add" ? "+" : "-"}</LinePrefix>
                  <LineContent>{line.content}</LineContent>
                </ChangedLine>
              )
            )}
          </DiffBlock>
        </CapsuleDiff>
      )}
      {isExpanded && file.patch === null && (
        <CapsuleDiff>
          <DiffMeta>No text diff (binary or oversized file).</DiffMeta>
        </CapsuleDiff>
      )}
    </Capsule>
  );
}

export function FileDiffList({ files }: { files: ForgePullFile[] }) {
  return (
    <ListWrap>
      {files.map((file) => (
        <FileCapsule key={file.filename} file={file} />
      ))}
    </ListWrap>
  );
}

const ListWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const Capsule = styled.div`
  display: flex;
  flex-direction: column;
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  overflow: hidden;
  transition: border-color ${ANIMATION.fast};

  &:hover {
    border-color: color-mix(in srgb, ${t.text.muted} 35%, ${t.border});
  }
`;

const CapsuleHeader = styled.div<{ $expandable: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 4px;
  cursor: ${(p) => (p.$expandable ? "pointer" : "default")};
  user-select: none;
  min-width: 0;
`;

const CapsuleChevron = styled.span<{ $isExpanded: boolean; $visible: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: ${t.text.muted};
  flex-shrink: 0;
  visibility: ${(p) => (p.$visible ? "visible" : "hidden")};
  transform: rotate(${(p) => (p.$isExpanded ? 90 : 0)}deg);
  transition: transform ${ANIMATION.fast};
`;

const StatusBadge = styled.span`
  font-size: ${t.typography.micro};
  font-weight: 600;
  font-family: ${t.fontMono};
  min-width: 12px;
  text-align: center;
  flex-shrink: 0;
`;

const FileName = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
  color: ${t.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  min-width: 0;
`;

const CapsuleSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const FileStat = styled.span`
  display: inline-flex;
  gap: 5px;
  flex-shrink: 0;
`;

const Additions = styled.span`
  color: ${STATE_COLORS.open};
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
`;

const Deletions = styled.span`
  color: ${STATE_COLORS.closed};
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
`;

const CapsuleDiff = styled.div`
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
  cursor: default;
`;

const DiffMeta = styled.div`
  padding: 8px 10px;
  font-size: ${t.typography.micro};
  color: ${t.text.muted};
  font-style: italic;
`;

const DiffBlock = styled.div`
  display: flex;
  flex-direction: column;
  font-family: ${t.fontMono};
  font-size: ${t.typography.micro};
  line-height: 1.5;
  padding: 4px 0;
  overflow-x: auto;
`;

const LinePrefix = styled.span`
  flex-shrink: 0;
  width: 10px;
  user-select: none;
  opacity: 0.7;
`;

const LineContent = styled.span`
  flex: 1;
  min-width: 0;
  white-space: pre;
`;

const ChangedLine = styled.div<{ $type: "add" | "del" }>`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 0 10px;
  background: ${(p) =>
    p.$type === "add" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)"};
  color: ${(p) => (p.$type === "add" ? "#86efac" : "#fca5a5")};
  white-space: pre;
  min-width: 0;
`;

const ContextLine = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 0 10px;
  color: ${t.text.muted};
  white-space: pre;
  min-width: 0;
`;

const HunkLine = styled.div`
  padding: 2px 10px;
  color: ${t.text.muted};
  font-style: italic;
  user-select: none;
  border-top: ${t.borderWidth} solid ${t.border};

  &:first-child {
    border-top: none;
  }
`;
