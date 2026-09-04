import { describe, expect, it } from "vitest";
import { LABEL_PREVIEW, orderLabels, toggleName } from "../labels";
import type { ForgeLabel } from "../types";

const label = (name: string, description: string | null = null): ForgeLabel => ({
  name,
  color: "#336699",
  description,
});

const labels = [label("bug", "Something is broken"), label("docs"), label("enhancement", "New feature"), label("help wanted")];

describe("orderLabels", () => {
  it("puts selected labels first in selection order, then repo order", () => {
    const { shown } = orderLabels(labels, ["help wanted", "bug"], "");
    expect(shown.map((l) => l.name)).toEqual(["help wanted", "bug", "docs", "enhancement"]);
  });

  it("matches name or description, case-insensitively", () => {
    expect(orderLabels(labels, [], "BROKEN").shown.map((l) => l.name)).toEqual(["bug"]);
    expect(orderLabels(labels, [], "e").shown.map((l) => l.name)).toEqual([
      "bug",
      "enhancement",
      "help wanted",
    ]);
  });

  it("caps the browse list and counts the rest", () => {
    const many = Array.from({ length: 30 }, (_, i) => label(`l${i}`));
    const { shown, hidden } = orderLabels(many, [], "");
    expect(shown).toHaveLength(LABEL_PREVIEW);
    expect(hidden).toBe(30 - LABEL_PREVIEW);
  });

  it("selected labels survive the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => label(`l${i}`));
    const { shown } = orderLabels(many, ["l29"], "");
    expect(shown[0].name).toBe("l29");
  });
});

describe("toggleName", () => {
  it("adds and removes exactly", () => {
    expect(toggleName([], "bug")).toEqual(["bug"]);
    expect(toggleName(["bug"], "docs")).toEqual(["bug", "docs"]);
    expect(toggleName(["bug", "docs"], "bug")).toEqual(["docs"]);
    expect(toggleName(["Bug"], "bug")).toEqual(["Bug", "bug"]);
  });
});
