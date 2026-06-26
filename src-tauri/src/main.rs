#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{Manager, GlobalShortcutManager, SystemTray, SystemTrayEvent};
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct TocEntry {
    title: String,
    char_offset: usize,
}

#[tauri::command]
fn parse_epub(path: String) -> Result<String, String> {
    let mut doc = epub::doc::EpubDoc::new(&path).map_err(|e| format!("Failed to open epub: {}", e))?;
    let mut text = String::new();
    loop {
        if let Some((content, _mime)) = doc.get_current_str() {
            let plain = strip_html_tags(&content);
            let clean = plain.replace("&nbsp;", " ")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
            let trimmed = clean.trim().to_string();
            if !trimmed.is_empty() {
                text.push_str(&trimmed);
                text.push_str("\n\n");
            }
        }
        if !doc.go_next() { break; }
    }
    Ok(text)
}

#[tauri::command]
fn parse_epub_toc(path: String) -> Result<Vec<TocEntry>, String> {
    let mut doc = epub::doc::EpubDoc::new(&path).map_err(|e| format!("Failed to open epub: {}", e))?;
    let mut entries = Vec::new();
    let mut char_offset = 0;
    let mut chapter_num = 1usize;

    loop {
        if let Some((content, _)) = doc.get_current_str() {
            let plain = strip_html_tags(&content);
            let clean = plain.replace("&nbsp;", " ")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
            let trimmed = clean.trim().to_string();

            if !trimmed.is_empty() {
                let title = extract_html_title(&content)
                    .unwrap_or_else(|| format!("第{}章", chapter_num));
                entries.push(TocEntry { title, char_offset });
                char_offset += trimmed.len() + 2;
                chapter_num += 1;
            }
        }
        if !doc.go_next() { break; }
    }
    Ok(entries)
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    if cfg!(target_os = "windows") {
        return Ok(Vec::new());
    }
    let output = Command::new("fc-list")
        .arg(":")
        .arg("family")
        .output()
        .map_err(|e| e.to_string())?;
    
    let out_str = String::from_utf8_lossy(&output.stdout);
    let mut fonts: Vec<String> = out_str
        .lines()
        .flat_map(|line| line.split(','))
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty() && !f.contains("."))
        .collect();
    fonts.sort();
    fonts.dedup();
    Ok(fonts)
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
}

fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    if let Some(start) = lower.find("<title>") {
        if let Some(end) = lower[start..].find("</title>") {
            let t = html[start + 7..start + end].trim().to_string();
            if !t.is_empty() { return Some(t); }
        }
    }
    for tag in &["<h1", "<h2", "<h3"] {
        if let Some(start) = lower.find(tag) {
            if let Some(content_start) = lower[start..].find('>') {
                let rest = &html[start + content_start + 1..];
                if let Some(end) = rest.to_lowercase().find("</h") {
                    let t = strip_html_tags(&rest[..end]).trim().to_string();
                    if !t.is_empty() { return Some(t); }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn register_shortcuts(
    app: tauri::AppHandle,
    boss_key: String,
    top_key: String,
    through_key: String,
    menu_key: String,
    bookmark_key: String,
    prev_page_key: String,
    next_page_key: String,
) -> Result<(), String> {
    let mut manager = app.global_shortcut_manager();
    let _ = manager.unregister_all();

    let shortcuts = vec![
        (boss_key, "boss"),
        (top_key, "top"),
        (through_key, "through"),
        (menu_key, "menu"),
        (bookmark_key, "bookmark"),
        (prev_page_key, "prev_page"),
        (next_page_key, "next_page"),
    ];

    for (key, name) in shortcuts {
        if key.is_empty() { continue; }
        // tauri v1 shortcuts use formats like "CommandOrControl+Shift+C"
        let app_handle = app.clone();
        let name_clone = name.to_string();
        
        let _ = manager.register(&key, move || {
            let window_visible = app_handle
                .get_window("main")
                .and_then(|w| w.is_visible().ok())
                .unwrap_or(true);

            if !window_visible && (name_clone == "boss" || name_clone == "menu") {
                if let Some(window) = app_handle.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let payload = format!("{}-show", name_clone);
                let _ = app_handle.emit_all("global-keypress", payload);
            } else {
                let _ = app_handle.emit_all("global-keypress", name_clone.clone());
            }
        });
    }

    Ok(())
}

fn main() {
    let tray = SystemTray::new();

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let is_visible = window.is_visible().unwrap_or(true);
                    if is_visible {
                        let _ = window.hide();
                        let _ = app.emit_all("tray-hide", ());
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit_all("tray-show", ());
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            parse_epub,
            parse_epub_toc,
            list_system_fonts,
            register_shortcuts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
