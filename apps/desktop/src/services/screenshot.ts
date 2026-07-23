import { invoke } from '@tauri-apps/api/core';

export interface ScreenshotResult {
  /** Absolute filesystem path the Rust backend wrote to
   *  (`~/Pictures/EchoGPT/screenshots/screenshot_<ts>.png`). The
   *  React surface renders via `convertFileSrc(path)` against the
   *  `asset://` protocol so the WebView never has to round-trip a
   *  multi-megabyte base64 payload — Tauri's IPC chokes on those
   *  silently and the `<img>` silently breaks. */
  path: string;
  /**
   * Currently the empty string. Reserved for a future Phase 25+ down-
   * scaled preview so the clip-region UX can show a small JPEG data
   * URL inline without an extra IPC roundtrip. Marked optional so
   * callers branching on it for `src` don't pretend it's populated.
   */
  dataUrl?: string;
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
