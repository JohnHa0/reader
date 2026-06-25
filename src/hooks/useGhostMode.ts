import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { TrayIcon } from "@tauri-apps/api/tray";
import { invoke } from "@tauri-apps/api/core";

export function useGhostMode(bossKey: string, topKey: string, throughKey: string, menuKey: string, idleTimeoutMinutes: number, hideTrayInGhost: boolean, onMenuToggle: () => void) {
  const [isGhost, setIsGhost] = useState(false);
  const [isTop, setIsTop] = useState(false);
  const [isThrough, setIsThrough] = useState(false);
  const trayRef = useRef<TrayIcon | null>(null);
  const isGhostRef = useRef(false);
  const hideTrayRef = useRef(hideTrayInGhost);

  // Keep refs in sync for use inside callbacks that don't re-register
  useEffect(() => { isGhostRef.current = isGhost; }, [isGhost]);
  useEffect(() => { hideTrayRef.current = hideTrayInGhost; }, [hideTrayInGhost]);

  const initTray = useCallback(async () => {
    try {
      if (!trayRef.current) {
        const tray = await TrayIcon.new({ 
          id: 'moyu-tray', 
          tooltip: 'Moyu Reader',
          action: () => {
            // Use ref so the callback always has latest state
            const win = getCurrentWindow();
            if (isGhostRef.current) {
              win.show().then(() => win.setFocus());
              trayRef.current?.setVisible(true);
              setIsGhost(false);
            } else {
              win.hide();
              if (hideTrayRef.current) {
                trayRef.current?.setVisible(false);
              }
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
    return () => {
      trayRef.current?.close();
    };
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

  // Register global shortcuts via Rust backend (uses tauri-plugin-global-shortcut, works on macOS + Linux X11)
  useEffect(() => {
    invoke("register_shortcuts", {
      bossKey: bossKey || "",
      topKey: topKey || "",
      throughKey: throughKey || "",
      menuKey: menuKey || "",
    }).catch((e) => console.error("Failed to register shortcuts:", e));
  }, [bossKey, topKey, throughKey, menuKey]);

  // Listen to shortcut events emitted by the Rust backend
  useEffect(() => {
    const unlisten = listen<string>('global-keypress', (event) => {
      const name = event.payload;
      if (name === "boss") toggleGhost();
      else if (name === "top") toggleTop();
      else if (name === "through") toggleThrough();
      else if (name === "menu") onMenuToggle();
    });

    return () => { unlisten.then(fn => fn()); };
  }, [toggleGhost, toggleTop, toggleThrough, onMenuToggle]);

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
