import { describe, expect, it } from 'vitest';
import type { AiModel, VisionDetail } from '@echo-gpt/shared-types';
import {
  ALL_AI_MODELS,
  MODEL_CAPABILITIES,
  VISION_CAPABLE_MODELS,
  getVisionDetail,
  isVisionCapable,
} from './providers.js';

/**
 * Single source of truth for the current vision-capable model list.
 * Phase 3 added the DashScope / Qwen-VL rows; future union expansions
 * extend this list intentionally so the author must audit whether each
 * new model advertises vision support.
 */
const CURRENT_VISION_MODELS: readonly AiModel[] = [
  // OpenAI GPT-4 family
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  // Anthropic Claude family
  'claude-4-opus',
  'claude-4-sonnet',
  'claude-3.5-sonnet',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  // Google Gemini family (all current models)
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  // DashScope / Qwen-VL — flagships get 'high', efficient variants get 'auto'
  'qwen-vl-max',
  'qwen-vl-plus',
  'qwen2.5-vl-72b-instruct',
  'qwen2.5-vl-7b-instruct',
  'qwen3-vl-235b-a22b-instruct',
  'qwen3-vl-plus',
  // OpenRouter (dynamic)
  'openrouter/auto',
];

/** Single source of truth for the current text-only list. */
const CURRENT_TEXT_ONLY_MODELS: readonly AiModel[] = [
  'gpt-3.5-turbo',
  'deepseek-chat',
  'deepseek-coder',
  'deepseek-reasoner',
  'ollama/llama3',
  'ollama/mixtral',
  'ollama/qwen2.5',
  'ollama/codellama',
];

describe('VISION_CAPABLE_MODELS derived set', () => {
  it('contains exactly the models CURRENT_VISION_MODELS lists', () => {
    expect(VISION_CAPABLE_MODELS.size).toBe(CURRENT_VISION_MODELS.length);
    for (const model of CURRENT_VISION_MODELS) {
      expect(VISION_CAPABLE_MODELS.has(model), `expected ${model}`).toBe(true);
    }
  });

  it('stays in sync with MODEL_CAPABILITIES.vision for every key', () => {
    // Belt-and-suspenders against the cast `Object.keys(...) as AiModel[]`:
    // proves the derivation is consistent with the source of truth.
    for (const model of Object.keys(MODEL_CAPABILITIES) as AiModel[]) {
      const inSet = VISION_CAPABLE_MODELS.has(model);
      const fromRecord = MODEL_CAPABILITIES[model].vision === true;
      expect(inSet, `drift at model=${model}`).toBe(fromRecord);
    }
  });
});

describe('isVisionCapable()', () => {
  it.each(CURRENT_VISION_MODELS)('returns true for %s', (model) => {
    expect(isVisionCapable(model)).toBe(true);
  });

  it.each(CURRENT_TEXT_ONLY_MODELS)('returns false for %s', (model) => {
    expect(isVisionCapable(model)).toBe(false);
  });
});

describe('getVisionDetail()', () => {
  const VALID_DETAILS: readonly VisionDetail[] = ['low', 'high', 'auto'];

  it('returns a valid VisionDetail for every registered model', () => {
    for (const model of Object.keys(MODEL_CAPABILITIES) as AiModel[]) {
      const detail = getVisionDetail(model);
      expect(VALID_DETAILS, `model=${model}, detail=${detail}`).toContain(detail);
    }
  });

  it('prefers "high" detail for GPT-4o and Claude vision rows', () => {
    // Locks the Phase 4 downscaler's expectation so design choices
    // cannot silently flip.
    expect(getVisionDetail('gpt-4o')).toBe('high');
    expect(getVisionDetail('claude-3-opus')).toBe('high');
    expect(getVisionDetail('gemini-2.0-pro')).toBe('high');
  });

  it('defaults non-vision rows to "auto"', () => {
    expect(getVisionDetail('gpt-3.5-turbo')).toBe('auto');
    expect(getVisionDetail('deepseek-chat')).toBe('auto');
    expect(getVisionDetail('ollama/llama3')).toBe('auto');
  });
});

describe('ALL_AI_MODELS derived list', () => {
  it('matches every AiModel union member (one-to-one with MODEL_CAPABILITIES keys)', () => {
    // Guard against future union additions that forget MODEL_CAPABILITIES.
    expect(ALL_AI_MODELS.length).toBe(Object.keys(MODEL_CAPABILITIES).length);
    for (const model of Object.keys(MODEL_CAPABILITIES) as AiModel[]) {
      expect(ALL_AI_MODELS, `missing ${model}`).toContain(model);
    }
  });
});

describe('MODEL_CAPABILITIES coverage', () => {
  it('exposes a visionDetail for every row (uniform union shape)', () => {
    // Guards the Phase 1 fix where `as const satisfies Record<AiModel, …>`
    // produced a union value type: missing visionDetail broke
    // `.visionDetail` access. Every row must declare a value.
    for (const model of Object.keys(MODEL_CAPABILITIES) as AiModel[]) {
      const row = MODEL_CAPABILITIES[model];
      expect(row.visionDetail, `model=${model}`).toBeDefined();
    }
  });

  it('flags DashScope flagship VL models with "high" detail', () => {
    // Locks the Phase 3 wiring: each new VL flagship row gets `high` so
    // the desktop downscaler does not silently downsample screenshots
    // meant for the highest-tier Qwen-VL runs.
    expect(MODEL_CAPABILITIES['qwen-vl-max'].visionDetail).toBe('high');
    expect(MODEL_CAPABILITIES['qwen2.5-vl-72b-instruct'].visionDetail).toBe('high');
    expect(MODEL_CAPABILITIES['qwen3-vl-235b-a22b-instruct'].visionDetail).toBe('high');
  });

  it('flags DashScope efficient VL models with "auto" detail', () => {
    expect(MODEL_CAPABILITIES['qwen-vl-plus'].visionDetail).toBe('auto');
    expect(MODEL_CAPABILITIES['qwen2.5-vl-7b-instruct'].visionDetail).toBe('auto');
    expect(MODEL_CAPABILITIES['qwen3-vl-plus'].visionDetail).toBe('auto');
  });
});
