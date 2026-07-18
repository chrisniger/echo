import { invoke } from '@tauri-apps/api/core';

export interface AudioDevice {
  name: string;
  is_default: boolean;
  channels: number;
  sample_rate: number;
  device_type: 'input' | 'output';
}

export interface CaptureState {
  is_capturing: boolean;
  device_name: string;
  source: 'microphone' | 'system' | 'unknown';
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
  provider?: string;
  error?: string;
}

export interface WhisperModel {
  name: string;
  size: string;
  downloaded: boolean;
}

class AudioService {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  async listAudioDevices(): Promise<AudioDevice[]> {
    try {
      const devices = await invoke<AudioDevice[]>('list_audio_devices');
      return devices;
    } catch (error) {
      console.error('Failed to list audio devices:', error);
      return [];
    }
  }

  async audioPreflight(): Promise<{
    hasDefaultInput: boolean;
    hasDefaultOutput: boolean;
    inputDeviceNames: string[];
    outputDeviceNames: string[];
    hint: string;
  }> {
    try {
      return await invoke('audio_preflight');
    } catch (error) {
      console.error('Failed audio preflight:', error);
      return {
        hasDefaultInput: false,
        hasDefaultOutput: false,
        inputDeviceNames: [],
        outputDeviceNames: [],
        hint: 'Could not query audio devices. Restart the app and try again.',
      };
    }
  }

  async startMicrophoneCapture(deviceName?: string): Promise<void> {
    try {
      await invoke<string>('start_mic_capture', { deviceName });
    } catch (error) {
      console.error('Failed to start microphone capture:', error);
      throw error;
    }
  }

  async startSystemAudioCapture(deviceName?: string): Promise<void> {
    try {
      await invoke<string>('start_system_capture', { deviceName });
    } catch (error) {
      console.error('Failed to start system audio capture:', error);
      throw error;
    }
  }

  async stopCapture(): Promise<CaptureState> {
    try {
      const state = await invoke<CaptureState>('stop_capture');
      return state;
    } catch (error) {
      console.error('Failed to stop capture:', error);
      throw error;
    }
  }

  async getCaptureState(): Promise<CaptureState> {
    try {
      const state = await invoke<CaptureState>('get_capture_state');
      return state;
    } catch (error) {
      console.error('Failed to get capture state:', error);
      return {
        is_capturing: false,
        device_name: '',
        source: 'unknown',
      };
    }
  }

  async transcribeAudio(gatewayUrl?: string): Promise<TranscriptionResult> {
    try {
      return await invoke<TranscriptionResult>('transcribe_audio', {
        gatewayUrl,
      });
    } catch (error) {
      console.error('Failed to transcribe audio:', error);
      throw error;
    }
  }

  async getWhisperModels(): Promise<WhisperModel[]> {
    try {
      const models = await invoke<WhisperModel[]>('get_whisper_models');
      return models;
    } catch (error) {
      console.error('Failed to get Whisper models:', error);
      return [];
    }
  }

  async takeScreenshot(): Promise<string> {
    try {
      const path = await invoke<string>('take_screenshot');
      return path;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      throw error;
    }
  }
}

export const audioService = new AudioService();
