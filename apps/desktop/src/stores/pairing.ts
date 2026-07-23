import { create } from 'zustand';
import { api } from '../lib/api';
import { errorMessage } from '../lib/utils';

export interface PairedDevice {
  id: string;
  name: string;
  platform: string;
  lastIp: string;
  lastUsedAt: string;
  isCurrentDevice: boolean;
}

export interface PairingCode {
  code: string;
  token: string;
  expiresAt: string;
  deviceName: string;
}

export interface PendingPairing {
  id: string;
  code: string;
  token: string;
  deviceName: string;
  platform: string;
  expiresAt: string;
  createdAt: string;
}

interface PairingState {
  devices: PairedDevice[];
  activeCode: PairingCode | null;
  pendingPairings: PendingPairing[];
  isLoading: boolean;
  error: string | null;

  fetchDevices: () => Promise<void>;
  fetchPendingPairings: () => Promise<void>;
  requestPairingCode: (deviceName: string, platform?: string) => Promise<PairingCode>;
  approvePairing: (token: string) => Promise<void>;
  rejectPairing: (token: string) => Promise<void>;
  verifyPairingCode: (
    code: string,
  ) => Promise<{ approved: boolean; token?: string; deviceName?: string }>;
  renameDevice: (id: string, name: string) => Promise<void>;
  removeDevice: (id: string) => Promise<void>;
  clearCode: () => void;
  clearError: () => void;
}

export const usePairingStore = create<PairingState>((set, get) => ({
  devices: [],
  activeCode: null,
  pendingPairings: [],
  isLoading: false,
  error: null,

  fetchDevices: async () => {
    set({ isLoading: true });
    try {
      const devices = await api.get<PairedDevice[]>('/devices');
      set({ devices, isLoading: false, error: null });
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err, 'Failed to fetch devices') });
    }
  },

  fetchPendingPairings: async () => {
    try {
      const pending = await api.get<PendingPairing[]>('/pairing/pending');
      set({ pendingPairings: pending });
    } catch (err) {
      console.error('Failed to fetch pending pairings:', err);
    }
  },

  requestPairingCode: async (deviceName: string, platform?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.post<PairingCode>('/pairing/request', {
        deviceName,
        platform: platform || navigator.platform || 'unknown',
      });
      set({ activeCode: result, isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err, 'Failed to generate pairing code') });
      throw err;
    }
  },

  approvePairing: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/pairing/approve', { token });
      await get().fetchDevices();
      await get().fetchPendingPairings();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err, 'Failed to approve device') });
      throw err;
    }
  },

  rejectPairing: async (token: string) => {
    try {
      await api.post('/pairing/reject', { token });
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to reject pairing') });
    }
  },

  verifyPairingCode: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.post<{ approved: boolean; token?: string; deviceName?: string }>(
        '/pairing/verify',
        { code },
      );
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err, 'Invalid pairing code') });
      throw err;
    }
  },

  renameDevice: async (id: string, name: string) => {
    try {
      await api.put(`/devices/${id}`, { name });
      await get().fetchDevices();
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to rename device') });
    }
  },

  removeDevice: async (id: string) => {
    try {
      await api.delete(`/devices/${id}`);
      set((state) => ({ devices: state.devices.filter((d) => d.id !== id) }));
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to remove device') });
    }
  },

  clearCode: () => set({ activeCode: null }),
  clearError: () => set({ error: null }),
}));
