import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Camera, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AiModel } from '@echo-gpt/shared-types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { screenshotService, type ScreenshotResult } from '../services/screenshot';
import { askAssistant } from '../services/chatService';
import { useSessionStore } from '../stores/session';
import { downscaleCanvas } from '../services/imageDownscaler';
import { getVisionDetail } from '@echo-gpt/shared-config';

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
  // Phase 6 race fix: track whether the <img> has actually decoded the
  // asset:// URL. Without this guard, `handleAnalyze` was invoked a tick
  // after `setLastScreenshot(result)` and `cropToCanvas`'s
  // `ctx.drawImage(img, ...)` ran against an `<img>` whose
  // `naturalWidth` was still 0 — silently producing a fully-black
  // data URL. `onLoad` flips this to true; `handleAnalyze` short-
  // circuits on false with a clear error toast.
  const [imageLoaded, setImageLoaded] = useState(false);

  const currentSession = useSessionStore((state) => state.currentSession);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const handleCaptureRef = useRef<(() => Promise<void>) | undefined>(undefined);
  // NIT 4 ref-pin: ensure the measurement block runs only on the
  // false→true transition of imageLoaded. The early-return inside the
  // effect resets this to false on any future Retake so the next decode
  // is not skipped. ResizeObserver handles all subsequent container
  // resizes for free, so we do NOT need the effect body to re-run on
  // layout reflows.
  //
  // IMPORTANT: this is intentionally a `useRef`, NOT a `useMemo`. They are
  // not equivalent. `useRef` survives React 19 StrictMode's
  // mount→cleanup→mount cycle and per-dep-change re-runs cleanly;
  // `useMemo` recomputes per render and would re-pin spuriously. Future
  // refactorers: keep this as `useRef`.
  const lastMeasuredLoaded = useRef(false);

  const handleCapture = async () => {
    setIsCapturing(true);
    setError(null);
    setSelection(null);
    try {
      const result = await screenshotService.captureScreenshot();
      setLastScreenshot(result);
      setImageLoaded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture screenshot');
    } finally {
      setIsCapturing(false);
    }
  };

  useLayoutEffect(() => {
    // NIT 4: ref-pin short-circuit. Reset the pin if imageLoaded drops
    // (e.g. Retake before the next onLoad), so the false→true
    // transition that follows reattaches the ResizeObserver cleanly.
    if (!imageLoaded) {
      lastMeasuredLoaded.current = false;
      return;
    }
    if (lastMeasuredLoaded.current) return;
    lastMeasuredLoaded.current = true;

    const measure = () => {
      const img = imageRef.current;
      if (!img || !lastScreenshot) return;
      const renderedWidth = img.clientWidth;
      // NIT 1: defensive fallback. If neither naturalWidth nor the
      // lastScreenshot.width from Rust are populated (which should never
      // happen post-decode — Rust always pushes image.width() — but is
      // possible during early-decoding or after a future Rust regression),
      // we log loudly AND fall back to a 1:1 ratio instead of letting
      // `displayScale = renderedWidth / 0 = NaN` produce a silently-invisible
      // indigo overlay. Loud-on-failure > silent-zero-output so any future
      // regression surfaces in devtools rather than as a UX regression.
      const naturalWidthRaw = img.naturalWidth || lastScreenshot.width;
      if (!naturalWidthRaw) {
        console.warn(
          '[ScreenshotCapture] image has no natural dimensions and lastScreenshot.width is 0; falling back to 1:1 ratio to prevent NaN scale.',
        );
      }
      const naturalWidth = naturalWidthRaw || 1;
      setDisplayScale(renderedWidth / naturalWidth);
    };

    measure();

    // NIT 3: ResizeObserver replaces the brittle window.resize
    // listener. Catches BOTH the asset:// bitmap's eventual natural-
    // size reveal AND any subsequent container-driven resize (dialog
    // resize, devtools toggle, cross-axis layout reflow, screen DPI
    // change, etc.) — none of which the prior listener caught.
    const img = imageRef.current;
    if (!img) return;
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    return () => observer.disconnect();
    // NIT 2: useLayoutEffect commits the scale synchronously before
    // paint so the indigo overlay never flashes as 0px on the first
    // render after a decode. The deps array still tracks imageLoaded
    // so the post-decode measurement runs as soon as <img onLoad>
    // fires; lastScreenshot retake the cycle by flipping imageLoaded
    // back to false first.
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

  /**
   * Phase 4.5: shared crop math — the single source of truth for the
   * cropped canvas. `buildDownscaledDataUrl` consumes the canvas and
   * runs it through `downscaleCanvas` so the byte-budget loop governs
   * the encode. The canvas is reconstructed each call so React's
   * render never sees a stale offscreen reference.
   */
  const cropToCanvas = useCallback((): HTMLCanvasElement | null => {
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
    return canvas;
  }, [lastScreenshot, selection]);

  /**
   * Phase 4.5: register the cropped canvas with the downscaler
   * pipeline. Reads `VisionDetail` from the current session's model
   * via the shared-config registry, runs the budget-controlled
   * (resize × 0.8, halve-quality) loop until the payload fits under
   * `MAX_IMAGE_BYTES`. After `DOWNSCALER_LIMITS.maxAttempts` we
   * degrade gracefully — see `imageDownscaler.ts`.
   *
   * The wrapping in `useCallback` + the dependency array pins the
   * strategy lookup to `currentSession.aiModel`. Detail recomputes
   * per-session so a Mid-session model swap re-runs the next
   * analyze with the right strategy.
   */
  const buildDownscaledDataUrl = useCallback(async (): Promise<string | null> => {
    const canvas = cropToCanvas();
    if (!canvas || !currentSession) return null;
    // `Session.aiModel` is `string` (the persisted column type);
    // `getVisionDetail` expects the `AiModel` literal union. The runtime
    // values are kept in lockstep via the Settings ↔ registry round-trip,
    // so the cast is safe at the call site.
    const detail = getVisionDetail(currentSession.aiModel as AiModel);
    return downscaleCanvas(canvas, detail);
  }, [cropToCanvas, currentSession]);

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
    if (!imageLoaded) {
      setError('Screenshot is still loading. Try again in a moment.');
      return;
    }
    // Phase 4.5: route the canvas through the registry-driven
    // downscaler so the data URL never exceeds MAX_IMAGE_BYTES.
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
              {/*
                Phase 6 display fix: serve the just-saved PNG through
                the Rust `asset://` protocol instead of round-tripping
                a multi-megabyte base64 payload back through the IPC
                bridge. The previous attempt shipped a `data:image/png;
                base64,…` URL produced in-memory, but Tauri's JSON IPC
                silently truncates / stalls WebView2 on payloads >~5 MB
                — a 4K PNG easily exceeds that once base64-encoded, so
                the `<img src>` rendered broken. We now keep the file
                on disk under `~/Pictures/EchoGPT/screenshots/` (the
                Rust side already writes it) and let Tauri's asset
                protocol serve it via `convertFileSrc(path)`. Scope is
                declared in tauri.conf.json → `assetProtocol.scope`,
                CSP `img-src asset:` already permits it. `path` is
                still preserved on ScreenshotResult so a future
                "Open in Finder / Explorer" button can shell.open() it.
              */}
              <img
                ref={imageRef}
                src={convertFileSrc(lastScreenshot.path)}
                alt="Screenshot"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageLoaded(false);
                  setError(
                    'Failed to render the saved screenshot. Check that Tauri has the asset:// scope configured for this path.',
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
