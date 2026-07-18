use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

// cpal::Stream is !Send on Windows. We wrap it for safe ownership.
struct StreamHandle(*mut cpal::Stream);
unsafe impl Send for StreamHandle {}

impl StreamHandle {
    fn new(stream: cpal::Stream) -> Self {
        Self(Box::into_raw(Box::new(stream)))
    }
}

impl Drop for StreamHandle {
    fn drop(&mut self) {
        unsafe { drop(Box::from_raw(self.0)) }
    }
}

#[derive(Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
    pub channels: u16,
    pub sample_rate: u32,
    pub device_type: String, // "input" or "output"
}

#[derive(Serialize)]
pub struct CaptureState {
    pub is_capturing: bool,
    pub device_name: String,
    pub source: &'static str,
}

pub struct AudioCapture {
    is_capturing: Arc<AtomicBool>,
    audio_buffer: Arc<Mutex<Vec<f32>>>,
    mic_stream: Option<StreamHandle>,
    system_stream: Option<StreamHandle>,
    sample_rate: u32,
    capture_source: String,
}

unsafe impl Send for AudioCapture {}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            is_capturing: Arc::new(AtomicBool::new(false)),
            audio_buffer: Arc::new(Mutex::new(Vec::new())),
            mic_stream: None,
            system_stream: None,
            sample_rate: 16000,
            capture_source: "unknown".to_string(),
        }
    }

    pub fn list_devices() -> Vec<AudioDevice> {
        let host = cpal::default_host();
        let default_input = host.default_input_device();
        let default_output = host.default_output_device();
        let mut devices = Vec::new();

        // List input devices (microphones)
        if let Ok(all_devices) = host.input_devices() {
            for device in all_devices {
                if let Ok(name) = device.name() {
                    if let Ok(config) = device.default_input_config() {
                        let is_default = default_input
                            .as_ref()
                            .and_then(|d| d.name().ok())
                            .map(|n| n == name)
                            .unwrap_or(false);
                        devices.push(AudioDevice {
                            name,
                            is_default,
                            channels: config.channels(),
                            sample_rate: config.sample_rate().0,
                            device_type: "input".to_string(),
                        });
                    }
                }
            }
        }

        // List output devices (for loopback capture)
        if let Ok(all_devices) = host.output_devices() {
            for device in all_devices {
                if let Ok(name) = device.name() {
                    if let Ok(config) = device.default_output_config() {
                        let is_default = default_output
                            .as_ref()
                            .and_then(|d| d.name().ok())
                            .map(|n| n == name)
                            .unwrap_or(false);
                        devices.push(AudioDevice {
                            name: format!("{} (Loopback)", name),
                            is_default,
                            channels: config.channels(),
                            sample_rate: config.sample_rate().0,
                            device_type: "output".to_string(),
                        });
                    }
                }
            }
        }

        devices
    }

    pub fn start_mic_capture(&mut self, device_name: Option<&str>) -> Result<(), String> {
        if self.mic_stream.is_some() {
            // Idempotent: already capturing. Don't error.
            return Ok(());
        }

        let host = cpal::default_host();
        let device = match device_name {
            Some(name) => host
                .input_devices()
                .map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == name).unwrap_or(false))
                .ok_or_else(|| format!("Device '{}' not found", name))?,
            None => host
                .default_input_device()
                .ok_or_else(|| "No default input device".to_string())?,
        };

        let config: cpal::StreamConfig = device
            .default_input_config()
            .map_err(|e| e.to_string())?
            .into();

        self.sample_rate = config.sample_rate.0;
        let buffer = self.audio_buffer.clone();
        let capturing = self.is_capturing.clone();
        capturing.store(true, Ordering::SeqCst);
        self.capture_source = if self.system_stream.is_some() {
            "mixed".to_string()
        } else {
            "microphone".to_string()
        };

        if self.system_stream.is_none() {
            if let Ok(mut buf) = buffer.lock() {
                buf.clear();
            }
        }

        let err_fn = move |err| {
            eprintln!("Audio capture error: {}", err);
        };

        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if capturing.load(Ordering::SeqCst) {
                        if let Ok(mut buf) = buffer.lock() {
                            buf.extend_from_slice(data);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?;

        stream.play().map_err(|e| e.to_string())?;
        self.mic_stream = Some(StreamHandle::new(stream));
        Ok(())
    }

    pub fn start_system_capture(&mut self, device_name: Option<&str>) -> Result<(), String> {
        if self.system_stream.is_some() {
            // Idempotent: already capturing. Don't error.
            return Ok(());
        }

        let host = cpal::default_host();
        let device = match device_name {
            Some(name) => {
                // Remove " (Loopback)" suffix if present
                let clean_name = name.replace(" (Loopback)", "");
                host.output_devices()
                    .map_err(|e| e.to_string())?
                    .find(|d| d.name().map(|n| n == clean_name).unwrap_or(false))
                    .ok_or_else(|| format!("Output device '{}' not found", clean_name))?
            }
            None => host
                .default_output_device()
                .ok_or_else(|| "No default output device".to_string())?,
        };

        let config: cpal::StreamConfig = device
            .default_output_config()
            .map_err(|e| e.to_string())?
            .into();

        self.sample_rate = config.sample_rate.0;
        let buffer = self.audio_buffer.clone();
        let capturing = self.is_capturing.clone();
        capturing.store(true, Ordering::SeqCst);
        self.capture_source = if self.mic_stream.is_some() {
            "mixed".to_string()
        } else {
            "system".to_string()
        };

        if self.mic_stream.is_none() {
            if let Ok(mut buf) = buffer.lock() {
                buf.clear();
            }
        }

        let err_fn = move |err| {
            eprintln!("System audio capture error: {}", err);
        };

        // For system audio capture, we use the output device in loopback mode
        // Note: This requires WASAPI on Windows and may not work on all platforms
        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if capturing.load(Ordering::SeqCst) {
                        if let Ok(mut buf) = buffer.lock() {
                            buf.extend_from_slice(data);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("System audio capture not supported: {}", e))?;

        stream.play().map_err(|e| e.to_string())?;
        self.system_stream = Some(StreamHandle::new(stream));
        Ok(())
    }

    pub fn stop_capture(&mut self) -> Result<Vec<f32>, String> {
        if !self.is_capturing.load(Ordering::SeqCst) {
            return Err("Not capturing".into());
        }
        self.is_capturing.store(false, Ordering::SeqCst);
        self.mic_stream = None;
        self.system_stream = None;
        self.audio_buffer
            .lock()
            .map(|mut b| std::mem::take(&mut *b))
            .map_err(|e| e.to_string())
    }

    pub fn get_state(&self) -> CaptureState {
        CaptureState {
            is_capturing: self.is_capturing.load(Ordering::SeqCst),
            device_name: String::new(),
            source: match self.capture_source.as_str() {
                "microphone" => "microphone",
                "system" => "system",
                "mixed" => "mixed",
                _ => "unknown",
            },
        }
    }

    pub fn get_buffered_audio(&self) -> Result<Vec<f32>, String> {
        self.audio_buffer
            .lock()
            .map(|mut b| std::mem::take(&mut *b))
            .map_err(|e| e.to_string())
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}
