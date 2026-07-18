import { useState } from 'react';
import { Camera, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { screenshotService, type ScreenshotResult, type ScreenshotAnalysis } from '../services/screenshot';
import { useSessionStore } from '../stores/session';

interface ScreenshotCaptureProps {
  sessionId: string;
  onScreenshotCaptured?: (result: ScreenshotResult, analysis?: ScreenshotAnalysis) => void;
}

export default function ScreenshotCapture({ sessionId, onScreenshotCaptured }: ScreenshotCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<ScreenshotResult | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<ScreenshotAnalysis | null>(null);
  
  const addTranscriptSegment = useSessionStore(state => state.addTranscriptSegment);
  const currentSession = useSessionStore(state => state.currentSession);

  const handleCapture = async () => {
    setIsCapturing(true);
    setError(null);
    
    try {
      const result = await screenshotService.captureScreenshot();
      setLastScreenshot(result);
      
      // Automatically analyze the screenshot
      setIsAnalyzing(true);
      const analysis = await screenshotService.analyzeScreenshot(result.path);
      setLastAnalysis(analysis);
      
      // Add to session transcript if we have an active session
      if (currentSession) {
        addTranscriptSegment({
          id: crypto.randomUUID(),
          sessionId: currentSession.id,
          speakerId: 'system',
          speakerLabel: 'Screenshot',
          text: `Screenshot captured: ${analysis.description}`,
          confidence: analysis.confidence,
          startTime: Date.now() / 1000,
          endTime: Date.now() / 1000,
          isEdited: false,
          createdAt: new Date().toISOString(),
        });
      }
      
      onScreenshotCaptured?.(result, analysis);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to capture screenshot';
      setError(errorMessage);
    } finally {
      setIsCapturing(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-indigo-500" />
          Screenshot Capture
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <Button
          onClick={handleCapture}
          disabled={isCapturing || isAnalyzing || !sessionId}
          className="w-full"
        >
          {isCapturing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Capturing...
            </>
          ) : isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" />
              Capture Screenshot
            </>
          )}
        </Button>

        {lastScreenshot && (
          <div className="space-y-3">
            <div className="p-3 bg-zinc-800/50 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Last Capture:</span>
                <Badge variant="outline">{lastScreenshot.width}x{lastScreenshot.height}</Badge>
              </div>
              <p className="text-xs text-zinc-500 truncate">{lastScreenshot.path}</p>
              <p className="text-xs text-zinc-500">{lastScreenshot.timestamp}</p>
            </div>

            {lastAnalysis && (
              <div className="p-3 bg-zinc-800/50 rounded-md space-y-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-medium text-zinc-300">Analysis</span>
                  <Badge variant="outline" className="ml-auto">
                    {Math.round(lastAnalysis.confidence * 100)}% confidence
                  </Badge>
                </div>
                <p className="text-sm text-zinc-300">{lastAnalysis.description}</p>
                {lastAnalysis.objects.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {lastAnalysis.objects.map((obj, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {obj}
                      </Badge>
                    ))}
                  </div>
                )}
                {lastAnalysis.text && (
                  <div className="mt-2 p-2 bg-zinc-900/50 rounded">
                    <p className="text-xs text-zinc-500 mb-1">Detected Text:</p>
                    <p className="text-sm text-zinc-300">{lastAnalysis.text}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
