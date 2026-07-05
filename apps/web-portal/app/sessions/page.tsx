'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { format } from 'date-fns';
import { Search as SearchIcon, Calendar } from 'lucide-react';

interface Session {
  id: string;
  name: string;
  status: string;
  model?: string;
  tags?: string[];
  createdAt: string;
  duration?: number;
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const data = await api.get<Session[]>('/api/sessions').catch(() => []);
      setSessions(data);
    } catch {}
    setLoading(false);
  };

  const filtered = sessions.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
        <h1 className="text-3xl font-bold mb-6">Session History</h1>
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-echo-500"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="in-progress">In Progress</option>
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="text-zinc-500 text-center py-12">No sessions found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 cursor-pointer"
                onClick={() => router.push(`/sessions/${s.id}`)}
              >
                <div className="flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(s.createdAt), 'MMM d, yyyy h:mm a')}
                    {s.model && ` · ${s.model}`}
                    {s.duration && ` · ${Math.round(s.duration / 60)} min`}
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
