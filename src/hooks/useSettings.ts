import { useState } from "react";

export interface AppSettings {
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  bgColor: string;
  bgOpacity: number;
  lineHeight: number;
  compactMode: boolean;
  autoScroll: boolean;
  autoScrollSpeed: number; // pixels per frame
  bossKey: string;
  topKey: string;
  throughKey: string;
  menuKey: string;
  idleTimeoutMinutes: number;
  menuVisible: boolean;
  hideTrayInGhost: boolean;
  windowTitle: string;
  bookmarkKey: string;
  tocKey: string;
  prevPageKey: string;
  nextPageKey: string;
  idleAction: 'hide' | 'disguise';
}

const defaultSettings: AppSettings = {
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
  fontColor: "#333333",
  bgColor: "#ffffff",
  bgOpacity: 0.8,
  lineHeight: 1.6,
  compactMode: false,
  autoScroll: false,
  autoScrollSpeed: 0.5,
  bossKey: "Alt+H",
  topKey: "Alt+T",
  throughKey: "Alt+P",
  menuKey: "Alt+M",
  idleTimeoutMinutes: 3,
  menuVisible: true,
  hideTrayInGhost: false,
  windowTitle: "Microsoft Excel",
  bookmarkKey: "Alt+B",
  tocKey: "Alt+C",
  prevPageKey: "Alt+ArrowUp",
  nextPageKey: "Alt+ArrowDown",
  idleAction: 'hide' as const,
};

const SETTINGS_VERSION = 2;

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("moyu_settings");
    const ver = parseInt(localStorage.getItem("moyu_settings_ver") || "0");
    if (saved && ver >= SETTINGS_VERSION) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    } else if (saved && ver < SETTINGS_VERSION) {
      // Migrate old settings but reset compactMode to new default
      try {
        const old = JSON.parse(saved);
        const migrated = { ...defaultSettings, ...old, compactMode: defaultSettings.compactMode };
        localStorage.setItem("moyu_settings", JSON.stringify(migrated));
        localStorage.setItem("moyu_settings_ver", String(SETTINGS_VERSION));
        return migrated;
      } catch (e) {
        console.error("Failed to migrate settings", e);
      }
    }
    localStorage.setItem("moyu_settings_ver", String(SETTINGS_VERSION));
    return defaultSettings;
  });

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem("moyu_settings", JSON.stringify(updated));
      return updated;
    });
  };

  return { settings, updateSettings };
}
