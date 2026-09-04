/**
 * Inline new-PR composer: github.com's compare flow, panel-sized. Base and
 * compare branch pickers (searchable dropdowns over the bridge's branch
 * list), title, markdown body, and a draft toggle. On success the new PR
 * opens the way the user's setting says.
 */

import { useState } from "react";
import { Button, Dropdown, DropdownItem, DropdownSectionLabel, Icon, Toggle } from "@soft-machine/sdk";
import styled from "styled-components";
import { t } from "@soft-machine/sdk";
import type { ForgeBranch, ForgePullDetail } from "../types";
import { useForge } from "../ForgeContext";
import { useForgeMutation, useForgeQuery } from "../hooks";
import {
  Composer,
  ComposerDock,
  ComposerHeader,
  ComposerHint,
  ComposerInput,
  ComposerSpacer,
  ComposerTextarea,
  ComposerToolbar,
  ErrorBanner,
  MenuList,
  MenuSearch,
  OptionCheck,
  OptionRow,
  PickerButton,
} from "../ui";

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
  exclude: string | null;
  onPick: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const shown = branches.filter(
    (b) =>
      b.name !== exclude &&
      (search.trim() === "" || b.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <Dropdown
      align="start"
      width={240}
      trigger={({ toggle, isOpen }) => (
        <PickerButton type="button" onClick={toggle} $open={isOpen} $filled={value !== null}>
          <PickerLabel>{label}</PickerLabel>
          <BranchName>{value ?? "select"}</BranchName>
          <Icon name="ChevronDown" size={12} />
        </PickerButton>
      )}
    >
      {({ close }) => (
        <>
          <MenuSearch
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a branch"
            aria-label={`Find a ${label} branch`}
            autoFocus
            spellCheck={false}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <MenuList>
            <DropdownSectionLabel>{shown.length === 0 ? "No branches" : "Branches"}</DropdownSectionLabel>
            {shown.map((branch) => (
              <DropdownItem
                key={branch.name}
                onClick={() => {
                  onPick(branch.name);
                  close();
                }}
              >
                <OptionRow $selected={branch.name === value}>
                  <BranchName>{branch.name}</BranchName>
                  <OptionCheck>{branch.name === value && <Icon name="Check" size={12} />}</OptionCheck>
                </OptionRow>
              </DropdownItem>
            ))}
          </MenuList>
        </>
      )}
    </Dropdown>
  );
}

export function PullComposer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (number: number) => void;
}) {
  const { repo } = useForge();
  const { mutate, isPending, error, clearError } = useForgeMutation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [head, setHead] = useState<string | null>(null);
  const [baseChoice, setBaseChoice] = useState<string | null>(null);

  const branches =
    useForgeQuery<{ branches: ForgeBranch[] }>(
      repo ? `/branches?repo=${encodeURIComponent(repo)}` : null
    ).data?.branches ?? [];

  const base =
    baseChoice ?? DEFAULT_BASES.find((name) => branches.some((b) => b.name === name)) ?? null;

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
      onCreated(created.pull.number);
    }
  };

  return (
    <ComposerDock>
      <Composer>
        <ComposerHeader>
          <BranchPicker label="base" value={base} branches={branches} exclude={head} onPick={setBaseChoice} />
          <Arrow>
            <Icon name="ArrowLeft" size={12} />
          </Arrow>
          <BranchPicker label="compare" value={head} branches={branches} exclude={base} onPick={setHead} />
        </ComposerHeader>
        <ComposerInput
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) clearError();
          }}
          placeholder="Pull request title"
          maxLength={TITLE_MAX}
          aria-label="Pull request title"
        />
        <ComposerTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (markdown)"
          rows={3}
          maxLength={BODY_MAX}
          aria-label="Pull request description"
        />
        <ComposerToolbar>
          <ComposerHint>
            <Toggle checked={draft} onChange={setDraft} title="Create as draft" />
            Draft
          </ComposerHint>
          {error && <ErrorBanner compact message={error} />}
          <ComposerSpacer />
          <Button type="button" $compact $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" $compact $variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {isPending ? "Creating…" : "Create pull request"}
          </Button>
        </ComposerToolbar>
      </Composer>
    </ComposerDock>
  );
}

const PickerLabel = styled.span`
  color: ${t.text.muted};
  flex-shrink: 0;
`;

const BranchName = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.xs};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Arrow = styled.span`
  display: inline-grid;
  place-items: center;
  color: ${t.text.muted};
  flex-shrink: 0;
`;
