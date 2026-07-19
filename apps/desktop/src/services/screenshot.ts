import { invoke } from '@tauri-apps/api/core';

export interface ScreenshotResult {
  path: string;
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
