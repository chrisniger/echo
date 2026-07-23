import type { ChatMessage, ImageContentPart, TextContentPart } from '@echo-gpt/shared-types';
import { contentToString, isContentArray } from '@echo-gpt/shared-types';

/**
 * Parsed payload from a base64 data URL — the canonical form Claude and
 * Gemini both accept in their vision payloads (`media_type`,
 * `mimeType` + `data` respectively).
 */
export interface ParsedImage {
  mimeType: string;
  base64: string;
}

const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/;

/**
 * Pull the mime type and base64 bytes out of a `data:` URL. Returns null
 * for remote https URLs (which Claude cannot consume inline and Gemini
 * would 400 on as inlineData). Callers convert those into a text
 * placeholder rather than fetching+re-encoding at runtime (avoids SSRF
 * and gateway-side latency spikes).
 *
 * Known limitation: RFC 2397 parameterised mediatypes such as
 * `data:text/plain;charset=utf-8;base64,…` are rejected — the pattern
 * only matches the simple `data:<mime>;base64,<b64>` shape that OpenAI's
 * image_url emits in practice. A hostile or non-conformant input
 * silently falls back to the text placeholder rather than crashing.
 */
export function extractDataUrl(url: string): ParsedImage | null {
  const match = DATA_URL_PATTERN.exec(url);
  if (!match) return null;
  return { mimeType: match[1]!, base64: match[2]! };
}

/** Gemini parts emitted by `buildGeminiParts`. */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Anthropic content blocks emitted by `buildAnthropicMessages`. */
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    };

/** Anthropic messages emitted by `buildAnthropicMessages`. */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/* ------------------------------------------------------------------------ */
/* Gemini transform                                                          */
/* ------------------------------------------------------------------------ */

const SYSTEM_INSTRUCTION_PREFIX = '[System Instruction]:';

/** Convert a single ContentPart into one or more Gemini parts (preserves order). */
function toGeminiPartsForArray(parts: Array<TextContentPart | ImageContentPart>): GeminiPart[] {
  const out: GeminiPart[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      out.push({ text: part.text });
      continue;
    }
    // image_url
    const extracted = extractDataUrl(part.image_url.url);
    if (extracted) {
      out.push({
        inlineData: { mimeType: extracted.mimeType, data: extracted.base64 },
      });
      continue;
    }
    out.push({ text: `[Image: ${part.image_url.url}]` });
  }
  return out;
}

/**
 * Flatten a ChatMessage[] into the Gemini `contents[].parts` shape.
 *
 *  - system role → emitted first per message with the `SYSTEM_INSTRUCTION_PREFIX` so
 *    Gemini knows it is a directive rather than user content.
 *  - string content → emitted as a single `{ text }` part (no behavioural change).
 *  - array content → parts are emitted in the order they appear in the
 *    input (text-then-image if that's what the caller sent). Anthropic and
 *    OpenAI both honour this ordering, so Gemini does too.
 *
 * Sibling helper to the Gemini provider's `chatStream` and `chat` methods,
 * which both call into this function. Changes here propagate to both code
 * paths automatically.
 */
export function buildGeminiParts(messages: ChatMessage[]): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      parts.push({ text: `${SYSTEM_INSTRUCTION_PREFIX} ${contentToString(m.content)}` });
      continue;
    }
    if (!isContentArray(m.content)) {
      parts.push({ text: m.content });
      continue;
    }
    parts.push(...toGeminiPartsForArray(m.content));
  }
  return parts;
}

/* ------------------------------------------------------------------------ */
/* Anthropic transform                                                       */
/* ------------------------------------------------------------------------ */

function toAnthropicBlocksForArray(
  parts: Array<TextContentPart | ImageContentPart>,
): AnthropicContentBlock[] {
  const out: AnthropicContentBlock[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      out.push({ type: 'text', text: part.text });
      continue;
    }
    const extracted = extractDataUrl(part.image_url.url);
    if (extracted) {
      out.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: extracted.mimeType,
          data: extracted.base64,
        },
      });
      continue;
    }
    out.push({ type: 'text', text: `[Image: ${part.image_url.url}]` });
  }
  return out;
}

/**
 * Flatten a ChatMessage[] into the Anthropic `messages` shape.
 *
 *  - system role → DROPPED from the returned array. Anthropic exposes
 *    system instructions as a top-level `body.system` field; the provider
 *    class attaches it from `ChatRequest.messages` directly. Returning it
 *    here would duplicate the directive in the request body.
 *  - string content → emitted as-is (same behaviour as before Phase 2).
 *  - array content → emitted as a content-block array, order preserved.
 *  - system role content is intentionally scalar/text-only here; the
 *    caller funnels it through `contentToString` so even an image part
 *    on a system message degrades to a `[Image: <url>]` text fragment
 *    today. Multimodal system directives (e.g. "always look at this
 *    reference image") land in Phase 6.
 */
export function buildAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (!isContentArray(m.content)) {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    out.push({
      role: m.role,
      content: toAnthropicBlocksForArray(m.content),
    });
  }
  return out;
}
