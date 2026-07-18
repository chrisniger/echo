import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause, Play, Square, Clock, Activity, FileText, Image, Mic, MicOff, Tag, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { ApiError } from '../lib/api';
import { SESSION_TYPES, isSessionType, type SessionType } from '@echo-gpt/shared-types';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import Transcript from '../components/Transcript';
import AIAssistance from '../components/AIAssistance';
import AudioCaptureControls from '../components/AudioCaptureControls';
import ScreenshotCapture from '../components/ScreenshotCapture';
import SessionExport from '../components/SessionExport';
import { SessionTypeBadge } from '../components/SessionTypeBadge';
import { useSessionBackground } from '../hooks/useSessionBackground';
import { formatTranscriptionInterval } from '../lib/transcriptionIntervals';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../components/ui/dropdown-menu';

const statusLabels: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  paused: 'warning',
  ended: 'secondary',
};

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentSession,
    transcript,
    aiResponses,
    isLoading,
    fetchSession,
    pauseSession,
    resumeSession,
    endSession,
    reclassifySession,
  } = useSessionStore();
  const pushToast = useToastStore((s) => s.pushToast);

  async function handleReclassify(t: SessionType) {
    try {
      await reclassifySession(t);
    } catch (err) {
      let message: string;
      if (err instanceof ApiError) {
        if (err.status === 401) message = "Session expired \u2014 please sign in again.";
        else if (err.status === 404) message = "Session not found.";
        else if (err.status === 409) message = (err.body as any)?.message || "Session can no longer be modified.";
        else if (err.status >= 500) message = "Server error \u2014 please try again in a moment.";
        else message = err.message;
      } else if (err instanceof Error) {
        message = err.message === "Failed to fetch"
          ? "Network error \u2014 check your connection."
          : err.message;
      } else {
        message = "Failed to reclassify session.";
      }
      pushToast({
        title: "Reclassify failed",
        description: message,
        variant: "warning",
        durationMs: 6000,
      });
    }
  }

  const [isListening, setIsListening] = useState(false);
  const [bgCapture, setBgCapture] = useState<{ isCapturing: boolean; source: string; error: string | null }>({
    isCapturing: false,
    source: 'unknown',
    error: null,
  });

  useEffect(() => {
    if (id) fetchSession(id);
  }, [id, fetchSession]);

  const shouldCapture = currentSession?.status === 'active';
  const captureSource = (currentSession?.audioSource as 'microphone' | 'system' | 'mixed') ?? 'system';

  useSessionBackground({
    enabled: shouldCapture,
    source: captureSource,
    transcriptionIntervalMs: currentSession?.transcriptionIntervalMs ?? 5000,
    gatewayUrl: 'http://localhost:4001',
    onCaptureStateChange: setBgCapture,
  });

  useEffect(() => {
    setIsListening(shouldCapture);
  }, [shouldCapture]);

  if (isLoading || !currentSession) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
        <div className="h-96 animate-pulse rounded-lg bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/history')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-100">{currentSession.name}</h1>
              <Badge variant={statusLabels[currentSession.status] || 'secondary'}>
                {currentSession.status}
              </Badge>
              <SessionTypeBadge type={currentSession.sessionType} size="md" />
              {(currentSession.status === "active" || currentSession.status === "paused") && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      aria-label="Reclassify session type"
                    >
                      <Tag className="h-3.5 w-3.5" />
                      <span>Reclassify</span>
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <DropdownMenuLabel className="text-xs uppercase tracking-wider text-zinc-500">
                      Reclassify as…
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {SESSION_TYPES.map((t) => {
                      const isCurrent = t === currentSession.sessionType;
                      return (
                        <DropdownMenuItem
                          key={t}
                          onSelect={() => handleReclassify(t)}
                          className="flex items-center gap-2"
                        >
                          {isCurrent ? (
                            <Check className="h-3.5 w-3.5 flex-none text-emerald-500" />
                          ) : (
                            <span className="h-3.5 w-3.5 flex-none" />
                          )}
                          <span className={isCurrent ? "font-semibold text-zinc-100" : "text-zinc-300"}>
                            {t}
                          </span>
                          {isCurrent && (
                            <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500">
                              current
                            </span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    {SESSION_TYPES.some((t) => !isSessionType(t)) && (
                      <DropdownMenuItem disabled className="text-red-400">
                        <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                        SessionType drift detected
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {isListening && (
                <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-emerald-400">Listening</span>
                </div>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {currentSession.duration}m
              </span>
              <span>{currentSession.aiModel}</span>
              <span>{currentSession.language.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <SessionExport
            session={currentSession}
            transcript={transcript}
            aiResponses={aiResponses}
          />
          {currentSession.status === 'active' && (
            <>
              <Button variant="secondary" size="sm" onClick={pauseSession}>
                <Pause className="mr-1 h-4 w-4" />
                Pause
              </Button>
              <Button variant="destructive" size="sm" onClick={endSession}>
                <Square className="mr-1 h-4 w-4" />
                End
              </Button>
            </>
          )}
          {currentSession.status === 'paused' && (
            <>
              <Button variant="secondary" size="sm" onClick={resumeSession}>
                <Play className="mr-1 h-4 w-4" />
                Resume
              </Button>
              <Button variant="destructive" size="sm" onClick={endSession}>
                <Square className="mr-1 h-4 w-4" />
                End
              </Button>
            </>
          )}
        </div>
      </div>

      {currentSession.status === 'active' && (
        <Card className={`border-emerald-500/20 ${bgCapture.error ? 'bg-red-500/5 border-red-500/30' : 'bg-emerald-500/5'}`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${bgCapture.isCapturing ? 'bg-emerald-500/20' : bgCapture.error ? 'bg-red-500/20' : 'bg-zinc-700/40'}`}>
              {bgCapture.isCapturing ? (
                <Mic className="h-6 w-6 text-emerald-500" />
              ) : (
                <MicOff className={`h-6 w-6 ${bgCapture.error ? 'text-red-500' : 'text-zinc-500'}`} />
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-zinc-100">
                {bgCapture.error
                  ? 'Audio capture failed'
                  : bgCapture.isCapturing
                  ? `Listening (${bgCapture.source})`
                  : 'Starting audio capture…'}
              </p>
              <p className="text-sm text-zinc-400">
                {bgCapture.error
                  ? bgCapture.error
                  : bgCapture.isCapturing
                  ? `Audio is being captured and transcribed every ${formatTranscriptionInterval(currentSession.transcriptionIntervalMs)}.`
                  : 'Warming up audio devices…'}
              </p>
            </div>
            {bgCapture.isCapturing && (
              <div className="flex gap-1">
                <div className="h-8 w-1 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '0ms' }} />
                <div className="h-8 w-1 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '150ms' }} />
                <div className="h-8 w-1 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '300ms' }} />
                <div className="h-8 w-1 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '450ms' }} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">
            Transcript ({transcript.length})
          </TabsTrigger>
          <TabsTrigger value="capture">
            Capture
          </TabsTrigger>
          <TabsTrigger value="responses">
            AI Responses ({aiResponses.length})
          </TabsTrigger>
          <TabsTrigger value="assistant">Assistant</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="space-y-3 mt-4">
          {transcript.length > 0 ? (
            transcript.map((seg) => (
              <Transcript key={seg.id} segment={seg} />
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <Activity className="h-12 w-12 text-zinc-700 mb-3" />
                <p className="text-zinc-400">No transcript segments yet</p>
                {currentSession.status === 'active' && (
                  <p className="mt-2 text-sm text-zinc-500">
                    Transcript will appear here as audio is captured
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="capture" className="mt-4 space-y-4">
          <AudioCaptureControls sessionId={currentSession.id} />
          <ScreenshotCapture
            sessionId={currentSession.id}
            onScreenshotCaptured={(result, analysis) => {
              console.log('Screenshot captured:', result, analysis);
            }}
          />
        </TabsContent>

        <TabsContent value="responses" className="space-y-3 mt-4">
          {aiResponses.length > 0 ? (
            [...aiResponses].reverse().map((resp) => (
              <Card key={resp.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="secondary">{resp.model}</Badge>
                    <Badge variant="outline">{resp.provider}</Badge>
                    <span className="text-xs text-zinc-500">
                      {resp.tokensUsed} tokens
                    </span>
                    <div className="flex-1" />
                    <span className="text-xs text-zinc-500">
                      {new Date(resp.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mb-3 rounded-md bg-zinc-800/50 p-3">
                    <p className="text-xs text-zinc-500 mb-1">Query</p>
                    <p className="text-sm text-zinc-300">{resp.query}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Response</p>
                    <p className="text-sm text-zinc-100 whitespace-pre-wrap">{resp.response}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <Activity className="h-12 w-12 text-zinc-700 mb-3" />
                <p className="text-zinc-400">No AI responses yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assistant" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="h-[600px]">
                <AIAssistance />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Session Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-zinc-500">Status</p>
                  <p className="text-sm text-zinc-300 capitalize">{currentSession.status}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">AI Model</p>
                  <p className="text-sm text-zinc-300">{currentSession.aiModel}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Response Style</p>
                  <p className="text-sm text-zinc-300 capitalize">{currentSession.responseStyle}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Language</p>
                  <p className="text-sm text-zinc-300">{currentSession.language.toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Audio Source</p>
                  <p className="text-sm text-zinc-300 capitalize">{currentSession.audioSource}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Session Type</p>
                  <div className="mt-1">
                    <SessionTypeBadge type={currentSession.sessionType} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Duration</p>
                  <p className="text-sm text-zinc-300">{currentSession.duration} minutes</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Started</p>
                  <p className="text-sm text-zinc-300">{new Date(currentSession.startedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Ended</p>
                  <p className="text-sm text-zinc-300">
                    {currentSession.endedAt ? new Date(currentSession.endedAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              {currentSession.summary && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Summary</p>
                  <p className="text-sm text-zinc-300">{currentSession.summary}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-zinc-500 mb-3">Statistics</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-zinc-800 p-3 text-center">
                    <FileText className="mx-auto mb-1 h-5 w-5 text-indigo-500" />
                    <p className="text-lg font-bold text-zinc-100">{currentSession.transcriptCount}</p>
                    <p className="text-xs text-zinc-500">Transcripts</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800 p-3 text-center">
                    <Activity className="mx-auto mb-1 h-5 w-5 text-emerald-500" />
                    <p className="text-lg font-bold text-zinc-100">{currentSession.aiResponseCount}</p>
                    <p className="text-xs text-zinc-500">Responses</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800 p-3 text-center">
                    <Image className="mx-auto mb-1 h-5 w-5 text-amber-500" />
                    <p className="text-lg font-bold text-zinc-100">{currentSession.screenshotCount}</p>
                    <p className="text-xs text-zinc-500">Screenshots</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
