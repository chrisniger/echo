import { fastRuleCheck } from './fastRules';
import { DEFAULT_INTERVIEW_PATTERNS, parseCustomPatterns, patternCheck } from './patterns';
import { contextCheck, inferSessionMode } from './contextMemory';
import { classifyWithAi, buildClassifierRequest } from './aiClassifier';

import type {
  ContextMemory,
  DetectionLayer,
  DetectionResult,
  EngineConfig,
  QuestionCategory,
  RuleHit,
  SessionMode,
} from './types';

/**
 * The Question Detection Engine.
 *
 * Composes four layers in order:
 *   1. Fast rule engine    (sync, ~1 ms)
 *   2. Pattern recognition (sync, ~1 ms)
 *   3. Context memory      (sync, ~1 ms)
 *   4. AI classifier       (async, ~200-400 ms)
 *
 * Each layer contributes a RuleHit with a weight in [0, 1]. The engine
 * takes the MAX weight across layers as the final confidence (with
 * tie-breaking by layer order) and the matched layer is recorded for
 * logging. The segment is considered a question when:
 *
 *   - Confidence >= config.threshold
 *   - The matched layer / classifier said it is one
 *
 * Per-segment logs are emitted via the optional log() callback. The
 * Session mode is updated each time based on the rolling window of
 * recent categories.
 */

export interface DetectLog {
  segment: string;
  layer: DetectionLayer | null;
  rule?: string;
  category: QuestionCategory;
  sessionMode: SessionMode;
  confidence: number;
  isQuestion: boolean;
  classifierConfidence?: number;
  classifierCategory?: QuestionCategory;
  processingTimeMs: number;
  classifierSkipped?: boolean;
  classifierError?: string;
  classifierSkippedReason?: string;
}

export interface QuestionDetectionEngine {
  detect(segment: string, options?: { skipClassifier?: boolean }): Promise<DetectionResult>;
  setContext(context: ContextMemory): void;
  getContext(): ContextMemory;
  reset(): void;
  onLog?: (log: DetectLog) => void;
}

const EMPTY_CONTEXT: ContextMemory = {
  recentSegments: [],
  recentDetections: [],
  sessionMode: 'Unknown',
};

export function createQuestionDetectionEngine(
  initialConfig: EngineConfig,
): QuestionDetectionEngine {
  const config = initialConfig;
  let context: ContextMemory = { ...EMPTY_CONTEXT };

  const engine: QuestionDetectionEngine = {
    setContext(next) {
      context = next;
    },
    getContext() {
      return context;
    },
    reset() {
      context = { ...EMPTY_CONTEXT };
    },
    onLog: undefined,

    async detect(segment, options) {
      const start = Date.now();
      const trimmed = segment.trim();
      const log: DetectLog = {
        segment: trimmed,
        layer: null,
        category: 'Unknown',
        sessionMode: context.sessionMode,
        confidence: 0,
        isQuestion: false,
        processingTimeMs: 0,
      };

      if (!trimmed) {
        log.processingTimeMs = Date.now() - start;
        engine.onLog?.(log);
        return finalize(log, trimmed, start);
      }

      // ---- Layer 1: fast rules ----
      let hit: RuleHit | null = null;
      let matchedLayer: DetectionLayer | null = null;
      if (config.enableFastRules) {
        hit = fastRuleCheck(trimmed);
        if (hit) {
          matchedLayer = 'fast';
        }
      }

      // ---- Layer 2: configurable patterns ----
      if (!hit && config.enablePatterns) {
        const customParsed = parseCustomPatterns(config.customPatterns);
        const all = [...DEFAULT_INTERVIEW_PATTERNS, ...customParsed];
        const pat = patternCheck(trimmed, all);
        if (pat) {
          hit = pat;
          matchedLayer = 'pattern';
        }
      }

      // ---- Layer 3: context memory (follow-ups) ----
      if (!hit && config.enableContextMemory) {
        const ctx = contextCheck(trimmed, context);
        if (ctx) {
          hit = ctx;
          matchedLayer = 'context';
        }
      }

      // ---- Layer 4: AI classifier ----
      let classifierOutput: DetectionResult['classifier'];
      if (!options?.skipClassifier && config.enableClassifier) {
        // Skip the AI call if Layer 1/2 already produced a very high confidence hit
        // — saves API cost and latency for clear cases.
        if (!hit || hit.weight < 0.9) {
          try {
            const req = buildClassifierRequest(
              trimmed,
              context,
              hit ? { matched: true, rule: hit.rule, category: hit.category } : { matched: false },
            );
            const res = await classifyWithAi(req);
            classifierOutput = {
              isQuestion: res.isQuestion,
              confidence: res.confidence,
              category: res.category,
              sessionMode: res.sessionMode,
              topic: res.topic,
              reasoning: res.reasoning,
            };
            log.classifierConfidence = res.confidence;
            log.classifierCategory = res.category;

            // AI classifier can override or boost a weak hit
            const classifierWeight = Math.max(0, Math.min(1, res.confidence));
            if (res.isQuestion) {
              if (!hit || classifierWeight > hit.weight) {
                hit = {
                  layer: 'classifier',
                  rule: 'classifier',
                  weight: classifierWeight,
                  category: res.category,
                };
                matchedLayer = 'classifier';
              }
            } else if (!hit) {
              // Classifier said "not a question" — record a low-confidence
              // negative hit so we don't fire unless something else matches.
              hit = {
                layer: 'classifier',
                rule: 'classifier:no',
                weight: 1 - classifierWeight,
                category: res.category,
              };
              matchedLayer = 'classifier';
            }
          } catch (err) {
            log.classifierError = err instanceof Error ? err.message : String(err);
            log.classifierSkipped = true;
            log.classifierSkippedReason = 'request-failed';
            // Fall back to whatever the rule engine produced (or nothing)
          }
        } else {
          log.classifierSkipped = true;
          log.classifierSkippedReason = 'high-confidence-rule';
        }
      } else if (!config.enableClassifier) {
        log.classifierSkipped = true;
        log.classifierSkippedReason = 'disabled';
      }

      // ---- Combine ----
      const confidence = hit?.weight ?? 0;
      const category: QuestionCategory = hit?.category ?? classifierOutput?.category ?? 'Unknown';
      const sessionMode: SessionMode = classifierOutput?.sessionMode ?? context.sessionMode;
      const classifierSaidNo = hit?.rule === 'classifier:no';
      const isQuestion = !!hit && !classifierSaidNo && confidence >= config.threshold;

      const result: DetectionResult = {
        segment: trimmed,
        isQuestion,
        confidence,
        category,
        sessionMode,
        ruleHit: hit ?? undefined,
        classifier: classifierOutput,
        matchedLayer: matchedLayer ?? undefined,
        processingTimeMs: Date.now() - start,
        timestamp: Date.now(),
      };

      log.layer = matchedLayer;
      log.rule = hit?.rule;
      log.category = category;
      log.sessionMode = sessionMode;
      log.confidence = confidence;
      log.isQuestion = isQuestion;
      log.processingTimeMs = result.processingTimeMs;
      engine.onLog?.(log);

      // ---- Update context memory ----
      if (config.enableContextMemory || config.enableClassifier) {
        const win = Math.max(8, config.contextWindowSize);
        context = {
          recentSegments: [...context.recentSegments, trimmed].slice(-win),
          recentDetections: [
            ...context.recentDetections,
            { isQuestion, category, sessionMode },
          ].slice(-Math.max(20, win)),
          sessionMode: inferSessionMode(context, [
            ...context.recentDetections.map((d) => d.category),
            category,
          ]),
        };
      }

      return result;
    },
  };

  return engine;
}

function finalize(log: DetectLog, segment: string, start: number): DetectionResult {
  return {
    segment,
    isQuestion: false,
    confidence: 0,
    category: 'Unknown',
    sessionMode: 'Unknown',
    processingTimeMs: Date.now() - start,
    timestamp: Date.now(),
  };
}
