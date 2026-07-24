/**
 * Inline new-issue composer for the Issues panel, styled as the Git
 * panel's commit composer: an elevated capsule with a borderless
 * textarea and a bottom action row. Posts through the server proxy and
 * closes on success; the context-wide refresh pulls the new issue in.
 */

import { useState } from "react";
import styled from "styled-components";
import { Button, EDITOR_SPACING, t } from "@soft-machine/sdk";
import { useForge } from "../ForgeContext";
import { useForgeMutation } from "../hooks";
import { AccentButton } from "./shared";

// Mirror the proxy's validation gates so bad input gets a local message
// instead of a generic 400.
const TITLE_MAX = 256;
const BODY_MAX = 65_536;

export function IssueComposer() {
  const { repo, setComposerOpen } = useForge();
  const { mutate, isPending, error, clearError } = useForgeMutation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const canSubmit = !isPending && repo !== null && title.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || !repo) return;
    const ok = await mutate("/issues", {
      repo,
      title: title.trim(),
      ...(body.trim() ? { body: body.trim() } : {}),
    });
    if (ok) {
      setTitle("");
      setBody("");
      setComposerOpen(false);
    }
  };

  return (
    <ComposerWrap>
      <Composer>
        <TitleInput
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) clearError();
          }}
          placeholder="Issue title"
          maxLength={TITLE_MAX}
          aria-label="Issue title"
          autoFocus
        />
        <BodyTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (markdown)"
          rows={3}
          maxLength={BODY_MAX}
          aria-label="Issue description"
        />
        <ComposerToolbar>
          {error && <ComposerError>{error}</ComposerError>}
          <ToolbarSpacer />
          <Button
            type="button"
            $compact
            $variant="ghost"
            onClick={() => setComposerOpen(false)}
          >
            Cancel
          </Button>
          <AccentButton
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {isPending ? "Creating…" : "Create issue"}
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
  box-sizing: border-box;
  transition: border-color 0.15s;

  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
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
  padding: 4px 6px 6px;
  min-width: 0;
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
