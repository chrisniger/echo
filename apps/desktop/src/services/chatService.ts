import { api, gatewayApi } from '../lib/api';
import { getWsClient } from '../hooks/useWebSocket';
import { useSessionStore } from '../stores/session';
import { buildContextMessages } from '../lib/context';
import {
  SCREENSHOT_MIME_TYPES,
  type AiModel,
  type ChatMessage,
  type ScreenshotMime,
  type SessionType,
} from '@echo-gpt/shared-types';
import { PREFERRED_VISION_FALLBACK, VISION_CAPABLE_MODELS } from '@echo-gpt/shared-config';

/**
 * Default vision-capable model used by the screenshot → /chat pipeline
 * when the user-selected model is text-only (or otherwise outside
 * VISION_CAPABLE_MODELS). Settable via the
 * `VITE_DEFAULT_IMAGE_MODEL` env var (see apps/desktop/.env.example).
 *
 * Contract:
 *   - Unset / empty / whitespace → `PREFERRED_VISION_FALLBACK` (no warn).
 *   - Set + in VISION_CAPABLE_MODELS → that model (no warn).
 *   - Set + NOT in VISION_CAPABLE_MODELS (typo / non-vision model) →
 *     `PREFERRED_VISION_FALLBACK` + a single console.warn so the
 *     operator notices.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so this runs
 * once at module load with the bundled string. Per-call reads would
 * add no actual flexibility since swaps at runtime have no effect.
 */
const _rawDefaultImageModel = (import.meta.env.VITE_DEFAULT_IMAGE_MODEL ?? '').trim();
export const DEFAULT_IMAGE_MODEL: AiModel = (() => {
  if (_rawDefaultImageModel && VISION_CAPABLE_MODELS.has(_rawDefaultImageModel as AiModel)) {
    return _rawDefaultImageModel as AiModel;
  }
  if (_rawDefaultImageModel) {
    console.warn(
      `[chatService] VITE_DEFAULT_IMAGE_MODEL="${_rawDefaultImageModel}" is not in VISION_CAPABLE_MODELS — falling back to ${PREFERRED_VISION_FALLBACK}.`,
    );
  }
  return PREFERRED_VISION_FALLBACK;
})();

export interface ChatRequestOptions {
  sessionId: string;
  query: string;
  model: string;
  additionalContext?: string;
  /** Snapshot of CV text captured when the session was created. */
  cv?: string;
  /** Additional documents uploaded with the session. */
  documents?: Array<{ name: string; content: string }>;
  /** Session language code (used to direct AI responses). */
  language?: string;
  /** User-declared session type (e.g. 'Interview', 'Meeting'). */
  sessionType?: SessionType;
  history?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  /** Base64 data URL of an image to include with the query (e.g. screenshot). */
  imageBase64?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: { prompt: number; completion: number; total: number };
}

const DATA_URL_MIME_RE = /^data:([^;,]+);/;

/**
 * Phase 24a — Decode the mime + natural dimensions of a `data:<mime>;base64,…`
 * payload. The cloud-api POST `/api/screenshots` zod schema requires
 * `{mime, width, height}` and a closed-union mime
 * (`SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg']`).
 *
 * Implementation notes:
 *   - Uses `<img>.onload` + `naturalWidth/Height` (browser-only) — this
 *     service only runs in the desktop WebView, so no jsdom-specific
 *     shim is needed for production. Vitest mocks `Image` globally so
 *     the test path still resolves synchronously.
 *   - Rejects with an Error rather than returning a sentinel, so the
 *     caller (`syncScreenshotToCloud`) can log WHY the persist was
 *     skipped (decode failure vs unknown mime) instead of swallowing
 *     silently.
 */
async function decodeDataUrlMeta(
  dataUrl: string,
): Promise<{ mime: ScreenshotMime; width: number; height: number }> {
  const prefixMatch = DATA_URL_MIME_RE.exec(dataUrl);
  const mimeCandidate = prefixMatch ? prefixMatch[1] : '';
  if (!(SCREENSHOT_MIME_TYPES as readonly string[]).includes(mimeCandidate)) {
    throw new Error(
      `Unsupported screenshot mime: "${mimeCandidate || '<empty>'}" — expected one of ${SCREENSHOT_MIME_TYPES.join(', ')}`,
    );
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('Decoded image has zero natural dimensions'));
        return;
      }
      resolve({ mime: mimeCandidate as ScreenshotMime, width: w, height: h });
    };
    img.onerror = () => reject(new Error('Failed to decode image data URL via <img>.onload'));
    img.src = dataUrl;
  });
}

/**
 * Phase 24a — Persist the analysed screenshot to cloud-api so the WS
 * gateway broadcasts a `screenshot.create` event to the Companion app
 * + Web Portal gallery (server-side commit 5125933 handles the
 * SQLite write + dual-fan-out broadcast on success).
 *
 * Best-effort by design: any failure (network blip, 4xx/5xx, unknown
 * mime, decode error) is logged via `console.warn` and DOES NOT throw.
 * The AI request is the user-facing commitment — a missing screenshot
 * row is unfortunate but not user-visible; a failed AI analysis because
 * the cloud-api was unreachable would be a regression.
 */
async function syncScreenshotToCloud(sessionId: string, imageBase64: string): Promise<void> {
  try {
    const { mime, width, height } = await decodeDataUrlMeta(imageBase64);
    await api.post('/screenshots', {
      sessionId,
      mime,
      width,
      height,
      // Phase 24a ships without crop-box plumbing — ScreenshotCapture's
      // selection rect stays in component-local state. The cloud-api
      // accepts `cropBoxJson: null` (Phase 24 schema). A follow-up
      // commit will plumb the rect through ChatRequestOptions.
      cropBoxJson: null,
      dataUrl: imageBase64,
    });
  } catch (err) {
    console.warn(
      `[chatService] Failed to sync screenshot to cloud-api (continuing AI request anyway): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Send a chat request to the AI Gateway, persist the response in the session
 * store, and broadcast it to every connected device (including the Companion)
 * via the WebSocket gateway.
 *
 * The system-message baseline is built via the Gateway's `ContextAssembler`
 * (called via `/chat/context`) so the AI sees the same baseline for every
 * session-mode trigger: candidate CV, additional user-supplied context,
 * uploaded documents, the session-language directive, and the session-type
 * opening role.
 */
export async function askAssistant(opts: ChatRequestOptions): Promise<ChatResponse | null> {
  const trimmed = opts.query.trim();
  if (!trimmed) return null;

  // 1) Baseline system-context messages, including CV + additional context +
  //    session-type opening directive.
  const baseMessages: ChatMessage[] = await buildContextMessages({
    cv: opts.cv,
    customContext: opts.additionalContext,
    documents: opts.documents,
    language: opts.language,
    sessionType: opts.sessionType,
  });

  // 2) Append the manual-conversation history (last 6 to bound tokens).
  const messages: ChatMessage[] = [...baseMessages];
  if (opts.history?.length) messages.push(...opts.history.slice(-6));

  // 3) Build the final user message. If a screenshot image is provided, use
  //    OpenAI-style multimodal content array so vision-capable models can
  //    see the image alongside the text query.
  if (opts.imageBase64) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text' as const, text: trimmed },
        { type: 'image_url' as const, image_url: { url: opts.imageBase64 } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: trimmed });
  }

  // 4) Ensure a vision-capable model is used when an image is supplied.
  //    `VISION_CAPABLE_MODELS` is the registry's source of truth and covers
  //    every model the gateway actually passes `image_url` parts through to:
  //    Phase 2 rewrote the Anthropic + Gemini adapters to forward
  //    `inline_data` / `image` natively, Phase 3 added the DashScope /
  //    Qwen-VL row as OpenAI-compatible. Anything not in the set would be
  //    silently stringified server-side, so we fall back to
  //    `DEFAULT_IMAGE_MODEL` (env-overridable, defaults to
  //    `PREFERRED_VISION_FALLBACK' = 'gpt-4o-mini') to guarantee the
  //    screenshot actually reaches the model.
  let targetModel = opts.model as AiModel;
  if (opts.imageBase64 && !VISION_CAPABLE_MODELS.has(targetModel)) {
    console.warn(
      `[chatService] Model ${targetModel} does not support vision in the current gateway. Falling back to ${DEFAULT_IMAGE_MODEL}.`,
    );
    targetModel = DEFAULT_IMAGE_MODEL;
  }

  // Phase 24a — persist the screenshot to cloud-api BEFORE the AI request
  // so the WS gateway's `screenshot.create` event fans out to Companion +
  // Web Portal in lockstep with the AI request (server-side commit 5125933).
  // Best-effort: a cloud-api POST failure does NOT abort the /chat flow
  // (the AI response is the user-facing commitment).
  if (opts.imageBase64) {
    await syncScreenshotToCloud(opts.sessionId, opts.imageBase64);
  }

  let response: ChatResponse;
  try {
    response = await gatewayApi.post<ChatResponse>('/chat', {
      model: targetModel,
      messages,
      stream: false,
      temperature: opts.temperature ?? 0.7,
      maxTokens: opts.maxTokens ?? 800,
      sessionId: opts.sessionId,
    });
  } catch (err) {
    console.error('[chatService] AI request failed:', err);
    return null;
  }

  const responseId = crypto.randomUUID();

  // Persist locally
  useSessionStore.getState().addAiResponse({
    id: responseId,
    sessionId: opts.sessionId,
    query: trimmed,
    response: response.content,
    model: response.model,
    provider: response.provider,
    tokensUsed: response.tokensUsed.total,
    createdAt: new Date().toISOString(),
  });

  // Broadcast to all devices (session room + user room in the cloud gateway)
  const ws = getWsClient();
  ws.send({
    action: 'ai.response',
    data: {
      sessionId: opts.sessionId,
      content: response.content,
      isFinal: true,
      finishReason: 'stop',
      tokensUsed: response.tokensUsed,
      query: trimmed,
      model: response.model,
      provider: response.provider,
      responseId,
    },
  });

  return response;
}
