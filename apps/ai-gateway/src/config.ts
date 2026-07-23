import dotenv from 'dotenv';
import {
  AI_GATEWAY,
  DESKTOP,
  JWT,
  PROVIDER_DEFAULTS,
  RATE_LIMIT_DEFAULTS,
} from '@echo-gpt/shared-config';

dotenv.config();

const TAURI_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
];

function parseCorsOrigins(raw: string): string[] {
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of TAURI_ORIGINS) {
    if (!list.includes(origin)) list.push(origin);
  }
  return list;
}

const rawCorsOrigin = process.env.CORS_ORIGIN || DESKTOP.DEV_URL;

export const config = {
  port: parseInt(process.env.PORT || String(AI_GATEWAY.DEFAULT_PORT), 10),
  jwtSecret: process.env.JWT_SECRET || JWT.DEFAULT_SECRET,
  // Shared secret for server-to-server calls from the Cloud API. In production,
  // this should be a strong, randomly generated secret.
  apiKey: process.env.AI_GATEWAY_API_KEY || '',
  corsOrigin: parseCorsOrigins(rawCorsOrigin),
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
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || PROVIDER_DEFAULTS.openrouter.baseUrl,
  },
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    baseUrl: process.env.DASHSCOPE_BASE_URL || PROVIDER_DEFAULTS.dashscope.baseUrl,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    whisperModel: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3',
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || PROVIDER_DEFAULTS.ollama.baseUrl,
  },
  rateLimit: {
    requestsPerMinute: parseInt(
      process.env.RATE_LIMIT_REQUESTS || String(RATE_LIMIT_DEFAULTS.requestsPerMinute),
      10,
    ),
    tokensPerMinute: parseInt(
      process.env.RATE_LIMIT_TOKENS || String(RATE_LIMIT_DEFAULTS.tokensPerMinute),
      10,
    ),
  },
};
