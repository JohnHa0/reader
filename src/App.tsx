import { useEffect, useRef, useState } from "react";
import { useGhostMode } from "./hooks/useGhostMode";
import { useReader } from "./hooks/useReader";
import { useSettings } from "./hooks/useSettings";
import "./App.css";

function App() {
  const { isGhost, isTop, isThrough, toggleGhost, toggleTop, toggleThrough } = useGhostMode();
  const { settings, updateSettings } = useSettings();
  const { content, filePath, openFileDialog, saveProgress, loadProgress } = useReader();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // In Tauri 2.0, transparent windows need to make sure the body is also transparent.
  useEffect(() => {
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
  }, []);

  // Restore scroll progress when file changes
  useEffect(() => {
    if (scrollRef.current && filePath) {
      scrollRef.current.scrollTop = loadProgress();
    }
  }, [filePath, loadProgress]);

  // Handle scroll save (throttled)
  const handleScroll = () => {
    if (scrollRef.current) {
      saveProgress(scrollRef.current.scrollTop);
    }
  };

  // Auto scroll logic
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

  // If completely hidden or click-through, don't show UI that intercepts events
  if (isGhost) return null;

  return (
    <div 
      className="w-screen h-screen overflow-hidden flex flex-col select-none"
      style={{
        backgroundColor: `${settings.bgColor}${Math.round(settings.bgOpacity * 255).toString(16).padStart(2, '0')}`,
        pointerEvents: isThrough ? 'none' : 'auto',
      }}
    >
      {/* Top Trigger Area for Menu */}
      {!isThrough && (
        <div 
          className="absolute top-0 left-0 w-full h-4 z-50 cursor-pointer"
          onMouseEnter={() => setMenuOpen(true)}
          data-tauri-drag-region
        />
      )}

      {/* Settings Menu */}
      {!isThrough && menuOpen && (
        <div 
          className="absolute top-0 left-0 w-full bg-white shadow-md z-40 p-2 flex flex-wrap gap-4 text-xs items-center opacity-95 transition-opacity"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button onClick={() => openFileDialog(settings.compactMode)} className="bg-blue-500 text-white px-2 py-1 rounded">打开小说</button>
          
          <label className="flex items-center gap-1">
            字体大小: 
            <input type="number" value={settings.fontSize} onChange={e => updateSettings({fontSize: Number(e.target.value)})} className="w-12 border rounded px-1" />
          </label>

          <label className="flex items-center gap-1">
            文字颜色: 
            <input type="color" value={settings.fontColor} onChange={e => updateSettings({fontColor: e.target.value})} className="w-6 h-6 p-0 border-0" />
          </label>

          <label className="flex items-center gap-1">
            背景色: 
            <input type="color" value={settings.bgColor} onChange={e => updateSettings({bgColor: e.target.value})} className="w-6 h-6 p-0 border-0" />
          </label>

          <label className="flex items-center gap-1">
            透明度: 
            <input type="range" min="0" max="1" step="0.05" value={settings.bgOpacity} onChange={e => updateSettings({bgOpacity: Number(e.target.value)})} className="w-20" />
          </label>

          <label className="flex items-center gap-1">
            自动排版: 
            <input type="checkbox" checked={settings.compactMode} onChange={e => updateSettings({compactMode: e.target.checked})} />
          </label>

          <label className="flex items-center gap-1">
            自动翻页: 
            <input type="checkbox" checked={settings.autoScroll} onChange={e => updateSettings({autoScroll: e.target.checked})} />
          </label>
          {settings.autoScroll && (
            <label className="flex items-center gap-1">
              速度: 
              <input type="range" min="0.1" max="5" step="0.1" value={settings.autoScrollSpeed} onChange={e => updateSettings({autoScrollSpeed: Number(e.target.value)})} className="w-20" />
            </label>
          )}

          <div className="flex-1"></div>
          <div className="text-gray-500 text-[10px]">
            Alt+H:老板键 | Alt+T:置顶 ({isTop?"开":"关"}) | Alt+P:穿透 ({isThrough?"开":"关"})
          </div>
        </div>
      )}

      {/* Reader Content Area */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 w-full h-full overflow-y-auto p-4 cursor-default whitespace-pre-wrap break-words"
        data-tauri-drag-region
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
