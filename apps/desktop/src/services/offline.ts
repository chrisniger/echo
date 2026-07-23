import { api } from '../lib/api';

/**
 * Phase 5: the data field is intentionally heterogeneous — different
 * `type`s carry different payloads. We type it as `Record<string, unknown>`
 * and narrow at the read sites (processSession / processTranscript /
 * processAiResponse / processScreenshot), each of which only touches
 * fields relevant to its concrete kind.
 */
export interface OfflineQueueItem {
  id: string;
  type: 'session' | 'transcript' | 'ai_response' | 'screenshot';
  action: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

/** Helper for narrowing `Record<string, unknown>` to a string field. */
function strField(data: Record<string, unknown>, key: string): string | undefined {
  return typeof data[key] === 'string' ? (data[key] as string) : undefined;
}

/** Helper for narrowing `Record<string, unknown>` to a `File` field. */
function fileField(data: Record<string, unknown>, key: string): File | undefined {
  const value = data[key];
  return value instanceof File ? value : undefined;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync: number | null;
  pendingItems: number;
  isSyncing: boolean;
}

class OfflineService {
  private queue: OfflineQueueItem[] = [];
  private isOnline = navigator.onLine;
  private isSyncing = false;
  private lastSync: number | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Load queue from localStorage
    this.loadQueue();

    // Check initial online status
    this.checkOnlineStatus();
  }

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem('echo_offline_queue');
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[OfflineService] Failed to load queue:', error);
      this.queue = [];
    }
  }

  private saveQueue(): void {
    try {
      localStorage.setItem('echo_offline_queue', JSON.stringify(this.queue));
    } catch (error) {
      console.error('[OfflineService] Failed to save queue:', error);
    }
  }

  private async checkOnlineStatus(): Promise<void> {
    try {
      // Try to reach the API
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      this.isOnline = response.ok;
    } catch {
      this.isOnline = false;
    }

    this.notifyListeners();
  }

  private handleOnline(): void {
    console.log('[OfflineService] App is online');
    this.isOnline = true;
    this.notifyListeners();

    // Automatically sync when coming back online
    this.sync();
  }

  private handleOffline(): void {
    console.log('[OfflineService] App is offline');
    this.isOnline = false;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }

  /**
   * Subscribe to sync status changes
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      lastSync: this.lastSync,
      pendingItems: this.queue.length,
      isSyncing: this.isSyncing,
    };
  }

  /**
   * Queue an action for later sync
   */
  queueAction(
    type: OfflineQueueItem['type'],
    action: OfflineQueueItem['action'],
    data: Record<string, unknown>,
  ): void {
    const item: OfflineQueueItem = {
      id: crypto.randomUUID(),
      type,
      action,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queue.push(item);
    this.saveQueue();
    this.notifyListeners();

    console.log(`[OfflineService] Queued ${action} ${type} (queue size: ${this.queue.length})`);

    // If online, try to sync immediately
    if (this.isOnline && !this.isSyncing) {
      this.sync();
    }
  }

  /**
   * Sync all queued items with the server
   */
  async sync(): Promise<void> {
    if (this.isSyncing || this.queue.length === 0) {
      return;
    }

    if (!this.isOnline) {
      console.log('[OfflineService] Cannot sync - app is offline');
      return;
    }

    this.isSyncing = true;
    this.notifyListeners();

    console.log(`[OfflineService] Starting sync (${this.queue.length} items)`);

    const failedItems: OfflineQueueItem[] = [];

    for (const item of this.queue) {
      try {
        await this.processItem(item);
        console.log(`[OfflineService] Synced ${item.action} ${item.type}`);
      } catch (error) {
        console.error(`[OfflineService] Failed to sync ${item.action} ${item.type}:`, error);

        item.retryCount++;
        if (item.retryCount < 3) {
          failedItems.push(item);
        } else {
          console.error(`[OfflineService] Giving up on item after 3 retries:`, item);
        }
      }
    }

    // Update queue with failed items
    this.queue = failedItems;
    this.saveQueue();

    this.lastSync = Date.now();
    this.isSyncing = false;
    this.notifyListeners();

    console.log(`[OfflineService] Sync complete (${failedItems.length} items failed)`);
  }

  /**
   * Process a single queue item
   */
  private async processItem(item: OfflineQueueItem): Promise<void> {
    switch (item.type) {
      case 'session':
        await this.processSession(item);
        break;
      case 'transcript':
        await this.processTranscript(item);
        break;
      case 'ai_response':
        await this.processAiResponse(item);
        break;
      case 'screenshot':
        await this.processScreenshot(item);
        break;
    }
  }

  private async processSession(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      await api.post('/sessions', item.data);
    } else if (item.action === 'update') {
      const id = strField(item.data, 'id');
      if (!id) return;
      await api.put(`/sessions/${id}`, item.data);
    } else if (item.action === 'delete') {
      const id = strField(item.data, 'id');
      if (!id) return;
      await api.delete(`/sessions/${id}`);
    }
  }

  private async processTranscript(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      const sessionId = strField(item.data, 'sessionId');
      if (!sessionId) return;
      await api.post(`/sessions/${sessionId}/transcript`, item.data);
    }
  }

  private async processAiResponse(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      const sessionId = strField(item.data, 'sessionId');
      if (!sessionId) return;
      await api.post(`/sessions/${sessionId}/responses`, item.data);
    }
  }

  private async processScreenshot(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      const file = fileField(item.data, 'file');
      const sessionId = strField(item.data, 'sessionId');
      if (!file || !sessionId) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);
      await api.post('/screenshots', formData);
    }
  }

  /**
   * Clear all queued items
   */
  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Force online status check
   */
  async checkStatus(): Promise<void> {
    await this.checkOnlineStatus();
  }
}

export const offlineService = new OfflineService();
