import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { TrayIcon } from "@tauri-apps/api/tray";
import { invoke } from "@tauri-apps/api/core";

export function useGhostMode(
  bossKey: string,
  topKey: string,
  throughKey: string,
  menuKey: string,
  bookmarkKey: string,
  idleTimeoutMinutes: number,
  idleAction: 'hide' | 'disguise',
  hideTrayInGhost: boolean,
  onMenuToggle: () => void,
  onBookmark: () => void,
) {
  const [isGhost, setIsGhost] = useState(false);
  const [isTop, setIsTop] = useState(false);
  const [isThrough, setIsThrough] = useState(false);
  const trayRef = useRef<TrayIcon | null>(null);
  const isGhostRef = useRef(false);
  const hideTrayRef = useRef(hideTrayInGhost);

  useEffect(() => { isGhostRef.current = isGhost; }, [isGhost]);
  useEffect(() => { hideTrayRef.current = hideTrayInGhost; }, [hideTrayInGhost]);

  const initTray = useCallback(async () => {
    try {
      if (!trayRef.current) {
        const tray = await TrayIcon.new({
          id: 'moyu-tray',
          tooltip: 'Moyu Reader',
          action: () => {
            const win = getCurrentWindow();
            if (isGhostRef.current) {
              win.show().then(() => win.setFocus());
              trayRef.current?.setVisible(true);
              setIsGhost(false);
            } else {
              win.hide();
              if (hideTrayRef.current) trayRef.current?.setVisible(false);
              setIsGhost(true);
            }
          }
        });
        trayRef.current = tray;
      }
    } catch (e) {
      console.error("Failed to init tray:", e);
    }
  }, []);

  useEffect(() => {
    initTray();
    return () => { trayRef.current?.close(); };
  }, [initTray]);

  const toggleGhost = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      if (isGhost) {
        await win.show();
        await win.setFocus();
        if (trayRef.current) await trayRef.current.setVisible(true);
        setIsGhost(false);
      } else {
        await win.hide();
        if (trayRef.current && hideTrayInGhost) await trayRef.current.setVisible(false);
        setIsGhost(true);
      }
    } catch (e) {
      console.error("Failed to toggle ghost mode:", e);
    }
  }, [isGhost, hideTrayInGhost]);

  const toggleTop = useCallback(async () => {
    try {
      const newTop = !isTop;
      await getCurrentWindow().setAlwaysOnTop(newTop);
      setIsTop(newTop);
    } catch (e) {
      console.error("Failed to toggle top:", e);
    }
  }, [isTop]);

  const toggleThrough = useCallback(async () => {
    try {
      const newThrough = !isThrough;
      await getCurrentWindow().setIgnoreCursorEvents(newThrough);
      setIsThrough(newThrough);
    } catch (e) {
      console.error("Failed to toggle through:", e);
    }
  }, [isThrough]);

  // Register global shortcuts via Rust backend
  useEffect(() => {
    invoke("register_shortcuts", {
      bossKey: bossKey || "",
      topKey: topKey || "",
      throughKey: throughKey || "",
      menuKey: menuKey || "",
      bookmarkKey: bookmarkKey || "",
    }).catch((e) => console.error("Failed to register shortcuts:", e));
  }, [bossKey, topKey, throughKey, menuKey, bookmarkKey]);

  // Listen to shortcut events from Rust backend
  useEffect(() => {
    const unlisten = listen<string>('global-keypress', (event) => {
      const name = event.payload;
      if (name === "boss") {
        // Window is visible — JS handles hiding
        toggleGhost();
      } else if (name === "boss-show") {
        // Rust already showed the window; JS just updates state
        if (trayRef.current) trayRef.current.setVisible(true).catch(() => {});
        setIsGhost(false);
      } else if (name === "top") {
        toggleTop();
      } else if (name === "through") {
        toggleThrough();
      } else if (name === "menu") {
        onMenuToggle();
      } else if (name === "menu-show") {
        // Rust showed window; JS updates state and opens menu
        if (trayRef.current) trayRef.current.setVisible(true).catch(() => {});
        setIsGhost(false);
        onMenuToggle();
      } else if (name === "bookmark") {
        onBookmark();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [toggleGhost, toggleTop, toggleThrough, onMenuToggle, onBookmark]);

  // Idle timeout — supports 'hide' (default) or 'disguise' action
  useEffect(() => {
    let timeout: number;
    const resetTimer = () => {
      clearTimeout(timeout);
      if (!isGhost && idleTimeoutMinutes > 0) {
        timeout = window.setTimeout(() => {
          // idleAction: 'hide' = silently hide; 'disguise' = caller handles via isIdle state
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
  }, [isGhost, toggleGhost, idleTimeoutMinutes, idleAction]);

  return { isGhost, isTop, isThrough, toggleGhost, toggleTop, toggleThrough };
}
