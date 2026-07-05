'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Monitor, Smartphone, Trash2, RefreshCw } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  platform: string;
  lastUsedAt: string;
  lastIp?: string;
  isCurrentDevice: boolean;
}

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setDevices(await api.get<Device[]>('/api/devices').catch(() => []));
    } catch {}
    setLoading(false);
  };

  const handleRemove = async (id: string) => {
    await api.delete(`/api/devices/${id}`);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  };

  if (loading)
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">Loading...</main>
      </div>
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Devices</h1>
          <button
            onClick={fetchDevices}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        {devices.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No devices paired</p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {d.platform.toLowerCase().includes('win') || d.platform === 'desktop' ? (
                    <Monitor className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <Smartphone className="w-5 h-5 text-zinc-400" />
                  )}
                  <div>
                    <p className="font-medium">
                      {d.name}{' '}
                      {d.isCurrentDevice && (
                        <span className="text-xs text-echo-400 ml-1">(current)</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {d.platform} · Last used: {new Date(d.lastUsedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(d.id)}
                  className="text-zinc-500 hover:text-red-400 p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
