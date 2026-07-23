import { MAX_IMAGE_BYTES } from '@echo-gpt/shared-types';
import {
  DOWNSCALER_LIMITS,
  encodeStrategyForDetail,
  type EncodingStrategy,
} from '@echo-gpt/shared-config';
import type { VisionDetail } from '@echo-gpt/shared-types';

/**
 * Phase 4.5 — desktop screenshot downscaler.
 *
 * Single producer of `imageBase64` data URLs that ship through the
 * gateway's `/chat` route. Previously canvas.toDataURL('image/png')
 * was emitted raw with no byte-budget enforcement, so a 4K capture
 * could blow past the gateway's 4 MB MAX_IMAGE_BYTES cap and trigger a
 * 502.
 *
 * This service enforces that budget along the `VisionDetail`
 * preference axis exposed by `MODEL_CAPABILITIES`:
 *
 *   detail='high' (flagship VL) → lossless PNG when the source already
 *                                 fits the strategy's dimension cap,
 *                                 otherwise resize within the cap.
 *   detail='auto' (efficient)  → always re-encode as JPEG with the
 *                                 strategy's quality, sized to cap.
 *   detail='low'  (token-economy) → aggressive resize + JPEG quality 0.7.
 *
 * The loop is bounded by `DOWNSCALER_LIMITS.maxAttempts` and degrades
 * gracefully: after the limit, it returns the smallest produced
 * payload (with a `console.warn`).
 */

/** base64-decoded byte count of a data URL payload (everything after the
 *  first `,` in `data:<mime>;base64,…`). Matches the bytes the gateway
 *  sees after stripping the prefix and inverting base64.
 */
export function dataUrlByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1 || !dataUrl.startsWith('data:')) return 0;
  const b64Payload = dataUrl.slice(commaIdx + 1);
  const padding = (b64Payload.match(/=+$/)?.[0].length ?? 0);
  return Math.floor((b64Payload.length * 3) / 4) - padding;
}

export function fitsBudget(dataUrl: string): boolean {
  return dataUrlByteSize(dataUrl) <= MAX_IMAGE_BYTES;
}

/** Returns true when the source exceeds the strategy's pixel cap on at
 *  least one axis. 'high' uses this to keep PNG pass-through when the
 *  source already fits.
 */
export function shouldResize(
  sourceWidth: number,
  sourceHeight: number,
  strategy: EncodingStrategy,
): boolean {
  return sourceWidth > strategy.maxWidth || sourceHeight > strategy.maxHeight;
}

/** Compute target dimensions for a given attempt. Each attempt compounds
 *  the reduction factor: attempt 2 = 0.8² × cap = 64% area; attempt 3 =
 *  0.8³ ≈ 51% area.
 */
export function pickNextDimensions(
  sourceWidth: number,
  sourceHeight: number,
  attempt: number,
  strategy: EncodingStrategy,
): { width: number; height: number } {
  const factor = Math.pow(DOWNSCALER_LIMITS.dimensionReductionFactor, attempt);
  return {
    width: Math.max(1, Math.round(strategy.maxWidth * factor)),
    height: Math.max(1, Math.round(strategy.maxHeight * factor)),
  };
}

/** Compute JPEG quality for an attempt. PNG strategies return null.
 *  Quality monotonically decreases toward `minQuality`.
 */
export function pickNextQuality(
  strategy: EncodingStrategy,
  attempt: number,
): number | null {
  if (strategy.quality === null) return null;
  const raw = strategy.quality - DOWNSCALER_LIMITS.qualityReductionPerAttempt * attempt;
  return Math.max(DOWNSCALER_LIMITS.minQuality, raw);
}

/**
 * DOM facade — runs the strategy loop on a canvas-or-image source.
 * The caller supplies the actual encode lambda so vitest can stub
 * `toDataURL` without standing up a real canvas.
 */
export async function downscaleImage(
  source: HTMLImageElement | HTMLCanvasElement,
  detail: VisionDetail,
  encode: (
    width: number,
    height: number,
    mime: string,
    quality: number | null,
  ) => string,
): Promise<string> {
  const strategy = encodeStrategyForDetail(detail);
  const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  let attempt = 0;
  let lastDataUrl = '';

  for (attempt = 0; attempt < DOWNSCALER_LIMITS.maxAttempts; attempt++) {
    let dims: { width: number; height: number };
    if (attempt === 0 && !shouldResize(sourceWidth, sourceHeight, strategy)) {
      // Source already fits the strategy caps AND no JPEG re-encode is
      // needed (quality === null). Encode at native dimensions so we
      // don't waste pixels upscaling a small screenshot.
      dims = { width: sourceWidth, height: sourceHeight };
    } else {
      dims = pickNextDimensions(sourceWidth, sourceHeight, attempt, strategy);
    }
    const quality = pickNextQuality(strategy, attempt);
    const dataUrl = encode(dims.width, dims.height, strategy.mime, quality);
    lastDataUrl = dataUrl;
    if (fitsBudget(dataUrl)) {
      return dataUrl;
    }
  }

  console.warn(
    `[imageDownscaler] Could not fit under MAX_IMAGE_BYTES after ${DOWNSCALER_LIMITS.maxAttempts} attempts. Final payload: ${dataUrlByteSize(lastDataUrl)} bytes (budget ${MAX_IMAGE_BYTES}). Forwarding anyway.`,
  );
  return lastDataUrl;
}

/**
 * Convenience: downscale a canvas produced by a previous crop step.
 * Short-circuits when the canvas already fits the strategy AND no
 * JPEG re-encode is needed; otherwise creates a sized copy and
 * re-encodes. The short-circuit avoids creating a new canvas (and
 * triggering jsdom's `getContext not implemented` error in tests).
 */
export async function downscaleCanvas(
  canvas: HTMLCanvasElement,
  detail: VisionDetail,
): Promise<string> {
  return downscaleImage(
    canvas,
    detail,
    (width, height, mime, quality) => {
      if (
        canvas.width <= width &&
        canvas.height <= height &&
        quality === null
      ) {
        // Source already fits the strategy's dimension cap AND the
        // strategy is PNG-based (quality === null). Encode at native
        // resolution, no new canvas needed.
        return canvas.toDataURL(mime);
      }
      // Make a sized copy so we don't mutate the caller's canvas.
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (!ctx) return canvas.toDataURL(mime, quality ?? undefined);
      ctx.drawImage(canvas, 0, 0, width, height);
      return quality === null ? out.toDataURL(mime) : out.toDataURL(mime, quality);
    },
  );
}
