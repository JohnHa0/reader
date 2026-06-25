import { useEffect, useRef } from "react";
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

function App() {
  const { settings, updateSettings } = useSettings();
  const { isGhost, isTop, isThrough } = useGhostMode(settings.bossKey, settings.topKey, settings.throughKey, settings.idleTimeoutMinutes, settings.hideTrayInGhost);
  const { content, filePath, openFileDialog, saveProgress, loadProgress } = useReader();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
  }, []);

  useEffect(() => {
    if (scrollRef.current && filePath) {
      scrollRef.current.scrollTop = loadProgress();
    }
  }, [filePath, loadProgress]);

  const handleScroll = () => {
    if (scrollRef.current) {
      saveProgress(scrollRef.current.scrollTop);
    }
  };

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
  }, [settings.autoScroll, settings.autoScrollSpeed, isGhost]);

  // Handle menu toggle shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Split the saved menuKey like "Alt+M" into modifier and key
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
        updateSettings({ menuVisible: !settings.menuVisible });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.menuKey, settings.menuVisible, updateSettings]);

  if (isGhost) return null;

  return (
    <div 
      className="w-screen h-screen overflow-hidden flex flex-col select-none relative"
      style={{
        backgroundColor: `${settings.bgColor}${Math.round(settings.bgOpacity * 255).toString(16).padStart(2, '0')}`,
        pointerEvents: isThrough ? 'none' : 'auto',
      }}
    >
      {/* Edge Drag Regions */}
      {!isThrough && (
        <>
          <div className="absolute top-0 left-0 w-full h-3 z-50 cursor-move" onPointerDown={(e) => { if(e.button === 0) getCurrentWindow().startDragging(); }} />
          <div className="absolute bottom-0 left-0 w-full h-3 z-50 cursor-move" onPointerDown={(e) => { if(e.button === 0) getCurrentWindow().startDragging(); }} />
          <div className="absolute top-0 left-0 w-3 h-full z-50 cursor-move" onPointerDown={(e) => { if(e.button === 0) getCurrentWindow().startDragging(); }} />
          <div className="absolute top-0 right-0 w-3 h-full z-50 cursor-move" onPointerDown={(e) => { if(e.button === 0) getCurrentWindow().startDragging(); }} />
        </>
      )}

      {/* Settings Menu */}
      {!isThrough && settings.menuVisible && (
        <div 
          className="absolute top-0 left-0 w-full bg-gray-100 shadow-md z-40 p-4 flex flex-col gap-3 text-sm opacity-95 border-b border-gray-300"
        >
          <div 
            className="flex justify-between items-center cursor-move" 
            onPointerDown={(e) => { 
              if(e.button === 0 && (e.target as HTMLElement).tagName !== 'BUTTON') {
                getCurrentWindow().startDragging(); 
              }
            }}
          >
            <h2 className="font-bold text-gray-700 pointer-events-none">Moyu Reader 控制中心</h2>
            <button onClick={() => updateSettings({ menuVisible: false })} className="text-gray-500 hover:text-black cursor-pointer">✕</button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <button onClick={() => openFileDialog(settings.compactMode)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded w-full">
              打开本地小说
            </button>
            <label className="flex flex-col">
              字体选择
              <select 
                value={settings.fontFamily} 
                onChange={e => updateSettings({fontFamily: e.target.value})} 
                className="border rounded px-2 py-1 mt-1 bg-white"
              >
                {PRESET_FONTS.map(f => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              字体大小 ({settings.fontSize}px)
              <input type="range" min="10" max="36" value={settings.fontSize} onChange={e => updateSettings({fontSize: Number(e.target.value)})} className="mt-1" />
            </label>
            <label className="flex flex-col">
              行高 ({settings.lineHeight})
              <input type="range" min="1" max="3" step="0.1" value={settings.lineHeight} onChange={e => updateSettings({lineHeight: Number(e.target.value)})} className="mt-1" />
            </label>
            
            <label className="flex flex-col justify-between border rounded p-1 bg-white">
              <span className="text-xs text-gray-500">文字颜色 (可直接拾取或输入Hex)</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={settings.fontColor} onChange={e => updateSettings({fontColor: e.target.value})} className="w-8 h-8 p-0 border-0 flex-shrink-0" />
                <input type="text" value={settings.fontColor} onChange={e => updateSettings({fontColor: e.target.value})} className="w-full text-xs outline-none" />
              </div>
            </label>
            <label className="flex flex-col justify-between border rounded p-1 bg-white">
              <span className="text-xs text-gray-500">背景颜色 (可直接拾取或输入Hex)</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={settings.bgColor} onChange={e => updateSettings({bgColor: e.target.value})} className="w-8 h-8 p-0 border-0 flex-shrink-0" />
                <input type="text" value={settings.bgColor} onChange={e => updateSettings({bgColor: e.target.value})} className="w-full text-xs outline-none" />
              </div>
            </label>
            <label className="flex flex-col">
              透明度 ({(settings.bgOpacity * 100).toFixed(0)}%)
              <input type="range" min="0" max="1" step="0.05" value={settings.bgOpacity} onChange={e => updateSettings({bgOpacity: Number(e.target.value)})} className="mt-1" />
            </label>
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input type="checkbox" checked={settings.compactMode} onChange={e => updateSettings({compactMode: e.target.checked})} className="w-4 h-4" />
              智能去空行/紧凑排版
            </label>
          </div>

          <div className="h-px w-full bg-gray-300 my-1"></div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="flex flex-col text-xs text-gray-600">
              老板键 (隐身)
              <ShortcutInput value={settings.bossKey} onChange={val => updateSettings({bossKey: val})} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              置顶切换快捷键
              <ShortcutInput value={settings.topKey} onChange={val => updateSettings({topKey: val})} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              鼠标穿透快捷键
              <ShortcutInput value={settings.throughKey} onChange={val => updateSettings({throughKey: val})} />
            </div>
            <div className="flex flex-col text-xs text-gray-600">
              菜单呼出快捷键
              <ShortcutInput value={settings.menuKey} onChange={val => updateSettings({menuKey: val})} />
            </div>
            <label className="flex flex-col text-xs text-gray-600">
              空闲隐藏(分钟，0为关闭) 
              <input type="number" min="0" value={settings.idleTimeoutMinutes} onChange={e => updateSettings({idleTimeoutMinutes: Number(e.target.value)})} className="border rounded px-1 mt-1 bg-white h-7" />
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600 mt-4 cursor-pointer">
              <input type="checkbox" checked={settings.hideTrayInGhost} onChange={e => updateSettings({hideTrayInGhost: e.target.checked})} className="w-4 h-4" />
              隐身时彻底隐藏托盘
            </label>
          </div>

          <div className="h-px w-full bg-gray-300 my-1"></div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input type="checkbox" checked={settings.autoScroll} onChange={e => updateSettings({autoScroll: e.target.checked})} className="w-4 h-4 text-blue-600" />
              开启自动翻页
            </label>
            {settings.autoScroll && (
              <label className="flex items-center gap-2">
                滚动速度: 
                <input type="range" min="0.1" max="3" step="0.1" value={settings.autoScrollSpeed} onChange={e => updateSettings({autoScrollSpeed: Number(e.target.value)})} className="w-24" />
              </label>
            )}
            <div className="flex-1"></div>
            <div className="text-gray-500 text-xs">
              状态: {isTop ? "已置顶" : "未置顶"} | 穿透后请按快捷键恢复 | Linux 下全局快捷键若失效，请取消隐藏托盘。
            </div>
          </div>
        </div>
      )}

      {/* Reader Content Area */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={(e) => {
          if (!scrollRef.current) return;
          const container = scrollRef.current;
          const lineH = settings.lineHeight * settings.fontSize;
          const pageH = container.clientHeight * 0.9;

          if (e.key === "ArrowDown") {
            container.scrollTop += lineH;
            e.preventDefault();
          } else if (e.key === "ArrowUp") {
            container.scrollTop -= lineH;
            e.preventDefault();
          } else if (e.key === "PageDown" || e.key === " ") {
            container.scrollTop += pageH;
            e.preventDefault();
          } else if (e.key === "PageUp") {
            container.scrollTop -= pageH;
            e.preventDefault();
          }
        }}
        tabIndex={0}
        className="flex-1 w-full h-full overflow-y-auto p-4 cursor-default whitespace-pre-wrap break-words outline-none"
        style={{
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          color: settings.fontColor,
          lineHeight: settings.lineHeight,
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none'
        }}
      >
        {content}
      </div>
    </div>
  );
}

export default App;
