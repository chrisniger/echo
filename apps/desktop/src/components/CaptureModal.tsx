import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AiModel } from '@echo-gpt/shared-types';
import { screenshotService, type ScreenshotResult } from '../services/screenshot';
import { askAssistant } from '../services/chatService';
import { useSessionStore } from '../stores/session';
import { downscaleCanvas } from '../services/imageDownscaler';
import { getVisionDetail } from '@echo-gpt/shared-config';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

interface CaptureModalProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Quick-capture dialog opened from the Camera icon on the SessionDetail
 * tabs row. One click → screenshotService.captureScreenshot → preview.
 *
 * Why a modal instead of reusing the inline ScreenshotCapture tab:
 *  - The tab row's Camera icon is a SHORTCUT, not a replacement. The
 *    inline Capture tab (with AudioCaptureControls + the full capture
 *    UI) still exists for power-users that want the verbose flow.
 *  - Putting the whole editor behind a Dialog makes the single-click
 *    capture → analyze path feel like a focused task with no scroll
 *    context-switch to the main page.
 *
 * Phase 6 preview rendering goes through convertFileSrc(path) (asset://
 * protocol) — see the ScreenshotCapture.tsx header for the rust-side
 * rationale. cropToCanvas still uses `<img>.naturalWidth/Height + ctx
 * .drawImage`, which works equally for asset:// URLs.
 */
export default function CaptureModal({ sessionId, open, onOpenChange }: CaptureModalProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<ScreenshotResult | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);
  // Phase 6 race fix — see ScreenshotCapture.tsx for the same guard.
  const [imageLoaded, setImageLoaded] = useState(false);

  const currentSession = useSessionStore((state) => state.currentSession);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const runCapture = useCallback(() => {
    setIsCapturing(true);
    setError(null);
    setSelection(null);
    setImageLoaded(false);
    screenshotService
      .captureScreenshot()
      .then((result) => {
        setLastScreenshot(result);
        setIsCapturing(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to capture screenshot');
        setIsCapturing(false);
      });
  }, []);

  // Auto-capture whenever the dialog mounts open (i.e. when the user
  // clicked the Camera shortcut). We deliberately do NOT auto-capture
  // each time `onOpenChange(true)` fires — the parent component is the
  // single source of truth for whether the dialog is open.
  useEffect(() => {
    if (!open) return;
    if (lastScreenshot) return; // already captured during this open session
    runCapture();
  }, [open, lastScreenshot, runCapture]);

  // Reset state on close so a subsequent open starts clean.
  useEffect(() => {
    if (open) return;
    setLastScreenshot(null);
    setSelection(null);
    setError(null);
    setIsCapturing(false);
    setIsAnalyzing(false);
    setImageLoaded(false);
  }, [open]);

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
    // imageLoaded dependency: synchronizes the displayScale recompute
    // with the <img> bitmap having decoded. Without imageLoaded, the
    // first effect run captured `clientWidth = 0` (image hadn't laid
    // out yet under the asset:// URL) and set displayScale to 0,
    // causing the indigo selection overlay to render at `0px` and
    // vanish while the drag handlers still set selection state
    // invisibly. See ScreenshotCapture.tsx for the longer write-up.
  }, [lastScreenshot, imageLoaded]);

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

  const cropToCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!lastScreenshot || !selection || selection.width < 2 || selection.height < 2) {
      return null;
    }
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
    return canvas;
  }, [lastScreenshot, selection]);

  const buildDownscaledDataUrl = useCallback(async (): Promise<string | null> => {
    const canvas = cropToCanvas();
    if (!canvas || !currentSession) return null;
    const detail = getVisionDetail(currentSession.aiModel as AiModel);
    return downscaleCanvas(canvas, detail);
  }, [cropToCanvas, currentSession]);

  const handleAnalyze = async () => {
    if (!currentSession) {
      setError('No active session');
      return;
    }
    if (!imageLoaded) {
      setError('Screenshot is still loading. Try again in a moment.');
      return;
    }
    const imageBase64 = await buildDownscaledDataUrl();
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
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-indigo-500" />
            Capture Screenshot
          </DialogTitle>
          <DialogDescription>
            {lastScreenshot
              ? 'Drag to select an area, then click Analyze. Enter / Shift+Arrows / Alt / Esc are supported.'
              : isCapturing
                ? 'Capturing the screen…'
                : 'Click the camera icon again to retry if the capture failed.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {isCapturing && !lastScreenshot && (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <Loader2 className="h-5 w-5 mr-2 animate-spin text-indigo-500" />
            Capturing screenshot…
          </div>
        )}

        {lastScreenshot && !isCapturing && (
          <div className="space-y-3">
            <div
              ref={containerRef}
              tabIndex={0}
              role="group"
              aria-label="Screenshot selection area"
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
                src={convertFileSrc(lastScreenshot.path)}
                alt="Screenshot"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageLoaded(false);
                  setError(
                    "Couldn't load the captured screenshot. Try a different window or restart the app.",
                  );
                }}
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
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleAnalyze} disabled={isAnalyzing} className="flex-1">
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Analyze Selection
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={runCapture} disabled={isAnalyzing}>
                <Camera className="h-4 w-4 mr-2" />
                Retake
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
