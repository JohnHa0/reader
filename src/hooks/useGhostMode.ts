import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { TrayIcon } from "@tauri-apps/api/tray";

export function useGhostMode(bossKey: string, topKey: string, throughKey: string, idleTimeoutMinutes: number, hideTrayInGhost: boolean) {
  const [isGhost, setIsGhost] = useState(false);
  const [isTop, setIsTop] = useState(false);
  const [isThrough, setIsThrough] = useState(false);
  const trayRef = useRef<TrayIcon | null>(null);

  const initTray = async () => {
    try {
      if (!trayRef.current) {
        // Create tray with default options
        const tray = await TrayIcon.new({ id: 'moyu-tray', tooltip: 'Moyu Reader' });
        trayRef.current = tray;
        
        // Add tray click event to restore window if it was hidden
        tray.onAction((event) => {
          if (event.type === 'Click') {
            toggleGhost();
          }
        });
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
    // Register shortcuts
    const setupShortcut = async () => {
      try {
        await unregister(bossKey).catch(() => {});
        await unregister(topKey).catch(() => {});
        await unregister(throughKey).catch(() => {});
        
        if (bossKey) {
          await register(bossKey, (event) => {
            if (event.state === "Pressed") toggleGhost();
          });
        }
        if (topKey) {
          await register(topKey, (event) => {
            if (event.state === "Pressed") toggleTop();
          });
        }
        if (throughKey) {
          await register(throughKey, (event) => {
            if (event.state === "Pressed") toggleThrough();
          });
        }
      } catch (e) {
        console.error("Failed to register shortcut:", e);
      }
    };
    setupShortcut();

    return () => {
      if (bossKey) unregister(bossKey).catch(() => {});
      if (topKey) unregister(topKey).catch(() => {});
      if (throughKey) unregister(throughKey).catch(() => {});
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
