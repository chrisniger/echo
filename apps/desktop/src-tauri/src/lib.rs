mod audio;
mod transcribe;
mod whisper;

use audio::AudioCapture;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

struct AppState {
    audio: Mutex<AudioCapture>,
}

#[tauri::command]
fn get_app_version() -> String {
    "0.1.0".into()
}

#[tauri::command]
fn list_audio_devices() -> Vec<audio::AudioDevice> {
    AudioCapture::list_devices()
}

#[tauri::command]
fn start_mic_capture(state: tauri::State<AppState>, device_name: Option<String>) -> Result<String, String> {
    let mut capture = state.audio.lock().map_err(|e| e.to_string())?;
    capture.start_mic_capture(device_name.as_deref())?;
    Ok("Recording started".into())
}

#[tauri::command]
fn stop_capture(state: tauri::State<AppState>) -> Result<audio::CaptureState, String> {
    let mut capture = state.audio.lock().map_err(|e| e.to_string())?;
    capture.stop_capture()?;
    Ok(capture.get_state())
}

#[tauri::command]
fn get_capture_state(state: tauri::State<AppState>) -> audio::CaptureState {
    state.audio.lock().map(|c| c.get_state()).unwrap_or(audio::CaptureState {
        is_capturing: false,
        device_name: String::new(),
        source: "unknown",
    })
}

#[tauri::command]
async fn transcribe_audio(state: tauri::State<'_, AppState>, gateway_url: Option<String>) -> Result<whisper::TranscriptionResult, String> {
    let (audio_data, sample_rate) = {
        let capture = state.audio.lock().map_err(|e| e.to_string())?;
        let data = capture.get_buffered_audio()?;
        let rate = capture.sample_rate();
        (data, rate)
    };

    if audio_data.is_empty() {
        return Err("No audio data to transcribe".into());
    }

    let url = gateway_url.unwrap_or_else(|| "http://localhost:4001".into());
    transcribe::transcribe_via_gateway(&audio_data, sample_rate, &url, None).await
}

#[tauri::command]
fn get_whisper_models() -> Vec<whisper::ModelInfo> {
    whisper::available_models()
}

#[tauri::command]
fn take_screenshot() -> String {
    // TODO: Implement screen capture via Tauri
    "screenshot_placeholder.png".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            audio: Mutex::new(AudioCapture::new()),
        })
        .setup(|app| {
            let new_session = MenuItem::with_id(app, "new_session", "New Session", true, None::<&str>)?;
            let pause_resume = MenuItem::with_id(app, "pause_resume", "Pause/Resume", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&new_session, &pause_resume, &quit])?;

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
            list_audio_devices,
            start_mic_capture,
            stop_capture,
            get_capture_state,
            transcribe_audio,
            get_whisper_models,
            take_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Echo GPT");
}
