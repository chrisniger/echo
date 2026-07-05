import { useState, useRef, useCallback } from 'react';

interface MediaRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  error: string | null;
}

interface UseMediaRecorderReturn extends MediaRecorderState {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export function useMediaRecorder(): UseMediaRecorderReturn {
  const [state, setState] = useState<MediaRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearDurationInterval = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    clearDurationInterval();
    setState((prev) => ({ ...prev, duration: 0 }));
    durationIntervalRef.current = setInterval(() => {
      setState((prev) => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);
  }, [clearDurationInterval]);

  const start = useCallback(async () => {
    try {
      chunksRef.current = [];

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setState((prev) => ({ ...prev, error: 'Microphone access denied. Audio capture is unavailable.' }));
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        setState((prev) => ({ ...prev, error: 'Recording error occurred' }));
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        clearDurationInterval();
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          audioBlob: blob,
        }));
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      startDurationTimer();
      setState((prev) => ({ ...prev, isRecording: true, isPaused: false, error: null, audioBlob: null }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [clearDurationInterval, startDurationTimer]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      clearDurationInterval();
      setState((prev) => ({ ...prev, isPaused: true }));
    }
  }, [clearDurationInterval]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      startDurationTimer();
      setState((prev) => ({ ...prev, isPaused: false }));
    }
  }, [startDurationTimer]);

  return {
    ...state,
    start,
    stop,
    pause,
    resume,
  };
}
