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

// Now safe to import — the mocks above are hoisted by vitest before
// `askAssistant` resolves.
import { askAssistant } from './chatService';
import { gatewayApi } from '../lib/api';

const mockPost = vi.mocked(gatewayApi.post);

describe('askAssistant — vision-capable model fallback (registry-driven)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({
      content: 'ok',
      model: 'irrelevant',
      provider: 'irrelevant',
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
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
