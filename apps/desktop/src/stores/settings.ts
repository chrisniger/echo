import { create } from 'zustand';
import type { UserSettings } from '@echo-gpt/shared-types';

const STORAGE_KEY = 'echo_settings';

const defaultSettings: UserSettings = {
  theme: 'dark',
  language: 'en',
  defaultAiModel: 'gpt-4o',
  defaultResponseStyle: 'concise',
  defaultAudioSource: 'system',
  floatingAssistantOpacity: 0.9,
  globalShortcuts: {
    'toggle-assistant': 'Ctrl+Shift+E',
    'new-session': 'Ctrl+Shift+N',
    'toggle-recording': 'Ctrl+Shift+R',
  },
  autoDeletePolicy: 'never',
  recordingQuality: 'medium',
  enableSpeakerDiarization: true,
  enableAutoSummaries: true,
  enableCloudSync: true,
  enableInterviewForceSend: true,
  questionDetection: {
    enabled: true,
    threshold: 0.7,
    responseDelayMs: 0,
    contextWindowSize: 30,
    enableFastRules: true,
    enablePatterns: true,
    enableContextMemory: true,
    enableClassifier: false, // off by default to avoid surprise API spend
    questionPatterns: [],
  },
};

function loadSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...defaultSettings };
}

function persistSettings(settings: UserSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface SettingsState {
  settings: UserSettings;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  resetDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: loadSettings(),

  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    set((state) => {
      const updated = { ...state.settings, [key]: value };
      persistSettings(updated);
      return { settings: updated };
    });
  },

  resetDefaults: () => {
    persistSettings(defaultSettings);
    set({ settings: { ...defaultSettings } });
  },
}));
