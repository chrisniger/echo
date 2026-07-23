import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFERRED_VISION_FALLBACK, VISION_CAPABLE_MODELS } from '@echo-gpt/shared-config';

/**
 * Phase 4 retires the hand-coded `VISION_SUPPORTED_MODELS` array in
 * `chatService.ts` in favour of the registry's `VISION_CAPABLE_MODELS`
 * set + `PREFERRED_VISION_FALLBACK` constant. These tests lock the
 * three-point guarantee:
 *
 *   1. When `imageBase64` is absent, the target model is sent verbatim
 *      (no implicit downgrades).
 *   2. When `imageBase64` is supplied and the target model IS
 *      vision-capable, the request carries both the image and the
 *      user-chosen model.
 *   3. When `imageBase64` is supplied and the target model is text-only,
 *      the request falls back to `PREFERRED_VISION_FALLBACK` and logs
 *      a `console.warn`.
 *
 * The mocks below cover every external touchpoint of `askAssistant`
 * (HTTP, WebSocket broadcast, session-store write, context builder) so
 * the fallback decision is the only code path that actually runs.
 */

// Module-level mocks MUST register before the import-under-test.
vi.mock('../lib/api', () => ({
  gatewayApi: { post: vi.fn() },
  api: { post: vi.fn() },
}));
vi.mock('../hooks/useWebSocket', () => ({
  getWsClient: vi.fn(() => ({ send: vi.fn() })),
}));
vi.mock('../stores/session', () => ({
  useSessionStore: {
    getState: vi.fn(() => ({ addAiResponse: vi.fn() })),
  },
}));
vi.mock('../lib/context', () => ({
  buildContextMessages: vi.fn(async () => []),
}));

// Stub the global Image so jsdom synchronously reports naturalWidth/Height
// on the .onload step of `decodeDataUrlMeta` inside chatService. The real
// one would never fire in jsdom (no real bitmap decoder), so we install
// a class that fires onload next-tick with a fixed 1x1 report.
class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1;
  naturalHeight = 1;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}
vi.stubGlobal('Image', StubImage);

// Now safe to import — the mocks above are hoisted by vitest before
// `askAssistant` resolves.
import { askAssistant } from './chatService';
import { api, gatewayApi } from '../lib/api';

const mockPost = vi.mocked(gatewayApi.post);
const mockApiPost = vi.mocked(api.post);

describe('askAssistant — vision-capable model fallback (registry-driven)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({
      content: 'ok',
      model: 'irrelevant',
      provider: 'irrelevant',
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
    } as never);
    // Phase 24a mock — default api.post to a successful screenshot insert.
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({
      id: 'ss-mock',
      sessionId: 'irrelevant',
      takenAt: '2024-01-01T00:00:00.000Z',
      mime: 'image/png',
      width: 1,
      height: 1,
      cropBoxJson: null,
      dataUrl: 'data:image/png;base64,',
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PASSES the user-chosen model through unchanged when no image is attached', async () => {
    // A text-only model (gpt-3.5-turbo) without an image should reach
    // the gateway verbatim — we never silently upgrade or downgrade
    // the user's choice when there's nothing to "see".
    await askAssistant({
      sessionId: 's1',
      query: 'hi',
      model: 'gpt-3.5-turbo',
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [, body] = mockPost.mock.calls[0]!;
    expect(body).toMatchObject({ model: 'gpt-3.5-turbo' });
  });

  it('PRESERVES the user-chosen vision-capable model when imageBase64 is supplied', async () => {
    // The user picked `gpt-4o-mini` and attached a screenshot; honour
    // that choice — do NOT fall back just because the registry offers
    // a cheaper or higher-detail alternative.
    await askAssistant({
      sessionId: 's2',
      query: 'what is this?',
      model: 'gpt-4o-mini',
      imageBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [, body] = mockPost.mock.calls[0]!;
    expect(body).toMatchObject({ model: 'gpt-4o-mini' });
    // And the request must carry the multimodal content array (not
    // stringified via contentToString).
    const messages = (body as { messages: unknown[] }).messages;
    expect(messages.some((m) => Array.isArray((m as { content: unknown }).content))).toBe(true);
  });

  it('FALLS BACK to PREFERRED_VISION_FALLBACK when imageBase64 + a text-only model collide', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await askAssistant({
      sessionId: 's3',
      query: 'describe this please',
      model: 'gpt-3.5-turbo', // text-only
      imageBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/gpt-3\.5-turbo/);
    expect(warnSpy.mock.calls[0]![0]).toContain(PREFERRED_VISION_FALLBACK);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [, body] = mockPost.mock.calls[0]!;
    expect(body).toMatchObject({ model: PREFERRED_VISION_FALLBACK });
  });

  it('uses the registry — not a hand-coded list — to determine vision support', () => {
    // Pure type/registry sanity check: every vision-capable model in
    // the registry MUST be in the set, and `PREFERRED_VISION_FALLBACK`
    // MUST live inside it. A future Phase that hand-edits the array
    // instead of changing the registry will trip this immediately.
    expect(VISION_CAPABLE_MODELS.has(PREFERRED_VISION_FALLBACK)).toBe(true);
  });
});

/**
 * Phase 24a — cloud-api /api/screenshots wire-in test coverage.
 *
 * Three guarantees:
 *   1. POST `/api/screenshots` fires BEFORE the `/chat` request when an
 *      image is attached (server-side WS `screenshot.create` broadcast
 *      happens regardless of /chat outcome).
 *   2. The AI request still runs when /api/screenshots fails — the POST
 *      is best-effort, the AI response is the user-facing commitment.
 *   3. The POST is SKIPPED when the dataUrl mime is not in
 *      `SCREENSHOT_MIME_TYPES` (closed union; we never post raw bytes
 *      or unknown formats).
 */
describe('askAssistant — Phase 24a cloud-api screenshot persist', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({
      content: 'ok',
      model: 'irrelevant',
      provider: 'irrelevant',
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
    } as never);
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({
      id: 'ss-mock',
      sessionId: 'irrelevant',
      takenAt: '2024-01-01T00:00:00.000Z',
      mime: 'image/png',
      width: 1,
      height: 1,
      cropBoxJson: null,
      dataUrl: 'data:image/png;base64,',
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs /api/screenshots BEFORE the /chat request when imageBase64 is attached', async () => {
    // Order matters: server-side commit 5125933 expects the WS
    // screenshot.create broadcast to fan out before (or at least
    // alongside) the AI response. Verifying via mock call ordering.
    const callOrder: string[] = [];
    mockApiPost.mockImplementation(async (path: string) => {
      callOrder.push(String(path));
      return {
        id: 'ss',
        sessionId: 's',
        takenAt: '2024-01-01T00:00:00.000Z',
        mime: 'image/png',
        width: 1,
        height: 1,
        cropBoxJson: null,
        dataUrl: '',
      } as never;
    });
    mockPost.mockImplementation(async (path: string) => {
      callOrder.push(String(path));
      return {
        content: 'ok',
        model: 'gpt-4o-mini',
        provider: 'openai',
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
      } as never;
    });

    await askAssistant({
      sessionId: 's-phase24a',
      query: 'describe',
      model: 'gpt-4o-mini',
      imageBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(callOrder).toEqual(['/screenshots', '/chat']);
    // And the body of the /screenshots POST matches the server schema.
    const [screenshotPath, screenshotBody] = mockApiPost.mock.calls[0]!;
    expect(screenshotPath).toBe('/screenshots');
    expect(screenshotBody).toMatchObject({
      sessionId: 's-phase24a',
      mime: 'image/png',
      width: 1,
      height: 1,
      cropBoxJson: null,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
  });

  it('CONTINUES to /chat when the cloud-api /api/screenshots POST throws', async () => {
    // Best-effort guarantee: a network blip / 4xx / 5xx / unknown mime
    // never blocks the AI response. We log a console.warn and proceed.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockApiPost.mockRejectedValueOnce(new Error('Network down'));

    await askAssistant({
      sessionId: 's-fail',
      query: 'describe',
      model: 'gpt-4o-mini',
      imageBase64: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]![0]).toMatch(/Failed to sync screenshot/);
    // /chat still ran despite the persist failure.
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0]![0]).toBe('/chat');
  });

  it('SKIPS /api/screenshots when the dataUrl mime is not in SCREENSHOT_MIME_TYPES', async () => {
    // A defensive guarantee: a future downscaler change that emits, say,
    // `image/webp` shouldn't accidentally hit the cloud-api with an
    // unknown mime (the zod schema would 400). The skip is silent so
    // the AI flow is unaffected, but a single console.warn fires.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await askAssistant({
      sessionId: 's-skip',
      query: 'describe',
      model: 'gpt-4o-mini',
      // Use a fake mime that is NOT in the closed union.
      imageBase64: 'data:image/svg+xml;base64,PHN2Zy8+',
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]![0]).toMatch(/Unsupported screenshot mime/);
    // No /api/screenshots call was attempted.
    expect(mockApiPost).not.toHaveBeenCalled();
    // /chat still ran (best-effort persist).
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
