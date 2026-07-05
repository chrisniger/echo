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
    fn take(self) -> cpal::Stream {
        let ptr = self.0;
        std::mem::forget(self);
        *unsafe { Box::from_raw(ptr) }
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
    stream: Option<StreamHandle>,
    sample_rate: u32,
}

unsafe impl Send for AudioCapture {}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            is_capturing: Arc::new(AtomicBool::new(false)),
            audio_buffer: Arc::new(Mutex::new(Vec::new())),
            stream: None,
            sample_rate: 16000,
        }
    }

    pub fn list_devices() -> Vec<AudioDevice> {
        let host = cpal::default_host();
        let default_device = host.default_input_device();
        let mut devices = Vec::new();

        if let Ok(all_devices) = host.input_devices() {
            for device in all_devices {
                if let Ok(name) = device.name() {
                    if let Ok(config) = device.default_input_config() {
                        let is_default = default_device
                            .as_ref()
                            .and_then(|d| d.name().ok())
                            .map(|n| n == name)
                            .unwrap_or(false);
                        devices.push(AudioDevice {
                            name,
                            is_default,
                            channels: config.channels(),
                            sample_rate: config.sample_rate().0,
                        });
                    }
                }
            }
        }
        devices
    }

    pub fn start_mic_capture(&mut self, device_name: Option<&str>) -> Result<(), String> {
        if self.is_capturing.load(Ordering::SeqCst) {
            return Err("Already capturing".into());
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

        if let Ok(mut buf) = buffer.lock() {
            buf.clear();
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
        self.stream = Some(StreamHandle::new(stream));
        Ok(())
    }

    pub fn stop_capture(&mut self) -> Result<Vec<f32>, String> {
        if !self.is_capturing.load(Ordering::SeqCst) {
            return Err("Not capturing".into());
        }
        self.is_capturing.store(false, Ordering::SeqCst);
        self.stream = None; // drop the stream
        self.audio_buffer
            .lock()
            .map(|mut b| std::mem::take(&mut *b))
            .map_err(|e| e.to_string())
    }

    pub fn get_state(&self) -> CaptureState {
        CaptureState {
            is_capturing: self.is_capturing.load(Ordering::SeqCst),
            device_name: String::new(),
            source: "microphone",
        }
    }

    pub fn get_buffered_audio(&self) -> Result<Vec<f32>, String> {
        self.audio_buffer
            .lock()
            .map(|mut b| std::mem::take(&mut *b))
            .map_err(|e| e.to_string())
    }

    pub fn is_capturing(&self) -> bool {
        self.is_capturing.load(Ordering::SeqCst)
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}
