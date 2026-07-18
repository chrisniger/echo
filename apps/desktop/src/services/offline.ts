import { api } from '../lib/api';

export interface OfflineQueueItem {
  id: string;
  type: 'session' | 'transcript' | 'ai_response' | 'screenshot';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount: number;
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
    this.listeners.forEach(listener => listener(status));
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
  queueAction(type: OfflineQueueItem['type'], action: OfflineQueueItem['action'], data: any): void {
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
      await api.put(`/sessions/${item.data.id}`, item.data);
    } else if (item.action === 'delete') {
      await api.delete(`/sessions/${item.data.id}`);
    }
  }

  private async processTranscript(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      await api.post(`/sessions/${item.data.sessionId}/transcript`, item.data);
    }
  }

  private async processAiResponse(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      await api.post(`/sessions/${item.data.sessionId}/responses`, item.data);
    }
  }

  private async processScreenshot(item: OfflineQueueItem): Promise<void> {
    if (item.action === 'create') {
      const formData = new FormData();
      formData.append('file', item.data.file);
      formData.append('sessionId', item.data.sessionId);
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
