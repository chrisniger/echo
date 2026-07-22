import { useState, useEffect } from 'react';
import { Mic, Volume2, Radio, AlertCircle, Square, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { audioService, type AudioDevice } from '../services/audio';
import type { AudioSource } from '@echo-gpt/shared-types';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import {
  TRANSCRIPTION_INTERVAL_OPTIONS,
  formatTranscriptionInterval,
} from '../lib/transcriptionIntervals';

interface AudioCaptureControlsProps {
  sessionId: string;
}

const AUDIO_SOURCES: {
  value: AudioSource;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: 'system',
    label: 'System Audio',
    icon: <Volume2 className="h-4 w-4" />,
    description: 'PC / interview audio',
  },
  {
    value: 'microphone',
    label: 'Microphone',
    icon: <Mic className="h-4 w-4" />,
    description: 'Your mic only',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    icon: <Radio className="h-4 w-4" />,
    description: 'System + mic together',
  },
];

/**
 * Simplified Capture tab.
 *
 * Was: a manual "Start Recording / Stop and Transcribe" panel that
 *       conflicted with the auto-capture in useSessionBackground and had
 *       a "Stop and Transcribe" bug (the Rust stop_capture drains the
 *       audio buffer, so the immediate transcribe call had nothing to
 *       transcribe and returned an empty error).
 *
 * Now: a pure control panel. Audio capture is handled automatically by
 *       useSessionBackground the moment the session is active. This tab
 *       just lets you:
 *         - see the real-time capture state (read-only, mirror of the
 *           status card at the top of SessionDetail)
 *         - change the audio source mid-session (the engine restarts
 *           capture with the new source on the next effect tick)
 *         - end the session
 *
 * No more Start / Stop buttons. No more transcribe-then-stop race.
 */
// sessionId is currently unused here — the component reads state directly
// from useSessionStore (currentSession, endSession, patchSession). It is kept
// on the props interface so a parent that wants to scope this control's
// behavior to a specific session can pass it later without an API break.
// The `_` prefix silences `@typescript-eslint/no-unused-vars`.
export default function AudioCaptureControls({ sessionId: _sessionId }: AudioCaptureControlsProps) {
  const currentSession = useSessionStore((s) => s.currentSession);
  const setCurrentSessionAudioSource = useSessionStore((s) => s.setCurrentSessionAudioSource);
  const patchSession = useSessionStore((s) => s.patchSession);
  const endSession = useSessionStore((s) => s.endSession);
  const pushToast = useToastStore((s) => s.pushToast);

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [preflight, setPreflight] = useState<{
    hint: string;
    hasDefaultInput: boolean;
    hasDefaultOutput: boolean;
    inputDeviceNames: string[];
    outputDeviceNames: string[];
  } | null>(null);

  useEffect(() => {
    const refresh = async () => {
      const list = await audioService.listAudioDevices();
      setDevices(list);
      const status = await audioService.audioPreflight();
      setPreflight(status);
    };
    void refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, []);

  if (!currentSession) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-zinc-500">
          No active session.
        </CardContent>
      </Card>
    );
  }

  const selectedSource: AudioSource = (currentSession.audioSource ?? 'system') as AudioSource;
  const sessionActive = currentSession.status === 'active';
  const selectedInterval = currentSession.transcriptionIntervalMs ?? 5000;

  const handleSourceChange = (value: string) => {
    const next = value as AudioSource;
    setCurrentSessionAudioSource(next);
  };

  const handleIntervalChange = async (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next) || next === selectedInterval) return;
    try {
      // PATCH /api/sessions/:id so the new cadence is persisted server-side.
      // patchSession is optimistic; useSessionBackground will pick up the new
      // value reactively via its [enabled, transcriptionIntervalMs] effect.
      // A companion or another desktop subscribed to the session room will
      // also receive the broadcast session.updated and converge.
      await patchSession({ transcriptionIntervalMs: next });
    } catch (err) {
      console.error('[AudioCaptureControls] Interval update failed:', err);
      pushToast({
        title: 'Interval not saved',
        description: 'Echo is keeping the previous interval because the server update failed.',
        variant: 'warning',
        durationMs: 6000,
      });
    }
  };

  const handleEndSession = async () => {
    if (!window.confirm('End this session? You will not be able to resume it after ending.'))
      return;
    try {
      await endSession();
    } catch (err) {
      console.error('[AudioCaptureControls] End session failed:', err);
    }
  };

  const inputDevices = devices.filter((d) => d.device_type === 'input');
  const outputDevices = devices.filter((d) => d.device_type === 'output');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {AUDIO_SOURCES.find((s) => s.value === selectedSource)?.icon}
            Audio Source
            {sessionActive ? (
              <Badge variant="default" className="ml-2 bg-emerald-500">
                <span className="animate-pulse mr-1">●</span>
                Live
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">
                {currentSession.status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">
            Audio is captured automatically as long as the session is active. Change the source here
            to switch what Echo listens to; the engine restarts with the new source on the next
            tick.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Source</label>
            <Select
              value={selectedSource}
              onValueChange={handleSourceChange}
              disabled={!sessionActive}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIO_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <div className="flex items-center gap-2">
                      {s.icon}
                      <div className="flex flex-col">
                        <span>{s.label}</span>
                        <span className="text-xs text-zinc-500">{s.description}</span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Transcription Interval</label>
            <Select
              value={String(selectedInterval)}
              onValueChange={handleIntervalChange}
              disabled={currentSession.status === 'ended'}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSCRIPTION_INTERVAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-zinc-500">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">
              Current cadence: {formatTranscriptionInterval(selectedInterval)}.
            </p>
          </div>

          {preflight && (!preflight.hasDefaultInput || !preflight.hasDefaultOutput) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-300 space-y-1">
                <p>{preflight.hint}</p>
                <p className="text-zinc-400">
                  On Windows: Settings → Privacy &amp; security → Microphone → enable "Let desktop
                  apps access your microphone".
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-zinc-400" />
            Detected Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1">Inputs ({inputDevices.length})</p>
            {inputDevices.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No microphone detected</p>
            ) : (
              <ul className="space-y-1">
                {inputDevices.map((d) => (
                  <li key={d.name} className="text-xs text-zinc-300 flex items-center gap-2">
                    <Mic className="h-3 w-3 text-zinc-500" />
                    <span className="truncate">{d.name}</span>
                    {d.is_default && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        Default
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1">
              Outputs ({outputDevices.length})
            </p>
            {outputDevices.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">
                No output detected (loopback unavailable)
              </p>
            ) : (
              <ul className="space-y-1">
                {outputDevices.map((d) => (
                  <li key={d.name} className="text-xs text-zinc-300 flex items-center gap-2">
                    <Volume2 className="h-3 w-3 text-zinc-500" />
                    <span className="truncate">{d.name}</span>
                    {d.is_default && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        Default
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 italic">
            Refreshes automatically every 5 seconds. Audio devices are listed by the OS — pick which
            one to use via the Source dropdown above.
          </p>
        </CardContent>
      </Card>

      {sessionActive && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="pt-6">
            <Button variant="destructive" className="w-full" onClick={handleEndSession}>
              <Square className="h-4 w-4 mr-2" />
              End Session
            </Button>
            <p className="mt-2 text-xs text-zinc-500 text-center">
              Ends the session, stops capture, and saves the transcript.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
