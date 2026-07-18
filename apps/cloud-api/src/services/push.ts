import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import webpush from 'web-push';

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

// Configure VAPID keys for web push
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:notifications@echo-gpt.app';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
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
    
    const results = await Promise.allSettled(
      tokens.map(t => this.deliver(t, payload))
    );
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[Push] Failed to send to ${tokens[index].platform}:`, result.reason);
      }
    });
  }

  async broadcast(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(userIds.map(uid => this.sendPush(uid, payload)));
  }

  private async deliver(token: PushToken, payload: PushPayload): Promise<void> {
    if (token.platform === 'ios') {
      await this.sendApns(token.token, payload);
    } else if (token.platform === 'android') {
      await this.sendFcm(token.token, payload);
    } else {
      await this.sendWebPush(token.token, payload);
    }
  }

  private async sendFcm(token: string, payload: PushPayload): Promise<void> {
    const fcmUrl = process.env.FCM_API_URL || 'https://fcm.googleapis.com/fcm/send';
    const serverKey = process.env.FCM_SERVER_KEY || '';
    
    if (!serverKey) {
      console.warn('[Push] FCM not configured - skipping');
      return;
    }
    
    const response = await fetch(fcmUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `key=${serverKey}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        to: token,
        notification: { 
          title: payload.title, 
          body: payload.body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
        },
        data: payload.data,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`FCM delivery failed: ${error}`);
    }
  }

  private async sendApns(token: string, payload: PushPayload): Promise<void> {
    const apnsKeyId = process.env.APNS_KEY_ID || '';
    const apnsTeamId = process.env.APNS_TEAM_ID || '';
    const apnsPrivateKey = process.env.APNS_PRIVATE_KEY || '';
    
    if (!apnsKeyId || !apnsTeamId || !apnsPrivateKey) {
      console.warn('[Push] APNs not configured - skipping');
      return;
    }
    
    // APNs requires HTTP/2 with JWT authentication
    // This is a simplified implementation - in production, use a proper APNs library
    console.log(`[Push] APNs delivery for token ${token.substring(0, 8)}...`);
    
    // TODO: Implement proper APNs delivery with JWT token generation
    // For now, this is a placeholder that logs the attempt
  }

  private async sendWebPush(subscription: string, payload: PushPayload): Promise<void> {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('[Push] Web Push VAPID keys not configured - skipping');
      return;
    }
    
    try {
      const pushSubscription = JSON.parse(subscription);
      
      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: payload.data,
        })
      );
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription is no longer valid, remove it
        console.log('[Push] Removing expired web push subscription');
        this.unregisterToken(subscription);
      } else {
        throw error;
      }
    }
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

  /**
   * Generate VAPID keys for web push (run once during setup)
   */
  static generateVapidKeys(): { publicKey: string; privateKey: string } {
    const keys = webpush.generateVAPIDKeys();
    return {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    };
  }
}

export const pushService = new PushService();
