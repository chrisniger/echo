import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../stores/session';
import { useSettingsStore } from '../stores/settings';
import { gatewayApi } from '../lib/api';
import { buildContextMessages } from '../lib/context';
import { getAccessToken } from '../lib/auth';
import { getWsClient } from './useWebSocket';
import {
  createQuestionDetectionEngine,
  getPromptTemplate,
  getSessionTypePrompt,
  getSessionTypeSeed,
  type DetectLog,
  type DetectionResult,
  type EngineConfig,
  type QuestionCategory,
} from '../services/intelligence';
import type { SessionType } from '@echo-gpt/shared-types';

export interface UseSessionBackgroundOptions {
  enabled: boolean;
  source: 'microphone' | 'system' | 'mixed';
  transcriptionIntervalMs?: number;
  gatewayUrl?: string;
  questionCooldownMs?: number;
  onLog?: (line: string) => void;
  onCaptureStateChange?: (state: { isCapturing: boolean; source: string; error: string | null }) => void;
}

interface Segment {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments?: Segment[];
  provider?: string;
  error?: string;
}

async function transcribeViaTauri(
  gatewayUrl?: string,
): Promise<TranscriptionResult | null> {
  try {
    const result = await invoke<TranscriptionResult>('transcribe_audio', {
      gatewayUrl: gatewayUrl ?? null,
    });
    return result;
  } catch (err) {
    console.warn('[useSessionBackground] transcribe_audio failed:', err);
    return null;
  }
}

async function fetchAiAnswer(args: {
  question: string;
  questionCategory: QuestionCategory;
  sessionId: string;
  aiModel: string;
  additionalContext: string;
  cv: string;
  documents?: Array<{ name: string; content: string }>;
  language?: string;
  sessionType?: SessionType;
  transcriptSegments: Array<{ speaker: string; text: string; timestamp: number }>;
}): Promise<{ content: string; model: string; provider: string; tokensUsed: { total: number } } | null> {
  const template = getPromptTemplate(args.questionCategory);
  // Compose the additional-context block. The session-type opening directive
  // is prepended *once* by the AI Gateway's ContextAssembler when we forward
  // sessionType below — we deliberately do NOT inline it here to avoid
  // duplicating tokens.
  const contextBlocks = [
    args.additionalContext?.trim() ? `User-supplied additional context:\n${args.additionalContext.trim()}` : '',
    template.system?.trim() ? `Question-category goal (${args.questionCategory}):\n${template.system.trim()}` : '',
  ].filter(Boolean);
  const customContext = contextBlocks.join('\n\n');

  const messages = await buildContextMessages({
    cv: args.cv,
    customContext,
    documents: args.documents,
    transcript: args.transcriptSegments,
    language: args.language,
    sessionType: args.sessionType,
  });

  try {
    return await gatewayApi.post('/chat', {
      model: args.aiModel,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            `Detected question (${args.questionCategory}):\n${args.question}\n\n` +
            `Answer only this question in 2-5 sentences. ` +
            `Ground the answer in the candidate's CV and any user-supplied additional context.`,
        },
      ],
      stream: false,
      temperature: 0.7,
      maxTokens: 600,
      sessionId: args.sessionId,
    });
  } catch (err) {
    console.error('[useSessionBackground] AI chat failed:', err);
    return null;
  }
}

export function useSessionBackground({
  enabled,
  source,
  transcriptionIntervalMs = 5000,
  gatewayUrl,
  questionCooldownMs = 15000,
  onLog,
  onCaptureStateChange,
}: UseSessionBackgroundOptions): void {
  const captureRunningRef = useRef(false);
  const lastQuestionAtRef = useRef(0);
  const lastAcceptedTranscriptRef = useRef('');
  const lastAcceptedTranscriptAtRef = useRef(0);
  const pendingUtteranceRef = useRef<string[]>([]);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const engineRef = useRef<ReturnType<typeof createQuestionDetectionEngine> | null>(null);
  const transcriptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (captureRunningRef.current) {
        invoke('stop_capture').catch(() => undefined);
        captureRunningRef.current = false;
      }
      return;
    }

    let stopped = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const log = (line: string) => {
      const stamped = `[useSessionBackground ${new Date().toLocaleTimeString()}] ${line}`;
      console.log(stamped);
      onLog?.(stamped);
    };

    // Build the question-detection engine from current settings
    const qd = useSettingsStore.getState().settings.questionDetection ?? {
      enabled: true,
      threshold: 0.7,
      responseDelayMs: 0,
      contextWindowSize: 30,
      enableFastRules: true,
      enablePatterns: true,
      enableContextMemory: true,
      enableClassifier: false,
      questionPatterns: [],
    };
    const engineConfig: EngineConfig = {
      enabled: qd.enabled,
      threshold: qd.threshold,
      responseDelayMs: qd.responseDelayMs,
      contextWindowSize: qd.contextWindowSize,
      enableFastRules: qd.enableFastRules,
      enablePatterns: qd.enablePatterns,
      enableContextMemory: qd.enableContextMemory,
      enableClassifier: qd.enableClassifier,
      customPatterns: qd.questionPatterns ?? [],
      classifierModel: qd.classifierModel,
      gatewayUrl: gatewayUrl || (import.meta.env.VITE_GATEWAY_API_URL as string) || 'http://localhost:4001',
      getAccessToken,
    };
        const engine = createQuestionDetectionEngine(engineConfig);
    engine.onLog = (l: DetectLog) => {
      const layer = l.layer ?? 'none';
      log(
        `DETECT [${layer}] isQ=${l.isQuestion} conf=${l.confidence.toFixed(2)} cat=${l.category} ` +
        `mode=${l.sessionMode}${l.rule ? ` rule=${l.rule}` : ''}` +
        (l.classifierConfidence !== undefined ? ` classifier[conf=${l.classifierConfidence.toFixed(2)},cat=${l.classifierCategory}]` : '') +
        (l.classifierSkipped ? ` classifier=skip(${l.classifierSkippedReason})` : '') +
        (l.classifierError ? ` classifierError=${l.classifierError}` : '') +
        ` (${l.processingTimeMs}ms) text="${l.segment.slice(0, 80)}${l.segment.length > 80 ? '…' : ''}"`,
      );
    };

    // Seed the engine's context.sessionMode with the user-declared session
    // type so the Layer-4 classifier trusts the user's intent on segment 1.
    // The detection layer can still refine the mode as content unfolds.
    const session = useSessionStore.getState().currentSession;
    const initialSessionMode = getSessionTypeSeed(session?.sessionType);
    if (initialSessionMode !== 'Unknown') {
      engine.setContext({
        recentSegments: [],
        recentDetections: [],
        sessionMode: initialSessionMode,
      });
    }
    engineRef.current = engine;
    const startCapture = async () => {
      try {
        const state = await invoke<{ is_capturing: boolean }>('get_capture_state');
        if (state.is_capturing) {
          captureRunningRef.current = true;
          onCaptureStateChange?.({ isCapturing: true, source: sourceRef.current, error: null });
          log('Capture already running, reusing existing stream');
          return;
        }
        if (source === 'system') {
          await invoke('start_system_capture', { deviceName: null });
        } else if (source === 'mixed') {
          await invoke('start_mic_capture', { deviceName: null });
          await invoke('start_system_capture', { deviceName: null });
        } else {
          await invoke('start_mic_capture', { deviceName: null });
        }
        captureRunningRef.current = true;
        onCaptureStateChange?.({ isCapturing: true, source: sourceRef.current, error: null });
        log(`Started ${source} capture`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        captureRunningRef.current = false;
        onCaptureStateChange?.({ isCapturing: false, source: sourceRef.current, error: msg });
        log(`Capture start failed: ${msg}`);
      }
    };

    const handleSegments = async (segments: Segment[]) => {
      if (segments.length === 0) return;

      const session = useSessionStore.getState().currentSession;
      if (!session) return;

      const ws = getWsClient();
      const collectedTexts: string[] = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const text = (segment.text || '').trim();
        if (!text) continue;

        const confidence = segment.confidence ?? 0;
        if (confidence < 0.35) {
          log(`Ignoring low-confidence transcript (${confidence.toFixed(2)}): "${text}"`);
          continue;
        }

        // Silent audio can produce the same hallucinated phrase on every tick.
        // Accept the first occurrence, but suppress an exact repeat arriving
        // shortly afterwards so it cannot fill the transcript indefinitely.
        const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const now = Date.now();
        if (
          normalized &&
          normalized === lastAcceptedTranscriptRef.current &&
          now - lastAcceptedTranscriptAtRef.current < 30_000
        ) {
          log(`Ignoring repeated transcript: "${text}"`);
          continue;
        }
        lastAcceptedTranscriptRef.current = normalized;
        lastAcceptedTranscriptAtRef.current = now;

        collectedTexts.push(text);

        const segId = crypto.randomUUID();
        const segTimestamp = Date.now();
        useSessionStore.getState().addTranscriptSegment({
          id: segId,
          sessionId: session.id,
          speakerId: 'unknown',
          speakerLabel: i === 0 ? 'Interviewer' : 'Speaker',
          text,
          confidence,
          startTime: segment.start ?? 0,
          endTime: segment.end ?? segment.start ?? 0,
          isEdited: false,
          createdAt: new Date().toISOString(),
        });

        ws.send({
          action: 'transcript.update',
          data: {
            sessionId: session.id,
            speaker: i === 0 ? 'Interviewer' : 'Speaker',
            text,
            timestamp: segTimestamp,
            confidence,
            isFinal: true,
          },
        });
      }

      // Keep each 5-second result in the current utterance. Question
      // detection is intentionally deferred until a later tick contains no
      // speech, otherwise a long question is sent to the AI one partial
      // batch at a time.
      pendingUtteranceRef.current.push(...collectedTexts);
    };

    const flushPendingUtterance = async () => {
      const pending = pendingUtteranceRef.current.splice(0);
      const combinedText = pending.join(' ').replace(/\s+/g, ' ').trim();
      if (!combinedText) return;

      const session = useSessionStore.getState().currentSession;
      if (!session) return;
      const ws = getWsClient();

      let detection: DetectionResult;
      try {
        detection = await engine.detect(combinedText);
      } catch (err) {
        log(`Detection error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      if (!detection.isQuestion) {
        return;
      }

      const now = Date.now();
      if (now - lastQuestionAtRef.current < questionCooldownMs) {
        log(`Question (${detection.matchedLayer ?? '?'}@${detection.confidence.toFixed(2)}, ${detection.category}) within cooldown, skipping: "${combinedText}"`);
        return;
      }
      lastQuestionAtRef.current = now;

      log(`Question (${detection.matchedLayer ?? '?'}@${detection.confidence.toFixed(2)}, ${detection.category}, mode=${detection.sessionMode}): "${combinedText}" — sending to AI`);

      const recentSegments = useSessionStore
        .getState()
        .transcript
        .slice(-10)
        .map((t) => ({
          speaker: t.speakerLabel || 'Speaker',
          text: t.text,
          timestamp: t.startTime || 0,
        }));

      const answer = await fetchAiAnswer({
        question: combinedText,
        questionCategory: detection.category,
        sessionId: session.id,
        aiModel: session.aiModel || 'deepseek-chat',
        additionalContext: (session as any).additionalContext || (session as any).context || '',
        cv: (session as any).cvContent || '',
        documents: (session as any).documents,
        language: session.language,
        sessionType: session.sessionType,
        transcriptSegments: recentSegments,
      });

      if (!answer) {
        log(`AI answer fetch failed for category=${detection.category}`);
        return;
      }

      const responseId = crypto.randomUUID();
      useSessionStore.getState().addAiResponse({
        id: responseId,
        sessionId: session.id,
        query: combinedText,
        response: answer.content,
        model: answer.model,
        provider: answer.provider,
        tokensUsed: answer.tokensUsed.total,
        createdAt: new Date().toISOString(),
      });

      ws.send({
        action: 'ai.response',
        data: {
          sessionId: session.id,
          content: answer.content,
          isFinal: true,
          finishReason: 'stop',
          tokensUsed: answer.tokensUsed,
          query: combinedText,
          responseId,
          category: detection.category,
          sessionMode: detection.sessionMode,
          confidence: detection.confidence,
        },
      });
      log(`AI response broadcast (${answer.content.length} chars, ${answer.tokensUsed.total} tokens, ${detection.category}/${detection.sessionMode})`);
    };

    const tick = async () => {
      if (stopped) return;
      if (!getAccessToken()) {
        log('No auth token yet, skipping transcription tick');
        return;
      }
      const result = await transcribeViaTauri(gatewayUrl);
      if (!result) {
        log('Transcription tick: Tauri command returned null');
        return;
      }
      if (result.error) {
        log(`STT error: ${result.error}`);
        return;
      }
      if (!result.segments || result.segments.length === 0) {
        if (result.provider === 'none') {
          log('No STT provider configured (set GROQ_API_KEY in ai-gateway/.env)');
        } else {
          log(`Transcription tick: 0 segments (${result.duration.toFixed(1)}s of audio, provider ${result.provider ?? 'unknown'})`);
        }
        // A no-speech tick is the end-of-utterance boundary. Flush all
        // transcript batches collected since the previous silence.
        await flushPendingUtterance();
        return;
      }
      log(`Transcribed ${result.segments.length} segment(s) via ${result.provider ?? 'unknown'}`);
      await handleSegments(result.segments);
    };
    tickRef.current = tick;

    (async () => {
      await startCapture();
      if (stopped) return;

      void tick();

      pollTimer = setInterval(async () => {
        try {
          const state = await invoke<{ is_capturing: boolean }>('get_capture_state');
          captureRunningRef.current = state.is_capturing;
        } catch {
          /* ignore */
        }
      }, 3000);
    })();

    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (captureRunningRef.current) {
        invoke('stop_capture').catch(() => undefined);
        captureRunningRef.current = false;
        onCaptureStateChange?.({ isCapturing: false, source: sourceRef.current, error: null });
      }
      engineRef.current = null;
    };
  }, [enabled, source, gatewayUrl, questionCooldownMs, onLog, onCaptureStateChange]);

  useEffect(() => {
    if (!enabled) {
      if (transcriptionTimerRef.current) {
        clearInterval(transcriptionTimerRef.current);
        transcriptionTimerRef.current = null;
      }
      return;
    }

    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current);
      transcriptionTimerRef.current = null;
    }

    if (!tickRef.current) return;

    transcriptionTimerRef.current = setInterval(() => {
      void tickRef.current?.();
    }, transcriptionIntervalMs);

    return () => {
      if (transcriptionTimerRef.current) {
        clearInterval(transcriptionTimerRef.current);
        transcriptionTimerRef.current = null;
      }
    };
  }, [enabled, transcriptionIntervalMs]);
}
