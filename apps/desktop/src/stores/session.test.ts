import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session, TranscriptSegment, AiResponse } from '@echo-gpt/shared-types';
import { api } from '../lib/api';
import { useSessionStore } from './session';

// Mock the API client so fetchSession/fetchSessions don't hit the network.
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock the toast store so failed fetches don't need a real DOM.
vi.mock('./toast', () => ({
  useToastStore: {
    getState: vi.fn(() => ({ pushToast: vi.fn() })),
  },
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    status: 'active',
    aiModel: 'gpt-4',
    responseStyle: 'concise',
    language: 'en',
    audioSource: 'system',
    transcriptionIntervalMs: 5000,
    sessionType: 'General',
    startedAt: '2023-01-01T10:00:00.000Z',
    endedAt: null,
    duration: 0,
    transcriptCount: 0,
    aiResponseCount: 0,
    screenshotCount: 0,
    tags: [],
    summary: null,
    ...overrides,
  };
}

function makeTranscript(id: string, text: string, createdAt: string): TranscriptSegment {
  return {
    id,
    sessionId: 'session-1',
    speakerId: 'speaker-1',
    speakerLabel: 'Speaker',
    text,
    confidence: 0.95,
    startTime: 0,
    endTime: 1,
    isEdited: false,
    createdAt,
  };
}

function makeAiResponse(id: string, response: string, createdAt: string): AiResponse {
  return {
    id,
    sessionId: 'session-1',
    query: 'test query',
    response,
    model: 'gpt-4',
    provider: 'openai',
    tokensUsed: 100,
    createdAt,
  };
}

describe('useSessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Merge (not replace) so the zustand action methods are preserved.
    useSessionStore.setState({
      currentSession: null,
      sessions: [],
      transcript: [],
      aiResponses: [],
      status: null,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  describe('persistence', () => {
    it('persists currentSession and sessions to localStorage', () => {
      const session = makeSession();
      useSessionStore.setState({ currentSession: session, sessions: [session] });

      const stored = localStorage.getItem('echo-session-storage');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.currentSession).toEqual(session);
      expect(parsed.state.sessions).toEqual([session]);
    });

    it('rehydrates currentSession and sessions from localStorage', async () => {
      const session = makeSession();
      const persisted = {
        state: {
          currentSession: session,
          sessions: [session],
        },
        version: 1,
      };
      localStorage.setItem('echo-session-storage', JSON.stringify(persisted));

      await useSessionStore.persist.rehydrate();

      const state = useSessionStore.getState();
      expect(state.currentSession).toEqual(session);
      expect(state.sessions).toEqual([session]);
    });

    it('persists transcript and aiResponses so SessionDetail survives navigation', () => {
      useSessionStore.setState({
        currentSession: makeSession(),
        sessions: [makeSession()],
        transcript: [makeTranscript('t1', 'hello', '2023-01-01T10:00:00.000Z')],
        aiResponses: [makeAiResponse('r1', 'answer', '2023-01-01T10:00:00.000Z')],
      });

      const stored = localStorage.getItem('echo-session-storage');
      const parsed = JSON.parse(stored!);
      expect(parsed.state.transcript).toHaveLength(1);
      expect(parsed.state.aiResponses).toHaveLength(1);
    });
  });

  describe('fetchSession merge logic', () => {
    it('merges local and server transcripts/AI responses and sorts by createdAt', async () => {
      const sessionId = 'session-1';
      const localTranscript = makeTranscript('t-local', 'local', '2023-01-01T10:00:00.000Z');
      const serverTranscript = makeTranscript('t-server', 'server', '2023-01-01T10:01:00.000Z');
      const localResponse = makeAiResponse('r-local', 'local', '2023-01-01T10:00:00.000Z');
      const serverResponse = makeAiResponse('r-server', 'server', '2023-01-01T10:01:00.000Z');

      useSessionStore.setState({
        currentSession: makeSession({ id: sessionId }),
        sessions: [makeSession({ id: sessionId })],
        transcript: [localTranscript],
        aiResponses: [localResponse],
      });

      vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path === `/sessions/${sessionId}`) return makeSession({ id: sessionId });
        if (path === `/sessions/${sessionId}/transcript`) return [serverTranscript];
        if (path === `/sessions/${sessionId}/responses`) return [serverResponse];
        return [];
      });

      await useSessionStore.getState().fetchSession(sessionId);

      const state = useSessionStore.getState();
      expect(state.transcript.map((t) => t.id)).toEqual(['t-local', 't-server']);
      expect(state.aiResponses.map((r) => r.id)).toEqual(['r-local', 'r-server']);
    });

    it('does not duplicate items already present locally and on the server', async () => {
      const sessionId = 'session-1';
      const sharedTranscript = makeTranscript('t-shared', 'shared', '2023-01-01T10:00:00.000Z');
      const sharedResponse = makeAiResponse('r-shared', 'shared', '2023-01-01T10:00:00.000Z');

      useSessionStore.setState({
        currentSession: makeSession({ id: sessionId }),
        sessions: [makeSession({ id: sessionId })],
        transcript: [sharedTranscript],
        aiResponses: [sharedResponse],
      });

      vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path === `/sessions/${sessionId}`) return makeSession({ id: sessionId });
        if (path === `/sessions/${sessionId}/transcript`) return [sharedTranscript];
        if (path === `/sessions/${sessionId}/responses`) return [sharedResponse];
        return [];
      });

      await useSessionStore.getState().fetchSession(sessionId);

      const state = useSessionStore.getState();
      expect(state.transcript).toHaveLength(1);
      expect(state.aiResponses).toHaveLength(1);
    });

    it('does not merge local state when fetching a different session', async () => {
      const localSessionId = 'session-local';
      const otherSessionId = 'session-other';

      useSessionStore.setState({
        currentSession: makeSession({ id: localSessionId }),
        sessions: [makeSession({ id: localSessionId })],
        transcript: [makeTranscript('t-local', 'local', '2023-01-01T10:00:00.000Z')],
        aiResponses: [makeAiResponse('r-local', 'local', '2023-01-01T10:00:00.000Z')],
      });

      vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path === `/sessions/${otherSessionId}`) return makeSession({ id: otherSessionId });
        if (path === `/sessions/${otherSessionId}/transcript`) return [];
        if (path === `/sessions/${otherSessionId}/responses`) return [];
        return [];
      });

      await useSessionStore.getState().fetchSession(otherSessionId);

      const state = useSessionStore.getState();
      expect(state.currentSession?.id).toBe(otherSessionId);
      expect(state.transcript).toHaveLength(0);
      expect(state.aiResponses).toHaveLength(0);
    });
  });
});
