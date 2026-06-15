import { useState, useCallback, useEffect } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import jschardet from "jschardet";

export interface ReaderConfig {
  compactMode: boolean;
  fontSize: number;
  fontFamily: string;
  color: string;
  lineHeight: number;
}

export function useReader() {
  const [content, setContent] = useState<string>("拖拽 txt 文件到此处开始摸鱼...\n您可以按住任意文字区域拖动窗口。\n\n按 Alt+H 隐藏/显示\n按 Alt+T 置顶/取消置顶\n按 Alt+P 鼠标穿透/取消");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  
  // Clean text based on config
  const cleanText = (rawText: string, compact: boolean) => {
    let text = rawText;
    if (compact) {
      // Remove multiple empty lines
      text = text.replace(/\n\s*\n/g, '\n');
      // Replace single line breaks with spaces to merge paragraphs, 
      // but keep double line breaks (which became single above) 
      // This is basic, might need tuning for Chinese novels
      text = text.replace(/([^\n])\n([^\n])/g, '$1$2');
    }
    return text;
  };

  const loadFile = useCallback(async (path: string, compact: boolean) => {
    try {
      const fileData = await readFile(path);
      
      // Detect encoding
      // We convert a small chunk to string for detection to avoid memory issues
      const sampleStr = String.fromCharCode.apply(null, Array.from(fileData.slice(0, 4096)));
      const detected = jschardet.detect(sampleStr);
      const encoding = detected.encoding || "utf-8";
      
      // Decode
      const decoder = new TextDecoder(encoding.toLowerCase().includes("gb") ? "gbk" : "utf-8", { fatal: false });
      const decodedText = decoder.decode(fileData);
      
      setContent(cleanText(decodedText, compact));
      setFilePath(path);
      
      // Save to history
      localStorage.setItem("last_file_path", path);
    } catch (e) {
      console.error("Failed to load file:", e);
      setContent("文件加载失败：" + String(e));
    }
  }, []);

  const openFileDialog = useCallback(async (compact: boolean) => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Text/Book',
          extensions: ['txt', 'epub']
        }]
      });
      if (selected && typeof selected === "string") {
        await loadFile(selected, compact);
      }
    } catch (e) {
      console.error("Dialog error:", e);
    }
  }, [loadFile]);

  // Load last file and progress on startup
  useEffect(() => {
    const lastPath = localStorage.getItem("last_file_path");
    if (lastPath) {
      loadFile(lastPath, true); // default to compact
    }
  }, [loadFile]);

  const saveProgress = useCallback((progress: number) => {
    if (filePath) {
      localStorage.setItem(`progress_${filePath}`, progress.toString());
      setScrollProgress(progress);
    }
  }, [filePath]);

  const loadProgress = useCallback(() => {
    if (filePath) {
      const saved = localStorage.getItem(`progress_${filePath}`);
      return saved ? parseFloat(saved) : 0;
    }
    return 0;
  }, [filePath]);

  return { content, filePath, openFileDialog, scrollProgress, saveProgress, loadProgress };
}
