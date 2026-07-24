/**
 * Inline new-PR composer for the Pull Requests panel: github.com's
 * compare flow, panel-sized. Base and compare branch pickers (searchable
 * dropdowns over the proxy's branch list), title, markdown body, and a
 * draft toggle. On success the new PR opens in the Pull Detail panel.
 */

import { useState } from "react";
import styled from "styled-components";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownSectionLabel,
  EDITOR_SPACING,
  Icon,
  t,
} from "@soft-machine/sdk";
import type { ForgeBranch, ForgePullDetail } from "../types";
import { useForge } from "../ForgeContext";
import { useForgeMutation, useForgeQuery, useOpenDetail } from "../hooks";
import { AccentButton } from "./shared";

const TITLE_MAX = 256;
const BODY_MAX = 65_536;
/** Preferred default base, in order, when the repo has one of these. */
const DEFAULT_BASES = ["main", "master", "develop"];

function BranchPicker({
  label,
  value,
  branches,
  exclude,
  onPick,
}: {
  label: string;
  value: string | null;
  branches: ForgeBranch[];
  /** Branch hidden from the list (the other side of the compare). */
  exclude: string | null;
  onPick: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const shown = branches.filter(
    (b) =>
      b.name !== exclude &&
      (search.trim() === "" ||
        b.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <Dropdown
      align="start"
      width={240}
      trigger={({ toggle }) => (
        <BranchTrigger type="button" onClick={toggle}>
          <TriggerLabel>{label}:</TriggerLabel>
          <TriggerValue>{value ?? "select"}</TriggerValue>
          <Icon name="ChevronDown" size={9} />
        </BranchTrigger>
      )}
    >
      {({ close }) => (
        <>
          <BranchSearch
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a branch"
            aria-label={`Find a ${label} branch`}
            autoFocus
            spellCheck={false}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <DropdownSectionLabel>
            {shown.length === 0 ? "No branches" : "Branches"}
          </DropdownSectionLabel>
          {shown.map((branch) => (
            <DropdownItem
              key={branch.name}
              onClick={() => {
                onPick(branch.name);
                close();
              }}
            >
              <BranchOption $selected={branch.name === value}>
                {branch.name}
              </BranchOption>
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

export function PullComposer({ onClose }: { onClose: () => void }) {
  const { repo } = useForge();
  const { mutate, isPending, error, clearError } = useForgeMutation();
  const { open: openPull } = useOpenDetail("pull");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [head, setHead] = useState<string | null>(null);
  const [baseChoice, setBaseChoice] = useState<string | null>(null);

  const branches =
    useForgeQuery<{ branches: ForgeBranch[] }>(
      repo ? `/branches?repo=${encodeURIComponent(repo)}` : null
    ).data?.branches ?? [];

  // Base defaults to the conventional trunk when present; an explicit
  // pick always wins.
  const base =
    baseChoice ??
    DEFAULT_BASES.find((name) => branches.some((b) => b.name === name)) ??
    null;

  const canSubmit =
    !isPending &&
    repo !== null &&
    title.trim().length > 0 &&
    head !== null &&
    base !== null &&
    head !== base;

  const submit = async () => {
    if (!canSubmit || !repo || !head || !base) return;
    const created = await mutate<{ pull: ForgePullDetail }>("/pulls", {
      repo,
      title: title.trim(),
      head,
      base,
      draft,
      ...(body.trim() ? { body: body.trim() } : {}),
    });
    if (created) {
      onClose();
      // Land directly on the new PR, github.com's post-create redirect.
      openPull(created.pull.number);
    }
  };

  return (
    <ComposerWrap>
      <Composer>
        <CompareRow>
          <BranchPicker
            label="base"
            value={base}
            branches={branches}
            exclude={head}
            onPick={setBaseChoice}
          />
          <CompareArrow>
            <Icon name="ArrowLeft" size={10} />
          </CompareArrow>
          <BranchPicker
            label="compare"
            value={head}
            branches={branches}
            exclude={base}
            onPick={setHead}
          />
        </CompareRow>
        <TitleInput
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) clearError();
          }}
          placeholder="Pull request title"
          maxLength={TITLE_MAX}
          aria-label="Pull request title"
        />
        <BodyTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (markdown)"
          rows={3}
          maxLength={BODY_MAX}
          aria-label="Pull request description"
        />
        <ComposerToolbar>
          <DraftToggle>
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
            />
            Draft
          </DraftToggle>
          {error && <ComposerError>{error}</ComposerError>}
          <ToolbarSpacer />
          <Button type="button" $compact $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <AccentButton
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {isPending ? "Creating…" : "Create pull request"}
          </AccentButton>
        </ComposerToolbar>
      </Composer>
    </ComposerWrap>
  );
}

const ComposerWrap = styled.div`
  padding: 6px ${EDITOR_SPACING.containerPadding};
`;

const Composer = styled.div`
  display: flex;
  flex-direction: column;
  background: ${t.bg.elevated};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.5);
  transition: border-color 0.15s;

  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
`;

const CompareRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 10px 0;
  min-width: 0;
  flex-wrap: wrap;
`;

const CompareArrow = styled.span`
  display: inline-flex;
  color: ${t.text.muted};
  flex-shrink: 0;
`;

const BranchTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  background: ${t.bg.tertiary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  color: ${t.text.primary};
  font-size: ${t.typography.micro};
  font-family: ${t.fontMono};
  cursor: pointer;
  min-width: 0;
  max-width: 200px;

  &:hover {
    background: ${t.bg.secondary};
  }
`;

const TriggerLabel = styled.span`
  color: ${t.text.muted};
  flex-shrink: 0;
`;

const TriggerValue = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const BranchSearch = styled.input`
  margin: 4px;
  padding: 4px 8px;
  width: calc(100% - 8px);
  background: ${t.bg.primary};
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  color: ${t.text.primary};
  font-size: ${t.typography.sm};
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: ${t.accent.primary};
  }
`;

const BranchOption = styled.span<{ $selected: boolean }>`
  font-family: ${t.fontMono};
  font-size: ${t.typography.sm};
  color: ${(p) => (p.$selected ? t.accent.primary : "inherit")};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TitleInput = styled.input`
  padding: 8px 10px 4px;
  background: transparent;
  border: none;
  outline: none;
  color: ${t.text.primary};
  font-size: ${t.typography.base};
  font-family: inherit;

  &::placeholder {
    color: ${t.text.muted};
  }
`;

const BodyTextarea = styled.textarea`
  padding: 0 10px;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  color: ${t.text.primary};
  font-size: ${t.typography.sm};
  font-family: inherit;
  line-height: 1.4;
  max-height: 160px;

  &::placeholder {
    color: ${t.text.muted};
  }
`;

const ComposerToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  min-width: 0;
`;

const DraftToggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${t.text.muted};
  font-size: ${t.typography.micro};
  cursor: pointer;
  user-select: none;
`;

const ToolbarSpacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const ComposerError = styled.span`
  color: ${t.ansi.red};
  font-size: ${t.typography.micro};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
