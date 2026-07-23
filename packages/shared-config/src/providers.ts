import type { AiProvider, AiModel, ModelCapabilities, VisionDetail } from '@echo-gpt/shared-types';

export const PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string; models: AiModel[] }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      'claude-4-opus',
      'claude-4-sonnet',
      'claude-3.5-sonnet',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
    ],
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/auto'],
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    models: ['ollama/llama3', 'ollama/mixtral', 'ollama/qwen2.5', 'ollama/codellama'],
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

/**
 * Per-model capability lookup used across the desktop UI, gateway router,
 * and chat service. Every `AiModel` union member gets an explicit entry so
 * the `satisfies Record<AiModel, …>` constraint catches union drift at
 * compile time — extending the union forces an update here.
 *
 * Phase 3 will append DashScope / Opencode rows alongside the type union
 * expansion.
 */
export const MODEL_CAPABILITIES = {
  // OpenAI GPT family
  'gpt-4o': { vision: true, visionDetail: 'high' },
  'gpt-4o-mini': { vision: true, visionDetail: 'auto' },
  'gpt-4-turbo': { vision: true, visionDetail: 'high' },
  'gpt-3.5-turbo': { vision: false, visionDetail: 'auto' },

  // Anthropic Claude family
  'claude-4-opus': { vision: true, visionDetail: 'high' },
  'claude-4-sonnet': { vision: true, visionDetail: 'high' },
  'claude-3.5-sonnet': { vision: true, visionDetail: 'high' },
  'claude-3-opus': { vision: true, visionDetail: 'high' },
  'claude-3-sonnet': { vision: true, visionDetail: 'high' },
  'claude-3-haiku': { vision: true, visionDetail: 'auto' },

  // Google Gemini family
  'gemini-2.0-flash': { vision: true, visionDetail: 'auto' },
  'gemini-2.0-pro': { vision: true, visionDetail: 'high' },
  'gemini-1.5-pro': { vision: true, visionDetail: 'high' },
  'gemini-1.5-flash': { vision: true, visionDetail: 'auto' },

  // DeepSeek — text-only across chat / coder / reasoner.
  'deepseek-chat': { vision: false, visionDetail: 'auto' },
  'deepseek-coder': { vision: false, visionDetail: 'auto' },
  'deepseek-reasoner': { vision: false, visionDetail: 'auto' },

  // OpenRouter — see VISION_CAPABLE_MODELS note about dynamic routing.
  'openrouter/auto': { vision: true, visionDetail: 'auto' },

  // Ollama — local models default to text-only here. Vision-capable
  // Ollama models (e.g. llava) can be added when the AiModel union is
  // expanded for them.
  'ollama/llama3': { vision: false, visionDetail: 'auto' },
  'ollama/mixtral': { vision: false, visionDetail: 'auto' },
  'ollama/qwen2.5': { vision: false, visionDetail: 'auto' },
  'ollama/codellama': { vision: false, visionDetail: 'auto' },
} as const satisfies Record<AiModel, ModelCapabilities>;

/**
 * Set of models that accept vision input (`image_url` content parts in
 * multimodal chat requests). DERIVED from `MODEL_CAPABILITIES` so the two
 * cannot drift — adding a row with `vision: true` to `MODEL_CAPABILITIES`
 * automatically appears here on module load.
 *
 * Used by:
 *  - the desktop model picker to badge/tag vision-capable options,
 *  - the AI gateway to keep vision-capable providers in the failover
 *    candidate set when a screenshot is attached to `/chat`,
 *  - the desktop chat service (Phase 4) to retire the hard-coded
 *    `VISION_SUPPORTED_MODELS` array in `chatService.ts`.
 *
 * Phase 3 will append DashScope (Qwen-VL, Qwen2.5-VL, Qwen3-VL) and
 * Opencode vision rows via `MODEL_CAPABILITIES` once their `AiModel`
 * union members are introduced in `packages/shared-types/src/gateway.ts`.
 */
export const VISION_CAPABLE_MODELS: ReadonlySet<AiModel> = new Set(
  (Object.keys(MODEL_CAPABILITIES) as AiModel[]).filter(
    (model) => MODEL_CAPABILITIES[model].vision,
  ),
);

/** Returns true when the given model accepts image_url content parts. */
export function isVisionCapable(model: AiModel): boolean {
  return MODEL_CAPABILITIES[model].vision === true;
}

/**
 * Recommended `image_url.detail` for the given model. Every row in
 * `MODEL_CAPABILITIES` declares an explicit detail so this never falls
 * back:
 *  - OpenAI    — `'high'` for gpt-4o / gpt-4-turbo; `'auto'` for gpt-4o-mini
 *  - Anthropic — `'high'` (Claude vision is detail-sensitive)
 *  - Gemini    — `'auto'` flashes, `'high'` for pro / 1.5-pro
 *  - OpenRouter / non-vision rows — `'auto'`
 */
export function getVisionDetail(model: AiModel): VisionDetail {
  return MODEL_CAPABILITIES[model].visionDetail;
}
