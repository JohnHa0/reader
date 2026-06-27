import { useState, useCallback, useEffect } from "react";
import { readBinaryFile } from "@tauri-apps/api/fs";
import { open } from "@tauri-apps/api/dialog";
import jschardet from "jschardet";
import { invoke } from "@tauri-apps/api/tauri";

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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 60) {
      const isChapter = CHAPTER_PATTERNS.some(p => p.test(trimmed));
      if (isChapter) {
        entries.push({ title: trimmed, charOffset }); 
      }
    }
    charOffset += line.length + 1; // +1 for '\n'
  }

  return entries;
}

export function useReader(compactMode: boolean) {
  const [rawContent, setRawContent] = useState<string>("");
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

  const cleanText = (rawText: string, compact: boolean, isEpub: boolean) => {
    if (isEpub) return rawText; // Don't alter EPUB text to preserve Rust TOC offsets
    let text = rawText.replace(/\r\n/g, '\n');
    if (compact) {
      // Remove all spaces/indents at the start and end of every line
      text = text.replace(/^[ \t\u3000]+|[ \t\u3000]+$/gm, '');
      // Mark actual paragraph breaks (2 or more newlines) with a special placeholder
      text = text.replace(/\n{2,}/g, '___P_BREAK___');
      // Remove all remaining single newlines (these are hard-wraps inside a paragraph)
      text = text.replace(/\n/g, '');
      // Restore paragraph breaks as a single newline to ensure a compact, flowing text without empty lines
      text = text.replace(/___P_BREAK___/g, '\n');
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

  const loadFile = useCallback(async (path: string) => {
    try {
      let extractedText = "";
      const epub = path.toLowerCase().endsWith(".epub");

      if (epub) {
        extractedText = await invoke<string>("parse_epub", { path });
        // Load TOC asynchronously
        invoke<TocEntry[]>("parse_epub_toc", { path })
          .then(entries => {
            setToc(entries);
          })
          .catch(() => setToc([]));
      } else {
        const fileData = await readBinaryFile(path);
        const sampleStr = String.fromCharCode.apply(null, Array.from(fileData.slice(0, 4096)));
        const detected = jschardet.detect(sampleStr);
        const encoding = detected.encoding || "utf-8";
        const decoder = new TextDecoder(encoding.toLowerCase().includes("gb") ? "gbk" : "utf-8", { fatal: false });
        extractedText = decoder.decode(fileData);
      }

      const cleaned = cleanText(extractedText, compactMode, epub);
      setRawContent(extractedText);
      setContent(cleaned);
      setFilePath(path);
      addToRecent(path);
      localStorage.setItem("last_file_path", path);

      // For txt, extract TOC from cleaned text
      if (!epub) {
        const tocEntries = extractTxtToc(cleaned);
        setToc(tocEntries);
      }
    } catch (e) {
      console.error("Failed to load file:", e);
      setContent("文件加载失败：" + String(e));
    }
  }, [addToRecent, compactMode]);

  // React to compactMode changes immediately
  useEffect(() => {
    if (rawContent && filePath && !filePath.toLowerCase().endsWith(".epub")) {
      const cleaned = cleanText(rawContent, compactMode, false);
      setContent(cleaned);
      const tocEntries = extractTxtToc(cleaned);
      setToc(tocEntries);
    }
  }, [compactMode, rawContent, filePath]);

  const openFileDialog = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Text/Book', extensions: ['txt', 'epub'] }]
      });
      if (selected && typeof selected === "string") {
        await loadFile(selected);
      }
    } catch (e) {
      console.error("Dialog error:", e);
    }
  }, [loadFile]);

  // Load last file on startup
  useEffect(() => {
    const lastPath = localStorage.getItem("last_file_path");
    if (lastPath && !filePath) {
      loadFile(lastPath);
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
