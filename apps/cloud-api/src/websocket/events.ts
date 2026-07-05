export interface TranscriptUpdate {
  sessionId: string;
  speaker: string;
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
}

export interface AiResponseEvent {
  sessionId: string;
  content: string;
  isFinal: boolean;
  finishReason?: string;
  tokensUsed?: { prompt: number; completion: number; total: number };
}

export interface SessionEvent {
  sessionId: string;
  status: 'started' | 'paused' | 'resumed' | 'ended';
  name?: string;
  model?: string;
  duration?: number;
  timestamp: number;
}

export interface UploadComplete {
  sessionId?: string;
  fileId: string;
  fileName: string;
  fileType: string;
  size: number;
  url: string;
}

export interface DeviceEvent {
  deviceId: string;
  deviceName: string;
  platform: string;
}

export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type WsEventPayload =
  | { type: 'transcript.update'; data: TranscriptUpdate }
  | { type: 'ai.response'; data: AiResponseEvent }
  | { type: 'session.start'; data: SessionEvent }
  | { type: 'session.pause'; data: SessionEvent }
  | { type: 'session.resume'; data: SessionEvent }
  | { type: 'session.end'; data: SessionEvent }
  | { type: 'upload.complete'; data: UploadComplete }
  | { type: 'device.connected'; data: DeviceEvent }
  | { type: 'device.disconnected'; data: DeviceEvent }
  | { type: 'notification'; data: NotificationEvent };

export type ClientMessage =
  | { action: 'subscribe'; rooms: string[] }
  | { action: 'unsubscribe'; rooms: string[] }
  | { action: 'ping' }
  | { action: 'transcript.update'; data: TranscriptUpdate }
  | { action: 'session.start'; data: SessionEvent }
  | { action: 'session.pause'; data: SessionEvent }
  | { action: 'session.resume'; data: SessionEvent }
  | { action: 'session.end'; data: SessionEvent };

export interface HeartbeatInfo {
  lastPing: number;
  missedPings: number;
  interval: ReturnType<typeof setInterval> | null;
}
