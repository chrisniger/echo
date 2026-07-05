use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn get_app_version() -> String {
    "0.1.0".into()
}

#[tauri::command]
fn start_recording(_app_handle: tauri::AppHandle) {
    // TODO: Implement WASAPI audio capture
    println!("Recording started");
}

#[tauri::command]
fn stop_recording(_app_handle: tauri::AppHandle) {
    // TODO: Implement stop recording
    println!("Recording stopped");
}

#[tauri::command]
fn take_screenshot() -> String {
    // TODO: Implement screenshot capture
    "screenshot_placeholder.png".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Build system tray menu
            let new_session = MenuItem::with_id(app, "new_session", "New Session", true, None::<&str>)?;
            let pause_resume = MenuItem::with_id(app, "pause_resume", "Pause/Resume", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&new_session, &pause_resume, &quit])?;

            // Build system tray icon
            let _tray = TrayIconBuilder::with_id("echo-tray")
                .tooltip("Echo GPT")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "new_session" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "pause_resume" => {
                        println!("pause/resume triggered");
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            start_recording,
            stop_recording,
            take_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Echo GPT");
}
