export type AiProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'ollama';

export type AiModel =
  | 'gpt-4o'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo'
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'claude-4'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-pro'
  | 'deepseek-chat'
  | 'deepseek-coder'
  | 'openrouter/auto'
  | 'ollama/llama3'
  | 'ollama/mixtral';

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
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
