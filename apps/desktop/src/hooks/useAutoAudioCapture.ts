import { useEffect, useRef } from 'react';
import { audioService, type CaptureState } from '../services/audio';

export interface UseAutoAudioCaptureOptions {
  enabled: boolean;
  source?: 'microphone' | 'system' | 'mixed';
  onError?: (err: Error) => void;
}

export function useAutoAudioCapture({ enabled, source = 'microphone', onError }: UseAutoAudioCaptureOptions) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (startedRef.current) {
        audioService.stopCapture().catch(() => undefined);
        startedRef.current = false;
      }
      return;
    }

    if (startedRef.current) return;

    (async () => {
      try {
        const state: CaptureState = await audioService.getCaptureState();
        if (state.is_capturing) {
          startedRef.current = true;
          return;
        }

        if (source === 'system') {
          await audioService.startSystemAudioCapture();
        } else if (source === 'mixed') {
          await audioService.startMicrophoneCapture();
          await audioService.startSystemAudioCapture();
        } else {
          await audioService.startMicrophoneCapture();
        }
        startedRef.current = true;
      } catch (err) {
        startedRef.current = false;
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      if (startedRef.current) {
        audioService.stopCapture().catch(() => undefined);
        startedRef.current = false;
      }
    };
  }, [enabled, source, onError]);
}
