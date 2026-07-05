import dotenv from 'dotenv';
import { AI_GATEWAY, DESKTOP, PROVIDER_DEFAULTS, RATE_LIMIT_DEFAULTS } from '@echo-gpt/shared-config';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || String(AI_GATEWAY.DEFAULT_PORT), 10),
  corsOrigin: process.env.CORS_ORIGIN || DESKTOP.DEV_URL,
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || PROVIDER_DEFAULTS.openai.baseUrl,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.ANTHROPIC_BASE_URL || PROVIDER_DEFAULTS.anthropic.baseUrl,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: process.env.GEMINI_BASE_URL || PROVIDER_DEFAULTS.gemini.baseUrl,
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || PROVIDER_DEFAULTS.deepseek.baseUrl,
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || PROVIDER_DEFAULTS.ollama.baseUrl,
  },
  rateLimit: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS || String(RATE_LIMIT_DEFAULTS.requestsPerMinute), 10),
    tokensPerMinute: parseInt(process.env.RATE_LIMIT_TOKENS || String(RATE_LIMIT_DEFAULTS.tokensPerMinute), 10),
  },
};
