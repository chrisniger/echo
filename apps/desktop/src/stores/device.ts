import { create } from 'zustand';

export interface ConnectedDevice {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'web';
  connected: boolean;
  battery?: number;
  lastSync: number;
  signalStrength: 'excellent' | 'good' | 'fair' | 'poor';
  latency?: number;
}

interface DeviceState {
  connectedDevices: ConnectedDevice[];
  addDevice: (device: ConnectedDevice) => void;
  removeDevice: (id: string) => void;
  updateDevice: (id: string, updates: Partial<ConnectedDevice>) => void;
  setConnected: (id: string, connected: boolean) => void;
  updateLastSync: (id: string) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  connectedDevices: [],

  addDevice: (device) => {
    set((state) => ({
      connectedDevices: [...state.connectedDevices, device],
    }));
  },

  removeDevice: (id) => {
    set((state) => ({
      connectedDevices: state.connectedDevices.filter((d) => d.id !== id),
    }));
  },

  updateDevice: (id, updates) => {
    set((state) => ({
      connectedDevices: state.connectedDevices.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    }));
  },

  setConnected: (id, connected) => {
    set((state) => ({
      connectedDevices: state.connectedDevices.map((d) =>
        d.id === id ? { ...d, connected, lastSync: Date.now() } : d
      ),
    }));
  },

  updateLastSync: (id) => {
    set((state) => ({
      connectedDevices: state.connectedDevices.map((d) =>
        d.id === id ? { ...d, lastSync: Date.now() } : d
      ),
    }));
  },
}));
