import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Trash2, Edit3, Check, X, RefreshCw, Copy } from 'lucide-react';
import { usePairingStore, type PairedDevice } from '../stores/pairing';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

export function DeviceManagement() {
  const {
    devices,
    isLoading,
    error,
    activeCode,
    fetchDevices,
    requestPairingCode,
    approvePairing,
    rejectPairing,
    renameDevice,
    removeDevice,
    clearCode,
    clearError,
  } = usePairingStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showPairDialog, setShowPairDialog] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleGenerateCode = async () => {
    if (!newDeviceName.trim()) return;
    try {
      await requestPairingCode(newDeviceName.trim());
      setNewDeviceName('');
    } catch {}
  };

  const handleCopyCode = async () => {
    if (activeCode) {
      await navigator.clipboard.writeText(activeCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renameDevice(id, editName.trim());
    setEditingId(null);
  };

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const p = platform.toLowerCase();
    if (p.includes('win') || p.includes('desktop')) return <Monitor className="w-4 h-4" />;
    if (p.includes('ios') || p.includes('android') || p.includes('mobile'))
      return <Smartphone className="w-4 h-4" />;
    return <Monitor className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Paired Devices</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchDevices} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={showPairDialog} onOpenChange={setShowPairDialog}>
            <DialogTrigger asChild>
              <Button size="sm">Pair New Device</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pair a New Device</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {!activeCode ? (
                  <>
                    <Input
                      placeholder="Device name (e.g., My Phone)"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerateCode()}
                    />
                    <Button
                      onClick={handleGenerateCode}
                      disabled={!newDeviceName.trim() || isLoading}
                      className="w-full"
                    >
                      Generate Pairing Code
                    </Button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-zinc-800 rounded-lg text-center">
                      <p className="text-sm text-zinc-400 mb-2">
                        Share this code with your device:
                      </p>
                      <p className="text-3xl font-mono font-bold tracking-widest text-green-400">
                        {activeCode.code}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Expires at {new Date(activeCode.expiresAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleCopyCode} variant="outline" className="flex-1">
                        {copied ? (
                          <Check className="w-4 h-4 mr-1" />
                        ) : (
                          <Copy className="w-4 h-4 mr-1" />
                        )}
                        {copied ? 'Copied!' : 'Copy Code'}
                      </Button>
                      <Button onClick={clearCode} variant="ghost" className="flex-1">
                        Generate New
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-500 text-center">
                      Open the Echo Companion app and enter this code, or scan the QR code from the
                      app.
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No devices paired yet</p>
          <p className="text-sm">Click "Pair New Device" above to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device: PairedDevice) => (
            <Card key={device.id} className="bg-zinc-900 border-zinc-800">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={device.platform} />
                  <div>
                    {editingId === device.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(device.id)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRename(device.id)}
                          className="h-8 w-8"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-8 w-8"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{device.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {device.platform}
                        </Badge>
                      </div>
                    )}
                    <p className="text-xs text-zinc-500">
                      Last used: {new Date(device.lastUsedAt).toLocaleDateString()}
                      {device.lastIp && ` · IP: ${device.lastIp}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!editingId && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(device.id);
                          setEditName(device.name);
                        }}
                        className="h-8 w-8"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeDevice(device.id)}
                        className="h-8 w-8 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
