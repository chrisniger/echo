import { Wifi, WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { useOffline } from '../hooks/useOffline';

export default function OfflineIndicator() {
  const { isOnline, pendingItems, isSyncing, lastSync, sync, checkStatus } = useOffline();

  const formatLastSync = () => {
    if (!lastSync) return 'Never';
    const diff = Date.now() - lastSync;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(lastSync).toLocaleDateString();
  };

  return (
    <Card className="border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className="h-5 w-5 text-emerald-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-amber-500" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-100">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <Badge variant={isOnline ? 'default' : 'secondary'}>
                  {isOnline ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500">
                {pendingItems > 0
                  ? `${pendingItems} item${pendingItems > 1 ? 's' : ''} pending sync`
                  : `Last sync: ${formatLastSync()}`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkStatus}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
            {pendingItems > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={sync}
                disabled={isSyncing || !isOnline}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Now
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
