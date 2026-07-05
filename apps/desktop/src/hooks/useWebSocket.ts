import { useEffect, useRef, useCallback, useState } from 'react';
import { WsClient, type WsEvent } from '../lib/ws-client';
import { useAuthStore } from '../stores/auth';

const WS_URL = import.meta.env.VITE_CLOUD_API_URL?.replace('http', 'ws') || 'ws://localhost:4000';
let globalClient: WsClient | null = null;

function getClient(): WsClient {
  if (!globalClient) {
    globalClient = new WsClient(WS_URL);
  }
  return globalClient;
}

export function useWebSocket() {
  const clientRef = useRef<WsClient>(getClient());
  const [connected, setConnected] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      clientRef.current.disconnect();
      setConnected(false);
      return;
    }

    clientRef.current.connect();

    const unsubConnected = clientRef.current.on('connected', () => {
      setConnected(true);
    });

    const interval = setInterval(() => {
      setBufferedCount(clientRef.current.bufferedCount);
      setConnected(clientRef.current.connected);
    }, 2000);

    return () => {
      unsubConnected();
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const subscribe = useCallback((rooms: string[]) => {
    clientRef.current.subscribe(rooms);
  }, []);

  const unsubscribe = useCallback((rooms: string[]) => {
    clientRef.current.unsubscribe(rooms);
  }, []);

  const on = useCallback((eventType: string, handler: (event: WsEvent) => void) => {
    return clientRef.current.on(eventType, handler);
  }, []);

  const send = useCallback((data: Record<string, unknown>) => {
    clientRef.current.bufferEvent(data);
  }, []);

  return {
    ws: clientRef.current,
    connected,
    bufferedCount,
    subscribe,
    unsubscribe,
    on,
    send,
  };
}

export function useWsEvent(eventType: string, handler: (event: WsEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const client = getClient();
    const unsubscribe = client.on(eventType, (event) => {
      handlerRef.current(event);
    });
    return unsubscribe;
  }, [eventType]);
}

export { WsClient };
