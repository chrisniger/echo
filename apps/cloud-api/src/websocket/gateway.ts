import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { RoomManager } from './rooms.js';
import type { ClientMessage, WsEventPayload, HeartbeatInfo } from './events.js';

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 120_000;

interface ClientInfo {
  userId: string;
  email: string;
  role: string;
  subscriptions: Set<string>;
  heartbeat: HeartbeatInfo;
}

export class WsGateway {
  private wss: WebSocketServer;
  private rooms = new RoomManager();
  private clients = new Map<WebSocket, ClientInfo>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      let payload: { userId: string; email: string; role: string };
      try {
        payload = jwt.verify(token, config.JWT_SECRET) as typeof payload;
      } catch {
        ws.close(4001, 'Invalid or expired token');
        return;
      }

      const info: ClientInfo = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        subscriptions: new Set(),
        heartbeat: {
          lastPing: Date.now(),
          missedPings: 0,
          interval: null,
        },
      };

      this.clients.set(ws, info);

      // Auto-join the user-level room so companion devices (subscribed to user:userId)
      // receive every session-scoped event the desktop publishes.
      this.rooms.join(`user:${payload.userId}`, ws);
      info.subscriptions.add(`user:${payload.userId}`);

      ws.send(JSON.stringify({ type: 'connected', userId: payload.userId }));

      const heartbeat = setInterval(() => {
        const info = this.clients.get(ws);
        if (!info) {
          clearInterval(heartbeat);
          return;
        }

        if (Date.now() - info.heartbeat.lastPing > HEARTBEAT_TIMEOUT) {
          ws.close(4002, 'Heartbeat timeout');
          clearInterval(heartbeat);
          return;
        }
      }, HEARTBEAT_INTERVAL);

      info.heartbeat.interval = heartbeat;

      ws.on('message', (raw) => {
        try {
          const msg: ClientMessage = JSON.parse(raw.toString());

          if (msg.action === 'ping') {
            const info = this.clients.get(ws);
            if (info) {
              info.heartbeat.lastPing = Date.now();
              info.heartbeat.missedPings = 0;
            }
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          if (msg.action === 'subscribe' && msg.rooms) {
            const info = this.clients.get(ws);
            if (!info) return;
            for (const roomId of msg.rooms) {
              this.rooms.join(roomId, ws);
              info.subscriptions.add(roomId);
            }
            ws.send(JSON.stringify({ type: 'subscribed', rooms: msg.rooms }));
            return;
          }

          if (msg.action === 'unsubscribe' && msg.rooms) {
            const info = this.clients.get(ws);
            if (!info) return;
            for (const roomId of msg.rooms) {
              this.rooms.leave(roomId, ws);
              info.subscriptions.delete(roomId);
            }
            ws.send(JSON.stringify({ type: 'unsubscribed', rooms: msg.rooms }));
            return;
          }

          if (
            [
              'transcript.update',
              'ai.response',
              'ai.request',
              'session.start',
              'session.pause',
              'session.resume',
              'session.end',
            ].includes(msg.action)
          ) {
            this.handleClientEvent(ws, msg);
            return;
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        const info = this.clients.get(ws);
        if (info?.heartbeat.interval) {
          clearInterval(info.heartbeat.interval);
        }
        this.rooms.leaveAll(ws);
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        const info = this.clients.get(ws);
        if (info?.heartbeat.interval) {
          clearInterval(info.heartbeat.interval);
        }
        this.rooms.leaveAll(ws);
        this.clients.delete(ws);
      });
    });
  }

  private handleClientEvent(ws: WebSocket, msg: ClientMessage): void {
    let event: WsEventPayload | null = null;

    switch (msg.action) {
      case 'transcript.update':
        if (!msg.data) return;
        event = { type: 'transcript.update', data: msg.data };
        break;
      case 'ai.response':
        if (!msg.data) return;
        event = { type: 'ai.response', data: msg.data };
        break;
      case 'ai.request':
        // Companion → Desktop: ask Desktop's AI Gateway to answer on behalf of this user.
        // We re-broadcast to the user room so the active Desktop picks it up; that Desktop
        // will then call the AI Gateway and publish a regular `ai.response`.
        if (!msg.data) return;
        event = { type: 'ai.response', data: { sessionId: msg.data.sessionId, content: '', isFinal: false } };
        // The actual ai.request payload rides along as a special event so Desktop can read it.
        (event as any).type = 'ai.request';
        (event as any).data = msg.data;
        break;
      case 'session.start':
        event = { type: 'session.start', data: msg.data };
        break;
      case 'session.pause':
        event = { type: 'session.pause', data: msg.data };
        break;
      case 'session.resume':
        event = { type: 'session.resume', data: msg.data };
        break;
      case 'session.end':
        event = { type: 'session.end', data: msg.data };
        break;
    }

    if (event) {
      const payload = JSON.stringify(event);
      const sessionId = event.data?.sessionId;

      if (sessionId) {
        // Broadcast to the session room (other desktop instances for the same session)
        this.rooms.broadcast(sessionId, payload, ws);
      }

      // Always also broadcast to the user's room so the companion (paired mobile device)
      // receives every event without needing to know the active sessionId.
      const userId = this.clients.get(ws)?.userId;
      if (userId) {
        this.rooms.broadcast(`user:${userId}`, payload, ws);
      }
    }
  }

  broadcast(event: WsEventPayload, roomId?: string): void {
    const payload = JSON.stringify(event);
    if (roomId) {
      this.rooms.broadcast(roomId, payload);
    } else {
      // Broadcast to all connected clients
      for (const [ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }

  /**
   * Server-initiated broadcast for a session-scoped event. Fans out to both
   * the per-session room (other desktop instances on the same session) and
   * the per-user room (Flutter companion, mobile web, etc.) — same dual
   * fan-out used by `handleClientEvent` for client-initiated events.
   *
   * Used by routes that mutate server state (e.g. PATCH /sessions/:id) so
   * every connected surface sees the change without polling.
   */
  broadcastSessionEvent(event: WsEventPayload, sessionId: string, userId: string): void {
    const payload = JSON.stringify(event);
    this.rooms.broadcast(sessionId, payload);
    this.rooms.broadcast(`user:${userId}`, payload);
  }

  sendToUser(userId: string, event: WsEventPayload): void {
    const payload = JSON.stringify(event);
    const userRooms = Array.from(this.clients.entries())
      .filter(([_, info]) => info.userId === userId)
      .flatMap(([ws]) =>
        Array.from(this.rooms.getRoomIds()).filter((r) => this.rooms.isInRoom(r, ws)),
      );

    this.rooms.broadcastToUser(userRooms, payload);
  }

  getStats(): { connections: number; rooms: number; clients: number } {
    return {
      connections: this.wss.clients.size,
      rooms: this.rooms.getRoomIds().length,
      clients: this.clients.size,
    };
  }
}
