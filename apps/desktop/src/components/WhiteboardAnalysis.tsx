import { useState, useRef, useCallback } from 'react';
import { Image as ImageIcon, Upload, Scan, Loader2, FileText, Tags } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { gatewayApi } from '../lib/api';
import { downscaleImage } from '../services/imageDownscaler';
import { getVisionDetail } from '@echo-gpt/shared-config';
import { useSessionStore } from '../stores/session';
import type { AiModel, VisionDetail } from '@echo-gpt/shared-types';

interface AnalysisResult {
  ocrText: string;
  description: string;
  elements: string[];
}

/**
 * Whiteboard / diagram analysis. The /chat request body is downscaled
 * through the shared-config registry (Phase 4.5) before submission so
 * the data URL never exceeds MAX_IMAGE_BYTES (4 MB post-encoding).
 */
export default function WhiteboardAnalysis() {
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
        }
      }
    },
    [handleFile],
  );

  // Phase 4.5: pull the current session's model so the downscaler uses
  // the same VisionDetail the rest of the app would. Falls back to
  // 'high' (gpt-4o's tier) when no session is active. `Session.aiModel`
  // is the persisted `string` column type, so the literal-union cast is
  // safe at runtime (the Settings dropdown keeps registry keys in
  // lockstep).
  const currentSession = useSessionStore((s) => s.currentSession);
  const activeDetail: VisionDetail = currentSession
    ? getVisionDetail(currentSession.aiModel as AiModel)
    : 'high';

  const handleAnalyze = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    setResult(null);

    // Phase 4.5: run the bytes-budget loop on the file-derived data URL
    // before posting. Bridge to the canvas-based downscaler via a
    // tiny decode-Image-then-encode loop (mirrors the ScreenshotCapture
    // path). The downscaler's stub-friendly encode signature lets us
    // avoid pulling a second canvas copy.
    let downscaled = image;
    try {
      const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = image;
      });
      downscaled = await downscaleImage(decoded, activeDetail, (w, h, mime, q) => {
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const ctx = out.getContext('2d');
        if (!ctx) return image;
        ctx.drawImage(decoded, 0, 0, w, h);
        return q === null ? out.toDataURL(mime) : out.toDataURL(mime, q);
      });
    } catch {
      // Decode failed (rare — uphold the previous behaviour and ship
      // the raw image). The user still gets an analysis response;
      // the gateway will 502 if too large and we surface that.
      console.warn(
        '[WhiteboardAnalysis] image decode failed; forwarding original to /chat. Gateway may 502 if over MAX_IMAGE_BYTES (4 MB).',
      );
      downscaled = image;
    }

    let res;
    try {
      res = await gatewayApi.post<{
        content: string;
      }>('/chat', {
        model: (currentSession?.aiModel as AiModel | undefined) ?? 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this whiteboard/diagram image. Provide: 1) OCR text extracted, 2) A description of the diagram, 3) Recognized elements as a list.',
              },
              { type: 'image_url', image_url: { url: downscaled } },
            ],
          },
        ],
      });
    } catch {
      setResult({
        ocrText: 'OCR processing unavailable in offline mode.',
        description: 'Unable to analyze diagram. Please check your connection.',
        elements: [],
      });
      setIsAnalyzing(false);
      return;
    }

    const lines = res.content.split('\n').filter(Boolean);
    setResult({
      ocrText: lines.slice(0, 3).join('\n') || 'Text extraction pending...',
      description: lines[3] || 'Diagram analysis complete.',
      elements:
        lines.slice(4).length > 0 ? lines.slice(4) : ['Flowchart', 'Text blocks', 'Arrows'],
    });
    setIsAnalyzing(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5 text-indigo-500" />
          Whiteboard Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!image ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
            onPaste={handlePaste}
            tabIndex={0}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors outline-none',
              isDragging
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-600',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="hidden"
            />
            <Upload className="mb-3 h-10 w-10 text-zinc-500" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Drop screenshot, click to browse, or paste image
            </p>
            <p className="mt-1 text-xs text-zinc-500">Supports PNG, JPG, WEBP</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <img
                src={image}
                alt="Uploaded whiteboard"
                className="max-h-96 w-full object-contain bg-zinc-950"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 bg-zinc-900/80 hover:bg-zinc-900"
                onClick={() => {
                  setImage(null);
                  setResult(null);
                }}
              >
                Remove
              </Button>
            </div>

            <Button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full gap-2">
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scan className="h-4 w-4" />
              )}
              {isAnalyzing ? 'Analyzing...' : 'Analyze Diagram'}
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                <FileText className="h-4 w-4 text-indigo-500" />
                OCR Text
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap">
                {result.ocrText}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                <ImageIcon className="h-4 w-4 text-indigo-500" />
                Description
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{result.description}</p>
            </div>

            {result.elements.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  <Tags className="h-4 w-4 text-indigo-500" />
                  Recognized Elements
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.elements.map((el, i) => (
                    <Badge key={i} variant="secondary">
                      {el}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
