import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
import { useToastStore } from './toast';

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

const STORAGE_KEY = 'echo-session-storage';

// Maximum number of transcript/AI-response items to persist to localStorage.
// This prevents the store from exceeding the browser's localStorage quota
// during very long sessions. In-memory arrays remain unbounded.
const MAX_PERSISTED_TRANSCRIPT_ITEMS = 500;
const MAX_PERSISTED_RESPONSE_ITEMS = 500;

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      currentSession: null,
      sessions: [],
      transcript: [],
      aiResponses: [],
      status: null,
      isLoading: false,

      createSession: async (data: NewSessionRequest) => {
        const session = await api.post<Session>('/sessions', data);
        set((state) => ({
          currentSession: session,
          status: session.status,
          transcript: [],
          aiResponses: [],
          sessions: [session, ...state.sessions],
        }));
        return session;
      },

      endSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        const updated = await api.post<Session>(`/sessions/${currentSession.id}/end`);
        set((state) => ({
          currentSession: updated,
          status: updated.status,
          sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
        }));
      },

      pauseSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        const updated = await api.post<Session>(`/sessions/${currentSession.id}/pause`);
        set((state) => ({
          currentSession: updated,
          status: updated.status,
          sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
        }));
      },

      resumeSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        const updated = await api.post<Session>(`/sessions/${currentSession.id}/resume`);
        set((state) => ({
          currentSession: updated,
          status: updated.status,
          sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
        }));
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
          set((state) => ({
            currentSession: updated,
            status: updated.status,
            sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
          }));
        } catch (err) {
          // Rollback the optimistic flip so the badge re-renders the prior type.
          // The server may still have applied the change despite us seeing the
          // error; in that case the eventual session.updated WS event will
          // re-converge to the new value.
          set((state) => {
            if (!state.currentSession) return state;
            const rolledBack = { ...state.currentSession, sessionType: previousSessionType };
            return {
              currentSession: rolledBack,
              sessions: state.sessions.map((s) => (s.id === rolledBack.id ? rolledBack : s)),
            };
          });
          throw err;
        }
      },

      addTranscriptSegment: (seg: TranscriptSegment) => {
        set((state) => {
          // Ignore echoes of segments already added locally or from another device
          if (state.transcript.some((t) => t.id === seg.id)) return state;
          return { transcript: [...state.transcript, seg] };
        });
      },

      addAiResponse: (resp: AiResponse) => {
        set((state) => {
          // Ignore echoes of responses already added locally or from another device
          if (state.aiResponses.some((r) => r.id === resp.id)) return state;
          return { aiResponses: [...state.aiResponses, resp] };
        });
      },

      fetchSessions: async () => {
        set({ isLoading: true });
        try {
          const res = await api.get<{ sessions: Session[] }>('/sessions');
          set({ sessions: res.sessions, isLoading: false });
        } catch {
          set({ isLoading: false });
          useToastStore.getState().pushToast({
            title: 'History unavailable',
            description: 'Could not refresh session history. Showing locally cached sessions.',
            variant: 'warning',
            durationMs: 6000,
          });
        }
      },

      fetchSession: async (id: string) => {
        set({ isLoading: true });
        try {
          const session = await api.get<Session>(`/sessions/${id}`);
          const serverTranscript = await api.get<TranscriptSegment[]>(`/sessions/${id}/transcript`);
          const serverAiResponses = await api.get<AiResponse[]>(`/sessions/${id}/responses`);

          // Merge server data with any local state we already have for this session.
          // This prevents losing unsynced transcript/AI-response data when the user
          // navigates away from an active session and comes back before the server
          // has persisted everything.
          const local = get();
          const isSameSession = local.currentSession?.id === id;
          const localTranscript = isSameSession ? local.transcript : [];
          const localAiResponses = isSameSession ? local.aiResponses : [];

          const mergedTranscript = mergeByIdSorted(
            [...serverTranscript, ...localTranscript],
            (t) => t.id,
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          const mergedAiResponses = mergeByIdSorted(
            [...serverAiResponses, ...localAiResponses],
            (r) => r.id,
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );

          set((state) => ({
            currentSession: session,
            transcript: mergedTranscript,
            aiResponses: mergedAiResponses,
            status: session.status,
            isLoading: false,
            sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
          }));
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
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      migrate: (persistedState) => persistedState,
      partialize: (state) => ({
        // Persist session metadata plus the current session's transcript and
        // AI responses. This prevents the SessionDetail page from appearing
        // blank when the user navigates away and returns before the server has
        // persisted every segment. Zustand throttles localStorage writes, so
        // the cost during active capture is acceptable. We cap the persisted
        // arrays to avoid exceeding the browser's localStorage quota during
        // very long sessions.
        currentSession: state.currentSession,
        sessions: state.sessions,
        transcript: state.transcript.slice(-MAX_PERSISTED_TRANSCRIPT_ITEMS),
        aiResponses: state.aiResponses.slice(-MAX_PERSISTED_RESPONSE_ITEMS),
      }),
    },
  ),
);

function mergeByIdSorted<T>(
  items: T[],
  getId: (item: T) => string,
  compare: (a: T, b: T) => number,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = getId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result.sort(compare);
}
