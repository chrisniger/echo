import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Monitor, Smartphone, Trash2, Edit3, Check, X, RefreshCw, Copy, Link } from 'lucide-react';
import QRCode from 'qrcode';
import { usePairingStore, type PairedDevice } from '../stores/pairing';
import { Card, CardContent } from './ui/card';
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
    pendingPairings,
    fetchDevices,
    fetchPendingPairings,
    requestPairingCode,
    approvePairing,
    rejectPairing,
    verifyPairingCode,
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
  const [phoneCode, setPhoneCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchDevices();
    fetchPendingPairings();
    const interval = setInterval(fetchPendingPairings, 5000);
    return () => clearInterval(interval);
  }, [fetchDevices, fetchPendingPairings]);

  // Generate a QR code whenever a pairing code is active. The payload encodes
  // the 6-character code plus the Cloud API URL so the companion can connect
  // without manual IP entry. We only use VITE_CLOUD_API_URL; falling back to
  // window.location.origin would point the companion at the Vite dev server.
  useEffect(() => {
    if (!activeCode) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    const buildPayload = async () => {
      const cloudBase = import.meta.env.VITE_CLOUD_API_URL as string | undefined;
      const payloadMap: Record<string, string> = { code: activeCode.code };

      if (cloudBase && !cloudBase.includes('localhost') && !cloudBase.includes('127.0.0.1')) {
        payloadMap.serverUrl = cloudBase.replace(/\/$/, '');
      } else {
        // The desktop is running against a localhost Cloud API, but phones
        // cannot reach localhost on the PC. Ask Tauri for the real LAN IP so
        // the companion can connect to the same machine.
        try {
          const localIp = await invoke<string>('get_local_ip');
          const portMatch = cloudBase?.match(/:(\d+)/);
          const port = portMatch ? portMatch[1] : '4000';
          payloadMap.serverUrl = `http://${localIp}:${port}`;
        } catch {
          // If we cannot determine the LAN IP, omit serverUrl and let the
          // companion discover the server with network discovery.
        }
      }

      const payload = JSON.stringify(payloadMap);
      const url = await QRCode.toDataURL(payload, { width: 240, margin: 2 });
      if (!cancelled) setQrDataUrl(url);
    };

    buildPayload();
    return () => {
      cancelled = true;
    };
  }, [activeCode]);

  const handleGenerateCode = async () => {
    if (!newDeviceName.trim()) return;
    try {
      await requestPairingCode(newDeviceName.trim());
      setNewDeviceName('');
      await fetchPendingPairings();
    } catch {}
  };

  const handleCopyCode = async () => {
    if (activeCode) {
      await navigator.clipboard.writeText(activeCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEnterPhoneCode = async () => {
    const code = phoneCode.trim().toUpperCase();
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      const result = await verifyPairingCode(code);
      if (result.token) {
        await approvePairing(result.token);
        setPhoneCode('');
        setShowPairDialog(false);
      }
    } catch {}
    setVerifying(false);
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchDevices();
              fetchPendingPairings();
            }}
            disabled={isLoading}
          >
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
                    <div className="space-y-3">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Option 1: Generate a code from desktop
                      </p>
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
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-zinc-300 dark:border-zinc-700" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-zinc-950 px-2 text-zinc-500">Or</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Option 2: Enter code from phone
                      </p>
                      <Input
                        placeholder="Enter 6-character code"
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleEnterPhoneCode()}
                        maxLength={6}
                        className="font-mono text-center text-lg tracking-widest"
                      />
                      <Button
                        onClick={handleEnterPhoneCode}
                        disabled={phoneCode.length !== 6 || verifying}
                        className="w-full"
                      >
                        {verifying ? 'Verifying...' : 'Pair with Code'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-center">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                        Share this code with your device:
                      </p>
                      <p className="text-3xl font-mono font-bold tracking-widest text-green-400">
                        {activeCode.code}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Expires at {new Date(activeCode.expiresAt).toLocaleTimeString()}
                      </p>
                    </div>
                    {qrDataUrl && (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={qrDataUrl}
                          alt="QR code for companion pairing"
                          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white p-2"
                          width={240}
                          height={240}
                        />
                        <p className="text-xs text-zinc-500">Scan with Echo Companion</p>
                      </div>
                    )}
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
                      Open the Echo Companion app and scan the QR code, or enter the 6-character
                      code manually.
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

      {pendingPairings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Pending Requests</h4>
          {pendingPairings.map((pairing) => (
            <Card key={pairing.id} className="bg-yellow-900/20 border-yellow-800/50">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Link className="w-4 h-4 text-yellow-500" />
                  <div>
                    <span className="font-medium">{pairing.deviceName}</span>
                    <Badge variant="outline" className="text-xs ml-2">
                      {pairing.platform}
                    </Badge>
                    <p className="text-xs text-zinc-500">
                      Code: <span className="font-mono">{pairing.code}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => approvePairing(pairing.token)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => rejectPairing(pairing.token)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
            <Card
              key={device.id}
              className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            >
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
