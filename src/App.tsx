import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGhostMode } from "./hooks/useGhostMode";
import { useReader } from "./hooks/useReader";
import { useSettings } from "./hooks/useSettings";
import "./App.css";
import { ShortcutInput } from "./components/ShortcutInput";

const PRESET_FONTS = [
  { label: "系统默认", value: "system-ui, sans-serif" },
  { label: "微软雅黑", value: "'Microsoft YaHei', sans-serif" },
  { label: "黑体", value: "SimHei, sans-serif" },
  { label: "宋体", value: "SimSun, serif" },
  { label: "楷体", value: "KaiTi, serif" },
  { label: "仿宋", value: "FangSong, serif" },
  { label: "苹方", value: "'PingFang SC', sans-serif" },
  { label: "思源黑体", value: "'Noto Sans SC', sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
];

const WINDOW_TITLE_PRESETS = [
  "Microsoft Excel",
  "Word - 文档1.docx",
  "Google Chrome",
  "Visual Studio Code",
  "文件资源管理器",
  "Moyu Reader",
];

function App() {
  const { settings, updateSettings } = useSettings();
  const {
    content, filePath, openFileDialog, loadFile,
    saveProgress, loadProgress,
    recentFiles, getFilePct,
    bookmarks, addBookmark, removeBookmark,
  } = useReader();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const lastGKeyTime = useRef(0); // for "gg" detection
  const toastTimer = useRef<number | null>(null);

  // Show a toast notification for 1.5s
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  // Set window title from settings
  useEffect(() => {
    getCurrentWindow().setTitle(settings.windowTitle).catch(() => {});
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

  // Toggle menu
  const toggleMenu = useCallback(() => {
    updateSettings({ menuVisible: !settings.menuVisible });
  }, [settings.menuVisible, updateSettings]);

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

  const { isGhost, isTop, isThrough } = useGhostMode(
    settings.bossKey, settings.topKey, settings.throughKey,
    settings.menuKey, settings.bookmarkKey,
    settings.idleTimeoutMinutes, settings.idleAction,
    settings.hideTrayInGhost,
    toggleMenu, onBookmark,
  );

  // Local menu key fallback (when window has focus / Wayland)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const parts = settings.menuKey.split("+");
      const keyStr = parts[parts.length - 1]?.toLowerCase();
      const needsAlt = parts.includes("Alt");
      const needsCtrl = parts.includes("CommandOrControl");
      const needsShift = parts.includes("Shift");
      if (
        (needsAlt ? e.altKey : !e.altKey) &&
        (needsCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)) &&
        (needsShift ? e.shiftKey : !e.shiftKey) &&
        e.key.toLowerCase() === keyStr
      ) {
        e.preventDefault();
        toggleMenu();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.menuKey, toggleMenu]);

  if (isGhost) return null;

  // Jump to bookmark
  const jumpToBookmark = (pos: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = pos;
    }
  };

  // Full keyboard navigation handler
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!scrollRef.current) return;
    // Don't intercept when menu is open and user is in a form field
    const tag = (e.target as HTMLElement).tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

    const container = scrollRef.current;
    const lineH = settings.lineHeight * settings.fontSize;
    const pageH = container.clientHeight * 0.9;
    const now = Date.now();

    switch (e.key) {
      case "ArrowDown":
      case "j":
        container.scrollTop += lineH;
        e.preventDefault();
        break;
      case "ArrowUp":
      case "k":
        container.scrollTop -= lineH;
        e.preventDefault();
        break;
      case "ArrowRight":
      case "d":
        container.scrollTop += pageH / 2;
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "u":
        container.scrollTop -= pageH / 2;
        e.preventDefault();
        break;
      case "PageDown":
        container.scrollTop += pageH;
        e.preventDefault();
        break;
      case "PageUp":
        container.scrollTop -= pageH;
        e.preventDefault();
        break;
      case " ":
        if (settings.autoScroll) {
          updateSettings({ autoScroll: false });
          showToast("⏸ 自动滚动已暂停");
        } else {
          container.scrollTop += pageH;
        }
        e.preventDefault();
        break;
      case "End":
        container.scrollTop = container.scrollHeight;
        e.preventDefault();
        break;
      case "Home":
        container.scrollTop = 0;
        e.preventDefault();
        break;
      case "G":
        if (e.shiftKey) {
          container.scrollTop = container.scrollHeight;
          e.preventDefault();
        }
        break;
      case "g":
        if (now - lastGKeyTime.current < 400) {
          // "gg" sequence — jump to top
          container.scrollTop = 0;
          lastGKeyTime.current = 0;
          e.preventDefault();
        } else {
          lastGKeyTime.current = now;
        }
        break;
      case "[":
        if (settings.autoScroll) {
          const newSpeed = Math.max(0.1, Math.round((settings.autoScrollSpeed - 0.1) * 10) / 10);
          updateSettings({ autoScrollSpeed: newSpeed });
          showToast(`滚动速度: ${newSpeed.toFixed(1)}x`);
        }
        break;
      case "]":
        if (settings.autoScroll) {
          const newSpeed = Math.min(5, Math.round((settings.autoScrollSpeed + 0.1) * 10) / 10);
          updateSettings({ autoScrollSpeed: newSpeed });
          showToast(`滚动速度: ${newSpeed.toFixed(1)}x`);
        }
        break;
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
      {/* Drag Regions — hidden when menu is open to prevent intercepting button clicks */}
      {!isThrough && !settings.menuVisible && (
        <>
          <div data-tauri-drag-region className="absolute top-0 left-0 w-full h-6 z-50 cursor-move" onPointerDown={(e) => { if (e.button === 0) getCurrentWindow().startDragging(); }} />
          <div data-tauri-drag-region className="absolute bottom-0 left-0 w-full h-6 z-50 cursor-move" onPointerDown={(e) => { if (e.button === 0) getCurrentWindow().startDragging(); }} />
          <div data-tauri-drag-region className="absolute top-0 left-0 w-6 h-full z-50 cursor-move" onPointerDown={(e) => { if (e.button === 0) getCurrentWindow().startDragging(); }} />
          <div data-tauri-drag-region className="absolute top-0 right-0 w-6 h-full z-50 cursor-move" onPointerDown={(e) => { if (e.button === 0) getCurrentWindow().startDragging(); }} />
        </>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-8 left-1/2 z-[100] pointer-events-none"
          style={{ transform: 'translateX(-50%)' }}>
          <div className="bg-black bg-opacity-70 text-white text-xs px-3 py-1.5 rounded-full shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* Settings Menu */}
      {!isThrough && settings.menuVisible && (
        <div className="absolute top-0 left-0 w-full bg-gray-100 shadow-md z-40 p-4 flex flex-col gap-3 text-sm opacity-95 border-b border-gray-300 max-h-[90vh] overflow-y-auto">
          {/* Menu Header */}
          <div data-tauri-drag-region className="flex justify-between items-center cursor-move">
            <h2 className="font-bold text-gray-700 pointer-events-none">Moyu Reader 控制中心</h2>
            <button onClick={() => updateSettings({ menuVisible: false })} className="text-gray-500 hover:text-black cursor-pointer">✕</button>
          </div>

          {/* Row 1: File + Display */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <button onClick={() => openFileDialog(settings.compactMode)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded w-full">
              打开本地小说
            </button>
            <label className="flex flex-col">
              字体选择
              <select value={settings.fontFamily} onChange={e => updateSettings({ fontFamily: e.target.value })} className="border rounded px-2 py-1 mt-1 bg-white">
                {PRESET_FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            <label className="flex flex-col text-xs text-gray-600">
              空闲隐藏(分钟)
              <input type="number" min="0" value={settings.idleTimeoutMinutes} onChange={e => updateSettings({ idleTimeoutMinutes: Number(e.target.value) })} className="border rounded px-1 mt-1 bg-white h-7" />
            </label>
          </div>

          {/* Row 2b: Stealth options */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
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
              {isTop ? "📌 已置顶" : "未置顶"} | Ctrl+滚轮调字号 | [ ] 调速
            </div>
          </div>

          {/* Recent Files */}
          {recentFiles.length > 0 && (
            <>
              <div className="h-px w-full bg-gray-300" />
              <div>
                <div className="text-xs font-bold text-gray-500 mb-1">📂 最近打开</div>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {recentFiles.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => loadFile(f.path, settings.compactMode)}
                      className="flex items-center justify-between text-left px-2 py-1 rounded hover:bg-gray-200 text-xs text-gray-700 group"
                    >
                      <span className="truncate max-w-[80%]">{f.name}</span>
                      <span className="text-gray-400 text-xs ml-2">{getFilePct(f.path).toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Bookmarks */}
          {filePath && bookmarks.length > 0 && (
            <>
              <div className="h-px w-full bg-gray-300" />
              <div>
                <div className="text-xs font-bold text-gray-500 mb-1">📌 书签 ({filePath.split(/[\\/]/).pop()})</div>
                <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                  {bookmarks.map((bm) => (
                    <div key={bm.time} className="flex items-center gap-2 group">
                      <button
                        onClick={() => { jumpToBookmark(bm.pos); updateSettings({ menuVisible: false }); }}
                        className="flex-1 text-left px-2 py-0.5 rounded hover:bg-gray-200 text-xs text-gray-700"
                      >
                        {bm.label} — {new Date(bm.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </button>
                      <button
                        onClick={() => removeBookmark(bm.time)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Reader Content Area */}
      <div
        data-tauri-drag-region
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={(e) => handleKeyDown(e as unknown as KeyboardEvent)}
        tabIndex={0}
        className="flex-1 w-full h-full overflow-y-auto p-4 cursor-move whitespace-pre-wrap break-words outline-none"
        style={{
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          color: settings.fontColor,
          lineHeight: settings.lineHeight,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {content}
      </div>

      {/* Progress indicator — bottom right, very subtle */}
      {filePath && (
        <div
          className="absolute bottom-8 right-8 text-xs pointer-events-none z-30 transition-opacity duration-300"
          style={{
            color: settings.fontColor,
            opacity: 0.15,
            fontSize: '11px',
          }}
        >
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
}

export default App;
