import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest } from '@echo-gpt/shared-types';
import { DashScopeProvider } from './dashscope.js';

/**
 * Smoke tests for the DashScope provider. We exercise:
 *  1. URL resolution (the OpenAI-compatible endpoint + bearer auth header).
 *  2. Model-id pass-through (no client-side translation map).
 *  3. The non-streaming response shape.
 *  4. The stream extractor (used by both `chatStream` and any future
 *     SSE helpers that route through `BaseProvider.parseSSE`).
 *
 * Network calls are stubbed via `vi.stubGlobal('fetch', …)`. We do not
 * exercise `chatStream` end-to-end here because streaming chunk parsing
 * is already locked by the openai/deepseek/openrouter siblings; the
 * extract-stream-content assertions below are sufficient as a contract.
 */

/**
 * `config.ts` reads `process.env.DASHSCOPE_API_KEY` at module load time
 * (it binds the value into a top-level `const`). That means we have to
 * set the env BEFORE the import graph runs — `beforeEach(vi.stubEnv)`
 * fires too late because the stub happens after `config.dashscope.apiKey`
 * has already been captured. `vi.hoisted` runs synchronously before
 * module evaluation, so config.ts captures the stubbed value as designed.
 *
 * The original value is captured inside this same hoist (BEFORE the
 * mutation) and surfaced via the return value, because a top-level
 * `const ORIGINAL = process.env.X` afterwards would only see the
 * post-stub value, defeating the cleanup. The `afterAll` hook restores
 * the captured original so sibling test files in the same vitest run
 * aren't polluted by the stub.
 *
 * If `config.ts` is ever refactored to lazy-read env on each request,
 * this hoisted block can be removed and `vi.stubEnv` (in beforeEach)
 * can take over.
 */
const { ORIGINAL_DASHSCOPE_API_KEY } = vi.hoisted(() => {
  const original = process.env.DASHSCOPE_API_KEY;
  process.env.DASHSCOPE_API_KEY = 'test-dashscope-key';
  return { ORIGINAL_DASHSCOPE_API_KEY: original };
});

/** Shared so the stub and the assertion cannot drift apart silently. */
const TEST_DASHSCOPE_KEY = 'test-dashscope-key';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAAXRSTlMAQObYZgAAAApJREFUeJxjAAAAAgABz8g15QAAAABJRU5ErkJggg==';

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

afterAll(() => {
  // Restore the env var captured INSIDE the hoisted block (pre-stub)
  // so sibling test files in the same vitest run aren't polluted.
  if (ORIGINAL_DASHSCOPE_API_KEY === undefined) {
    delete process.env.DASHSCOPE_API_KEY;
  } else {
    process.env.DASHSCOPE_API_KEY = ORIGINAL_DASHSCOPE_API_KEY;
  }
});

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: 'qwen2.5-vl-72b-instruct',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  } as ChatRequest;
}

function stubFetchOk(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('DashScopeProvider.identity', () => {
  it('advertises the dashscope provider name and the six Qwen-VL models', () => {
    const p = new DashScopeProvider();
    expect(p.name).toBe('dashscope');
    expect(p.models).toEqual([
      'qwen-vl-max',
      'qwen-vl-plus',
      'qwen2.5-vl-72b-instruct',
      'qwen2.5-vl-7b-instruct',
      'qwen3-vl-235b-a22b-instruct',
      'qwen3-vl-plus',
    ]);
  });
});

describe('DashScopeProvider.chat (non-streaming)', () => {
  it('POSTs to the OpenAI-compatible /chat/completions with Bearer auth', async () => {
    const fetchMock = stubFetchOk({
      id: 'chatcmpl-dashscope-1',
      choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 },
    });

    const p = new DashScopeProvider();
    const response = await p.chat(makeRequest({ model: 'qwen-vl-plus' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TEST_DASHSCOPE_KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('qwen-vl-plus');
    expect(body.stream).toBe(false);

    // Lock the response shape so future DashScope API tweaks surface
    // as test failures instead of silent UI breakage.
    expect(response.provider).toBe('dashscope');
    expect(response.model).toBe('qwen-vl-plus');
    expect(response.content).toBe('hello');
    expect(response.finishReason).toBe('stop');
    expect(response.tokensUsed).toEqual({
      prompt: 11,
      completion: 5,
      total: 16,
    });
  });

  it('passes message content with multimodal image_url parts straight through', async () => {
    const fetchMock = stubFetchOk({
      id: 'chatcmpl-dashscope-2',
      choices: [{ message: { content: 'looks like a pixel' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 8, total_tokens: 108 },
    });

    const p = new DashScopeProvider();
    await p.chat(
      makeRequest({
        model: 'qwen3-vl-235b-a22b-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe this' },
              { type: 'image_url', image_url: { url: PNG_DATA_URL } },
            ],
          },
        ],
      }),
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'describe this' },
      { type: 'image_url', image_url: { url: PNG_DATA_URL } },
    ]);
    // Critical: NO `[Image: …]` stringification — DashScope's compatible
    // mode accepts the OpenAI image_url part shape natively.
    expect(JSON.stringify(body)).not.toContain('[Image:');

    // TODO(Phase 4): once `ImageContentPart.image_url` carries a
    // `detail: VisionDetail` field, extend this test to assert that
    // `body.messages[0].content[1].image_url.detail` is forwarded
    // verbatim. DashScope's OpenAI-compatible mode advertises the
    // OpenAI `image_url.detail` knob; we want lock-tests once the
    // type widens. Today `detail` lives only on `ModelCapabilities`.
  });

  it('surfaces non-2xx as a typed DashScope API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"quota"}', { status: 429 })),
    );
    const p = new DashScopeProvider();
    await expect(p.chat(makeRequest())).rejects.toThrow(/DashScope API error 429/);
  });
});

describe('DashScopeProvider.extractStreamContent', () => {
  // Mirrors OpenAI's stream chunk shape; if DashScope ever diverges this
  // assertion will turn red.
  const p = new DashScopeProvider();

  it('returns the delta content for a normal chunk', () => {
    expect(
      p['extractStreamContent']({
        choices: [{ delta: { content: 'chunk' }, finish_reason: null }],
      }),
    ).toEqual({ content: 'chunk', finishReason: null });
  });

  it('returns null for a chunk with no choices', () => {
    expect(p['extractStreamContent']({ choices: [] })).toBeNull();
  });
});
