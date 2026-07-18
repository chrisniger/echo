import type { SessionType } from '@echo-gpt/shared-types';

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
  query?: string;
  model?: string;
  provider?: string;
}

export interface AiRequestEvent {
  sessionId: string;
  content: string;
  fromDeviceId?: string;
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

/**
 * Server → clients: a session row was patched via PATCH /api/sessions/:id.
 * Currently only the `sessionType` field can be patched mid-session, but the
 * `updatedFields` array advertises which columns actually changed so clients
 * can distinguish "only sessionType" from future PATCH payloads without
 * re-fetching the row.
 */
export interface SessionUpdatedEvent {
  sessionId: string;
  sessionType: SessionType;
  transcriptionIntervalMs?: number;
  /**
   * Stored value BEFORE this update. Optional so older server builds can emit
   * `session.updated` without it; consumers should treat `undefined` as
   * "no prior type known" and skip change-from-toast UX.
   */
  previousSessionType?: SessionType;
  previousTranscriptionIntervalMs?: number;
  updatedAt: string;
  /** Columns that actually changed in this patch. */
  updatedFields: string[];
}

export type WsEventPayload =
  | { type: 'transcript.update'; data: TranscriptUpdate }
  | { type: 'ai.response'; data: AiResponseEvent }
  | { type: 'ai.request'; data: AiRequestEvent }
  | { type: 'session.start'; data: SessionEvent }
  | { type: 'session.pause'; data: SessionEvent }
  | { type: 'session.resume'; data: SessionEvent }
  | { type: 'session.end'; data: SessionEvent }
  | { type: 'session.updated'; data: SessionUpdatedEvent }
  | { type: 'upload.complete'; data: UploadComplete }
  | { type: 'device.connected'; data: DeviceEvent }
  | { type: 'device.disconnected'; data: DeviceEvent }
  | { type: 'notification'; data: NotificationEvent };

export type ClientMessage =
  | { action: 'subscribe'; rooms: string[] }
  | { action: 'unsubscribe'; rooms: string[] }
  | { action: 'ping' }
  | { action: 'transcript.update'; data: TranscriptUpdate }
  | { action: 'ai.response'; data: AiResponseEvent }
  | { action: 'ai.request'; data: AiRequestEvent }
  | { action: 'session.start'; data: SessionEvent }
  | { action: 'session.pause'; data: SessionEvent }
  | { action: 'session.resume'; data: SessionEvent }
  | { action: 'session.end'; data: SessionEvent };

export interface HeartbeatInfo {
  lastPing: number;
  missedPings: number;
  interval: ReturnType<typeof setInterval> | null;
}
