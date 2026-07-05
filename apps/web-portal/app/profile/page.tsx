'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { User, Save, Shield } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await api.get<{ user: { name: string; email: string } }>('/auth/me');
      setName(data.user.name);
      setEmail(data.user.email);
    } catch {}
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/auth/me', { name });
    } catch {}
    setSaving(false);
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
        <h1 className="text-3xl font-bold mb-6">Profile</h1>
        <div className="max-w-lg space-y-6">
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-lg space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <User className="w-4 h-4" /> Account Info
            </h2>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                value={email}
                disabled
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-400 cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-echo-600 rounded-lg hover:bg-echo-700 text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-lg space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4" /> Security
            </h2>
            <div>
              <label className="block text-sm font-medium mb-1">Current Password</label>
              <input
                type="password"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
                />
              </div>
            </div>
            <button className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm">
              Update Password
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
