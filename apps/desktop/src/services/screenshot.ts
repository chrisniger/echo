import { invoke } from '@tauri-apps/api/core';

export interface ScreenshotResult {
  /** Absolute filesystem path the Rust backend wrote to
   *  (`~/Pictures/EchoGPT/screenshots/screenshot_<ts>.png`). Kept so a
   *  future surface can "Open in Finder / Explorer" via `shell.open()`. */
  path: string;
  /**
   * `data:image/png;base64,…` payload produced in-memory by the Rust
   * `take_screenshot` command immediately after capture. The desktop
   * WebView blocks arbitrary `file://` URLs (CSP lacks `file:` and the
   * asset-protocol scope isn't configured for `~/Pictures/...`), so the
   * `<img src={…}>` element must consume a data: URL instead. The
   * downscaler (Phase 4.5) still gates the actual `/chat` payload under
   * `MAX_IMAGE_BYTES` — this `data_url` is the source the downscaler
   * reads from via `<img>.src` + `ctx.drawImage`.
   */
  dataUrl: string;
  width: number;
  height: number;
  timestamp: string;
}

class ScreenshotService {
  async captureScreenshot(): Promise<ScreenshotResult> {
    try {
      const result = await invoke<ScreenshotResult>('take_screenshot');
      return result;
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      throw error;
    }
  }
}

export const screenshotService = new ScreenshotService();
