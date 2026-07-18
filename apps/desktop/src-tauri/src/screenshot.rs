use image::{ImageBuffer, Rgba};
use screenshots::Screen;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct ScreenshotResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub timestamp: String,
}

pub fn capture_screenshot() -> Result<ScreenshotResult, String> {
    // Get all screens
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;
    
    if screens.is_empty() {
        return Err("No screens found".into());
    }

    // Capture the primary screen (first screen)
    let screen = &screens[0];
    let image = screen.capture().map_err(|e| format!("Failed to capture screen: {}", e))?;

    // Create timestamp for filename
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    
    // Create screenshots directory if it doesn't exist
    let screenshot_dir = dirs::picture_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("EchoGPT")
        .join("screenshots");
    
    fs::create_dir_all(&screenshot_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    // Save the screenshot
    let filename = format!("screenshot_{}.png", timestamp);
    let filepath = screenshot_dir.join(&filename);
    
    image
        .save(&filepath)
        .map_err(|e| format!("Failed to save screenshot: {}", e))?;

    Ok(ScreenshotResult {
        path: filepath.to_string_lossy().to_string(),
        width: image.width(),
        height: image.height(),
        timestamp,
    })
}

pub fn capture_window_screenshot(window_title: &str) -> Result<ScreenshotResult, String> {
    // This would require platform-specific window capture
    // For now, we'll just capture the full screen
    capture_screenshot()
}
