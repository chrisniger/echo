import { useState } from 'react';
import { Calendar, CalendarDays, Link2, Link2Off, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';

interface CalendarConnection {
  provider: 'google' | 'outlook';
  connected: boolean;
  email?: string;
}

export default function CalendarIntegration() {
  const [connections, setConnections] = useState<CalendarConnection[]>([
    { provider: 'google', connected: false },
    { provider: 'outlook', connected: false },
  ]);
  const [autoDetect, setAutoDetect] = useState(false);
  const [syncInterval, setSyncInterval] = useState('15');

  const handleConnect = (provider: 'google' | 'outlook') => {
    setConnections((prev) =>
      prev.map((c) =>
        c.provider === provider
          ? { ...c, connected: true, email: `user@${provider}.com` }
          : c,
      ),
    );
  };

  const handleDisconnect = (provider: 'google' | 'outlook') => {
    setConnections((prev) =>
      prev.map((c) =>
        c.provider === provider
          ? { ...c, connected: false, email: undefined }
          : c,
      ),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-500" />
          Calendar Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.provider}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  conn.provider === 'google' ? 'bg-red-600/20' : 'bg-blue-600/20',
                )}>
                  <CalendarDays className={cn(
                    'h-5 w-5',
                    conn.provider === 'google' ? 'text-red-500' : 'text-blue-500',
                  )} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-100 capitalize">{conn.provider} Calendar</p>
                  {conn.connected && conn.email && (
                    <p className="text-xs text-zinc-500">{conn.email}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {conn.connected ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <Button size="sm" variant="ghost" onClick={() => handleDisconnect(conn.provider)} className="text-red-400 hover:text-red-300">
                      <Link2Off className="mr-1 h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => handleConnect(conn.provider)} className="gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    Connect
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg bg-zinc-800/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-detect Meetings</Label>
              <p className="text-xs text-zinc-500">Automatically detect and log calendar meetings</p>
            </div>
            <Switch checked={autoDetect} onCheckedChange={setAutoDetect} />
          </div>

          <div className="space-y-1.5">
            <Label>Sync Interval</Label>
            <Select value={syncInterval} onValueChange={setSyncInterval}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Every 5 minutes</SelectItem>
                <SelectItem value="15">Every 15 minutes</SelectItem>
                <SelectItem value="30">Every 30 minutes</SelectItem>
                <SelectItem value="60">Every hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
