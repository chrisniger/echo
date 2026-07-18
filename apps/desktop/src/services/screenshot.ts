import { invoke } from '@tauri-apps/api/core';
import { gatewayApi } from '../lib/api';

export interface ScreenshotResult {
  path: string;
  width: number;
  height: number;
  timestamp: string;
}

export interface ScreenshotAnalysis {
  description: string;
  objects: string[];
  text?: string;
  confidence: number;
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

  async analyzeScreenshot(imagePath: string): Promise<ScreenshotAnalysis> {
    try {
      // Read the image file and convert to base64
      const response = await fetch(`file://${imagePath}`);
      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);

      // Send to AI Gateway for analysis
      const analysis = await gatewayApi.post<ScreenshotAnalysis>('/analyze-image', {
        image: base64,
        analysisType: 'full',
      });

      return analysis;
    } catch (error) {
      console.error('Failed to analyze screenshot:', error);
      throw error;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const screenshotService = new ScreenshotService();
