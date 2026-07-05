import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause, Play, Square, Clock, Activity, FileText, Image } from 'lucide-react';
import { useSessionStore } from '../stores/session';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import Transcript from '../components/Transcript';

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
  } = useSessionStore();

  useEffect(() => {
    if (id) fetchSession(id);
  }, [id, fetchSession]);

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

      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">
            Transcript ({transcript.length})
          </TabsTrigger>
          <TabsTrigger value="responses">
            AI Responses ({aiResponses.length})
          </TabsTrigger>
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="responses" className="space-y-3 mt-4">
          {aiResponses.length > 0 ? (
            aiResponses.map((resp) => (
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
