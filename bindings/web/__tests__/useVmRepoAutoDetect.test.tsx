/**
 * Behavior tests for useVmRepoAutoDetect — the fallback repo auto-detection
 * that reads the host's credential-scrubbed workspace-repository capability
 * and locks onto the first GitHub/GitLab origin. Retry/dedupe live in the
 * SDK's useWorkspaceRepositories (covered by its own tests); this file pins
 * the forge-side contract: what gets selected, and that the probe is never
 * even enabled once the question is answered.
 *
 * hooks.ts pulls several SDK exports at load for its OTHER exports; the SDK
 * is stubbed wholesale so the hook under test loads hermetically.
 */

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/forge/bindings/web/ForgeContext", () => ({
  useForge: vi.fn(),
}));
vi.mock("@soft-machine/sdk", () => ({
  apiFetch: vi.fn(),
  hasElementChipTarget: vi.fn(),
  sendElementToComposer: vi.fn(),
  usePanelActions: vi.fn(),
  usePolledQuery: vi.fn(),
  useWorkspaceRepositories: vi.fn(),
}));

import { useWorkspaceRepositories } from "@soft-machine/sdk";
import { useForge } from "@plugins/forge/bindings/web/ForgeContext";
import { useVmRepoAutoDetect } from "@plugins/forge/bindings/web/hooks";

function arrange({
  needsRepoAutoDetect = true,
  repositories = [] as Array<{ path: string; origin: string }>,
} = {}) {
  const autoSelectFromUrl = vi.fn();
  vi.mocked(useForge).mockReturnValue({
    needsRepoAutoDetect,
    autoSelectFromUrl,
  } as unknown as ReturnType<typeof useForge>);
  vi.mocked(useWorkspaceRepositories).mockReturnValue({
    repositories,
    isDetecting: false,
  });
  return { autoSelectFromUrl };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useVmRepoAutoDetect", () => {
  it("selects the first forge origin, skipping dotfile/home repos", () => {
    const h = arrange({
      repositories: [
        {
          path: "/workspace/.home",
          origin: "https://gitea.internal/dotfiles.git",
        },
        {
          path: "/workspace/soft-machine",
          origin: "https://github.com/soft-machine-io/soft-machine",
        },
      ],
    });

    renderHook(() => useVmRepoAutoDetect());

    expect(h.autoSelectFromUrl).toHaveBeenCalledTimes(1);
    expect(h.autoSelectFromUrl).toHaveBeenCalledWith(
      "https://github.com/soft-machine-io/soft-machine"
    );
  });

  it("selects nothing when no origin parses to a forge repo", () => {
    const h = arrange({
      repositories: [
        {
          path: "/workspace/.home",
          origin: "https://gitea.internal/dotfiles.git",
        },
      ],
    });

    renderHook(() => useVmRepoAutoDetect());

    expect(h.autoSelectFromUrl).not.toHaveBeenCalled();
  });

  it("disables the capability probe once detection is answered", () => {
    // Even a stale repository list must not fight a made selection.
    const h = arrange({
      needsRepoAutoDetect: false,
      repositories: [
        { path: "/workspace/repo", origin: "git@github.com:o/r.git" },
      ],
    });

    renderHook(() => useVmRepoAutoDetect());

    expect(vi.mocked(useWorkspaceRepositories)).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(h.autoSelectFromUrl).not.toHaveBeenCalled();
  });

  it("selects once repositories arrive on a later render", () => {
    const h = arrange({ repositories: [] });
    const { rerender } = renderHook(() => useVmRepoAutoDetect());
    expect(h.autoSelectFromUrl).not.toHaveBeenCalled();

    vi.mocked(useWorkspaceRepositories).mockReturnValue({
      repositories: [
        { path: "/workspace/repo", origin: "git@github.com:o/r.git" },
      ],
      isDetecting: false,
    });
    rerender();

    expect(h.autoSelectFromUrl).toHaveBeenCalledWith("git@github.com:o/r.git");
  });
});
