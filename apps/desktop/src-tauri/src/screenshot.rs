use screenshots::Screen;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// Result returned by the `take_screenshot` Tauri command.
///
/// `#[serde(rename_all = "camelCase")]` keeps the Rust field names
/// (which favour snake_case) and the TypeScript field names (which
/// favour camelCase) in lockstep at the IPC boundary. Without this
/// attr, the JSON payload would emit `"data_url"` and the React
/// `ScreenshotResult.dataUrl` field would read as `undefined`,
/// silently turning `<img src={undefined}>` back into the original
/// broken-image bug. The four pre-existing fields (`path`/`width`/
/// `height`/`timestamp`) are all single-word so the rename has zero
/// effect on their wire format.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    /// Absolute filesystem path where the PNG was written. Kept for
    /// future "open in Finder/Explorer" UX via Tauri's shell plugin.
    pub path: String,
    /// `data:image/png;base64,…` produced by re-reading the saved
    /// PNG immediately after capture. The desktop WebView blocks
    /// arbitrary `file://` URLs (CSP lacks `file:` and the asset-
    /// protocol scope isn't configured for `~/Pictures/...`), so
    /// React's `<img>` element needs the data URL to actually render.
    /// Downstream Phase 4.5 still gates the `/chat` payload under
    /// `MAX_IMAGE_BYTES` via the VisionDetail-aware downscaler —
    /// this data URL is the source the downscaler reads from via
    /// `<img>.src` + `ctx.drawImage`.
    pub data_url: String,
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
    let image = screen
        .capture()
        .map_err(|e| format!("Failed to capture screen: {}", e))?;

    // Create timestamp for filename
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();

    // Create screenshots directory if it doesn't exist
    let screenshot_dir = dirs::picture_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("EchoGPT")
        .join("screenshots");

    fs::create_dir_all(&screenshot_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Save the screenshot — using `image.save(&filepath)` is the proven
    // path: `screenshots::Image` re-exports `image::DynamicImage` from
    // an older `image` version (0.24.x via `screenshots-0.8`) and its
    // `.write_to(&mut Writer, ImageFormat)` path expects that older
    // crate's `ImageOutputFormat` enum, which doesn't accept a fresh
    // `image::ImageFormat` (Rust 0.25). Using `.save` keeps us on the
    // version the `Image` actually carries.
    let filename = format!("screenshot_{}.png", timestamp);
    let filepath = screenshot_dir.join(&filename);

    image
        .save(&filepath)
        .map_err(|e| format!("Failed to save screenshot to disk: {}", e))?;

    // Phase 6 — the full-resolution base64 payload is NOT returned
    // through IPC. Tauri's JSON bridge chokes (read: silently truncates
    // or stalls the WebView) on payloads >~5 MB, and a 4K PNG easily
    // blows past that once base64-encoded. Instead, the screenshot file
    // on disk is the source of truth, and React mounts it through the
    // asset:// protocol via `convertFileSrc(path)` (see
    // ScreenshotCapture.tsx). The `data_url` field is kept on the wire
    // for forward compat but is currently the empty string; a future
    // Phase 25+ can repurpose it for a downscaled preview PNG if the
    // clip-region UX wants one without an extra roundtrip.
    Ok(ScreenshotResult {
        path: filepath.to_string_lossy().to_string(),
        data_url: String::new(),
        width: image.width(),
        height: image.height(),
        timestamp,
    })
}

/// Placeholder for per-window capture; left in place so a future Tauri
/// command registration in `lib.rs` can wire it through without an
/// extra Rust-side edit. Silences the `dead_code` lint until that
/// wiring lands.
#[allow(dead_code)]
pub fn capture_window_screenshot(window_title: &str) -> Result<ScreenshotResult, String> {
    // This would require platform-specific window capture
    // For now, we'll just capture the full screen
    let _ = window_title; // suppress unused_variable until implemented
    capture_screenshot()
}
