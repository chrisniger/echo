import type { AiProvider, AiModel } from '@echo-gpt/shared-types';

export const PROVIDER_DEFAULTS: Record<
  AiProvider,
  { baseUrl: string; models: AiModel[] }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-4'],
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/auto'],
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    models: ['ollama/llama3', 'ollama/mixtral'],
  },
};

export const PROVIDER_PRIORITY: AiProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'openrouter',
  'ollama',
];

export const RATE_LIMIT_DEFAULTS = {
  requestsPerMinute: 60,
  tokensPerMinute: 100_000,
} as const;

export const TOKEN_LIMITS = {
  MAX_PROMPT_TOKENS: 128_000,
  MAX_COMPLETION_TOKENS: 4_096,
  DEFAULT_TEMPERATURE: 0.7,
} as const;
