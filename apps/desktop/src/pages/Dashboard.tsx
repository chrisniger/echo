import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, History, Settings, Clock, CalendarDays, Activity } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useSessionStore } from '../stores/session';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

const statusLabels: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  paused: 'warning',
  ended: 'secondary',
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { sessions, fetchSessions, isLoading } = useSessionStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const recentSessions = sessions.slice(0, 5);
  const totalSessions = sessions.length;
  const thisMonthSessions = sessions.filter((s) => {
    const sessionDate = new Date(s.startedAt);
    const now = new Date();
    return (
      sessionDate.getMonth() === now.getMonth() && sessionDate.getFullYear() === now.getFullYear()
    );
  }).length;
  const avgDuration =
    sessions.length > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.duration, 0) / sessions.length)
      : 0;

  const stats = [
    { label: 'Total Sessions', value: totalSessions, icon: Activity },
    { label: 'This Month', value: thisMonthSessions, icon: CalendarDays },
    { label: 'Avg Duration', value: `${avgDuration}m`, icon: Clock },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Welcome back, {user?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Ready to start a new session?</p>
        </div>
        <Button onClick={() => navigate('/new-session')} className="gap-2">
          <PlusCircle className="h-5 w-5" />
          New Session
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-600/20">
                <stat.icon className="h-6 w-6 text-indigo-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Recent Sessions
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : recentSessions.length > 0 ? (
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <Card
                key={session.id}
                className="cursor-pointer transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                onClick={() => navigate(`/sessions/${session.id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {session.name}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
                      <span>{new Date(session.startedAt).toLocaleDateString()}</span>
                      <span>{session.duration}m</span>
                      <span>{session.aiModel}</span>
                    </div>
                  </div>
                  <Badge variant={statusLabels[session.status] || 'secondary'}>
                    {session.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <Activity className="h-12 w-12 text-zinc-600 mb-4" />
              <p className="text-zinc-500 dark:text-zinc-400">No sessions yet</p>
              <Button className="mt-4" onClick={() => navigate('/new-session')}>
                Start your first session
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card
            className="cursor-pointer transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
            onClick={() => navigate('/new-session')}
          >
            <CardContent className="flex flex-col items-center py-8">
              <PlusCircle className="h-8 w-8 text-indigo-500 mb-2" />
              <p className="font-medium text-zinc-900 dark:text-zinc-100">New Session</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
            onClick={() => navigate('/history')}
          >
            <CardContent className="flex flex-col items-center py-8">
              <History className="h-8 w-8 text-emerald-500 mb-2" />
              <p className="font-medium text-zinc-900 dark:text-zinc-100">View History</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
            onClick={() => navigate('/settings')}
          >
            <CardContent className="flex flex-col items-center py-8">
              <Settings className="h-8 w-8 text-amber-500 mb-2" />
              <p className="font-medium text-zinc-900 dark:text-zinc-100">Settings</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
