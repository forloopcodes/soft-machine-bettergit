/**
 * Plugin settings: how detail views open, whether the sidebar is shown, and
 * background refresh. Declared on the module so the host renders them in
 * Settings → Plugins → bettergit and stores them with the user's app
 * settings; panels read them back through usePluginSettings. Stored values
 * are hostile input; every read goes through settingsFromValues.
 */

export type DetailOpenMode = "same-panel" | "new-panel";

export interface ForgeSettings {
  /** Where a clicked issue / pull opens: inside the list panel (the panel
   *  swaps to the detail and its sidebar becomes the list) or in the
   *  dedicated detail panel. */
  detailOpenMode: DetailOpenMode;
  /** Sidebar visibility for the list panels (the shell still hides it
   *  below the narrow breakpoint regardless). */
  sidebarOpen: boolean;
  /** Poll GitHub in the background while panels are open. Off: refresh
   *  only on the Refresh button and after writes. */
  autoRefresh: boolean;
  /** Seconds between refreshes of lists and open details when autoRefresh
   *  is on. Slower data (labels, repos) scales proportionally. */
  refreshSeconds: number;
}

/** The route table's list cadence; the slider is expressed relative to it. */
export const BASE_REFRESH_SECONDS = 45;
export const REFRESH_SECONDS_MIN = 15;
export const REFRESH_SECONDS_MAX = 300;

export const DEFAULT_SETTINGS: ForgeSettings = {
  detailOpenMode: "same-panel",
  sidebarOpen: true,
  autoRefresh: true,
  refreshSeconds: BASE_REFRESH_SECONDS,
};

/** Host setting keys (the declarations below and usePluginSettings values). */
export const SETTING_KEYS = {
  openInNewPanel: "openInNewPanel",
  sidebar: "sidebar",
  autoRefresh: "autoRefresh",
  refreshSeconds: "refreshSeconds",
} as const;

/** Rendered by the host's plugin settings page. */
export const SETTINGS_DECLARATIONS = [
  {
    key: SETTING_KEYS.openInNewPanel,
    label: "Open details in a new panel",
    description:
      "Off: a pull request or issue opens inside the list panel and the sidebar becomes the list. On: it opens in the dedicated detail panel beside the list.",
    kind: "toggle",
    default: DEFAULT_SETTINGS.detailOpenMode === "new-panel",
  },
  {
    key: SETTING_KEYS.sidebar,
    label: "Show sidebar",
    description:
      "Repositories while browsing, the item list while reading. Hidden automatically in narrow panels.",
    kind: "toggle",
    default: DEFAULT_SETTINGS.sidebarOpen,
  },
  {
    key: SETTING_KEYS.autoRefresh,
    label: "Auto-refresh",
    description:
      "Keep lists and open items in sync with GitHub in the background while the tab is visible. Off: refresh with the panel's Refresh button, or after you comment, merge or close.",
    kind: "toggle",
    default: DEFAULT_SETTINGS.autoRefresh,
  },
  {
    key: SETTING_KEYS.refreshSeconds,
    label: "Refresh every",
    description:
      "How often lists and open items re-check GitHub when auto-refresh is on. Reference data (labels, repositories) refreshes proportionally less often.",
    kind: "slider",
    default: DEFAULT_SETTINGS.refreshSeconds,
    min: REFRESH_SECONDS_MIN,
    max: REFRESH_SECONDS_MAX,
    step: 15,
    unit: " s",
  },
] as const;

function clampSeconds(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_SETTINGS.refreshSeconds;
  return Math.min(REFRESH_SECONDS_MAX, Math.max(REFRESH_SECONDS_MIN, n));
}

/** Host values → typed settings; anything unexpected falls back per field. */
export function settingsFromValues(values: Record<string, unknown> | null | undefined): ForgeSettings {
  const v = values ?? {};
  return {
    detailOpenMode:
      v[SETTING_KEYS.openInNewPanel] === true
        ? "new-panel"
        : v[SETTING_KEYS.openInNewPanel] === false
          ? "same-panel"
          : DEFAULT_SETTINGS.detailOpenMode,
    sidebarOpen:
      typeof v[SETTING_KEYS.sidebar] === "boolean"
        ? (v[SETTING_KEYS.sidebar] as boolean)
        : DEFAULT_SETTINGS.sidebarOpen,
    autoRefresh:
      typeof v[SETTING_KEYS.autoRefresh] === "boolean"
        ? (v[SETTING_KEYS.autoRefresh] as boolean)
        : DEFAULT_SETTINGS.autoRefresh,
    refreshSeconds: clampSeconds(v[SETTING_KEYS.refreshSeconds]),
  };
}

/** Typed patch → host values patch (only the fields present). */
export function valuesFromPatch(patch: Partial<ForgeSettings>): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  if (patch.detailOpenMode !== undefined) {
    out[SETTING_KEYS.openInNewPanel] = patch.detailOpenMode === "new-panel";
  }
  if (patch.sidebarOpen !== undefined) {
    out[SETTING_KEYS.sidebar] = patch.sidebarOpen;
  }
  if (patch.autoRefresh !== undefined) {
    out[SETTING_KEYS.autoRefresh] = patch.autoRefresh;
  }
  if (patch.refreshSeconds !== undefined) {
    out[SETTING_KEYS.refreshSeconds] = clampSeconds(patch.refreshSeconds);
  }
  return out;
}

/** The query store policy a settings value implies. */
export function pollPolicyFor(settings: ForgeSettings): { enabled: boolean; scale: number } {
  return { enabled: settings.autoRefresh, scale: settings.refreshSeconds / BASE_REFRESH_SECONDS };
}
