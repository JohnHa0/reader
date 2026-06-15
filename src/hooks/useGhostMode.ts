import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { TrayIcon } from "@tauri-apps/api/tray";

export function useGhostMode() {
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
      if (isGhost) {
        // Show
        await win.show();
        await win.setFocus();
        if (trayRef.current) await trayRef.current.setVisible(true);
        setIsGhost(false);
      } else {
        // Hide
        await win.hide();
        if (trayRef.current) await trayRef.current.setVisible(false);
        setIsGhost(true);
      }
    } catch (e) {
      console.error("Failed to toggle ghost mode:", e);
    }
  }, [isGhost]);

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
        await unregister("Alt+H");
        await unregister("Alt+T");
        await unregister("Alt+P");
        
        await register("Alt+H", (event) => {
          if (event.state === "Pressed") toggleGhost();
        });
        await register("Alt+T", (event) => {
          if (event.state === "Pressed") toggleTop();
        });
        await register("Alt+P", (event) => {
          if (event.state === "Pressed") toggleThrough();
        });
      } catch (e) {
        console.error("Failed to register shortcut:", e);
      }
    };
    setupShortcut();

    return () => {
      unregister("Alt+H").catch(console.error);
      unregister("Alt+T").catch(console.error);
      unregister("Alt+P").catch(console.error);
    };
  }, [toggleGhost, toggleTop, toggleThrough]);

  // Idle timeout feature (Anti-Gank)
  useEffect(() => {
    let timeout: number;
    const resetTimer = () => {
      clearTimeout(timeout);
      if (!isGhost) {
        timeout = window.setTimeout(() => {
          toggleGhost();
        }, 3 * 60 * 1000); // 3 minutes default
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
  }, [isGhost, toggleGhost]);

  return { isGhost, isTop, isThrough, toggleGhost, toggleTop, toggleThrough };
}
