import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, Clock, Activity } from 'lucide-react';
import { useSessionStore } from '../stores/session';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import {
  SESSION_TYPE_VALUES,
  SessionTypeBadge,
} from '../components/SessionTypeBadge';
import { isSessionType, type SessionType } from '@echo-gpt/shared-types';

const statusLabels: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  paused: 'warning',
  ended: 'secondary',
};

// Sentinel value used in the Radix <Select>'s onValueChange callback (which
// is `string`-only — `null` isn't a valid Radix value). Three places use it;
// keeping it as one const prevents drift if we ever rename the "all" option.
const ALL_TYPES = '__all__';

/**
 * Type-safe narrowing from Radix's string callback to SessionType. Uses
 * the shared `isSessionType` predicate from @echo-gpt/shared-types so the
 * typecast vanishes and a new SessionType added to the union is automatically
 * picked up here (no edit required in this file).
 */
function parseTypeFilter(v: string): SessionType | null {
  if (v === ALL_TYPES) return null;
  return isSessionType(v) ? v : null;
}

export default function History() {
  const { sessions, fetchSessions, isLoading } = useSessionStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // null = no SessionType filter. Default convention: nullable sentinels
  // are idiomatic in React; the previous "__all__" string sentinel was
  // over-engineered.
  const [typeFilter, setTypeFilter] = useState<SessionType | null>(null);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesModel = modelFilter === 'all' || s.aiModel === modelFilter;
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchesType = typeFilter === null || s.sessionType === typeFilter;
    return matchesSearch && matchesModel && matchesStatus && matchesType;
  });

  const uniqueModels = [...new Set(sessions.map((s) => s.aiModel))];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-bold text-zinc-100">Session History</h1>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 pl-10 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {uniqueModels.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter ?? ALL_TYPES}
            onValueChange={(v) => setTypeFilter(parseTypeFilter(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>All Types</SelectItem>
              {SESSION_TYPE_VALUES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      ) : filteredSessions.length > 0 ? (
        <div className="space-y-3">
          {filteredSessions.map((session) => (
            <Card
              key={session.id}
              className="cursor-pointer transition-colors hover:border-zinc-700"
              onClick={() => navigate(`/sessions/${session.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-100 truncate">{session.name}</h3>
                      <SessionTypeBadge
                        type={session.sessionType}
                        shortLabel={{ Brainstorming: 'Brainstorm', 'Customer Support': 'Support' }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(session.startedAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {session.duration}m
                      </span>
                      <span>{session.aiModel}</span>
                      <span>{session.transcriptCount} transcripts</span>
                      <span>{session.aiResponseCount} responses</span>
                    </div>
                    {session.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {session.tags.map((tag: string) => (
                          <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant={statusLabels[session.status] || 'secondary'}>
                    {session.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Activity className="h-16 w-16 text-zinc-700 mb-4" />
            <p className="text-lg text-zinc-400">No sessions found</p>
            <p className="mt-1 text-sm text-zinc-600">
              {search || modelFilter !== 'all' || statusFilter !== 'all' || typeFilter !== null
                ? 'Try adjusting your search or filters'
                : 'Start your first session to see it here'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
