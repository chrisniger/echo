export type AudioSourceOption = 'microphone' | 'system' | 'mixed';

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  defaultAiModel: string;
  defaultResponseStyle: 'concise' | 'detailed' | 'creative';
  /** Default audio source pre-selected in the New Session form */
  defaultAudioSource?: AudioSourceOption;
  floatingAssistantOpacity: number;
  globalShortcuts: Record<string, string>;
  autoDeletePolicy: 'never' | '30d' | '60d' | '90d';
  recordingQuality: 'low' | 'medium' | 'high';
  enableSpeakerDiarization: boolean;
  enableAutoSummaries: boolean;
  enableCloudSync: boolean;
  /**
   * Extra phrases (lowercased) that should be treated as question triggers.
   * Matched anywhere in the transcript segment.
   * Examples: "i'm wondering", "talk to me about", "your thoughts on"
   */
  questionTriggerPhrases?: string[];
  /** Question detection engine — multi-layer intelligent detector */
  questionDetection?: {
    enabled: boolean;
    /** Confidence threshold in [0, 1] below which the segment is ignored */
    threshold: number;
    /** ms to wait after a question is detected before sending it to the AI */
    responseDelayMs: number;
    /** How many previous segments to keep in context (Layer 3) */
    contextWindowSize: number;
    enableFastRules: boolean;
    enablePatterns: boolean;
    enableContextMemory: boolean;
    enableClassifier: boolean;
    /** Optional user-defined pattern list (Layer 2) */
    questionPatterns: string[];
    /** Optional model override for the AI classifier */
    classifierModel?: string;
  };
}

export interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  features: string[];
  usageQuota: {
    sessionsPerMonth: number;
    tokensPerMonth: number;
    storageGb: number;
  };
  usageCurrent: {
    sessionsUsed: number;
    tokensUsed: number;
    storageUsedGb: number;
  };
}

export interface FeatureFlags {
  enableOfflineAi: boolean;
  enableCalendarIntegration: boolean;
  enablePluginSystem: boolean;
  enableCodingInterview: boolean;
  enableWhiteboard: boolean;
  enableTranslation: boolean;
  maxSessionDuration: number;
}
