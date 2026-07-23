import { Wifi, WifiOff, Battery, Clock, Signal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useDeviceStore, type ConnectedDevice } from '../stores/device';

export default function ConnectedDevices() {
  const { connectedDevices } = useDeviceStore();

  const getSignalIcon = (strength: ConnectedDevice['signalStrength']) => {
    switch (strength) {
      case 'excellent':
        return <Signal className="h-4 w-4 text-emerald-500" />;
      case 'good':
        return <Signal className="h-4 w-4 text-green-500" />;
      case 'fair':
        return <Signal className="h-4 w-4 text-yellow-500" />;
      case 'poor':
        return <Signal className="h-4 w-4 text-red-500" />;
    }
  };

  const formatLastSync = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 1000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString();
  };

  if (connectedDevices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-zinc-500" />
            Connected Devices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">No devices connected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-indigo-500" />
          Connected Devices
          <Badge variant="secondary">{connectedDevices.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connectedDevices.map((device) => (
          <div
            key={device.id}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
              {device.connected ? (
                <Wifi className="h-5 w-5 text-indigo-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-zinc-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {device.name}
                </span>
                <Badge variant={device.connected ? 'default' : 'secondary'} className="text-xs">
                  {device.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  {getSignalIcon(device.signalStrength)}
                  {device.signalStrength}
                </span>
                {device.battery !== undefined && (
                  <span className="flex items-center gap-1">
                    <Battery className="h-3 w-3" />
                    {device.battery}%
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatLastSync(device.lastSync)}
                </span>
                {device.latency !== undefined && <span>{device.latency}ms</span>}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
