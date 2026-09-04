import { describe, expect, it } from "vitest";
import {
  LIST_VIEW,
  listView,
  openDetailView,
  resolveView,
  sanitizePanelView,
} from "../panelView";

describe("resolveView", () => {
  it("shows the list when nothing is open", () => {
    expect(resolveView(LIST_VIEW, "o/r")).toEqual({ view: "list" });
    expect(resolveView(listView("o/r"), "o/r")).toEqual({ view: "list" });
  });

  it("shows the detail for the same repo (case-insensitive)", () => {
    expect(resolveView(openDetailView("o/r", 42), "o/r")).toEqual({ view: "detail", number: 42 });
    expect(resolveView(openDetailView("O/R", 42), "o/r")).toEqual({ view: "detail", number: 42 });
  });

  it("falls back to the list when the repo changed or is missing", () => {
    expect(resolveView(openDetailView("o/r", 42), "o/other")).toEqual({ view: "list" });
    expect(resolveView(openDetailView("o/r", 42), null)).toEqual({ view: "list" });
  });

  it("round-trips: open then back", () => {
    const opened = openDetailView("o/r", 7);
    expect(resolveView(opened, "o/r")).toEqual({ view: "detail", number: 7 });
    expect(resolveView(listView("o/r"), "o/r")).toEqual({ view: "list" });
  });
});

describe("sanitizePanelView", () => {
  it("rejects junk and partial detail states", () => {
    expect(sanitizePanelView(null)).toEqual(LIST_VIEW);
    expect(sanitizePanelView({ view: "detail", number: 3 })).toEqual(LIST_VIEW);
    expect(sanitizePanelView({ view: "detail", repo: "o/r", number: -1 })).toEqual({
      repo: "o/r",
      view: "list",
      number: null,
    });
    expect(sanitizePanelView({ view: "detail", repo: "../etc", number: 3 })).toEqual(LIST_VIEW);
  });

  it("keeps a well-formed detail state", () => {
    expect(sanitizePanelView({ view: "detail", repo: "o/r", number: 3 })).toEqual({
      repo: "o/r",
      view: "detail",
      number: 3,
    });
  });
});

describe("repo switch semantics", () => {
  it("a detail for another repo resolves to the list and must be forgotten", () => {
    const stale = openDetailView("o/a", 5);
    expect(resolveView(stale, "o/b")).toEqual({ view: "list" });
    // After the hook resets on the switch, returning to o/a shows the list.
    const reset = listView("o/b");
    expect(resolveView(reset, "o/a")).toEqual({ view: "list" });
  });

  it("an unknown repo (null) keeps the remembered detail resolvable later", () => {
    const remembered = openDetailView("o/a", 5);
    expect(resolveView(remembered, null)).toEqual({ view: "list" });
    expect(resolveView(remembered, "o/a")).toEqual({ view: "detail", number: 5 });
  });
});
