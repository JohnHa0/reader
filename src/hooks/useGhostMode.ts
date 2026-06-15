import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { TrayIcon } from "@tauri-apps/api/tray";

export function useGhostMode(bossKey: string, topKey: string, throughKey: string, idleTimeoutMinutes: number, hideTrayInGhost: boolean) {
  const [isGhost, setIsGhost] = useState(false);
  const [isTop, setIsTop] = useState(false);
  const [isThrough, setIsThrough] = useState(false);
  const trayRef = useRef<TrayIcon | null>(null);

  const initTray = async () => {
    try {
      if (!trayRef.current) {
        const tray = await TrayIcon.new({ 
          id: 'moyu-tray', 
          tooltip: 'Moyu Reader',
          action: (event) => {
            if (event.type === 'Click') {
              toggleGhost();
            }
          }
        });
        trayRef.current = tray;
      }
    } catch (e) {
      console.error("Failed to init tray:", e);
    }
  };

  useEffect(() => {
    initTray();
    return () => {
      trayRef.current?.close();
    };
  }, []);

  const toggleGhost = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      // If we are currently ghosted (hidden), we need to show
      if (isGhost) {
        await win.show();
        await win.setFocus();
        if (trayRef.current) await trayRef.current.setVisible(true);
        setIsGhost(false);
      } else {
        // We are visible, so hide
        await win.hide();
        if (trayRef.current && hideTrayInGhost) {
          await trayRef.current.setVisible(false);
        }
        setIsGhost(true);
      }
    } catch (e) {
      console.error("Failed to toggle ghost mode:", e);
    }
  }, [isGhost, hideTrayInGhost]);

  const toggleTop = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const newTop = !isTop;
      await win.setAlwaysOnTop(newTop);
      setIsTop(newTop);
    } catch (e) {
      console.error("Failed to toggle top:", e);
    }
  }, [isTop]);

  const toggleThrough = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const newThrough = !isThrough;
      await win.setIgnoreCursorEvents(newThrough);
      setIsThrough(newThrough);
    } catch (e) {
      console.error("Failed to toggle through:", e);
    }
  }, [isThrough]);

  useEffect(() => {
    const setupGlobalListener = async () => {
      try {
        await listen<string>('global-keypress', (event) => {
          const shortcut = event.payload;
          if (!shortcut) return;
          const s = shortcut.toUpperCase();

          if (bossKey && s === bossKey.toUpperCase()) {
             toggleGhost();
          } else if (topKey && s === topKey.toUpperCase()) {
             toggleTop();
          } else if (throughKey && s === throughKey.toUpperCase()) {
             toggleThrough();
          }
        });
      } catch (e) {
        console.error("Failed to listen to global keypress", e);
      }
    };
    
    setupGlobalListener();

    // LOCAL SHORTCUT FALLBACK
    const handleLocalKeyDown = (e: KeyboardEvent) => {
      const checkMatch = (shortcut: string) => {
        if (!shortcut) return false;
        const parts = shortcut.split('+');
        const key = parts[parts.length - 1]?.toUpperCase();
        const needsAlt = parts.includes('Alt');
        const needsCtrl = parts.includes('CommandOrControl') || parts.includes('CmdOrCtrl');
        const needsShift = parts.includes('Shift');
        const needsSuper = parts.includes('Super');

        const pressedKey = e.key === ' ' ? 'SPACE' : e.key.toUpperCase();

        return (
          pressedKey === key &&
          (needsAlt ? e.altKey : !e.altKey) &&
          (needsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
          (needsShift ? e.shiftKey : !e.shiftKey) &&
          (needsSuper ? e.metaKey : !e.metaKey) // approximate meta
        );
      };

      if (checkMatch(bossKey)) {
        e.preventDefault();
        toggleGhost();
      } else if (checkMatch(topKey)) {
        e.preventDefault();
        toggleTop();
      } else if (checkMatch(throughKey)) {
        e.preventDefault();
        toggleThrough();
      }
    };

    window.addEventListener('keydown', handleLocalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleLocalKeyDown);
    };
  }, [toggleGhost, toggleTop, toggleThrough, bossKey, topKey, throughKey]);

  // Idle timeout feature (Anti-Gank)
  useEffect(() => {
    let timeout: number;
    const resetTimer = () => {
      clearTimeout(timeout);
      if (!isGhost && idleTimeoutMinutes > 0) {
        timeout = window.setTimeout(() => {
          toggleGhost();
        }, idleTimeoutMinutes * 60 * 1000);
      }
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [isGhost, toggleGhost, idleTimeoutMinutes]);

  return { isGhost, isTop, isThrough, toggleGhost, toggleTop, toggleThrough };
}
