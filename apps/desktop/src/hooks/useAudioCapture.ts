import { useState, useEffect, useCallback, useRef } from 'react';
import { audioService, type AudioDevice, type CaptureState, type TranscriptionResult } from '../services/audio';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '../stores/session';
import { useSettingsStore } from '../stores/settings';
import { gatewayApi } from '../lib/api';
import { createQuestionDetectionEngine, type EngineConfig } from '../services/intelligence';

export type AudioSource = 'microphone' | 'system' | 'mixed';

interface UseAudioCaptureOptions {
  autoStart?: boolean;
  source?: AudioSource;
  deviceId?: string;
  continuousTranscription?: boolean;
  transcriptionInterval?: number; // milliseconds
  onTranscription?: (result: TranscriptionResult) => void;
  onQuestionDetected?: (question: string) => void;
  onError?: (error: Error) => void;
}

interface UseAudioCaptureReturn {
  isCapturing: boolean;
  captureState: CaptureState;
  devices: AudioDevice[];
  currentSource: AudioSource;
  startCapture: (source?: AudioSource, deviceId?: string) => Promise<void>;
  stopCapture: () => Promise<void>;
  transcribe: () => Promise<TranscriptionResult | null>;
  refreshDevices: () => Promise<void>;
  error: string | null;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}): UseAudioCaptureReturn {
  const {
    autoStart = false,
    source: initialSource = 'microphone',
    deviceId,
    continuousTranscription = false,
    transcriptionInterval = 5000, // Transcribe every 5 seconds
    onTranscription,
    onQuestionDetected,
    onError
  } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureState>({
    is_capturing: false,
    device_name: '',
    source: 'unknown',
  });
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [currentSource, setCurrentSource] = useState<AudioSource>(initialSource);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<number | null>(null);
  const transcriptionIntervalRef = useRef<number | null>(null);
  const addTranscriptSegment = useSessionStore(state => state.addTranscriptSegment);
  const currentSession = useSessionStore(state => state.currentSession);

  const refreshDevices = useCallback(async () => {
    try {
      const deviceList = await audioService.listAudioDevices();
      setDevices(deviceList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list devices';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [onError]);

  const startCapture = useCallback(async (source?: AudioSource, selectedDeviceId?: string) => {
    try {
      setError(null);
      const captureSource = source || currentSource;

      if (captureSource === 'microphone') {
        await audioService.startMicrophoneCapture(selectedDeviceId || deviceId);
      } else if (captureSource === 'system') {
        await audioService.startSystemAudioCapture(selectedDeviceId || deviceId);
      } else if (captureSource === 'mixed') {
        await audioService.startMicrophoneCapture(selectedDeviceId || deviceId);
        await audioService.startSystemAudioCapture(selectedDeviceId || deviceId);
      }

      setCurrentSource(captureSource);
      setIsCapturing(true);
      
      // Start polling for capture state
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(async () => {
        const state = await audioService.getCaptureState();
        setCaptureState(state);
        if (!state.is_capturing) {
          setIsCapturing(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, 1000);

      // Start continuous transcription if enabled
      if (continuousTranscription) {
        if (transcriptionIntervalRef.current) {
          clearInterval(transcriptionIntervalRef.current);
        }
        transcriptionIntervalRef.current = window.setInterval(async () => {
          try {
            const result = await audioService.transcribeAudio();
            if (result && result.segments && result.segments.length > 0) {
              const combinedText = result.segments
                .map((segment) => segment.text.trim())
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

              onTranscription?.(result);
              
              // Add segments to session store
              if (currentSession) {
                for (const segment of result.segments) {
                  addTranscriptSegment({
                    id: crypto.randomUUID(),
                    sessionId: currentSession.id,
                    speakerId: 'unknown',
                    speakerLabel: 'Speaker',
                    text: segment.text,
                    confidence: segment.confidence || 0,
                    startTime: segment.start,
                    endTime: segment.end,
                    isEdited: false,
                    createdAt: new Date().toISOString(),
                  });
                }
              }

              // Detect questions once per batch so the AI sees the combined
              // utterance instead of a partial STT slice.
              const settings = useSettingsStore.getState().settings;
              const qd = settings.questionDetection;
              if (qd?.enabled !== false) {
                const engineConfig: EngineConfig = {
                  enabled: true,
                  threshold: qd?.threshold ?? 0.7,
                  responseDelayMs: qd?.responseDelayMs ?? 0,
                  contextWindowSize: qd?.contextWindowSize ?? 30,
                  enableFastRules: qd?.enableFastRules ?? true,
                  enablePatterns: qd?.enablePatterns ?? true,
                  enableContextMemory: qd?.enableContextMemory ?? true,
                  enableClassifier: false, // skip classifier for manual trigger
                  customPatterns: qd?.questionPatterns ?? [],
                  classifierModel: qd?.classifierModel,
                  gatewayUrl: 'http://localhost:4001',
                  getAccessToken: () => null,
                };
                const engine = createQuestionDetectionEngine(engineConfig);
                const detected = await engine.detect(combinedText, { skipClassifier: true });
                if (detected.isQuestion) {
                  onQuestionDetected?.(combinedText);
                }
              }
            }
          } catch (err) {
            console.error('[Continuous Transcription] Error:', err);
          }
        }, transcriptionInterval);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start capture';
      setError(errorMessage);
      setIsCapturing(false);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [currentSource, deviceId, onError, continuousTranscription, transcriptionInterval, currentSession, addTranscriptSegment, onTranscription, onQuestionDetected]);

  const stopCapture = useCallback(async () => {
    try {
      setError(null);
      const state = await audioService.stopCapture();
      setCaptureState(state);
      setIsCapturing(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (transcriptionIntervalRef.current) {
        clearInterval(transcriptionIntervalRef.current);
        transcriptionIntervalRef.current = null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop capture';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [onError]);

  const transcribe = useCallback(async () => {
    try {
      setError(null);
      const result = await audioService.transcribeAudio();
      onTranscription?.(result);
      
      // Add segments to session store if we have an active session
      if (currentSession && result.segments) {
        for (const segment of result.segments) {
          addTranscriptSegment({
            id: crypto.randomUUID(),
            sessionId: currentSession.id,
            speakerId: 'unknown',
            speakerLabel: 'Speaker',
            text: segment.text,
            confidence: segment.confidence || 0,
            startTime: segment.start,
            endTime: segment.end,
            isEdited: false,
            createdAt: new Date().toISOString(),
          });

          // Detect questions and trigger AI response
          const settings = useSettingsStore.getState().settings;
          const qd = settings.questionDetection;
          if (qd?.enabled !== false) {
            const engineConfig: EngineConfig = {
              enabled: true,
              threshold: qd?.threshold ?? 0.7,
              responseDelayMs: qd?.responseDelayMs ?? 0,
              contextWindowSize: qd?.contextWindowSize ?? 30,
              enableFastRules: qd?.enableFastRules ?? true,
              enablePatterns: qd?.enablePatterns ?? true,
              enableContextMemory: qd?.enableContextMemory ?? true,
              enableClassifier: false, // skip classifier for manual trigger
              customPatterns: qd?.questionPatterns ?? [],
              classifierModel: qd?.classifierModel,
              gatewayUrl: 'http://localhost:4001',
              getAccessToken: () => null,
            };
            const engine = createQuestionDetectionEngine(engineConfig);
            const result = await engine.detect(segment.text, { skipClassifier: true });
            if (result.isQuestion) {
              onQuestionDetected?.(segment.text);
            }
          }
        }
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      return null;
    }
  }, [currentSession, addTranscriptSegment, onTranscription, onQuestionDetected, onError]);

  // Initialize
  useEffect(() => {
    audioService.initialize().then(async () => {
      await refreshDevices();
      // Sync UI with whatever the Rust side is already doing (e.g. the
      // useSessionBackground hook may have started capture automatically).
      try {
        const rustState = await invoke<CaptureState>('get_capture_state');
        if (rustState.is_capturing) {
          setIsCapturing(true);
          setCaptureState(rustState);
        }
      } catch {
        /* not yet available */
      }
      if (autoStart) {
        startCapture();
      }
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (transcriptionIntervalRef.current) {
        clearInterval(transcriptionIntervalRef.current);
      }
      if (isCapturing) {
        stopCapture();
      }
    };
  }, []);

  return {
    isCapturing,
    captureState,
    devices,
    currentSource,
    startCapture,
    stopCapture,
    transcribe,
    refreshDevices,
    error,
  };
}
