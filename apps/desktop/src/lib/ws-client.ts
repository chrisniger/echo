import { getAccessToken } from '../lib/auth';

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

export type WsEvent =
  | { type: 'transcript.update'; data: TranscriptUpdate }
  | { type: 'ai.response'; data: AiResponseEvent }
  | { type: 'session.start'; data: SessionEvent }
  | { type: 'session.pause'; data: SessionEvent }
  | { type: 'session.resume'; data: SessionEvent }
  | { type: 'session.end'; data: SessionEvent }
  | { type: 'device.connected'; data: DeviceEvent }
  | { type: 'device.disconnected'; data: DeviceEvent }
  | { type: 'notification'; data: NotificationEvent }
  | { type: 'subscribed'; rooms: string[] }
  | { type: 'unsubscribed'; rooms: string[] }
  | { type: 'connected'; userId: string }
  | { type: 'pong' }
  | { type: 'error'; message: string };

type EventHandler = (event: WsEvent) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private eventBuffer: WsEvent[] = [];
  private isConnected = false;

  constructor(baseUrl = 'ws://localhost:4000') {
    this.baseUrl = baseUrl;
  }

  connect(): void {
    const token = getAccessToken();
    if (!token) return;

    this.shouldReconnect = true;
    this.ws = new WebSocket(`${this.baseUrl}/ws?token=${token}`);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.flushBuffer();

      this.pingInterval = setInterval(() => {
        this.send({ action: 'ping' });
      }, 25_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed: WsEvent = JSON.parse(event.data);
        this.dispatch(parsed);
      } catch {
        /* ignore parse errors */
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.isConnected = false;
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(rooms: string[]): void {
    this.send({ action: 'subscribe', rooms });
  }

  unsubscribe(rooms: string[]): void {
    this.send({ action: 'unsubscribe', rooms });
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  off(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  private dispatch(event: WsEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          /* handler error */
        }
      }
    }

    const allHandlers = this.handlers.get('*');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler(event);
        } catch {
          /* handler error */
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30_000);

    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  private flushBuffer(): void {
    if (this.eventBuffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const buffer = [...this.eventBuffer];
      this.eventBuffer = [];
      for (const event of buffer) {
        this.ws.send(JSON.stringify(event));
      }
    }
  }

  bufferEvent(event: Record<string, unknown>): void {
    if (this.isConnected) {
      this.send(event);
    } else {
      this.eventBuffer.push(event as unknown as WsEvent);
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get bufferedCount(): number {
    return this.eventBuffer.length;
  }
}
