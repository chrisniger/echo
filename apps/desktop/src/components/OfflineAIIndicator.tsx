import { useState } from 'react';
import { Wifi, WifiOff, Cloud, Loader2, HardDrive, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';

type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

interface ModelEntry {
  name: string;
  size: string;
  downloaded: boolean;
  progress: number;
}

const mockModels: ModelEntry[] = [
  { name: 'llama3.2:3b', size: '2.0 GB', downloaded: true, progress: 100 },
  { name: 'mixtral:8x7b', size: '26 GB', downloaded: false, progress: 45 },
  { name: 'nomic-embed-text', size: '274 MB', downloaded: true, progress: 100 },
];

export default function OfflineAIIndicator() {
  const [ollamaStatus, setOllamaStatus] = useState<ConnectionStatus>('disconnected');
  const [useLocal, setUseLocal] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    setTesting(true);
    setOllamaStatus('loading');
    await new Promise((r) => setTimeout(r, 2000));
    setOllamaStatus('connected');
    setTesting(false);
  };

  const handleSwitchMode = (v: boolean) => {
    setUseLocal(v);
    if (v) {
      handleTestConnection();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-indigo-500" />
          Offline AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-3">
            {ollamaStatus === 'connected' ? (
              <Wifi className="h-5 w-5 text-emerald-500" />
            ) : ollamaStatus === 'loading' ? (
              <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
            ) : (
              <WifiOff className="h-5 w-5 text-zinc-500" />
            )}
            <div>
              <p className="text-sm font-medium text-zinc-100">Ollama</p>
              <p className="text-xs text-zinc-500">
                {ollamaStatus === 'connected'
                  ? 'Connected'
                  : ollamaStatus === 'loading'
                  ? 'Connecting...'
                  : 'Disconnected'}
              </p>
            </div>
          </div>
          <Badge
            variant={
              ollamaStatus === 'connected'
                ? 'success'
                : ollamaStatus === 'loading'
                ? 'warning'
                : 'secondary'
            }
          >
            {ollamaStatus}
          </Badge>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
          <div className="flex items-center gap-2">
            {useLocal ? (
              <HardDrive className="h-4 w-4 text-indigo-500" />
            ) : (
              <Cloud className="h-4 w-4 text-zinc-400" />
            )}
            <div>
              <Label>Use local AI</Label>
              <p className="text-xs text-zinc-500">Switch between cloud and local inference</p>
            </div>
          </div>
          <Switch checked={useLocal} onCheckedChange={handleSwitchMode} />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleTestConnection}
          disabled={testing}
          className="w-full gap-2"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Test Connection
        </Button>

        {mockModels.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400">Models</p>
            {mockModels.map((model) => (
              <div key={model.name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">{model.name}</span>
                    <span className="text-xs text-zinc-500">{model.size}</span>
                  </div>
                  {model.downloaded ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="text-xs text-amber-500">{model.progress}%</span>
                  )}
                </div>
                {!model.downloaded && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${model.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
