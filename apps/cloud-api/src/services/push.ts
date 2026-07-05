import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  createdAt: string;
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  type: string;
}

export class PushService {
  registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    deviceId?: string,
  ): void {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM push_tokens WHERE token = ?').get(token) as any;
    if (existing) {
      db.prepare(
        'UPDATE push_tokens SET user_id = ?, device_id = ?, updated_at = ? WHERE id = ?',
      ).run(userId, deviceId || null, now, existing.id);
    } else {
      db.prepare(
        'INSERT INTO push_tokens (id, user_id, token, platform, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(uuid(), userId, token, platform, deviceId || null, now);
    }
  }

  unregisterToken(token: string): void {
    const db = getDb();
    db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
  }

  getUserTokens(userId: string): PushToken[] {
    const db = getDb();
    return db.prepare('SELECT * FROM push_tokens WHERE user_id = ?').all(userId) as PushToken[];
  }

  async sendPush(userId: string, payload: PushPayload): Promise<void> {
    const tokens = this.getUserTokens(userId);
    if (tokens.length === 0) return;
    for (const t of tokens) {
      await this.deliver(t, payload);
    }
  }

  async broadcast(userIds: string[], payload: PushPayload): Promise<void> {
    for (const uid of userIds) {
      await this.sendPush(uid, payload);
    }
  }

  private async deliver(token: PushToken, payload: PushPayload): Promise<void> {
    try {
      if (token.platform === 'ios') {
        await this.sendApns(token.token, payload);
      } else if (token.platform === 'android') {
        await this.sendFcm(token.token, payload);
      } else {
        await this.sendWebPush(token.token, payload);
      }
    } catch (err) {
      console.error(`[Push] Failed to send to ${token.platform} token:`, err);
    }
  }

  private async sendFcm(token: string, payload: PushPayload): Promise<void> {
    const fcmUrl = process.env.FCM_API_URL || 'https://fcm.googleapis.com/fcm/send';
    const serverKey = process.env.FCM_SERVER_KEY || '';
    if (!serverKey) {
      console.warn('[Push] FCM not configured');
      return;
    }
    await fetch(fcmUrl, {
      method: 'POST',
      headers: { Authorization: `key=${serverKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      }),
    });
  }

  private async sendApns(token: string, payload: PushPayload): Promise<void> {
    const apnsKeyId = process.env.APNS_KEY_ID || '';
    if (!apnsKeyId) {
      console.warn('[Push] APNs not configured');
      return;
    }
    // APNs requires HTTP/2 with TLS client certificate — placeholder for native module
    console.log(`[Push] APNs delivery placeholder for token ${token.substring(0, 8)}...`);
  }

  private async sendWebPush(token: string, payload: PushPayload): Promise<void> {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
    if (!vapidPublic) {
      console.warn('[Push] Web Push not configured');
      return;
    }
    // Web Push requires WebPush protocol — placeholder
    console.log(`[Push] Web Push delivery placeholder for token ${token.substring(0, 8)}...`);
  }

  getStats(): { totalTokens: number; byPlatform: Record<string, number> } {
    const db = getDb();
    const rows = db
      .prepare('SELECT platform, COUNT(*) as count FROM push_tokens GROUP BY platform')
      .all() as any[];
    const byPlatform: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byPlatform[r.platform] = r.count;
      total += r.count;
    }
    return { totalTokens: total, byPlatform };
  }
}

export const pushService = new PushService();
