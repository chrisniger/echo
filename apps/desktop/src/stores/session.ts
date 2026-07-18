import { create } from 'zustand';
import type {
  Session,
  SessionType,
  TranscriptSegment,
  AiResponse,
  NewSessionRequest,
  SessionStatus,
  AudioSource,
} from '@echo-gpt/shared-types';
import { api } from '../lib/api';

interface SessionState {
  currentSession: Session | null;
  sessions: Session[];
  transcript: TranscriptSegment[];
  aiResponses: AiResponse[];
  status: SessionStatus | null;
  isLoading: boolean;

  createSession: (data: NewSessionRequest) => Promise<Session>;
  endSession: () => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  /**
   * PATCH /api/sessions/:id with `{ sessionType }` — reclassify a mid-session
   * type (e.g. user realises this is a "Customer Support" call, not "General").
   * Optimistic update: store flips immediately, rolls back on API error.
   * The server broadcasts session.updated over WebSocket, so all connected
   * devices (this desktop + companion + any other desktop) converge to the
   * same value without polling.
   */
  reclassifySession: (sessionType: SessionType) => Promise<void>;
  addTranscriptSegment: (seg: TranscriptSegment) => void;
  addAiResponse: (resp: AiResponse) => void;
  fetchSessions: () => Promise<void>;
  fetchSession: (id: string) => Promise<void>;
  /**
   * Update the current session's audio source locally (no API call).
   * Used by the inline "change source" control in SessionDetail.
   * useSessionBackground reads this via the store, so the engine
   * restarts with the new source on the next effect tick.
   */
  setCurrentSessionAudioSource: (source: AudioSource) => void;
  /**
   * Replace the current session's sessionType locally (no API call).
   * Triggered by the `session.updated` WS event when another device
   * (or the paired companion) reclassifies the session. Anything that
   * reads `currentSession.sessionType` (SessionTypeBadge, promptRouter)
   * picks up the new value on the next render.
   */
  updateCurrentSessionType: (sessionType: SessionType) => void;
  updateCurrentSessionTranscriptionInterval: (transcriptionIntervalMs: number) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSession: null,
  sessions: [],
  transcript: [],
  aiResponses: [],
  status: null,
  isLoading: false,

  createSession: async (data: NewSessionRequest) => {
    const session = await api.post<Session>('/sessions', data);
    set({ currentSession: session, status: session.status, transcript: [], aiResponses: [] });
    return session;
  },

  endSession: async () => {
    const { currentSession } = get();
    if (!currentSession) return;
    const updated = await api.post<Session>(`/sessions/${currentSession.id}/end`);
    set({ currentSession: updated, status: updated.status });
  },

  pauseSession: async () => {
    const { currentSession } = get();
    if (!currentSession) return;
    const updated = await api.post<Session>(`/sessions/${currentSession.id}/pause`);
    set({ currentSession: updated, status: updated.status });
  },

  resumeSession: async () => {
    const { currentSession } = get();
    if (!currentSession) return;
    const updated = await api.post<Session>(`/sessions/${currentSession.id}/resume`);
    set({ currentSession: updated, status: updated.status });
  },

  reclassifySession: async (sessionType: SessionType) => {
    const { currentSession } = get();
    if (!currentSession) return;
    // Server treats "= previous value" as a no-op (returns 200 + no broadcast),
    // so a local no-op is consistent and saves the round-trip.
    if (currentSession.sessionType === sessionType) return;
    // Defensive precheck matches cloud-api's 409 — UI also hides the dropdown
    // when status === 'ended', but a stale render could still submit here.
    if (currentSession.status === 'ended') {
      throw new Error('Cannot reclassify an ended session');
    }
    // Optimistic update — flip the badge immediately for snappy UX.
    const previousSessionType = currentSession.sessionType;
    set({ currentSession: { ...currentSession, sessionType } });
    try {
      const updated = await api.patch<Session>(`/sessions/${currentSession.id}`, {
        sessionType,
      });
      set({ currentSession: updated, status: updated.status });
    } catch (err) {
      // Rollback the optimistic flip so the badge re-renders the prior type.
      // The server may still have applied the change despite us seeing the
      // error; in that case the eventual session.updated WS event will
      // re-converge to the new value.
      set((state) =>
        state.currentSession
          ? { currentSession: { ...state.currentSession, sessionType: previousSessionType } }
          : state,
      );
      throw err;
    }
  },

  addTranscriptSegment: (seg: TranscriptSegment) => {
    set((state) => ({ transcript: [...state.transcript, seg] }));
  },

  addAiResponse: (resp: AiResponse) => {
    set((state) => ({ aiResponses: [...state.aiResponses, resp] }));
  },

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<{ sessions: Session[] }>('/sessions');
      set({ sessions: res.sessions, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchSession: async (id: string) => {
    set({ isLoading: true });
    try {
      const session = await api.get<Session>(`/sessions/${id}`);
      const transcript = await api.get<TranscriptSegment[]>(`/sessions/${id}/transcript`);
      const aiResponses = await api.get<AiResponse[]>(`/sessions/${id}/responses`);
      set({ currentSession: session, transcript, aiResponses, status: session.status, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setCurrentSessionAudioSource: (source) => {
    const { currentSession } = get();
    if (!currentSession) return;
    set({ currentSession: { ...currentSession, audioSource: source } });
  },

  updateCurrentSessionType: (sessionType) => {
    const { currentSession } = get();
    if (!currentSession) return;
    if (currentSession.sessionType === sessionType) return;
    set({ currentSession: { ...currentSession, sessionType } });
  },

  updateCurrentSessionTranscriptionInterval: (transcriptionIntervalMs) => {
    const { currentSession } = get();
    if (!currentSession) return;
    if (currentSession.transcriptionIntervalMs === transcriptionIntervalMs) return;
    set({ currentSession: { ...currentSession, transcriptionIntervalMs } });
  },
}));
