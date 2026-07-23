import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, Loader2, HardDrive, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { checkOllamaStatus, formatModelSize, type OllamaStatus } from '../services/ollama';

type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

export default function OfflineAIIndicator() {
  const [ollamaStatus, setOllamaStatus] = useState<ConnectionStatus>('disconnected');
  const [ollamaData, setOllamaData] = useState<OllamaStatus>({ connected: false, models: [] });
  const [useLocal, setUseLocal] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    // Check initial status
    handleTestConnection();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setOllamaStatus('loading');

    const status = await checkOllamaStatus();
    setOllamaData(status);

    if (status.connected) {
      setOllamaStatus('connected');
    } else {
      setOllamaStatus('disconnected');
    }

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
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-4">
          <div className="flex items-center gap-3">
            {ollamaStatus === 'connected' ? (
              <Wifi className="h-5 w-5 text-emerald-500" />
            ) : ollamaStatus === 'loading' ? (
              <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
            ) : (
              <WifiOff className="h-5 w-5 text-zinc-500" />
            )}
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Ollama</p>
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

        <div className="flex items-center justify-between rounded-lg bg-zinc-50/50 dark:bg-zinc-800/50 px-4 py-3">
          <div className="flex items-center gap-2">
            {useLocal ? (
              <HardDrive className="h-4 w-4 text-indigo-500" />
            ) : (
              <Cloud className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
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

        {ollamaData.models.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Installed Models</p>
            {ollamaData.models.map((model) => (
              <div
                key={model.name}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {model.name}
                    </span>
                    <span className="text-xs text-zinc-500">{formatModelSize(model.size)}</span>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                {model.details && (
                  <div className="mt-1 text-xs text-zinc-500">
                    {model.details.parameter_size} • {model.details.quantization_level}
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
