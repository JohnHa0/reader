import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [content, setContent] = useState<string>("拖拽 txt 文件到此处开始摸鱼...\n您可以按住任意文字区域拖动窗口。");

  // In Tauri 2.0, transparent windows need to make sure the body is also transparent.
  useEffect(() => {
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
  }, []);

  return (
    <div 
      className="w-screen h-screen overflow-hidden p-4 select-none cursor-default bg-transparent"
      data-tauri-drag-region
    >
      <div 
        className="text-gray-800 text-sm font-sans whitespace-pre-wrap leading-relaxed opacity-90 h-full overflow-y-auto"
        data-tauri-drag-region
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {content}
      </div>
    </div>
  );
}

export default App;
