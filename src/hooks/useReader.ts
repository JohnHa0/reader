import { useState, useCallback, useEffect } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import jschardet from "jschardet";
import { invoke } from "@tauri-apps/api/core";

export interface RecentFile {
  path: string;
  name: string;
  lastOpenedAt: number; // unix timestamp ms
}

export interface Bookmark {
  pos: number;      // scrollTop pixels
  pct: number;      // 0-100 percentage
  label: string;
  time: number;     // timestamp
}

export interface TocEntry {
  title: string;
  charOffset: number;
  scrollPct?: number; // estimated 0-100
}

// Common Chinese/English chapter title patterns for txt files
const CHAPTER_PATTERNS = [
  /^第[零一二三四五六七八九十百千万\d]+[章节回卷篇]/m,
  /^Chapter\s+\d+/im,
  /^序[章言]|^楔子|^后[记语]|^尾[声章]|^番外/m,
  /^(?:第)?[一二三四五六七八九十百千万]+[章节回卷]/m,
];

function extractTxtToc(content: string): TocEntry[] {
  const lines = content.split('\n');
  const entries: TocEntry[] = [];
  let charOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 60) {
      const isChapter = CHAPTER_PATTERNS.some(p => p.test(trimmed));
      if (isChapter) {
        entries.push({ title: trimmed, charOffset });
      }
    }
    charOffset += line.length + 1; // +1 for the '\n'
  }

  return entries;
}

export function useReader() {
  const [content, setContent] = useState<string>(
    "拖拽 txt/epub 文件到此处开始摸鱼...\n您可以按住任意文字区域拖动窗口。\n\n按 Alt+H 隐藏/显示\n按 Alt+T 置顶/取消置顶\n按 Alt+P 鼠标穿透/取消\n按 Alt+B 添加书签\n按 Alt+C 显示目录"
  );
  const [filePath, setFilePath] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => {
    try { return JSON.parse(localStorage.getItem("recent_files") || "[]"); } catch { return []; }
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [toc, setToc] = useState<TocEntry[]>([]);

  // Load bookmarks when file changes
  useEffect(() => {
    if (filePath) {
      try {
        const saved = JSON.parse(localStorage.getItem(`bookmarks_${filePath}`) || "[]");
        setBookmarks(saved);
      } catch { setBookmarks([]); }
    } else {
      setBookmarks([]);
    }
  }, [filePath]);

  const getFileName = (path: string) => path.split(/[\\\/]/).pop() || path;

  const cleanText = (rawText: string, compact: boolean) => {
    let text = rawText;
    if (compact) {
      text = text.replace(/\n\s*\n/g, '\n');
      text = text.replace(/([^\n])\n([^\n])/g, '$1$2');
    }
    return text;
  };

  const addToRecent = useCallback((path: string) => {
    const name = getFileName(path);
    const entry: RecentFile = { path, name, lastOpenedAt: Date.now() };
    setRecentFiles(prev => {
      const updated = [entry, ...prev.filter(r => r.path !== path)].slice(0, 10);
      localStorage.setItem("recent_files", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const loadFile = useCallback(async (path: string, compact: boolean) => {
    try {
      let extractedText = "";
      const epub = path.toLowerCase().endsWith(".epub");

      if (epub) {
        extractedText = await invoke<string>("parse_epub", { path });
        // Load TOC asynchronously
        invoke<TocEntry[]>("parse_epub_toc", { path })
          .then(entries => {
            const total = extractedText.length;
            setToc(entries.map(e => ({
              ...e,
              scrollPct: total > 0 ? (e.charOffset / total) * 100 : 0,
            })));
          })
          .catch(() => setToc([]));
      } else {
        const fileData = await readFile(path);
        const sampleStr = String.fromCharCode.apply(null, Array.from(fileData.slice(0, 4096)));
        const detected = jschardet.detect(sampleStr);
        const encoding = detected.encoding || "utf-8";
        const decoder = new TextDecoder(encoding.toLowerCase().includes("gb") ? "gbk" : "utf-8", { fatal: false });
        extractedText = decoder.decode(fileData);
      }

      const cleaned = cleanText(extractedText, compact);
      setContent(cleaned);
      setFilePath(path);
      addToRecent(path);
      localStorage.setItem("last_file_path", path);

      // For txt, extract TOC from cleaned text
      if (!epub) {
        const tocEntries = extractTxtToc(cleaned);
        const total = cleaned.length;
        setToc(tocEntries.map(e => ({
          ...e,
          scrollPct: total > 0 ? (e.charOffset / total) * 100 : 0,
        })));
      }
    } catch (e) {
      console.error("Failed to load file:", e);
      setContent("文件加载失败：" + String(e));
    }
  }, [addToRecent]);

  const openFileDialog = useCallback(async (compact: boolean) => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Text/Book', extensions: ['txt', 'epub'] }]
      });
      if (selected && typeof selected === "string") {
        await loadFile(selected, compact);
      }
    } catch (e) {
      console.error("Dialog error:", e);
    }
  }, [loadFile]);

  // Load last file on startup
  useEffect(() => {
    const lastPath = localStorage.getItem("last_file_path");
    if (lastPath) {
      loadFile(lastPath, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProgress = useCallback((scrollTop: number, pct: number) => {
    if (filePath) {
      localStorage.setItem(`progress_${filePath}`, scrollTop.toString());
      localStorage.setItem(`progress_pct_${filePath}`, pct.toString());
      setScrollProgress(scrollTop);
    }
  }, [filePath]);

  const loadProgress = useCallback(() => {
    if (filePath) {
      const saved = localStorage.getItem(`progress_${filePath}`);
      return saved ? parseFloat(saved) : 0;
    }
    return 0;
  }, [filePath]);

  const getFilePct = (path: string): number =>
    parseFloat(localStorage.getItem(`progress_pct_${path}`) || "0");

  const addBookmark = useCallback((pos: number, pct: number) => {
    if (!filePath) return;
    const label = `${Math.round(pct)}% 处`;
    const newBm: Bookmark = { pos, pct: Math.round(pct), label, time: Date.now() };
    const key = `bookmarks_${filePath}`;
    const existing: Bookmark[] = (() => {
      try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
    })();
    const updated = [...existing, newBm].slice(-20);
    localStorage.setItem(key, JSON.stringify(updated));
    setBookmarks(updated);
  }, [filePath]);

  const removeBookmark = useCallback((time: number) => {
    if (!filePath) return;
    const key = `bookmarks_${filePath}`;
    const updated = bookmarks.filter(b => b.time !== time);
    localStorage.setItem(key, JSON.stringify(updated));
    setBookmarks(updated);
  }, [filePath, bookmarks]);

  return {
    content, filePath, openFileDialog, loadFile,
    scrollProgress, saveProgress, loadProgress,
    recentFiles, getFilePct,
    bookmarks, addBookmark, removeBookmark,
    toc,
  };
}
