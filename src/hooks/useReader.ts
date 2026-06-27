import { useState, useCallback, useEffect } from "react";
import { readBinaryFile } from "@tauri-apps/api/fs";
import { open } from "@tauri-apps/api/dialog";
import jschardet from "jschardet";
import { invoke } from "@tauri-apps/api/tauri";

export interface RecentFile {
  path: string;
  name: string;
  lastOpenedAt: number;
}

export interface Bookmark {
  pos: number;
  pct: number;
  label: string;
  time: number;
}

export interface TocEntry {
  title: string;
  charOffset: number;
}

const CHAPTER_PATTERNS = [
  /^第[零一二三四五六七八九十百千万\d]+[章节回卷篇]/m,
  /^Chapter\s+\d+/im,
  /^序[章言]|^楔子|^后[记语]|^尾[声章]|^番外/m,
  /^(?:第)?[一二三四五六七八九十百千万]+[章节回卷]/m,
];

export function extractTxtToc(content: string): TocEntry[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const entries: TocEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0 && trimmed.length < 60) {
      if (CHAPTER_PATTERNS.some(p => p.test(trimmed))) {
        // charOffset stores the line index for scrollIntoView-based navigation
        entries.push({ title: trimmed, charOffset: i });
      }
    }
  }
  return entries;
}

/**
 * Level 1 — "去除空行": collapse blank lines and remove leading indents.
 * Each paragraph stays on its own line; only blank separators are removed.
 */
export function applyRemoveEmptyLines(rawText: string): string {
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip leading/trailing whitespace from each line (excluding \n but including all other whitespaces)
  text = text.replace(/^[^\S\n]+|[^\S\n]+$/gm, '');
  // Collapse 2+ consecutive newlines → single newline (removes empty lines)
  text = text.replace(/\n{2,}/g, '\n');
  return text;
}

/**
 * Level 2 — "智能排版": remove ALL newlines and empty lines for fully continuous flowing text.
 * Every paragraph is joined together; the window width drives all line wrapping.
 * Chinese text does not need spaces between joined paragraphs.
 */
export function applySmartFormat(rawText: string): string {
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip leading/trailing whitespace from each line
  text = text.replace(/^[^\S\n]+|[^\S\n]+$/gm, '');
  // Remove ALL newlines — everything becomes one continuous stream
  text = text.replace(/\n+/g, '');
  return text;
}

// applyCompact is an alias for Level 1
export const applyCompact = applyRemoveEmptyLines;

const PLACEHOLDER = "拖拽 txt/epub 文件到此处开始摸鱼...\n您可以按住任意文字区域拖动窗口。\n\n按 Alt+H 隐藏/显示\n按 Alt+T 置顶/取消置顶\n按 Alt+P 鼠标穿透/取消\n按 Alt+B 添加书签\n按 Alt+C 显示目录";

export function useReader() {
  const [rawContent, setRawContent] = useState<string>("");
  const [isEpub, setIsEpub] = useState<boolean>(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => {
    try { return JSON.parse(localStorage.getItem("recent_files") || "[]"); } catch { return []; }
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // tocRaw is built from the raw (un-compacted) text so charOffsets are stable
  const [tocRaw, setTocRaw] = useState<TocEntry[]>([]);

  // Load bookmarks when file changes
  useEffect(() => {
    if (filePath) {
      try {
        setBookmarks(JSON.parse(localStorage.getItem(`bookmarks_${filePath}`) || "[]"));
      } catch { setBookmarks([]); }
    } else {
      setBookmarks([]);
    }
  }, [filePath]);

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
        invoke<TocEntry[]>("parse_epub_toc", { path })
          .then(entries => setTocRaw(entries))
          .catch(() => setTocRaw([]));
      } else {
        const fileData = await readBinaryFile(path);
        const sampleStr = String.fromCharCode.apply(null, Array.from(fileData.slice(0, 4096)));
        const detected = jschardet.detect(sampleStr);
        const encoding = detected.encoding || "utf-8";
        const decoder = new TextDecoder(encoding.toLowerCase().includes("gb") ? "gbk" : "utf-8", { fatal: false });
        extractedText = decoder.decode(fileData);
        // Build TOC from normalized raw text — charOffsets reference rawContent
        setTocRaw(extractTxtToc(extractedText.replace(/\r\n/g, '\n')));
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
    if (lastPath && !filePath) loadFile(lastPath);
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
    const newBm: Bookmark = { pos, pct: Math.round(pct), label: `${Math.round(pct)}% 处`, time: Date.now() };
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
    rawContent,
    placeholder: PLACEHOLDER,
    isEpub,
    filePath,
    openFileDialog,
    loadFile,
    scrollProgress,
    saveProgress,
    loadProgress,
    recentFiles,
    getFilePct,
    bookmarks,
    addBookmark,
    removeBookmark,
    tocRaw,
  };
}
