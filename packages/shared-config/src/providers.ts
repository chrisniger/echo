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
  dashscope: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen-vl-max',
      'qwen-vl-plus',
      'qwen2.5-vl-72b-instruct',
      'qwen2.5-vl-7b-instruct',
      'qwen3-vl-235b-a22b-instruct',
      'qwen3-vl-plus',
    ],
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
  'dashscope',
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
 * Phase 3 added the DashScope / Qwen-VL rows; Opencode rows land in a
 * later phase.
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

  // DashScope / Qwen — Alibaba Cloud's OpenAI-compatible endpoint. All
  // current DashScope models in the union are VL variants; the flagship
  // tier (qwen-vl-max, qwen2.5-vl-72b-instruct, qwen3-vl-235b-a22b-instruct)
  // gets `high` detail because the parameter count justifies the token
  // cost; the lighter variants stay at `auto`.
  'qwen-vl-max': { vision: true, visionDetail: 'high' },
  'qwen-vl-plus': { vision: true, visionDetail: 'auto' },
  'qwen2.5-vl-72b-instruct': { vision: true, visionDetail: 'high' },
  'qwen2.5-vl-7b-instruct': { vision: true, visionDetail: 'auto' },
  'qwen3-vl-235b-a22b-instruct': { vision: true, visionDetail: 'high' },
  'qwen3-vl-plus': { vision: true, visionDetail: 'auto' },

  // Ollama — local models default to text-only here. Vision-capable
  // Ollama models (e.g. llava) can be added when the AiModel union is
  // expanded for them.
  'ollama/llama3': { vision: false, visionDetail: 'auto' },
  'ollama/mixtral': { vision: false, visionDetail: 'auto' },
  'ollama/qwen2.5': { vision: false, visionDetail: 'auto' },
  'ollama/codellama': { vision: false, visionDetail: 'auto' },
} as const satisfies Record<AiModel, ModelCapabilities>;

/**
 * Every `AiModel` union member, derived from `MODEL_CAPABILITIES` so the
 * two cannot drift. Used by the AI gateway's `/chat` zod schema (the
 * model whitelist is no longer hand-maintained) and as the canonical
 * enumeration order for UI dropdowns / persistence helpers.
 */
export const ALL_AI_MODELS: readonly AiModel[] = Object.keys(MODEL_CAPABILITIES) as AiModel[];

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
 * Phase 3 added the DashScope (Qwen-VL, Qwen2.5-VL, Qwen3-VL) rows.
 * Opencode vision comes in a later phase.
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

/**
 * UI display metadata, not domain logic.
 *
 * The every-row `as const satisfies Record<AiModel, string>` constraint
 * is the compile-time gate that catches union drift: adding a new
 * `AiModel` union member forces an update here (test name:
 * "supplies exactly one label per AiModel"). Phase 4 centralised these
 * labels so NewSession.tsx and Settings.tsx no longer carry duplicated
 * 22-entry `models = [{value,label}…]` arrays. Cloud-api and web-portal
 * will reuse the same map when they adopt the dropdown.
 */
export const MODEL_LABELS = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'claude-4-opus': 'Claude 4 Opus',
  'claude-4-sonnet': 'Claude 4 Sonnet',
  'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-opus': 'Claude 3 Opus',
  'claude-3-sonnet': 'Claude 3 Sonnet',
  'claude-3-haiku': 'Claude 3 Haiku',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.0-pro': 'Gemini 2.0 Pro',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'deepseek-chat': 'DeepSeek Chat',
  'deepseek-coder': 'DeepSeek Coder',
  'deepseek-reasoner': 'DeepSeek Reasoner',
  'qwen-vl-max': 'Qwen VL Max',
  'qwen-vl-plus': 'Qwen VL Plus',
  'qwen2.5-vl-72b-instruct': 'Qwen2.5 VL 72B',
  'qwen2.5-vl-7b-instruct': 'Qwen2.5 VL 7B',
  'qwen3-vl-235b-a22b-instruct': 'Qwen3 VL 235B',
  'qwen3-vl-plus': 'Qwen3 VL Plus',
  'openrouter/auto': 'OpenRouter Auto',
  'ollama/llama3': 'Ollama Llama 3',
  'ollama/mixtral': 'Ollama Mixtral',
  'ollama/qwen2.5': 'Ollama Qwen 2.5',
  'ollama/codellama': 'Ollama Code Llama',
} as const satisfies Record<AiModel, string>;

/**
 * Vision-capable model used when the user requested a non-vision model
 * but the request body contains an image. Centralised here so a single
 * edit swaps the desktop's entire fallback behaviour — no need to touch
 * `chatService.ts` when the preferred cost / latency profile changes.
 *
 * Defaults to `'gpt-4o-mini'` (matches the pre-Phase-4 hard-coded
 * fallback). The asserted lock-test guarantees this id stays a member of
 * `VISION_CAPABLE_MODELS`; replacing the default is a single-line edit.
 */
export const PREFERRED_VISION_FALLBACK: AiModel = 'gpt-4o-mini';

/**
 * Human-readable provider labels. Exported so future consumers
 * (cloud-api subscription tier UI, web-portal admin page) can render a
 * provider name without traversing `getProviderModelGroups()`. Title
 * Case + brand tweaks.
 */
export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  dashscope: 'DashScope (Qwen VL)',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (Local)',
};

/**
 * Build a visually grouped list of models per provider, in `PROVIDER_PRIORITY`
 * order, for the desktop's `<SelectGroup>` dropdowns. Each row carries the
 * vision flag so the UI can badge it without a second registry lookup.
 *
 * Used by both `pages/NewSession.tsx` and `pages/Settings.tsx` so the two
 * dropdowns stay in lockstep automatically.
 */
export interface ProviderModelGroup {
  provider: AiProvider;
  label: string;
  models: Array<{ value: AiModel; label: string; vision: boolean }>;
}

export function getProviderModelGroups(): ProviderModelGroup[] {
  return PROVIDER_PRIORITY.map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider],
    models: PROVIDER_DEFAULTS[provider].models.map((model) => ({
      value: model,
      label: MODEL_LABELS[model],
      vision: isVisionCapable(model),
    })),
  }));
}

/* ------------------------------------------------------------------------ */
/* Phase 4.5 — vision downscaler strategies                                  */
/* ------------------------------------------------------------------------ */

/**
 * Per-detail encoding strategy the desktop's image downscaler uses to
 * steer size-vs-quality tradeoffs before a screenshot is forwarded to
 * `/chat`. Centralised here so future surfaces (web-portal preview,
 * companion on-device orchestration) inherit the exact same matrix
 * without re-implementing the byte-budget loop.
 *
 * `mime: 'image/png'` is lossless and is used by 'high' detail when the
 * source image already fits under `MAX_SCREENSHOT_SIZE_BYTES`. JPEG's
 * quality knob trades bytes for visual fidelity: 0.95 is high quality,
 * 0.85 the balanced default, 0.70 the lowest tier.
 *
 * `maxWidth` / `maxHeight` are the dimension caps the strategy aims for
 * before encoding. If the cropped source already fits AND the encoded
 * payload fits under MAX_IMAGE_BYTES, the strategy is a no-op.
 */
export interface EncodingStrategy {
  mime: 'image/png' | 'image/jpeg';
  /** JPEG quality in [0, 1]. `undefined` for PNG (lossless). */
  quality: number | null;
  /** Pixel-width cap. Source exceeds → resize. */
  maxWidth: number;
  /** Pixel-height cap. Source exceeds → resize. */
  maxHeight: number;
}

export const ENCODING_STRATEGIES: Record<VisionDetail, EncodingStrategy> = {
  // 'high' (= flagship VL models: gpt-4o, gpt-4-turbo, all Claude 3/4,
  // gemini-2.0-pro / 1.5-pro, qwen-vl-max / qwen2.5-vl-72b / qwen3-vl-235b).
  // Resize only if dimension cap exceeded; preserve PNG for lossless capture
  // (a 4K screenshot of small UI looks near-identical at JPEG 0.95 vs PNG,
  // but PNG preserves anti-aliased edges that the flagship models
  // demonstrably read better).
  high: { mime: 'image/png', quality: null, maxWidth: 2048, maxHeight: 2048 },
  // 'auto' (= efficient OpenAI / Anthropic Haiku / Gemini Flash / Qwen-VL-Plus
  // / Qwen2.5-VL-7B / Qwen3-VL-Plus). Always resize + re-encode. Target hold:
  // 1024px on the long edge is the published sweet-spot for these models
  // (token cost plateaus above it).
  auto: { mime: 'image/jpeg', quality: 0.85, maxWidth: 1024, maxHeight: 1024 },
  // 'low' (currently unused — placeholder for future "low-detail" routing
  // when the user opts to economise on tokens). Aggressive downscale +
  // lower quality.
  low: { mime: 'image/jpeg', quality: 0.7, maxWidth: 512, maxHeight: 512 },
};

/**
 * Lookup helper for parity with `getVisionDetail(model)`. If a future
 * VisionDetail value is added (e.g. `'medium'`), the Record's exhaustiveness
 * gate forces an update here.
 */
export function encodeStrategyForDetail(detail: VisionDetail): EncodingStrategy {
  return ENCODING_STRATEGIES[detail];
}

/**
 * Phase 4.5 downscaler loop constants. Baked into shared-config so a
 * future Phase can move the loop into a Web Worker without re-deriving
 * these (Workers can't import React state, but they CAN import pure
 * constants from shared-config).
 */
export const DOWNSCALER_LIMITS = {
  /**
   * Maximum iterations of the (resize × 0.8, halve-quality) loop. After
   * this many attempts we degrade gracefully: return whatever the last
   * encode produced even if it exceeds `MAX_IMAGE_BYTES`. Better to
   * forward a slightly-too-large image than to abort the user's request.
   */
  maxAttempts: 3,
  /**
   * Multiplicative shrink applied to width AND height each iteration.
   * 0.8 means attempt 2 is 64% the area of attempt 1; attempt 3 is 51%.
   */
  dimensionReductionFactor: 0.8,
  /**
   * Linear reduction applied to JPEG quality each iteration (PNG
   * strategies ignore this). Starts at the strategy's quality and
   * subtracts this each pass. Calibrated to keep `maxAttempts × step`
   * within the lowest-strategy budget (low quality 0.7 − minQuality 0.5
   * = 0.2; step × 3 = 0.15 ≤ 0.2).
   */
  qualityReductionPerAttempt: 0.05,
  /**
   * Floor on JPEG quality. Encoding below ~0.5 produces visible
   * artefacts and is rarely worth the byte savings.
   */
  minQuality: 0.5,
} as const;
