import { create } from 'zustand';
import { api } from '../lib/api';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  pendingChanges: number;
  triggerSync: () => Promise<void>;
  getSyncStatus: () => SyncStatus;
  resolveConflict: (resolution: 'local' | 'remote') => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncStatus: 'idle',
  lastSyncedAt: null,
  pendingChanges: 0,

  triggerSync: async () => {
    set({ syncStatus: 'syncing' });
    try {
      const res = await api.post<{ syncedAt: string; pendingChanges: number }>('/sync/trigger');
      set({
        syncStatus: 'idle',
        lastSyncedAt: res.syncedAt,
        pendingChanges: res.pendingChanges,
      });
    } catch {
      set({ syncStatus: 'error' });
    }
  },

  getSyncStatus: () => {
    return get().syncStatus;
  },

  resolveConflict: async (resolution: 'local' | 'remote') => {
    set({ syncStatus: 'syncing' });
    try {
      const res = await api.post<{ syncedAt: string; pendingChanges: number }>('/sync/resolve', { resolution });
      set({
        syncStatus: 'idle',
        lastSyncedAt: res.syncedAt,
        pendingChanges: res.pendingChanges,
      });
    } catch {
      set({ syncStatus: 'error' });
    }
  },
}));
