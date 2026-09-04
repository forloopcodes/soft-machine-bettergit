import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_DECLARATIONS,
  SETTING_KEYS,
  pollPolicyFor,
  settingsFromValues,
  valuesFromPatch,
} from "../settings";

describe("settingsFromValues", () => {
  it("returns defaults for missing or junk values", () => {
    expect(settingsFromValues(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromValues(null)).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromValues({})).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromValues({ openInNewPanel: "yes", sidebar: 1, autoRefresh: "no", refreshSeconds: "x" })).toEqual(
      DEFAULT_SETTINGS
    );
  });

  it("maps the host values onto the typed settings", () => {
    expect(settingsFromValues({ openInNewPanel: true, sidebar: false, autoRefresh: false, refreshSeconds: 120 })).toEqual({
      detailOpenMode: "new-panel",
      sidebarOpen: false,
      autoRefresh: false,
      refreshSeconds: 120,
    });
    expect(settingsFromValues({ openInNewPanel: false })).toEqual({ ...DEFAULT_SETTINGS, detailOpenMode: "same-panel" });
  });

  it("clamps the refresh interval to the slider range", () => {
    expect(settingsFromValues({ refreshSeconds: 1 }).refreshSeconds).toBe(15);
    expect(settingsFromValues({ refreshSeconds: 9999 }).refreshSeconds).toBe(300);
    expect(settingsFromValues({ refreshSeconds: 44.6 }).refreshSeconds).toBe(45);
  });
});

describe("valuesFromPatch", () => {
  it("writes only the fields present", () => {
    expect(valuesFromPatch({})).toEqual({});
    expect(valuesFromPatch({ sidebarOpen: false })).toEqual({ sidebar: false });
    expect(valuesFromPatch({ detailOpenMode: "new-panel" })).toEqual({ openInNewPanel: true });
    expect(valuesFromPatch({ autoRefresh: false, refreshSeconds: 600 })).toEqual({ autoRefresh: false, refreshSeconds: 300 });
  });

  it("round-trips through the host shape", () => {
    const settings = { detailOpenMode: "new-panel" as const, sidebarOpen: false, autoRefresh: false, refreshSeconds: 90 };
    expect(settingsFromValues(valuesFromPatch(settings))).toEqual(settings);
  });
});

describe("pollPolicyFor", () => {
  it("scales relative to the 45s list cadence and can switch polling off", () => {
    expect(pollPolicyFor(DEFAULT_SETTINGS)).toEqual({ enabled: true, scale: 1 });
    expect(pollPolicyFor({ ...DEFAULT_SETTINGS, refreshSeconds: 90 })).toEqual({ enabled: true, scale: 2 });
    expect(pollPolicyFor({ ...DEFAULT_SETTINGS, autoRefresh: false }).enabled).toBe(false);
  });
});

describe("SETTINGS_DECLARATIONS", () => {
  it("declares every host key exactly once with a default of the right type", () => {
    const keys = SETTINGS_DECLARATIONS.map((d) => d.key);
    expect([...keys].sort()).toEqual(Object.values(SETTING_KEYS).sort());
    for (const d of SETTINGS_DECLARATIONS) {
      expect(["toggle", "slider"]).toContain(d.kind);
      expect(typeof d.default).toBe(d.kind === "toggle" ? "boolean" : "number");
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it("defaults agree with DEFAULT_SETTINGS", () => {
    const defaults = Object.fromEntries(SETTINGS_DECLARATIONS.map((d) => [d.key, d.default]));
    expect(settingsFromValues(defaults)).toEqual(DEFAULT_SETTINGS);
  });
});
