import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES } from '@echo-gpt/shared-types';
import {
  DOWNSCALER_LIMITS,
  ENCODING_STRATEGIES,
  encodeStrategyForDetail,
} from '@echo-gpt/shared-config';
import {
  dataUrlByteSize,
  downscaleCanvas,
  downscaleImage,
  fitsBudget,
  pickNextDimensions,
  pickNextQuality,
  shouldResize,
} from './imageDownscaler.js';

/**
 * Phase 4.5 lock-tests for the image downscaler.
 *
 * Two layers:
 *   1. Pure math (no DOM): byte counting, dimension/quality iteration,
 *      strategy lookup. These run in jsdom without touching the
 *      document and are the bulk of the contract.
 *   2. DOM wrapper integration: `downscaleImage` and `downscaleCanvas`
 *      are exercised against a stubbed `toDataURL` so we don't need
 *      a real <img>-loader to verify the loop converges.
 */

// ---------- helpers --------------------------------------------------------

const PNG_HEADER = 'data:image/png;base64,';
const JPEG_HEADER = 'data:image/jpeg;base64,';

/** Build a synthetic `data:image/...;base64,...` whose decoded payload
 *  length matches the requested byte count verified by `dataUrlByteSize`.
 *
 * Padding math: base64 encodes 3 source bytes → 4 chars. The LAST 4-char
 * group has 3, 1, or 2 source bytes when `byteLen % 3` is 0, 1, or 2
 * respectively, with '=' chars filling the empty slots:
 *   - remainder 0 → padding ''
 *   - remainder 1 → padding '=='
 *   - remainder 2 → padding '='
 *
 * Earlier Phase 4.5 reviews caught a bug here where this helper produced
 * b64 strings whose length was not divisible by 4 (which is invalid
 * base64). The fix uses `groups = ceil(byteLen/3); b64Chars = groups*4`
 * and pads the LAST group explicitly.
 */
function syntheticDataUrl(byteLen: number, mime: 'png' | 'jpeg' = 'png'): string {
  const prefix = mime === 'png' ? PNG_HEADER : JPEG_HEADER;
  const remainder = byteLen % 3;
  const padding = remainder === 0 ? '' : remainder === 1 ? '==' : '=';
  const groups = Math.ceil(byteLen / 3);
  const b64Chars = groups * 4;
  const fillerCount = b64Chars - padding.length;
  return prefix + 'A'.repeat(fillerCount) + padding;
}

function makeStubSource(width: number, height: number): HTMLImageElement {
  // jsdom doesn't allocate an actual image; the naturalWidth/naturalHeight
  // properties are read-only. We stub them via defineProperty.
  const img = new Image();
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  return img;
}

// ---------- pure math ------------------------------------------------------

describe('dataUrlByteSize()', () => {
  it('returns 0 for malformed data URLs', () => {
    expect(dataUrlByteSize('not-a-data-url')).toBe(0);
    expect(dataUrlByteSize('data:image/png;base64')).toBe(0);
  });

  it('decodes a 1 KB payload to 1024 bytes', () => {
    // 1 KB = 1024 raw bytes; base64 expands by 4/3 → ~1365 chars + padding
    expect(dataUrlByteSize(syntheticDataUrl(1024))).toBe(1024);
  });

  it('matches MAX_IMAGE_BYTES verbatim for a payload at the cap', () => {
    expect(dataUrlByteSize(syntheticDataUrl(MAX_IMAGE_BYTES))).toBe(MAX_IMAGE_BYTES);
    expect(fitsBudget(syntheticDataUrl(MAX_IMAGE_BYTES))).toBe(true);
  });

  it('rejects a payload one byte over the cap', () => {
    const overByOne = syntheticDataUrl(MAX_IMAGE_BYTES + 1);
    expect(dataUrlByteSize(overByOne)).toBe(MAX_IMAGE_BYTES + 1);
    expect(fitsBudget(overByOne)).toBe(false);
  });
});

describe('shouldResize()', () => {
  it('returns false when source fits inside the strategy cap', () => {
    expect(shouldResize(800, 600, ENCODING_STRATEGIES.high)).toBe(false);
    expect(shouldResize(1024, 1024, ENCODING_STRATEGIES.high)).toBe(false);
  });

  it('returns true when source exceeds the strategy cap', () => {
    expect(shouldResize(3000, 2000, ENCODING_STRATEGIES.high)).toBe(true);
    expect(shouldResize(2000, 2000, ENCODING_STRATEGIES.auto)).toBe(true);
  });
});

describe('pickNextDimensions()', () => {
  it('compounds the reduction factor across attempts', () => {
    // Attempt 0: native strategy caps (2048 for high).
    const a0 = pickNextDimensions(4000, 3000, 0, ENCODING_STRATEGIES.high);
    expect(a0).toEqual({ width: 2048, height: 2048 });

    const a1 = pickNextDimensions(4000, 3000, 1, ENCODING_STRATEGIES.high);
    // 0.8 reduction: 2048 × 0.8 ≈ 1638.
    expect(a1.width).toBeLessThan(2048);
    expect(a1.height).toBeLessThan(2048);

    const a2 = pickNextDimensions(4000, 3000, 2, ENCODING_STRATEGIES.high);
    expect(a2.width).toBeLessThan(a1.width);
    expect(a2.height).toBeLessThan(a1.height);
  });

  it('never returns a dimension smaller than 1px', () => {
    // 10 attempts × 0.8 → ridiculously small; clamp at 1.
    for (let i = 0; i < 10; i++) {
      const dims = pickNextDimensions(10000, 10000, i, ENCODING_STRATEGIES.low);
      expect(dims.width).toBeGreaterThanOrEqual(1);
      expect(dims.height).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('pickNextQuality()', () => {
  it('returns null for PNG (lossless) strategies', () => {
    expect(pickNextQuality(ENCODING_STRATEGIES.high, 0)).toBeNull();
    expect(pickNextQuality(ENCODING_STRATEGIES.high, 5)).toBeNull();
  });

  it('monotonically decreases JPEG quality toward the minQuality floor', () => {
    const q0 = pickNextQuality(ENCODING_STRATEGIES.auto, 0)!;
    const q1 = pickNextQuality(ENCODING_STRATEGIES.auto, 1)!;
    const qN = pickNextQuality(ENCODING_STRATEGIES.auto, 99)!;
    expect(q0).toBeGreaterThan(q1);
    expect(q1).toBeGreaterThanOrEqual(DOWNSCALER_LIMITS.minQuality);
    expect(qN).toBe(DOWNSCALER_LIMITS.minQuality);
  });
});

describe('encodeStrategyForDetail()', () => {
  it('returns the registry strategy for every VisionDetail value', () => {
    for (const detail of ['low', 'high', 'auto'] as const) {
      expect(encodeStrategyForDetail(detail)).toEqual(ENCODING_STRATEGIES[detail]);
    }
  });
});

// ---------- DOM wrapper (stubbed) ------------------------------------------

describe('downscaleImage() — DOM wrapper', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns the first encoded data URL that fits the byte budget (no resize needed)', async () => {
    const source = makeStubSource(800, 600);
    const encoderCalls: Array<{ w: number; h: number; mime: string; q: number | null }> = [];
    const encode = (w: number, h: number, mime: string, q: number | null) => {
      encoderCalls.push({ w, h, mime, q });
      // First attempt yields a 100 KB JPEG → fits comfortably.
      return syntheticDataUrl(100_000, mime === 'image/png' ? 'png' : 'jpeg');
    };

    const result = await downscaleImage(source, 'high', encode);

    expect(encoderCalls).toHaveLength(1);
    expect(result.startsWith(PNG_HEADER)).toBe(true);
  });

  it('iterates when initial encode exceeds the budget', async () => {
    // Encode lambda respects the strategy mime so the result's prefix
    // matches the strategy contract (auto → JPEG).
    const source = makeStubSource(4000, 3000);
    let callIdx = 0;
    // Attempt 0: 10 MB > 4 MB → fail.
    // Attempt 1: 5 MB  > 4 MB → fail.
    // Attempt 2: 100 KB < 4 MB → fit.
    const encode = (_w: number, _h: number, mime: string, _q: number | null) => {
      const idx = callIdx++;
      const prefix = mime === 'image/jpeg' ? 'jpeg' : 'png';
      if (idx === 0) return syntheticDataUrl(10 * 1024 * 1024, prefix);
      if (idx === 1) return syntheticDataUrl(5 * 1024 * 1024, prefix);
      return syntheticDataUrl(100_000, prefix);
    };

    const result = await downscaleImage(source, 'auto', encode);

    expect(callIdx).toBe(3);
    expect(result.startsWith(JPEG_HEADER)).toBe(true);
  });

  it('warns and returns the last attempt when budget still exceeds after maxAttempts', async () => {
    const source = makeStubSource(4000, 3000);
    let callIdx = 0;
    const encode = (_w: number, _h: number, mime: string, _q: number | null) => {
      callIdx++;
      // Always over budget; respect mime so we hit JPEG_HEADER on
      // 'auto' strategy.
      const prefix = mime === 'image/jpeg' ? 'jpeg' : 'png';
      return syntheticDataUrl(MAX_IMAGE_BYTES + 1, prefix);
    };

    const result = await downscaleImage(source, 'auto', encode);

    expect(callIdx).toBe(DOWNSCALER_LIMITS.maxAttempts);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(result.startsWith(JPEG_HEADER)).toBe(true);
  });

  it('downscaleCanvas short-circuits when the source already fits the strategy caps (no new canvas)', async () => {
    // Source is 800x600 — fits inside the 'high' strategy cap (2048²).
    // The PNG path skips document.createElement + getContext so the
    // test runs cleanly in jsdom without the `canvas` npm package.
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'width', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'height', { value: 600, configurable: true });
    canvas.toDataURL = vi.fn(() => syntheticDataUrl(100_000, 'png'));

    const result = await downscaleCanvas(canvas, 'high');
    expect(result.startsWith(PNG_HEADER)).toBe(true);
    // toDataURL called exactly once on the source canvas — no
    // second canvas was instantiated.
    expect(canvas.toDataURL).toHaveBeenCalledTimes(1);
  });
});
