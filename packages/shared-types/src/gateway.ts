export type AiProvider =
  'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'dashscope' | 'openrouter' | 'ollama';

export type AiModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo'
  | 'claude-4-opus'
  | 'claude-4-sonnet'
  | 'claude-3.5-sonnet'
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-pro'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'deepseek-chat'
  | 'deepseek-coder'
  | 'deepseek-reasoner'
  | 'qwen-vl-max'
  | 'qwen-vl-plus'
  | 'qwen2.5-vl-72b-instruct'
  | 'qwen2.5-vl-7b-instruct'
  | 'qwen3-vl-235b-a22b-instruct'
  | 'qwen3-vl-plus'
  | 'openrouter/auto'
  | 'ollama/llama3'
  | 'ollama/mixtral'
  | 'ollama/qwen2.5'
  | 'ollama/codellama';

export type MessageRole = 'system' | 'user' | 'assistant';

/** OpenAI-compatible content part for vision/multimodal messages. */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** OpenAI-compatible image content part. `url` can be a data URL or remote URL. */
export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export type ChatMessageContent = string | Array<TextContentPart | ImageContentPart>;

/** Returns true when the message content is an array of parts (multimodal). */
export function isContentArray(
  content: ChatMessageContent,
): content is Array<TextContentPart | ImageContentPart> {
  return Array.isArray(content);
}

/** Convert any ChatMessageContent to a plain string for providers that only support text.
 *  Text parts are concatenated; image parts are replaced with a placeholder noting the image URL.
 */
export function contentToString(content: ChatMessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      return `[Image: ${part.image_url.url}]`;
    })
    .join('\n');
}

export interface ChatMessage {
  role: MessageRole;
  content: ChatMessageContent;
}

export interface ChatRequest {
  model: AiModel;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  sessionId?: string;
}

export interface ChatResponse {
  id: string;
  model: AiModel;
  provider: AiProvider;
  content: string;
  finishReason: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  latencyMs: number;
}

export interface ChatChunk {
  id: string;
  model: AiModel;
  provider: AiProvider;
  content: string;
  finishReason: string | null;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  } | null;
}

export interface ContextPayload {
  cv?: string;
  jobDescription?: string;
  documents?: Array<{ name: string; content: string }>;
  transcript?: Array<{
    speaker: string;
    text: string;
    timestamp: number;
  }>;
  screenshots?: Array<{ url: string; ocrText?: string }>;
  images?: Array<{ url: string; description?: string }>;
  conversationHistory?: ChatMessage[];
  customContext?: string;
  language?: string;
  /**
   * User-declared session type (e.g. 'Interview', 'Meeting'). The context
   * assembler prepends a role directive for this type so the AI knows the
   * shape of the conversation from the first message. Defaults to nothing
   * if absent, which preserves the baseline persona.
   */
  sessionType?: string;
}

export interface ProviderConfig {
  name: AiProvider;
  apiKey: string;
  baseUrl?: string;
  models: AiModel[];
  priority: number;
  rateLimit: { requestsPerMinute: number; tokensPerMinute: number };
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  modelPattern: string;
  primaryProvider: AiProvider;
  fallbackProviders: AiProvider[];
  failoverStrategy: 'sequential' | 'circuit-breaker';
}

/**
 * OpenAI-style vision "detail" knob — trades resolution vs. token cost on
 * image parts. Forwarded as `image_url.detail` to OpenAI- and Anthropic-
 * compatible providers; ignored by Gemini (which has its own media
 * resolution controls) and Ollama.
 */
export type VisionDetail = 'low' | 'high' | 'auto';

/**
 * Per-model capability flags advertised across the desktop UI, the AI
 * gateway router, and the cloud API. Used today to gate vision requests;
 * future fields (tools, JSON mode, context window, etc.) extend this
 * record without breaking the current consumers.
 */
export interface ModelCapabilities {
  /** Whether the model can accept `image_url` content parts in chat completions. */
  vision: boolean;
  /** Preferred `image_url.detail` when sending screenshots. Falls back to 'auto' when omitted. */
  visionDetail?: VisionDetail;
}

/**
 * Upper bound (in bytes) for a single image part sent through the AI
 * gateway's `/chat` route. Set to 4 MB so the base64-encoded payload
 * (~5.3 MB) stays under the Express `json({ limit: '10mb' })` body ceiling
 * once the surrounding context messages, system prompt, and conversation
 * history are factored in.
 *
 * The desktop's `MAX_SCREENSHOT_SIZE_BYTES` upload cap (in shared-config
 * storage.ts) is intentionally set slightly higher (5 MB) so round-trips
 * that upload a pre-encapsulated multipart form can still succeed even
 * when the raw PNG is just over the gateway cap; the desktop downscaler
 * (introduced in Phase 4) normalises to MAX_IMAGE_BYTES before the
 * base64 conversion.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
