import { gatewayApi } from '../lib/api';
import { getWsClient } from '../hooks/useWebSocket';
import { useSessionStore } from '../stores/session';
import { buildContextMessages } from '../lib/context';
import type { AiModel, ChatMessage, SessionType } from '@echo-gpt/shared-types';

/** Models that the AI Gateway currently passes multimodal content arrays through to.
 *  Only these models are guaranteed to actually "see" an image when imageBase64 is supplied.
 *  openrouter/auto is intentionally excluded because it may route to non-vision models.
 */
const VISION_SUPPORTED_MODELS: AiModel[] = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];

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
  //    The Gateway's Anthropic/Gemini/Ollama adapters currently stringify
  //    image content, and DeepSeek does not support vision, so fall back to
  //    a known vision model when necessary.
  let targetModel = opts.model as AiModel;
  if (opts.imageBase64 && !VISION_SUPPORTED_MODELS.includes(targetModel)) {
    console.warn(
      `[chatService] Model ${targetModel} does not support vision in the current gateway. Falling back to gpt-4o-mini.`,
    );
    targetModel = 'gpt-4o-mini';
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
