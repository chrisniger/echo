import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@echo-gpt/shared-types';
import {
  buildAnthropicMessages,
  buildGeminiParts,
  extractDataUrl,
  type AnthropicContentBlock,
} from './multimodal.js';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAAXRSTlMAQObYZgAAAApJREFUeJxjAAAAAgABz8g15QAAAABJRU5ErkJggg==';
const JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/';
const REMOTE_IMAGE_URL = 'https://example.com/cat.png';
const REMOTE_INVALID_DATA_URL = 'data:image/png;base64,'; // empty base64 is still parseable as data URL pattern
const NON_DATA_INPUT = 'not-a-url';

describe('extractDataUrl', () => {
  it('parses png data URLs into { mimeType, base64 }', () => {
    expect(extractDataUrl(PNG_DATA_URL)).toEqual({
      mimeType: 'image/png',
      base64: expect.any(String),
    });
  });

  it('parses jpeg data URLs', () => {
    expect(extractDataUrl(JPEG_DATA_URL)).toEqual({
      mimeType: 'image/jpeg',
      base64: expect.any(String),
    });
  });

  it('returns null for remote https URLs (Claude/Gemini cannot inline these)', () => {
    expect(extractDataUrl(REMOTE_IMAGE_URL)).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(extractDataUrl('not-a-url')).toBeNull();
    expect(extractDataUrl('data:foo')).toBeNull();
    expect(extractDataUrl('data:image/png;charset=utf-8,foo')).toBeNull();
  });
});

describe('buildGeminiParts', () => {
  it('emits a single { text } part for string content', () => {
    expect(buildGeminiParts([{ role: 'user', content: 'hi' }])).toEqual([{ text: 'hi' }]);
  });

  it('prefixes system role with [System Instruction]: directive', () => {
    expect(
      buildGeminiParts([
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ]),
    ).toEqual([{ text: '[System Instruction]: be brief' }, { text: 'hi' }]);
  });

  it('forwards an ImageContentPart as inlineData with parsed mime + base64', () => {
    const out = buildGeminiParts([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: PNG_DATA_URL } }],
      },
    ]);
    expect(out).toHaveLength(1);
    const part = out[0]!;
    expect(part).toEqual({
      inlineData: { mimeType: 'image/png', data: expect.any(String) },
    });
    // No stringified [Image: ...] leakage
    expect(JSON.stringify(part)).not.toContain('[Image:');
  });

  it('preserves order of mixed text + image parts (caller controls the prefix)', () => {
    expect(
      buildGeminiParts([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this image:' },
            { type: 'image_url', image_url: { url: PNG_DATA_URL } },
          ],
        },
      ]),
    ).toEqual([
      { text: 'describe this image:' },
      { inlineData: { mimeType: 'image/png', data: expect.any(String) } },
    ]);
  });

  it('falls back to [Image: <url>] text part for remote URLs', () => {
    expect(
      buildGeminiParts([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: REMOTE_IMAGE_URL } }],
        },
      ]),
    ).toEqual([{ text: `[Image: ${REMOTE_IMAGE_URL}]` }]);
  });

  it('reduces system role array content via contentToString (system stays text-only)', () => {
    // Confirms that even an exotic system payload with image parts
    // doesn't accidentally emit inlineData in the directive slot.
    const out = buildGeminiParts([
      {
        role: 'system',
        content: [
          { type: 'text', text: 'tone: formal' },
          { type: 'image_url', image_url: { url: PNG_DATA_URL } },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveProperty('text');
    expect(JSON.stringify(out)).not.toContain('inlineData');
  });
});

describe('buildAnthropicMessages', () => {
  it('emits scalar string content for text-only messages', () => {
    expect(buildAnthropicMessages([{ role: 'user', content: 'hi' }])).toEqual([
      { role: 'user', content: 'hi' },
    ]);
  });

  it('drops system role messages (they ride body.system)', () => {
    expect(
      buildAnthropicMessages([
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ]),
    ).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('forwards an ImageContentPart as an image block with media_type + base64', () => {
    const out = buildAnthropicMessages([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: PNG_DATA_URL } }],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toEqual([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: expect.any(String),
        },
      },
    ]);
  });

  it('preserves order of mixed text + image parts', () => {
    const blocks = buildAnthropicMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          { type: 'image_url', image_url: { url: PNG_DATA_URL } },
        ],
      },
    ])[0]!.content as AnthropicContentBlock[];
    expect(blocks[0]).toEqual({ type: 'text', text: 'what is this?' });
    expect(blocks[1]).toMatchObject({ type: 'image' });
  });

  it('falls back to a text block for remote image URLs', () => {
    expect(
      buildAnthropicMessages([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: REMOTE_IMAGE_URL } }],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: `[Image: ${REMOTE_IMAGE_URL}]` }],
      },
    ]);
  });

  it('handles a multi-turn conversation with mixed text-only and multimodal messages', () => {
    expect(
      buildAnthropicMessages([
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'now look:' },
            { type: 'image_url', image_url: { url: PNG_DATA_URL } },
          ],
        },
      ]),
    ).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'now look:' },
          {
            type: 'image',
            source: expect.objectContaining({
              type: 'base64',
              media_type: 'image/png',
            }),
          },
        ],
      },
    ]);
  });
});
