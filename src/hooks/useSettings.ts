import { useState, useEffect } from "react";

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
  idleTimeoutMinutes: number;
}

const defaultSettings: AppSettings = {
  fontSize: 14,
  fontFamily: "sans-serif",
  fontColor: "#333333",
  bgColor: "#ffffff",
  bgOpacity: 0.8,
  lineHeight: 1.6,
  compactMode: true,
  autoScroll: false,
  autoScrollSpeed: 0.5,
  bossKey: "Alt+H",
  idleTimeoutMinutes: 3,
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("moyu_settings");
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
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
