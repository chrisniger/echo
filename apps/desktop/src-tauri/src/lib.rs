mod audio;
mod transcribe;
mod whisper;
mod screenshot;

use audio::AudioCapture;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
    WindowEvent,
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

#[derive(serde::Serialize)]
pub struct AudioPreflight {
    pub has_default_input: bool,
    pub has_default_output: bool,
    pub input_device_names: Vec<String>,
    pub output_device_names: Vec<String>,
    pub hint: String,
}

#[tauri::command]
fn audio_preflight() -> AudioPreflight {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let has_default_input = host.default_input_device().is_some();
    let has_default_output = host.default_output_device().is_some();

    let input_device_names: Vec<String> = host
        .input_devices()
        .map(|d| d.filter_map(|dev| dev.name().ok()).collect())
        .unwrap_or_default();

    let output_device_names: Vec<String> = host
        .output_devices()
        .map(|d| d.filter_map(|dev| dev.name().ok()).collect())
        .unwrap_or_default();

    let hint = match (has_default_input, has_default_output) {
        (false, false) => "No microphone or speaker detected. Plug in a mic and check Windows Settings → System → Sound → Input.",
        (false, true) => "No microphone detected. Check Windows Settings → System → Sound → Input, and ensure microphone access for desktop apps is enabled.",
        (true, false) => "No speaker detected. Check Windows Settings → System → Sound → Output.",
        (true, true) => "Audio devices ready.",
    }
    .to_string();

    AudioPreflight {
        has_default_input,
        has_default_output,
        input_device_names,
        output_device_names,
        hint,
    }
}

#[tauri::command]
fn start_mic_capture(state: tauri::State<AppState>, device_name: Option<String>) -> Result<String, String> {
    let mut capture = state.audio.lock().map_err(|e| e.to_string())?;
    capture.start_mic_capture(device_name.as_deref())?;
    Ok("Recording started".into())
}

#[tauri::command]
fn start_system_capture(state: tauri::State<AppState>, device_name: Option<String>) -> Result<String, String> {
    let mut capture = state.audio.lock().map_err(|e| e.to_string())?;
    capture.start_system_capture(device_name.as_deref())?;
    Ok("System audio recording started".into())
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
fn get_audio_buffer(state: tauri::State<AppState>) -> Result<Vec<f32>, String> {
    let capture = state.audio.lock().map_err(|e| e.to_string())?;
    capture.get_buffered_audio()
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

    // Do not send silence/noise-floor buffers to Whisper. Whisper-compatible
    // models can hallucinate short phrases (often "you" or "thank you") when
    // asked to decode several seconds of silence.
    let (sum_squares, peak) = audio_data.iter().fold((0.0_f64, 0.0_f32), |(sum, peak), sample| {
        let absolute = sample.abs();
        (sum + (*sample as f64 * *sample as f64), peak.max(absolute))
    });
    let rms = (sum_squares / audio_data.len() as f64).sqrt();
    if rms < 0.008 && peak < 0.03 {
        return Ok(whisper::TranscriptionResult {
            text: String::new(),
            language: "en".into(),
            duration: audio_data.len() as f64 / sample_rate.max(1) as f64,
            segments: Vec::new(),
            provider: Some("silence-filter".into()),
            error: None,
        });
    }

    let url = gateway_url.unwrap_or_else(|| "http://localhost:4001".into());
    transcribe::transcribe_via_gateway(&audio_data, sample_rate, &url, None).await
}

#[tauri::command]
fn get_whisper_models() -> Vec<whisper::ModelInfo> {
    whisper::available_models()
}

#[tauri::command]
fn take_screenshot() -> Result<screenshot::ScreenshotResult, String> {
    screenshot::capture_screenshot()
}

#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
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
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&new_session, &pause_resume, &show, &quit])?;

            let _tray = TrayIconBuilder::with_id("echo-tray")
                .tooltip("Echo GPT — Running in background")
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
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
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
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            list_audio_devices,
            audio_preflight,
            start_mic_capture,
            start_system_capture,
            stop_capture,
            get_capture_state,
            get_audio_buffer,
            transcribe_audio,
            get_whisper_models,
            take_screenshot,
            hide_to_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Echo GPT");
}
