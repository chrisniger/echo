import { create } from 'zustand';
import { api } from '../lib/api';

const PAIRING_CODE_LENGTH = 6;

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

interface PairingState {
  devices: PairedDevice[];
  activeCode: PairingCode | null;
  isLoading: boolean;
  error: string | null;

  fetchDevices: () => Promise<void>;
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
  isLoading: false,
  error: null,

  fetchDevices: async () => {
    set({ isLoading: true });
    try {
      const devices = await api.get<PairedDevice[]>('/devices');
      set({ devices, isLoading: false, error: null });
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Failed to fetch devices' });
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
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Failed to generate pairing code' });
      throw err;
    }
  },

  approvePairing: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/pairing/approve', { token });
      await get().fetchDevices();
      set({ isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Failed to approve device' });
      throw err;
    }
  },

  rejectPairing: async (token: string) => {
    try {
      await api.post('/pairing/reject', { token });
    } catch (err: any) {
      set({ error: err.message || 'Failed to reject pairing' });
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
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Invalid pairing code' });
      throw err;
    }
  },

  renameDevice: async (id: string, name: string) => {
    try {
      await api.put(`/devices/${id}`, { name });
      await get().fetchDevices();
    } catch (err: any) {
      set({ error: err.message || 'Failed to rename device' });
    }
  },

  removeDevice: async (id: string) => {
    try {
      await api.delete(`/devices/${id}`);
      set((state) => ({ devices: state.devices.filter((d) => d.id !== id) }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to remove device' });
    }
  },

  clearCode: () => set({ activeCode: null }),
  clearError: () => set({ error: null }),
}));
