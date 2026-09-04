/**
 * Changed-files viewer: one bordered capsule per file with a chevron
 * header (status letter, left-truncated path, +/- counts) that expands
 * into the unified diff. Hover snaps; only the chevron rotates.
 */

import { useMemo, useState } from "react";
import styled from "styled-components";
import { Icon, t } from "@soft-machine/sdk";
import { parsePatch, type ForgePullFile } from "../../types";
import { CodeLine } from "../../highlight/CodeLine";
import { languageForFile } from "../../highlight/language";
import { Count, DIFF_COLORS, STATE_COLORS, fileStatusVisual } from "../../ui";
import { Capsule } from "./shared";

function FileCapsule({ file }: { file: ForgePullFile }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const info = fileStatusVisual(file.status);
  const canExpand = file.patch !== null;
  const language = useMemo(() => languageForFile(file.filename), [file.filename]);
  const lines = useMemo(
    () => (isExpanded && file.patch !== null ? parsePatch(file.patch) : []),
    [isExpanded, file.patch]
  );

  return (
    <Capsule>
      <CapsuleHeader
        type="button"
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        disabled={!canExpand}
      >
        <Chevron $isExpanded={isExpanded} $visible={canExpand}>
          <Icon name="ChevronRight" size={12} />
        </Chevron>
        <StatusBadge style={{ color: info.color }}>{info.label}</StatusBadge>
        <FileName title={file.filename}>{file.filename}</FileName>
        <HeaderSpacer />
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
            {lines.map((line, i) =>
              line.kind === "hunk" ? (
                <HunkLine key={i}>{line.content}</HunkLine>
              ) : line.kind === "context" ? (
                <ContextLine key={i}>
                  <LinePrefix> </LinePrefix>
                  <LineContent>
                    <CodeLine text={line.content} language={language} />
                  </LineContent>
                </ContextLine>
              ) : (
                <ChangedLine key={i} $type={line.kind} $highlighted={language !== null}>
                  <LinePrefix>{line.kind === "add" ? "+" : "-"}</LinePrefix>
                  <LineContent>
                    <CodeLine text={line.content} language={language} />
                  </LineContent>
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
  gap: 8px;
`;

const CapsuleHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 10px 5px 4px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
  min-width: 0;
  &:disabled {
    cursor: default;
  }
`;

const Chevron = styled.span<{ $isExpanded: boolean; $visible: boolean }>`
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  color: ${t.text.muted};
  flex-shrink: 0;
  visibility: ${({ $visible }) => ($visible ? "visible" : "hidden")};
  transform: rotate(${({ $isExpanded }) => ($isExpanded ? 90 : 0)}deg);
  transition: transform 0.15s ease;
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StatusBadge = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  font-weight: 600;
  min-width: 12px;
  text-align: center;
  flex-shrink: 0;
`;

const FileName = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  color: ${t.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  min-width: 0;
`;

const HeaderSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const FileStat = styled.span`
  display: inline-flex;
  gap: 5px;
  flex-shrink: 0;
`;

export const Additions = styled(Count)`
  color: ${STATE_COLORS.open};
`;

export const Deletions = styled(Count)`
  color: ${STATE_COLORS.closed};
`;

const CapsuleDiff = styled.div`
  border-top: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.secondary};
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
  font-size: ${t.typographyMono.micro};
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

/* With a known language the wash alone marks the change and tokens keep
   their syntax colors (the +/- prefix stays green/red); without one the
   whole line takes the Git panel's diff text color. */
const ChangedLine = styled.div<{ $type: "add" | "del"; $highlighted: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 0 10px;
  background: ${({ $type }) => ($type === "add" ? DIFF_COLORS.addWash : DIFF_COLORS.delWash)};
  color: ${({ $type, $highlighted }) =>
    $highlighted ? t.text.primary : $type === "add" ? DIFF_COLORS.addText : DIFF_COLORS.delText};
  white-space: pre;
  min-width: 0;
  & > ${() => LinePrefix} {
    color: ${({ $type }) => ($type === "add" ? DIFF_COLORS.addText : DIFF_COLORS.delText)};
    opacity: 1;
  }
`;

/* Unchanged lines are quiet: highlighted tokens are dimmed as a whole so
   the changed lines stay the loudest thing in the block. */
const ContextLine = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 0 10px;
  color: ${t.text.muted};
  opacity: 0.75;
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
