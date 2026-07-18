import { useEffect, useRef } from 'react';
import { WsClient, type WsEvent } from '../lib/ws-client';
import { useSessionStore } from '../stores/session';
import { useAuthStore } from '../stores/auth';
import { useDeviceStore } from '../stores/device';
import { useToastStore } from '../stores/toast';
import { askAssistant } from '../services/chatService';
import { onAuthRefresh } from '../lib/api';

let wsClientInstance: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!wsClientInstance) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';
    wsClientInstance = new WsClient(wsUrl);
  }
  return wsClientInstance;
}

export function useWebSocket() {
  const wsClient = getWsClient();
  const addTranscriptSegment = useSessionStore(state => state.addTranscriptSegment);
  const addAiResponse = useSessionStore(state => state.addAiResponse);
  const currentSession = useSessionStore(state => state.currentSession);
  const updateCurrentSessionType = useSessionStore(state => state.updateCurrentSessionType);
  const updateCurrentSessionTranscriptionInterval = useSessionStore(
    state => state.updateCurrentSessionTranscriptionInterval,
  );
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const addDevice = useDeviceStore(state => state.addDevice);
  const setConnected = useDeviceStore(state => state.setConnected);
  const updateDevice = useDeviceStore(state => state.updateDevice);
  const inFlightRef = useRef<Set<string>>(new Set());
  const seenAiResponseIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      wsClient.disconnect();
      return;
    }

    wsClient.connect();

    if (currentSession) {
      wsClient.subscribe([currentSession.id]);
    }

    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      wsClient.subscribe([`user:${userId}`]);
    }

    // Reconnect whenever the access token is refreshed in the background so
    // the WS doesn't keep using a stale JWT.
    const unsubscribeRefresh = onAuthRefresh(() => {
      wsClient.disconnect();
      setTimeout(() => {
        wsClient.connect();
        if (currentSession) wsClient.subscribe([currentSession.id]);
        const uid = useAuthStore.getState().user?.id;
        if (uid) wsClient.subscribe([`user:${uid}`]);
      }, 100);
    });

    return () => {
      unsubscribeRefresh();
      wsClient.disconnect();
    };
  }, [isAuthenticated, currentSession?.id]);

  useEffect(() => {
    const unsubscribeTranscript = wsClient.on('transcript.update', (event) => {
      if (event.type === 'transcript.update') {
        const { data } = event;
        if (data.sessionId === currentSession?.id) {
          addTranscriptSegment({
            id: crypto.randomUUID(),
            sessionId: data.sessionId,
            speakerId: 'unknown',
            speakerLabel: data.speaker,
            text: data.text,
            confidence: data.confidence,
            startTime: data.timestamp,
            endTime: data.timestamp + 1,
            isEdited: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });

    const unsubscribeAiResponse = wsClient.on('ai.response', (event) => {
      if (event.type === 'ai.response') {
        const { data } = event;
        if (data.sessionId === currentSession?.id && data.isFinal) {
          const responseId = typeof data.responseId === 'string' ? data.responseId : undefined;
          if (responseId && seenAiResponseIdsRef.current.has(responseId)) {
            return;
          }
          if (responseId) {
            seenAiResponseIdsRef.current.add(responseId);
            if (seenAiResponseIdsRef.current.size > 200) {
              const first = seenAiResponseIdsRef.current.values().next().value;
              if (first) seenAiResponseIdsRef.current.delete(first);
            }
          }
          addAiResponse({
            id: responseId || crypto.randomUUID(),
            sessionId: data.sessionId,
            query: data.query || '',
            response: data.content,
            model: data.model || 'unknown',
            provider: data.provider || 'unknown',
            tokensUsed: data.tokensUsed?.total || 0,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });

    // Companion → Desktop: companion asked a question; Desktop calls the AI and
    // publishes an ai.response that the companion will receive.
    const unsubscribeAiRequest = wsClient.on('ai.request', (event) => {
      if (event.type !== 'ai.request') return;
      const { sessionId, content } = event.data;
      if (!sessionId || !content) return;

      const session = useSessionStore.getState().currentSession;
      if (!session || session.id !== sessionId) return;

      const dedupeKey = `${sessionId}:${content}`;
      if (inFlightRef.current.has(dedupeKey)) return;
      inFlightRef.current.add(dedupeKey);

      askAssistant({
        sessionId,
        query: content,
        model: session.aiModel || 'deepseek-chat',
        additionalContext: (session as any).additionalContext || (session as any).context || '',
        cv: (session as any).cvContent || '',
        documents: (session as any).documents,
        language: session.language,
      }).finally(() => {
        // Keep the dedupe key for a short while to ignore duplicate echoes
        setTimeout(() => inFlightRef.current.delete(dedupeKey), 30_000);
      });
    });

    const unsubscribeSession = wsClient.on('session.start', (event) => {
      if (event.type === 'session.start') console.log('Session started:', event.data);
    });

    const unsubscribeSessionPause = wsClient.on('session.pause', (event) => {
      if (event.type === 'session.pause') console.log('Session paused:', event.data);
    });

    const unsubscribeSessionResume = wsClient.on('session.resume', (event) => {
      if (event.type === 'session.resume') console.log('Session resumed:', event.data);
    });

    const unsubscribeSessionEnd = wsClient.on('session.end', (event) => {
      if (event.type === 'session.end') console.log('Session ended:', event.data);
    });

    // Mid-session reclassification: cloud-api PATCH /api/sessions/:id was applied
    // (either by this instance or by another connected device / the companion).
    // If the change applies to the locally-active session, patch the store so
    // SessionTypeBadge + the promptRouter pick up the new persona on next tick.
    const unsubscribeSessionUpdated = wsClient.on('session.updated', (event) => {
      if (event.type !== 'session.updated') return;
      const { sessionId, sessionType, previousSessionType, transcriptionIntervalMs } = event.data;
      const local = useSessionStore.getState().currentSession;
      if (!local || local.id !== sessionId) return;
      updateCurrentSessionType(sessionType);
      if (typeof transcriptionIntervalMs === 'number') {
        updateCurrentSessionTranscriptionInterval(transcriptionIntervalMs);
      }
      if (previousSessionType && previousSessionType !== sessionType) {
        useToastStore.getState().pushToast({
          title: 'Session reclassified',
          description: `${previousSessionType} → ${sessionType}`,
          variant: 'default',
        });
      }
    });

    const unsubscribeDeviceConnected = wsClient.on('device.connected', (event) => {
      if (event.type === 'device.connected') {
        const { data } = event;
        addDevice({
          id: data.deviceId,
          name: data.deviceName,
          platform: data.platform as 'ios' | 'android' | 'web',
          connected: true,
          lastSync: Date.now(),
          signalStrength: 'excellent',
        });
      }
    });

    const unsubscribeDeviceDisconnected = wsClient.on('device.disconnected', (event) => {
      if (event.type === 'device.disconnected') {
        const { data } = event;
        setConnected(data.deviceId, false);
      }
    });

    return () => {
      unsubscribeTranscript();
      unsubscribeAiResponse();
      unsubscribeAiRequest();
      unsubscribeSession();
      unsubscribeSessionPause();
      unsubscribeSessionResume();
      unsubscribeSessionEnd();
      unsubscribeSessionUpdated();
      unsubscribeDeviceConnected();
      unsubscribeDeviceDisconnected();
    };
  }, [
    currentSession?.id,
    addTranscriptSegment,
    addAiResponse,
    addDevice,
    setConnected,
    updateDevice,
    updateCurrentSessionType,
    updateCurrentSessionTranscriptionInterval,
  ]);

  return {
    wsClient,
    isConnected: wsClient.connected,
    subscribe: (rooms: string[]) => wsClient.subscribe(rooms),
    unsubscribe: (rooms: string[]) => wsClient.unsubscribe(rooms),
    send: (data: Record<string, unknown>) => wsClient.send(data),
  };
}
