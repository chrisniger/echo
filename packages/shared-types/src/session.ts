export type SessionStatus = 'active' | 'paused' | 'ended';
export type AudioSource = 'microphone' | 'system' | 'mixed';
export type ResponseStyle = 'concise' | 'detailed' | 'creative';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko' | 'pt' | 'ar' | 'ru';

export interface NewSessionRequest {
  name: string;
  cvId?: string;
  context?: string;
  documentIds?: string[];
  aiModel: string;
  responseStyle: ResponseStyle;
  recordSession: boolean;
  enableTranscript: boolean;
  audioSource: AudioSource;
  language: Language;
}

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  aiModel: string;
  responseStyle: ResponseStyle;
  language: Language;
  audioSource: AudioSource;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  transcriptCount: number;
  aiResponseCount: number;
  screenshotCount: number;
  tags: string[];
  summary: string | null;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerLabel: string;
  text: string;
  confidence: number;
  startTime: number;
  endTime: number;
  isEdited: boolean;
  createdAt: string;
}

export interface AiResponse {
  id: string;
  sessionId: string;
  query: string;
  response: string;
  model: string;
  provider: string;
  tokensUsed: number;
  createdAt: string;
}

export interface CvDocument {
  id: string;
  name: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  parsedText: string | null;
  isDefault: boolean;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDocument {
  id: string;
  sessionId: string;
  name: string;
  type: 'document' | 'screenshot' | 'image';
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}
