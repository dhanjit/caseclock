/**
 * App-level settings (T3): theme (light/dark ledger) + the engine's Settings
 * (dormancy threshold, gazetted holidays). Persisted in the encrypted meta table
 * (same pattern as notify-settings); the theme is ALSO mirrored to localStorage
 * so the lock screen renders in the chosen theme before unlock.
 */
import { create } from "zustand";
import { DEFAULT_SETTINGS, type Settings } from "@/domain/types";
import { useSession } from "./session";

const KEY = "app_settings";
const THEME_LS = "caseclock-theme";
export type Theme = "light" | "dark";

interface Stored {
  theme?: Theme;
  untouchedDays?: number;
  holidays?: string[];
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_LS, theme);
  } catch {
    /* private mode — theme just won't pre-apply before unlock */
  }
}

/** Pre-unlock: apply the last chosen theme from localStorage (main.tsx). */
export function applyStoredThemeEarly() {
  try {
    const t = localStorage.getItem(THEME_LS);
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  } catch {
    /* ignore */
  }
}

async function read(): Promise<Stored> {
  try {
    const rows = await useSession.getState().client.query<{ value: string }>(
      `SELECT value FROM meta WHERE key='${KEY}'`,
    );
    return rows.length ? (JSON.parse(rows[0].value) as Stored) : {};
  } catch {
    return {};
  }
}
async function write(v: Stored): Promise<void> {
  await useSession.getState().client.exec(
    `INSERT INTO meta(key, value) VALUES ('${KEY}', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(v)],
  );
}

interface AppSettingsState {
  theme: Theme;
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: Theme) => Promise<void>;
  setUntouchedDays: (days: number) => Promise<void>;
}

export const useAppSettings = create<AppSettingsState>((set, get) => ({
  theme: (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light") as Theme,
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    const s = await read();
    const theme: Theme = s.theme === "dark" ? "dark" : "light";
    applyTheme(theme);
    set({
      theme,
      settings: {
        untouchedDays: s.untouchedDays && s.untouchedDays > 0 ? s.untouchedDays : DEFAULT_SETTINGS.untouchedDays,
        holidays: s.holidays ?? DEFAULT_SETTINGS.holidays,
      },
      loaded: true,
    });
  },
  async setTheme(theme) {
    applyTheme(theme);
    set({ theme });
    const cur = get().settings;
    await write({ theme, untouchedDays: cur.untouchedDays, holidays: cur.holidays });
  },
  async setUntouchedDays(days) {
    const untouchedDays = Number.isFinite(days) && days > 0 ? Math.round(days) : DEFAULT_SETTINGS.untouchedDays;
    const settings = { ...get().settings, untouchedDays };
    set({ settings });
    await write({ theme: get().theme, untouchedDays, holidays: settings.holidays });
  },
}));
