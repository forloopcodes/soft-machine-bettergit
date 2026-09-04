/**
 * Inline new-issue composer, docked under the filter row. Posts through
 * the bridge and closes on success; the context-wide refresh pulls the new
 * issue in. Built on the shared composer capsule.
 */

import { useState } from "react";
import { Button } from "@soft-machine/sdk";
import { useForge } from "../ForgeContext";
import { useForgeMutation } from "../hooks";
import {
  Composer,
  ComposerDock,
  ComposerInput,
  ComposerSpacer,
  ComposerTextarea,
  ComposerToolbar,
  ErrorBanner,
} from "../ui";

// Mirror the bridge's validation gates so bad input gets a local message
// instead of a generic 400.
const TITLE_MAX = 256;
const BODY_MAX = 65_536;

export function IssueComposer({ onClose }: { onClose: () => void }) {
  const { repo } = useForge();
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
      onClose();
    }
  };

  return (
    <ComposerDock>
      <Composer>
        <ComposerInput
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
        <ComposerTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (markdown)"
          rows={3}
          maxLength={BODY_MAX}
          aria-label="Issue description"
        />
        <ComposerToolbar>
          {error && <ErrorBanner compact message={error} />}
          <ComposerSpacer />
          <Button type="button" $compact $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" $compact $variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {isPending ? "Creating…" : "Create issue"}
          </Button>
        </ComposerToolbar>
      </Composer>
    </ComposerDock>
  );
}
