import { useState, useCallback, useEffect, useMemo } from "react";
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

/** Apply compact formatting: strip indents and collapse blank lines into flowing text */
export function applyCompact(rawText: string): string {
  let text = rawText.replace(/\r\n/g, '\n');
  // Strip all leading/trailing whitespace (including full-width spaces) from each line
  text = text.replace(/^[ \t\u3000]+|[ \t\u3000]+$/gm, '');
  // Use a placeholder to mark multi-newline (paragraph) breaks
  text = text.replace(/\n{2,}/g, '\x00');
  // Remove all single newlines (hard-wraps) — join within paragraphs
  text = text.replace(/\n/g, '');
  // Restore paragraph breaks as single newlines
  text = text.replace(/\x00/g, '\n');
  return text;
}

export function useReader(compactMode: boolean) {
  const [rawContent, setRawContent] = useState<string>("");
  const [isEpub, setIsEpub] = useState<boolean>(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => {
    try { return JSON.parse(localStorage.getItem("recent_files") || "[]"); } catch { return []; }
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [toc, setToc] = useState<TocEntry[]>([]);

  // Derive content reactively — any change to compactMode is IMMEDIATELY reflected
  const content: string = useMemo(() => {
    if (!rawContent) {
      return "拖拽 txt/epub 文件到此处开始摸鱼...\n您可以按住任意文字区域拖动窗口。\n\n按 Alt+H 隐藏/显示\n按 Alt+T 置顶/取消置顶\n按 Alt+P 鼠标穿透/取消\n按 Alt+B 添加书签\n按 Alt+C 显示目录";
    }
    if (isEpub || !compactMode) return rawContent;
    return applyCompact(rawContent);
  }, [rawContent, isEpub, compactMode]);

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

  // Update TOC whenever displayed content changes (reacts to compactMode too)
  useEffect(() => {
    if (!rawContent || !filePath || isEpub) return;
    const tocEntries = extractTxtToc(content);
    setToc(tocEntries);
  // content is derived — this fires whenever rawContent, compactMode, or filePath changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, filePath, isEpub]);

  const getFileName = (path: string) => path.split(/[\\\/]/).pop() || path;

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

      setRawContent(extractedText);
      setIsEpub(epub);
      setFilePath(path);
      addToRecent(path);
      localStorage.setItem("last_file_path", path);
    } catch (e) {
      console.error("Failed to load file:", e);
      setRawContent("文件加载失败：" + String(e));
    }
  }, [addToRecent]);

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
