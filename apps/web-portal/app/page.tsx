'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { format } from 'date-fns';

interface SessionSummary {
  id: string;
  name: string;
  status: string;
  model?: string;
  createdAt: string;
  duration?: number;
}

interface DashboardData {
  totalSessions: number;
  totalHours: number;
  totalTokens: number;
  recentSessions: SessionSummary[];
  subscription?: { planName: string; status: string };
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [me, sessions] = await Promise.all([
        api.get<{ user: any }>('/auth/me').catch(() => ({ user: null })),
        api.get<SessionSummary[]>('/api/sessions?limit=5').catch(() => []),
      ]);
      setData({
        totalSessions: sessions.length,
        totalHours: 0,
        totalTokens: 0,
        recentSessions: sessions.slice(0, 5),
      });
    } catch {
      /* ignore */
    }
    setLoading(false);
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
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Sessions" value={String(data?.totalSessions ?? 0)} />
          <StatCard label="Hours" value={(data?.totalHours ?? 0).toFixed(1)} />
          <StatCard label="AI Tokens" value={(data?.totalTokens ?? 0).toLocaleString()} />
        </div>
        <h2 className="text-xl font-semibold mb-4">Recent Sessions</h2>
        {!data?.recentSessions || data.recentSessions.length === 0 ? (
          <p className="text-zinc-500">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            {data.recentSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 cursor-pointer"
                onClick={() => router.push(`/sessions/${s.id}`)}
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-zinc-500">
                    {s.model && `${s.model} · `}
                    {format(new Date(s.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${s.status === 'completed' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
