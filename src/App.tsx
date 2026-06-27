import { useEffect, useRef, useState, useCallback } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/tauri";
import { useGhostMode } from "./hooks/useGhostMode";
import { useReader } from "./hooks/useReader";
import { useSettings } from "./hooks/useSettings";
import "./App.css";
import { ShortcutInput } from "./components/ShortcutInput";

// Built-in preset fonts (fallback / always available)
const PRESET_FONTS = [
  { label: "系统默认", value: "system-ui, sans-serif" },
  { label: "苹方", value: "'PingFang SC', sans-serif" },
  { label: "微软雅黑", value: "'Microsoft YaHei', sans-serif" },
  { label: "黑体", value: "SimHei, sans-serif" },
  { label: "宋体", value: "SimSun, serif" },
  { label: "楷体", value: "KaiTi, serif" },
  { label: "仿宋", value: "FangSong, serif" },
  { label: "思源黑体", value: "'Noto Sans SC', sans-serif" },
  { label: "思源宋体", value: "'Noto Serif SC', serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const WINDOW_TITLE_PRESETS = [
  "Microsoft Excel",
  "Word - 文档1.docx",
  "Google Chrome",
  "Visual Studio Code",
  "文件资源管理器",
  "Moyu Reader",
];

// Check if a KeyboardEvent matches the key part of a shortcut string (e.g. "C", "M", "F5")
// Uses e.code as primary check to handle Alt/Option key layout changes on macOS
function matchesKey(e: KeyboardEvent, keyStr: string): boolean {
  const k = keyStr.toLowerCase();
  // e.code-based check (layout-independent): "KeyC" for "c", "Digit1" for "1", "F5" for "f5"
  const code = e.code.toLowerCase();
  if (code === `key${k}`) return true;
  if (code === `digit${k}`) return true;
  if (code === k) return true; // for F1-F12, Space, etc.
  // fallback to e.key (works when no Alt modifier)
  return e.key.toLowerCase() === k;
}

// Format relative time
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}天前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

// Disguised Password Verification Component
function PasswordScreen({ onVerify }: { onVerify: () => void }) {
  const [pwd, setPwd] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd === "18652063629") {
      onVerify();
    } else {
      setPwd(""); // Silently fail and clear
    }
  };

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-white text-gray-800 select-none" data-tauri-drag-region>
      <div className="flex flex-col items-center pointer-events-none">
        <h1 className="text-4xl font-bold text-gray-300 mb-1 tracking-wider">404</h1>
        <p className="text-xs text-gray-400 mb-12 font-sans tracking-wide">Not Found</p>
      </div>
        
      <form onSubmit={handleSubmit} className="opacity-0 hover:opacity-30 transition-opacity duration-700">
        <input
          type="password"
          value={pwd}
          onChange={e => setPwd(e.target.value)}
          className="border-b border-gray-200 px-2 py-1 outline-none text-center text-xs text-gray-400 bg-transparent w-24"
          autoFocus
        />
      </form>
    </div>
  );
}

function MainApp() {
  const { settings, updateSettings } = useSettings();
  const {
    content, filePath, openFileDialog, loadFile,
    saveProgress, loadProgress,
    recentFiles, getFilePct,
    bookmarks, addBookmark, removeBookmark,
    toc,
  } = useReader(settings.compactMode);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const lastGKeyTime = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [tocVisible, setTocVisible] = useState(false);

  // Show toast notification for 1.5s
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  // Load system fonts on startup
  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then(fonts => setSystemFonts(fonts))
      .catch(() => setSystemFonts([]));
  }, []);

  // Set window title from settings
  useEffect(() => {
    appWindow.setTitle(settings.windowTitle).catch(() => {});
  }, [settings.windowTitle]);

  // Transparent background
  useEffect(() => {
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
  }, []);

  // Restore scroll position when file loads
  useEffect(() => {
    if (scrollRef.current && filePath) {
      scrollRef.current.scrollTop = loadProgress();
    }
  }, [filePath, loadProgress]);

  // Auto-scroll
  useEffect(() => {
    let animationId: number;
    const scroll = () => {
      if (settings.autoScroll && scrollRef.current && !isGhost) {
        scrollRef.current.scrollTop += settings.autoScrollSpeed;
      }
      animationId = requestAnimationFrame(scroll);
    };
    if (settings.autoScroll && !isGhost) {
      animationId = requestAnimationFrame(scroll);
    }
    return () => cancelAnimationFrame(animationId);
  }, [settings.autoScroll, settings.autoScrollSpeed]);

  // Handle scroll: save progress + update percentage
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const pct = scrollHeight > clientHeight
        ? (scrollTop / (scrollHeight - clientHeight)) * 100
        : 0;
      setProgress(pct);
      saveProgress(scrollTop, pct);
    }
  }, [saveProgress]);

  // Ctrl+wheel: adjust font size
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const newSize = Math.min(36, Math.max(10, settings.fontSize + delta));
        updateSettings({ fontSize: newSize });
        showToast(`字号: ${newSize}px`);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [settings.fontSize, updateSettings, showToast]);

  const toggleMenu = useCallback(() => {
    updateSettings({ menuVisible: !settings.menuVisible });
  }, [settings.menuVisible, updateSettings]);

  const toggleToc = useCallback(() => {
    setTocVisible(v => !v);
  }, []);

  // Add bookmark at current scroll position
  const onBookmark = useCallback(() => {
    if (scrollRef.current && filePath) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const pct = scrollHeight > clientHeight
        ? (scrollTop / (scrollHeight - clientHeight)) * 100
        : 0;
      addBookmark(scrollTop, pct);
      showToast(`📌 书签已添加 (${Math.round(pct)}%)`);
    } else {
      showToast("📌 请先打开一本书");
    }
  }, [filePath, addBookmark, showToast]);

  // Page turning logic (scrolls by ~80% of clientHeight)
  const handlePrevPage = useCallback(() => {
    if (scrollRef.current) {
      const pageH = scrollRef.current.clientHeight * 0.8;
      scrollRef.current.scrollTop -= pageH;
    }
  }, []);

  const handleNextPage = useCallback(() => {
    if (scrollRef.current) {
      const pageH = scrollRef.current.clientHeight * 0.8;
      scrollRef.current.scrollTop += pageH;
    }
  }, []);

  const { isGhost, isTop, isThrough } = useGhostMode(
    settings.bossKey, settings.topKey, settings.throughKey,
    settings.menuKey, settings.bookmarkKey,
    settings.prevPageKey, settings.nextPageKey,
    settings.idleTimeoutMinutes, settings.idleAction,
    settings.hideTrayInGhost,
    toggleMenu, onBookmark, handlePrevPage, handleNextPage,
  );

  // Local menu key fallback (when window has focus / Wayland)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // TOC toggle shortcut (local only)
      const tocParts = settings.tocKey.split("+");
      const tocKeyStr = tocParts[tocParts.length - 1] ?? "";
      const tocNeedsAlt = tocParts.includes("Alt");
      const tocNeedsCtrl = tocParts.includes("CommandOrControl") || tocParts.includes("Ctrl");
      if (
        (tocNeedsAlt ? e.altKey : !e.altKey) &&
        (tocNeedsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
        matchesKey(e, tocKeyStr)
      ) {
        e.preventDefault();
        toggleToc();
        return;
      }

      // Menu toggle fallback
      const parts = settings.menuKey.split("+");
      const keyStr = parts[parts.length - 1] ?? "";
      const needsAlt = parts.includes("Alt");
      const needsCtrl = parts.includes("CommandOrControl");
      const needsShift = parts.includes("Shift");
      if (
        (needsAlt ? e.altKey : !e.altKey) &&
        (needsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
        (needsShift ? e.shiftKey : !e.shiftKey) &&
        matchesKey(e, keyStr)
      ) {
        e.preventDefault();
        toggleMenu();
        return;
      }

      // Prev Page fallback
      const prevParts = settings.prevPageKey.split("+");
      const prevKeyStr = prevParts[prevParts.length - 1] ?? "";
      const prevNeedsAlt = prevParts.includes("Alt");
      const prevNeedsCtrl = prevParts.includes("CommandOrControl") || prevParts.includes("Ctrl");
      if (
        (prevNeedsAlt ? e.altKey : !e.altKey) &&
        (prevNeedsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
        matchesKey(e, prevKeyStr)
      ) {
        e.preventDefault();
        handlePrevPage();
        return;
      }

      // Next Page fallback
      const nextParts = settings.nextPageKey.split("+");
      const nextKeyStr = nextParts[nextParts.length - 1] ?? "";
      const nextNeedsAlt = nextParts.includes("Alt");
      const nextNeedsCtrl = nextParts.includes("CommandOrControl") || nextParts.includes("Ctrl");
      if (
        (nextNeedsAlt ? e.altKey : !e.altKey) &&
        (nextNeedsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
        matchesKey(e, nextKeyStr)
      ) {
        e.preventDefault();
        handleNextPage();
        return;
      }
      // Bookmark fallback
      const bookmarkParts = settings.bookmarkKey.split("+");
      const bookmarkKeyStr = bookmarkParts[bookmarkParts.length - 1] ?? "";
      const bookmarkNeedsAlt = bookmarkParts.includes("Alt");
      const bookmarkNeedsCtrl = bookmarkParts.includes("CommandOrControl") || bookmarkParts.includes("Ctrl");
      if (
        (bookmarkNeedsAlt ? e.altKey : !e.altKey) &&
        (bookmarkNeedsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
        matchesKey(e, bookmarkKeyStr)
      ) {
        e.preventDefault();
        onBookmark();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.menuKey, settings.tocKey, settings.prevPageKey, settings.nextPageKey, settings.bookmarkKey, toggleMenu, toggleToc, handlePrevPage, handleNextPage, onBookmark]);

  if (isGhost) return null;

  // Jump to position by exact character offset
  const jumpToCharOffset = (charOffset: number) => {
    setTocVisible(false);
    setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      
      const textNode = container.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

      try {
        const range = document.createRange();
        range.setStart(textNode, charOffset);
        range.setEnd(textNode, charOffset);
        
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        container.scrollTop += (rect.top - containerRect.top);
      } catch (e) {
        console.error("Failed to jump to char offset", e);
      }
    }, 50);
  };

  const jumpToBookmark = (pos: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = pos;
    }
  };

  // Merge system fonts with presets (remove duplicates by value)
  const systemFontOptions = systemFonts.map(f => ({ label: f, value: `'${f}', sans-serif` }));
  const presetValues = new Set(PRESET_FONTS.map(f => f.label.toLowerCase()));
  const uniqueSystemFonts = systemFontOptions.filter(
    f => !presetValues.has(f.label.toLowerCase())
  );

  // Full keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!scrollRef.current) return;
    const tag = (e.target as HTMLElement).tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

    const container = scrollRef.current;
    const lineH = settings.lineHeight * settings.fontSize;
    const pageH = container.clientHeight * 0.9;
    const now = Date.now();

    switch (e.key) {
      case "ArrowDown": case "j":
        container.scrollTop += lineH; e.preventDefault(); break;
      case "ArrowUp": case "k":
        container.scrollTop -= lineH; e.preventDefault(); break;
      case "ArrowRight": case "d":
        container.scrollTop += pageH / 2; e.preventDefault(); break;
      case "ArrowLeft": case "u":
        container.scrollTop -= pageH / 2; e.preventDefault(); break;
      case "PageDown":
        container.scrollTop += pageH; e.preventDefault(); break;
      case "PageUp":
        container.scrollTop -= pageH; e.preventDefault(); break;
      case " ":
        if (settings.autoScroll) {
          updateSettings({ autoScroll: false }); showToast("⏸ 自动滚动已暂停");
        } else { container.scrollTop += pageH; }
        e.preventDefault(); break;
      case "End": container.scrollTop = container.scrollHeight; e.preventDefault(); break;
      case "Home": container.scrollTop = 0; e.preventDefault(); break;
      case "G":
        if (e.shiftKey) { container.scrollTop = container.scrollHeight; e.preventDefault(); } break;
      case "g":
        if (now - lastGKeyTime.current < 400) {
          container.scrollTop = 0; lastGKeyTime.current = 0; e.preventDefault();
        } else { lastGKeyTime.current = now; }
        break;
      case "[":
        if (settings.autoScroll) {
          const s = Math.max(0.1, Math.round((settings.autoScrollSpeed - 0.1) * 10) / 10);
          updateSettings({ autoScrollSpeed: s }); showToast(`速度: ${s.toFixed(1)}x`);
        } break;
      case "]":
        if (settings.autoScroll) {
          const s = Math.min(5, Math.round((settings.autoScrollSpeed + 0.1) * 10) / 10);
          updateSettings({ autoScrollSpeed: s }); showToast(`速度: ${s.toFixed(1)}x`);
        } break;
    }
  };

  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col select-none relative"
      style={{
        backgroundColor: `${settings.bgColor}${Math.round(settings.bgOpacity * 255).toString(16).padStart(2, '0')}`,
        pointerEvents: isThrough ? 'none' : 'auto',
      }}
    >
      {/* Drag Regions — hidden when menu is open */}
      {!isThrough && !settings.menuVisible && (
        <>
          <div data-tauri-drag-region className="absolute top-0 left-0 w-full h-6 z-50" onPointerDown={(e) => { if (e.button === 0) appWindow.startDragging(); }} />
          <div data-tauri-drag-region className="absolute bottom-0 left-0 w-full h-6 z-50" onPointerDown={(e) => { if (e.button === 0) appWindow.startDragging(); }} />
          <div data-tauri-drag-region className="absolute top-0 left-0 w-6 h-full z-50" onPointerDown={(e) => { if (e.button === 0) appWindow.startDragging(); }} />
          <div data-tauri-drag-region className="absolute top-0 right-0 w-6 h-full z-50" onPointerDown={(e) => { if (e.button === 0) appWindow.startDragging(); }} />
        </>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-8 left-1/2 z-[100] pointer-events-none" style={{ transform: 'translateX(-50%)' }}>
          <div className="bg-black bg-opacity-70 text-white text-xs px-3 py-1.5 rounded-full shadow-lg">{toast}</div>
        </div>
      )}

      {/* Settings Menu */}
      {!isThrough && settings.menuVisible && (
        <div className="absolute top-0 left-0 w-full bg-gray-100 shadow-md z-40 p-4 flex flex-col gap-3 text-sm opacity-95 border-b border-gray-300 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div data-tauri-drag-region className="flex justify-between items-center cursor-move">
            <h2 className="font-bold text-gray-700 pointer-events-none">Moyu Reader v1.0.0</h2>
            <button onClick={() => updateSettings({ menuVisible: false })} className="text-gray-500 hover:text-black cursor-pointer text-lg leading-none px-1">✕</button>
          </div>

          {/* Row 1: File + Display */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <button onClick={() => openFileDialog()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded w-full">
              打开本地小说
            </button>
            <label className="flex flex-col">
              字体选择
              <select
                value={settings.fontFamily}
                onChange={e => updateSettings({ fontFamily: e.target.value })}
                className="border rounded px-2 py-1 mt-1 bg-white"
                style={{ fontFamily: settings.fontFamily }}
              >
                <optgroup label="预设字体">
                  {PRESET_FONTS.map(f => (
                    <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                  ))}
                </optgroup>
                {uniqueSystemFonts.length > 0 && (
                  <optgroup label="系统字体">
                    {uniqueSystemFonts.map(f => (
                      <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label className="flex flex-col">
              字体大小 ({settings.fontSize}px)
              <input type="range" min="10" max="36" value={settings.fontSize} onChange={e => updateSettings({ fontSize: Number(e.target.value) })} className="mt-1" />
            </label>
            <label className="flex flex-col">
              行高 ({settings.lineHeight})
              <input type="range" min="1" max="3" step="0.1" value={settings.lineHeight} onChange={e => updateSettings({ lineHeight: Number(e.target.value) })} className="mt-1" />
            </label>

            <label className="flex flex-col justify-between border rounded p-1 bg-white">
              <span className="text-xs text-gray-500">文字颜色</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={settings.fontColor} onChange={e => updateSettings({ fontColor: e.target.value })} className="w-8 h-8 p-0 border-0 flex-shrink-0" />
                <input type="text" value={settings.fontColor} onChange={e => updateSettings({ fontColor: e.target.value })} className="w-full text-xs outline-none" />
              </div>
            </label>
            <label className="flex flex-col justify-between border rounded p-1 bg-white">
              <span className="text-xs text-gray-500">背景颜色</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={settings.bgColor} onChange={e => updateSettings({ bgColor: e.target.value })} className="w-8 h-8 p-0 border-0 flex-shrink-0" />
                <input type="text" value={settings.bgColor} onChange={e => updateSettings({ bgColor: e.target.value })} className="w-full text-xs outline-none" />
              </div>
            </label>
            <label className="flex flex-col">
              透明度 ({(settings.bgOpacity * 100).toFixed(0)}%)
              <input type="range" min="0" max="1" step="0.05" value={settings.bgOpacity} onChange={e => updateSettings({ bgOpacity: Number(e.target.value) })} className="mt-1" />
            </label>
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input type="checkbox" checked={settings.compactMode} onChange={e => updateSettings({ compactMode: e.target.checked })} className="w-4 h-4" />
              智能去空行
            </label>
          </div>

          <div className="h-px w-full bg-gray-300" />

          {/* Row 2: Shortcuts + Stealth */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            <div className="flex flex-col text-xs text-gray-600">
              老板键 (隐身)
              <ShortcutInput value={settings.bossKey} onChange={val => updateSettings({ bossKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              置顶快捷键
              <ShortcutInput value={settings.topKey} onChange={val => updateSettings({ topKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              穿透快捷键
              <ShortcutInput value={settings.throughKey} onChange={val => updateSettings({ throughKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              菜单快捷键
              <ShortcutInput value={settings.menuKey} onChange={val => updateSettings({ menuKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              书签快捷键
              <ShortcutInput value={settings.bookmarkKey} onChange={val => updateSettings({ bookmarkKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              目录快捷键
              <ShortcutInput value={settings.tocKey} onChange={val => updateSettings({ tocKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              上一页快捷键
              <ShortcutInput value={settings.prevPageKey} onChange={val => updateSettings({ prevPageKey: val })} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              下一页快捷键
              <ShortcutInput value={settings.nextPageKey} onChange={val => updateSettings({ nextPageKey: val })} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <label className="flex flex-col text-xs text-gray-600">
              空闲隐藏(分钟)
              <input type="number" min="0" value={settings.idleTimeoutMinutes} onChange={e => updateSettings({ idleTimeoutMinutes: Number(e.target.value) })} className="border rounded px-1 mt-1 bg-white h-7" />
            </label>
            <label className="flex flex-col text-xs text-gray-600">
              窗口标题伪装
              <select value={settings.windowTitle} onChange={e => updateSettings({ windowTitle: e.target.value })} className="border rounded px-2 py-1 mt-1 bg-white text-xs">
                {WINDOW_TITLE_PRESETS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-600">
              自定义标题
              <input type="text" value={settings.windowTitle} onChange={e => updateSettings({ windowTitle: e.target.value })} className="border rounded px-2 py-1 mt-1 bg-white text-xs" />
            </label>
            <label className="flex flex-col text-xs text-gray-600">
              空闲超时动作
              <select value={settings.idleAction} onChange={e => updateSettings({ idleAction: e.target.value as 'hide' | 'disguise' })} className="border rounded px-2 py-1 mt-1 bg-white text-xs">
                <option value="hide">无感隐藏（默认）</option>
                <option value="disguise">切换到伪装界面</option>
              </select>
            </label>
            <div className="flex flex-col gap-1 text-xs text-gray-600">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={settings.hideTrayInGhost} onChange={e => updateSettings({ hideTrayInGhost: e.target.checked })} className="w-4 h-4" />
                隐身时隐藏托盘
              </label>
            </div>
          </div>

          <div className="h-px w-full bg-gray-300" />

          {/* Row 3: Auto scroll */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input type="checkbox" checked={settings.autoScroll} onChange={e => updateSettings({ autoScroll: e.target.checked })} className="w-4 h-4 text-blue-600" />
              开启自动翻页
            </label>
            {settings.autoScroll && (
              <label className="flex items-center gap-2">
                速度 ({settings.autoScrollSpeed.toFixed(1)}x):
                <input type="range" min="0.1" max="5" step="0.1" value={settings.autoScrollSpeed} onChange={e => updateSettings({ autoScrollSpeed: Number(e.target.value) })} className="w-24" />
              </label>
            )}
            <div className="flex-1" />
            <div className="text-gray-500 text-xs">
              {isTop ? "📌 已置顶" : "未置顶"} | Ctrl+滚轮调字号 | {settings.tocKey} 显示目录
            </div>
          </div>

          {/* Recent Files */}
          {recentFiles.length > 0 && (
            <>
              <div className="h-px w-full bg-gray-300" />
              <div>
                <div className="text-xs font-bold text-gray-500 mb-2">📂 最近打开</div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {recentFiles.map((f) => {
                    const pct = getFilePct(f.path);
                    return (
                      <button
                        key={f.path}
                        onClick={() => loadFile(f.path)}
                        className="flex items-center gap-3 text-left px-2 py-1.5 rounded hover:bg-gray-200 text-xs text-gray-700 group"
                      >
                        <span className="text-base">📖</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium truncate">{f.name}</span>
                          <span className="text-gray-400 text-xs">{formatRelativeTime(f.lastOpenedAt)}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <span className="text-gray-500 font-medium">{pct.toFixed(0)}%</span>
                          <div className="w-16 h-1.5 bg-gray-300 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full transition-all"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TOC Panel — right side float, independent of menu */}
      {!isThrough && tocVisible && (
        <div
          className="absolute top-0 right-0 h-full w-56 bg-white bg-opacity-95 shadow-xl z-50 flex flex-col"
          style={{ borderLeft: '1px solid #e5e7eb' }}
        >
          {/* TOC Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
            <span className="font-bold text-gray-700 text-sm">
              {filePath ? filePath.split(/[\\\/]/).pop() : "目录 & 书签"}
            </span>
            <button onClick={() => setTocVisible(false)} className="text-gray-400 hover:text-black cursor-pointer text-base leading-none">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Chapter TOC */}
            {toc.length > 0 && (
              <div>
                <div className="px-3 pt-2 pb-1 text-xs font-bold text-blue-600 uppercase tracking-wide">章节目录</div>
                {toc.map((entry, idx) => {
                  const pct = content.length > 0 ? (entry.charOffset / content.length) * 100 : 0;
                  return (
                    <button
                      key={idx}
                      onClick={() => jumpToCharOffset(entry.charOffset)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="truncate flex-1">{entry.title}</span>
                      <span className="text-gray-400 flex-shrink-0">{pct.toFixed(0)}%</span>
                    </button>
                  );
                })}
              </div>
            )}

            {toc.length === 0 && filePath && (
              <div className="px-3 pt-3 text-xs text-gray-400">
                未检测到章节标题
              </div>
            )}

            {/* Bookmarks */}
            {filePath && bookmarks.length > 0 && (
              <div>
                <div className="px-3 pt-3 pb-1 text-xs font-bold text-amber-600 uppercase tracking-wide">书签</div>
                {bookmarks.map((bm) => (
                  <div key={bm.time} className="flex items-center group">
                    <button
                      onClick={() => { jumpToBookmark(bm.pos); setTocVisible(false); }}
                      className="flex-1 text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                    >
                      <span className="block font-medium">{bm.label}</span>
                      <span className="text-gray-400 text-xs">
                        {new Date(bm.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                    <button
                      onClick={() => removeBookmark(bm.time)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-2 py-1.5 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {filePath && toc.length === 0 && bookmarks.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                <div className="text-2xl mb-1">📑</div>
                无目录和书签<br />
                <span className="text-gray-300">按 {settings.bookmarkKey} 添加书签</span>
              </div>
            )}

            {!filePath && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                <div className="text-2xl mb-1">📚</div>
                请先打开一本书
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reader Content Area */}
      <div
        data-tauri-drag-region
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={(e) => handleKeyDown(e as unknown as KeyboardEvent)}
        tabIndex={0}
        className="flex-1 w-full h-full overflow-y-auto p-4 whitespace-pre-wrap break-words outline-none"
        style={{
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          color: settings.fontColor,
          lineHeight: settings.lineHeight,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingRight: tocVisible ? '14rem' : undefined,
        }}
      >
        {content}
      </div>

      {/* Progress indicator — bottom right, very subtle */}
      {filePath && settings.menuVisible && (
        <div
          className="absolute bottom-8 right-8 text-xs pointer-events-none z-30 transition-opacity duration-300"
          style={{
            color: settings.fontColor,
            opacity: 0.15,
            fontSize: '11px',
            right: tocVisible ? '14.5rem' : undefined,
          }}
        >
          {Math.round(progress)}%
        </div>
      )}

      {/* TOC toggle button — bottom right floating, subtle */}
      {filePath && !isThrough && settings.menuVisible && (
        <button
          onClick={toggleToc}
          className="absolute bottom-8 left-4 z-30 text-xs opacity-20 hover:opacity-60 transition-opacity cursor-pointer select-none pointer-events-auto"
          style={{ color: settings.fontColor, fontSize: '11px' }}
          title={`目录 (${settings.tocKey})`}
        >
          目录
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [isVerified, setIsVerified] = useState(false);
  
  if (!isVerified) {
    return <PasswordScreen onVerify={() => setIsVerified(true)} />
  }

  return <MainApp />;
}
