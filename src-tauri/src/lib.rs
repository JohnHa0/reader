#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut alt_pressed = false;
                let mut ctrl_pressed = false;
                let mut shift_pressed = false;
                let mut meta_pressed = false;

                if let Err(error) = rdev::listen(move |event| {
                    match event.event_type {
                        rdev::EventType::KeyPress(key) => {
                            match key {
                                rdev::Key::Alt | rdev::Key::AltGr => alt_pressed = true,
                                rdev::Key::ControlLeft | rdev::Key::ControlRight => ctrl_pressed = true,
                                rdev::Key::ShiftLeft | rdev::Key::ShiftRight => shift_pressed = true,
                                rdev::Key::MetaLeft | rdev::Key::MetaRight => meta_pressed = true,
                                _ => {
                                    let mut parts = Vec::new();
                                    if ctrl_pressed { parts.push("CommandOrControl"); }
                                    if alt_pressed { parts.push("Alt"); }
                                    if shift_pressed { parts.push("Shift"); }
                                    if meta_pressed { parts.push("Super"); }
                                    
                                    let key_name = format!("{:?}", key).replace("Key", "").to_uppercase();
                                    parts.push(&key_name);
                                    let shortcut_str = parts.join("+");
                                    
                                    let _ = app_handle.emit("global-keypress", shortcut_str);
                                }
                            }
                        },
                        rdev::EventType::KeyRelease(key) => {
                            match key {
                                rdev::Key::Alt | rdev::Key::AltGr => alt_pressed = false,
                                rdev::Key::ControlLeft | rdev::Key::ControlRight => ctrl_pressed = false,
                                rdev::Key::ShiftLeft | rdev::Key::ShiftRight => shift_pressed = false,
                                rdev::Key::MetaLeft | rdev::Key::MetaRight => meta_pressed = false,
                                _ => {}
                            }
                        },
                        _ => {}
                    }
                }) {
                    println!("rdev error: {:?}", error);
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
