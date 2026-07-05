'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Search as SearchIcon, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface SearchResult {
  id: string;
  type: 'session' | 'transcript' | 'cv';
  title: string;
  snippet: string;
  date: string;
  sessionId?: string;
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearched(true);
    // Client-side mock; real search calls API
    setResults([
      {
        id: '1',
        type: 'session',
        title: `Results for "${query}"`,
        snippet:
          'Search is available once the API implements full-text search across sessions, transcripts, and CVs.',
        date: new Date().toISOString(),
      },
    ]);
  };

  if (typeof window !== 'undefined' && !getToken()) {
    router.push('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6">Search</h1>
        <div className="relative max-w-2xl mb-8">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search sessions, transcripts, CVs..."
            className="w-full pl-12 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-echo-500 text-lg"
          />
        </div>
        {searched && results.length === 0 && (
          <p className="text-zinc-500 text-center py-8">No results found</p>
        )}
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.id}
              className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 cursor-pointer"
              onClick={() => r.sessionId && router.push(`/sessions/${r.sessionId}`)}
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-echo-400" />
                <span className="font-medium">{r.title}</span>
                <span className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded capitalize">
                  {r.type}
                </span>
              </div>
              <p className="text-sm text-zinc-400">{r.snippet}</p>
              <p className="text-xs text-zinc-600 mt-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(r.date), 'MMM d, yyyy')}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
