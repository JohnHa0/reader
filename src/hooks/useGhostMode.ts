import { useState, useEffect, useCallback } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";

export function useGhostMode(
  bossKey: string,
  topKey: string,
  throughKey: string,
  menuKey: string,
  bookmarkKey: string,
  prevPageKey: string,
  nextPageKey: string,
  idleTimeoutMinutes: number,
  idleAction: 'hide' | 'disguise',
  onMenuToggle: (forceOpen?: boolean) => void,
  onBookmark: () => void,
  onPrevPage: () => void,
  onNextPage: () => void,
) {
  const [isGhost, setIsGhost] = useState(false);
  const [isTop, setIsTop] = useState(false);
  const [isThrough, setIsThrough] = useState(false);
  const [isDisguised, setIsDisguised] = useState(false);
  const [registeredMenuKey, setRegisteredMenuKey] = useState<string | null>(null);
  const toggleGhost = useCallback(async () => {
    try {
      if (isGhost) {
        await appWindow.show();
        await appWindow.setFocus();
        setIsGhost(false);
      } else {
        await appWindow.hide();
        setIsGhost(true);
      }
    } catch (e) {
      console.error("Failed to toggle ghost mode:", e);
    }
  }, [isGhost]);

  const toggleTop = useCallback(async () => {
    try {
      const newTop = !isTop;
      await appWindow.setAlwaysOnTop(newTop);
      setIsTop(newTop);
    } catch (e) {
      console.error("Failed to toggle top:", e);
    }
  }, [isTop]);

  const toggleThrough = useCallback(async () => {
    try {
      const newThrough = !isThrough;
      await appWindow.setIgnoreCursorEvents(newThrough);
      setIsThrough(newThrough);
    } catch (e) {
      console.error("Failed to toggle through:", e);
    }
  }, [isThrough]);

  const handleMenuShortcut = useCallback(async (forceOpen = false) => {
    if (isThrough) {
      await toggleThrough();
    }
    onMenuToggle(forceOpen || isThrough);
  }, [isThrough, onMenuToggle, toggleThrough]);

  // Register global shortcuts via Rust backend
  useEffect(() => {
    let active = true;
    setRegisteredMenuKey(null);
    invoke<[boolean, string[]]>("register_shortcuts", {
      bossKey: bossKey || "",
      topKey: topKey || "",
      throughKey: throughKey || "",
      menuKey: menuKey || "",
      bookmarkKey: bookmarkKey || "",
      prevPageKey: prevPageKey || "",
      nextPageKey: nextPageKey || "",
    }).then(([menuRegistered, errors]) => {
      if (active && menuRegistered) setRegisteredMenuKey(menuKey);
      if (errors.length) console.error("Failed to register shortcuts:", errors);
    }).catch((e) => console.error("Failed to register shortcuts:", e));
    return () => { active = false; };
  }, [bossKey, topKey, throughKey, menuKey, bookmarkKey, prevPageKey, nextPageKey]);

  // Listen to shortcut events from Rust backend
  useEffect(() => {
    const unlisten = listen<string>('global-keypress', (event) => {
      const name = event.payload;
      if (name === "boss-hide") {
        setIsGhost(true);
      } else if (name === "boss-show") {
        setIsGhost(false);
      } else if (name === "top") {
        toggleTop();
      } else if (name === "through") {
        toggleThrough();
      } else if (name === "menu") {
        void handleMenuShortcut();
      } else if (name === "menu-show") {
        setIsGhost(false);
        void handleMenuShortcut(true);
      } else if (name === "bookmark") {
        onBookmark();
      } else if (name === "prev_page") {
        onPrevPage();
      } else if (name === "next_page") {
        onNextPage();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [toggleTop, toggleThrough, handleMenuShortcut, onBookmark, onPrevPage, onNextPage]);

  // Idle timeout — supports 'hide' (default) or 'disguise' action
  useEffect(() => {
    let timeout: number;
    const resetTimer = () => {
      clearTimeout(timeout);
      if (!isGhost && idleTimeoutMinutes > 0) {
        timeout = window.setTimeout(() => {
          if (idleAction === 'disguise') {
            setIsDisguised(true);
          } else {
            toggleGhost();
          }
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

  return {
    isGhost,
    isTop,
    isThrough,
    isDisguised,
    menuRegistered: registeredMenuKey === menuKey,
    handleMenuShortcut,
    clearDisguise: () => setIsDisguised(false),
    toggleGhost,
    toggleTop,
    toggleThrough,
  };
}
