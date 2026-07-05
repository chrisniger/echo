import { create } from 'zustand';
import type {
  Session,
  TranscriptSegment,
  AiResponse,
  NewSessionRequest,
  SessionStatus,
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
  addTranscriptSegment: (seg: TranscriptSegment) => void;
  addAiResponse: (resp: AiResponse) => void;
  fetchSessions: () => Promise<void>;
  fetchSession: (id: string) => Promise<void>;
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
}));
