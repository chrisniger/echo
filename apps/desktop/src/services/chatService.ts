import { gatewayApi } from '../lib/api';
import { getWsClient } from '../hooks/useWebSocket';
import { useSessionStore } from '../stores/session';
import { buildContextMessages } from '../lib/context';
import type { ChatMessage, SessionType } from '@echo-gpt/shared-types';

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
  messages.push({ role: 'user', content: trimmed });

  let response: ChatResponse;
  try {
    response = await gatewayApi.post<ChatResponse>('/chat', {
      model: opts.model,
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
