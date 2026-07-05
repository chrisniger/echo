export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  defaultAiModel: string;
  defaultResponseStyle: 'concise' | 'detailed' | 'creative';
  floatingAssistantOpacity: number;
  globalShortcuts: Record<string, string>;
  autoDeletePolicy: 'never' | '30d' | '60d' | '90d';
  recordingQuality: 'low' | 'medium' | 'high';
  enableSpeakerDiarization: boolean;
  enableAutoSummaries: boolean;
  enableCloudSync: boolean;
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
