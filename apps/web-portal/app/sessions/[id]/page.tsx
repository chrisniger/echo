'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { format } from 'date-fns';
import { ArrowLeft, Download } from 'lucide-react';

interface SessionDetail {
  id: string;
  name: string;
  status: string;
  model?: string;
  createdAt: string;
  duration?: number;
  transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
  aiResponses?: Array<{ content: string; createdAt: string }>;
  screenshots?: string[];
  documents?: Array<{ name: string }>;
  summary?: string;
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [tab, setTab] = useState<'transcript' | 'ai' | 'details'>('transcript');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchSession();
  }, [id]);

  const fetchSession = async () => {
    try {
      const data = await api.get<SessionDetail>(`/api/sessions/${id}`);
      setSession(data);
    } catch {}
    setLoading(false);
  };

  if (loading)
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">Loading...</main>
      </div>
    );
  if (!session)
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">Session not found</main>
      </div>
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <button
          onClick={() => router.push('/sessions')}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{session.name}</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {format(new Date(session.createdAt), 'MMM d, yyyy h:mm a')}
              {session.model && ` · ${session.model}`}
              {session.duration && ` · ${Math.round(session.duration / 60)} min`}
            </p>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
        {session.summary && (
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg mb-6">
            <h3 className="font-semibold mb-2">Summary</h3>
            <p className="text-sm text-zinc-300">{session.summary}</p>
          </div>
        )}
        <div className="flex gap-4 mb-4 border-b border-zinc-800">
          {(['transcript', 'ai', 'details'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium capitalize ${tab === t ? 'text-echo-500 border-b-2 border-echo-500' : 'text-zinc-400 hover:text-white'}`}
            >
              {t} {t === 'ai' ? 'Responses' : ''}
            </button>
          ))}
        </div>
        {tab === 'transcript' && (
          <div className="space-y-3">
            {session.transcript?.map((seg, i) => (
              <div key={i} className="p-3 bg-zinc-900 rounded-lg">
                <p className="text-xs text-echo-400 font-medium mb-1">
                  {seg.speaker} · {format(new Date(seg.timestamp), 'mm:ss')}
                </p>
                <p className="text-sm">{seg.text}</p>
              </div>
            )) || <p className="text-zinc-500">No transcript available</p>}
          </div>
        )}
        {tab === 'ai' && (
          <div className="space-y-3">
            {session.aiResponses?.map((r, i) => (
              <div key={i} className="p-3 bg-zinc-900 rounded-lg">
                <p className="text-xs text-zinc-500 mb-1">
                  {format(new Date(r.createdAt), 'MMM d, h:mm a')}
                </p>
                <p className="text-sm whitespace-pre-wrap">{r.content}</p>
              </div>
            )) || <p className="text-zinc-500">No AI responses</p>}
          </div>
        )}
        {tab === 'details' && (
          <div className="space-y-4">
            {session.screenshots && session.screenshots.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Screenshots</h3>
                <div className="grid grid-cols-4 gap-2">
                  {session.screenshots.map((s, i) => (
                    <img key={i} src={s} alt="" className="rounded-lg bg-zinc-800" />
                  ))}
                </div>
              </div>
            )}
            {session.documents && session.documents.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Documents</h3>
                <div className="space-y-1">
                  {session.documents.map((d, i) => (
                    <div key={i} className="p-2 bg-zinc-900 rounded text-sm">
                      {d.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
