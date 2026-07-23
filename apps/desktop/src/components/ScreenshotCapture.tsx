import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { screenshotService, type ScreenshotResult } from '../services/screenshot';
import { askAssistant } from '../services/chatService';
import { useSessionStore } from '../stores/session';

interface ScreenshotCaptureProps {
  sessionId: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function ScreenshotCapture({ sessionId }: ScreenshotCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<ScreenshotResult | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);

  const currentSession = useSessionStore((state) => state.currentSession);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const handleCaptureRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const handleCapture = async () => {
    setIsCapturing(true);
    setError(null);
    setSelection(null);
    try {
      const result = await screenshotService.captureScreenshot();
      setLastScreenshot(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture screenshot');
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    const updateScale = () => {
      const img = imageRef.current;
      if (!img || !lastScreenshot) return;
      const renderedWidth = img.clientWidth;
      const naturalWidth = img.naturalWidth || lastScreenshot.width;
      setDisplayScale(renderedWidth / naturalWidth);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [lastScreenshot]);

  const getImageCoordinates = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ): { x: number; y: number } | null => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return null;
    const rect = container.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    let clientX: number;
    let clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return null;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startSelection = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!lastScreenshot) return;
    const coords = getImageCoordinates(e);
    if (!coords) return;
    dragStart.current = coords;
    setSelection({ x: coords.x, y: coords.y, width: 0, height: 0 });
  };

  const updateSelection = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!dragStart.current || !selection) return;
    const coords = getImageCoordinates(e);
    if (!coords) return;
    const x = Math.min(dragStart.current.x, coords.x);
    const y = Math.min(dragStart.current.y, coords.y);
    const width = Math.abs(coords.x - dragStart.current.x);
    const height = Math.abs(coords.y - dragStart.current.y);
    setSelection({ x, y, width, height });
  };

  const endSelection = () => {
    dragStart.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startSelection(e);
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    updateSelection(e);
  };
  const handleMouseUp = () => endSelection();

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => startSelection(e);
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => updateSelection(e);
  const handleTouchEnd = () => endSelection();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!lastScreenshot) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selection && selection.width >= 2 && selection.height >= 2) {
        void handleAnalyze();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setSelection(null);
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    e.preventDefault();

    const img = imageRef.current;
    if (!img) return;

    const naturalWidth = img.naturalWidth || lastScreenshot.width;
    const naturalHeight = img.naturalHeight || lastScreenshot.height;
    const step = e.altKey ? 5 : 20;
    const isResize = e.shiftKey;
    const key = e.key;

    setSelection((prev) => {
      if (!prev) {
        const defaultWidth = naturalWidth * 0.2;
        const defaultHeight = naturalHeight * 0.2;
        return {
          x: (naturalWidth - defaultWidth) / 2,
          y: (naturalHeight - defaultHeight) / 2,
          width: defaultWidth,
          height: defaultHeight,
        };
      }

      let { x, y, width, height } = prev;

      if (isResize) {
        if (key === 'ArrowUp') height = Math.max(2, height - step);
        if (key === 'ArrowDown') height = Math.min(naturalHeight - y, height + step);
        if (key === 'ArrowLeft') width = Math.max(2, width - step);
        if (key === 'ArrowRight') width = Math.min(naturalWidth - x, width + step);
      } else {
        if (key === 'ArrowUp') y = Math.max(0, y - step);
        if (key === 'ArrowDown') y = Math.min(naturalHeight - height, y + step);
        if (key === 'ArrowLeft') x = Math.max(0, x - step);
        if (key === 'ArrowRight') x = Math.min(naturalWidth - width, x + step);
      }

      return { x, y, width, height };
    });
  };

  const cropToBase64 = useCallback((): string | null => {
    if (!lastScreenshot || !selection || selection.width < 2 || selection.height < 2) return null;
    const img = imageRef.current;
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(selection.width);
    canvas.height = Math.round(selection.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      img,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height,
    );
    return canvas.toDataURL('image/png');
  }, [lastScreenshot, selection]);

  // Keep a live ref to the capture function so the global event listener
  // always invokes the latest closure without re-registering on every render.
  handleCaptureRef.current = handleCapture;

  // Attach non-passive native touch listeners to prevent the browser from
  // scrolling/zooming while the user is drawing a selection on a touchscreen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventDefault = (e: TouchEvent) => {
      e.preventDefault();
    };

    container.addEventListener('touchstart', preventDefault, { passive: false });
    container.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      container.removeEventListener('touchstart', preventDefault);
      container.removeEventListener('touchmove', preventDefault);
    };
  }, [lastScreenshot]);

  useEffect(() => {
    const handleTrigger = () => {
      // If a screenshot is already open, re-capture so the user gets a fresh
      // frame; otherwise start the first capture.
      handleCaptureRef.current?.();
    };
    window.addEventListener('echo:trigger-screenshot', handleTrigger);
    return () => window.removeEventListener('echo:trigger-screenshot', handleTrigger);
  }, []);

  const handleAnalyze = async () => {
    if (!currentSession) {
      setError('No active session');
      return;
    }
    const imageBase64 = cropToBase64();
    if (!imageBase64) {
      setError('Please select an area first');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      await askAssistant({
        sessionId,
        query: 'Analyze this screenshot and help with anything shown.',
        model: currentSession.aiModel,
        cv: currentSession.cvContent,
        additionalContext: currentSession.additionalContext,
        documents: currentSession.documents,
        language: currentSession.language,
        sessionType: currentSession.sessionType,
        imageBase64,
      });
      setLastScreenshot(null);
      setSelection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze screenshot');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const overlayStyle = selection
    ? {
        left: `${selection.x * displayScale}px`,
        top: `${selection.y * displayScale}px`,
        width: `${selection.width * displayScale}px`,
        height: `${selection.height * displayScale}px`,
      }
    : undefined;

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

        {!lastScreenshot && (
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
            ) : (
              <>
                <Camera className="h-4 w-4 mr-2" />
                Capture Screenshot
              </>
            )}
          </Button>
        )}

        {lastScreenshot && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400" id="screenshot-selection-help">
              Drag to select an area, then click Analyze. Or focus the screenshot area and use arrow
              keys to move, Shift+arrow to resize, Alt+arrow for fine adjustment, Enter to analyze,
              Escape to clear.
            </p>
            <div
              ref={containerRef}
              tabIndex={0}
              role="group"
              aria-label="Screenshot selection area"
              aria-describedby="screenshot-selection-help"
              className="relative inline-block max-w-full cursor-crosshair select-none touch-none rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onKeyDown={handleKeyDown}
            >
              <img
                ref={imageRef}
                src={`file://${lastScreenshot.path}`}
                alt="Screenshot"
                className="max-w-full h-auto rounded-md border border-zinc-300 dark:border-zinc-700"
                draggable={false}
              />
              {selection && (
                <div
                  className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none"
                  style={overlayStyle}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAnalyze} disabled={isAnalyzing} className="flex-1">
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Analyze Selection
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setLastScreenshot(null);
                  setSelection(null);
                }}
                disabled={isAnalyzing}
              >
                <X className="h-4 w-4 mr-2" />
                Retake
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
