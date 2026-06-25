use tauri::Emitter;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn parse_epub(path: String) -> Result<String, String> {
    let mut doc = epub::doc::EpubDoc::new(&path).map_err(|e| format!("Failed to open epub: {}", e))?;
    let mut full_text = String::new();
    
    while let Some((content, _mime)) = doc.get_current_str() {
        let mut in_tag = false;
        let mut text = String::with_capacity(content.len());
        for c in content.chars() {
            if c == '<' {
                in_tag = true;
            } else if c == '>' {
                in_tag = false;
            } else if !in_tag {
                text.push(c);
            }
        }
        let clean = text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
        let clean = clean.trim().to_string();
        if !clean.is_empty() {
            full_text.push_str(&clean);
            full_text.push_str("\n\n");
        }
        if !doc.go_next() {
            break;
        }
    }
    
    Ok(full_text)
}

/// Parse a shortcut string like "Alt+H" into a Tauri Shortcut
fn parse_shortcut(shortcut_str: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();
    if parts.is_empty() { return None; }
    
    let key_str = parts.last()?.to_uppercase();
    let mut mods = Modifiers::empty();
    
    for part in &parts[..parts.len()-1] {
        match part.to_uppercase().as_str() {
            "ALT" => mods |= Modifiers::ALT,
            "COMMANDORCONTROL" | "CTRL" | "CONTROL" => mods |= Modifiers::CONTROL,
            "SHIFT" => mods |= Modifiers::SHIFT,
            "SUPER" | "META" => mods |= Modifiers::META,
            _ => {}
        }
    }
    
    let code = match key_str.as_str() {
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC, "D" => Code::KeyD,
        "E" => Code::KeyE, "F" => Code::KeyF, "G" => Code::KeyG, "H" => Code::KeyH,
        "I" => Code::KeyI, "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
        "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO, "P" => Code::KeyP,
        "Q" => Code::KeyQ, "R" => Code::KeyR, "S" => Code::KeyS, "T" => Code::KeyT,
        "U" => Code::KeyU, "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
        "Y" => Code::KeyY, "Z" => Code::KeyZ,
        "0" | "DIGIT0" => Code::Digit0, "1" | "DIGIT1" => Code::Digit1,
        "2" | "DIGIT2" => Code::Digit2, "3" | "DIGIT3" => Code::Digit3,
        "4" | "DIGIT4" => Code::Digit4, "5" | "DIGIT5" => Code::Digit5,
        "6" | "DIGIT6" => Code::Digit6, "7" | "DIGIT7" => Code::Digit7,
        "8" | "DIGIT8" => Code::Digit8, "9" | "DIGIT9" => Code::Digit9,
        "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3, "F4" => Code::F4,
        "F5" => Code::F5, "F6" => Code::F6, "F7" => Code::F7, "F8" => Code::F8,
        "F9" => Code::F9, "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        "SPACE" => Code::Space, "ENTER" => Code::Enter, "ESCAPE" | "ESC" => Code::Escape,
        "TAB" => Code::Tab, "BACKSPACE" => Code::Backspace,
        _ => return None,
    };
    
    Some(Shortcut::new(Some(mods), code))
}

#[tauri::command]
async fn register_shortcuts(
    app: tauri::AppHandle,
    boss_key: String,
    top_key: String,
    through_key: String,
    menu_key: String,
) -> Result<(), String> {
    // Unregister all existing shortcuts first to avoid duplicates
    let _ = app.global_shortcut().unregister_all();
    
    let shortcuts_with_names: Vec<(String, String)> = vec![
        (boss_key, "boss".to_string()),
        (top_key, "top".to_string()),
        (through_key, "through".to_string()),
        (menu_key, "menu".to_string()),
    ];
    
    for (key_str, name) in shortcuts_with_names {
        if key_str.is_empty() { continue; }
        if let Some(shortcut) = parse_shortcut(&key_str) {
            let app_handle = app.clone();
            let name_clone = name.clone();
            let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = app_handle.emit("global-keypress", &name_clone);
                }
            });
        }
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![parse_epub, register_shortcuts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
