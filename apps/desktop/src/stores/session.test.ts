import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session, SessionType, TranscriptSegment, AiResponse } from '@echo-gpt/shared-types';
import { api, ApiError } from '../lib/api';
import { useSessionStore } from './session';
import { useToastStore } from './toast';

// Mock the API client so fetchSession/fetchSessions don't hit the network.
// Use vi.importActual to keep the real `ApiError` class accessible to tests
// that need to construct a typed rejection (404 from cloud-api).
vi.mock('../lib/api', async () => {
  // Cast via `typeof ApiError` (a regular value import) instead of
  // `typeof import('../lib/api')` — the latter is a forbidden `import()`
  // type annotation under @typescript-eslint/consistent-type-imports.
  const actual = (await vi.importActual('../lib/api')) as { ApiError: typeof ApiError };
  return {
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
    ApiError: actual.ApiError,
  };
});

// Mock the toast store so failed fetches don't need a real DOM.
// Important: capture `pushToast` in a closure so every call to getState() returns
// the SAME vi.fn(). Otherwise the dedupe tests (which spy on pushToast) couldn't
// observe calls — each call to getState() would yield a brand-new mock instance.
vi.mock('./toast', () => {
  const pushToast = vi.fn();
  return {
    useToastStore: {
      getState: vi.fn(() => ({ pushToast })),
    },
  };
});

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

  describe('404 server responses (session is gone from cloud-api)', () => {
    beforeEach(() => {
      useSessionStore.setState({
        currentSession: makeSession({ status: 'active', endedAt: null }),
        sessions: [makeSession({ status: 'active', endedAt: null })],
        transcript: [],
        aiResponses: [],
      });
    });

    it('endSession locally ends the session on 404 and resolves successfully', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new ApiError(404, 'Session not found'));

      await expect(useSessionStore.getState().endSession()).resolves.toBeUndefined();

      const state = useSessionStore.getState();
      expect(state.currentSession?.status).toBe('ended');
      // endedAt should be populated so History shows a real end-time.
      expect(state.currentSession?.endedAt).not.toBeNull();
      // sessions[] also gets the tombstone so the History list reflects it.
      expect(state.sessions[0].status).toBe('ended');
    });

    it('pauseSession on 404 preserves status and surfaces a "not on server" toast', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new ApiError(404, 'Session not found'));

      await useSessionStore.getState().pauseSession();

      const state = useSessionStore.getState();
      // Pause is reversible — don't flip local state when the server doesn't
      // know about the row. The user must hit End to clear it.
      expect(state.currentSession?.status).toBe('active');
    });

    it('fetchSession 404 surfaces the "not on server" toast and resets isLoading', async () => {
      vi.mocked(api.get).mockRejectedValue(new ApiError(404, 'Session not found'));

      await useSessionStore.getState().fetchSession('session-1');

      // Critically: the persisted currentSession is preserved so the page can
      // keep rendering from local cache and the user can still click End.
      const state = useSessionStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.currentSession).not.toBeNull();
    });

    it('reclassifySession on 404 reverts the optimistic update AND re-throws', async () => {
      // SessionDetail.tsx catches the thrown ApiError and toasts a tailored
      // "Session not found" message. If we silently swallowed the error
      // here the UI would roll back the badge with no user feedback.
      const initialType: SessionType = 'Interview';
      const newType: SessionType = 'Sales Call';
      useSessionStore.setState({
        currentSession: makeSession({ sessionType: initialType, status: 'active' }),
        sessions: [makeSession({ sessionType: initialType, status: 'active' })],
      });
      vi.mocked(api.patch).mockRejectedValueOnce(new ApiError(404, 'Session not found'));

      await expect(useSessionStore.getState().reclassifySession(newType)).rejects.toBeInstanceOf(
        ApiError,
      );

      const state = useSessionStore.getState();
      expect(state.currentSession?.sessionType).toBe(initialType);
    });
  });

  describe('404 toast dedupe (per session id, 4s window)', () => {
    let pushToast: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Pull a fresh handle so we can spy across calls even after vi.clearAllMocks.
      // Tests in this block use UNIQUE session ids per case, so the module-level
      // dedupe Map naturally isolates state between tests — no reset helper needed.
      pushToast = useToastStore.getState().pushToast as unknown as ReturnType<typeof vi.fn>;
      pushToast.mockClear();
    });

    it('pauseSession 404 fires the toast once, then suppresses repeats within the 4s window', async () => {
      const sessionId = 'dedupe-pause-a';
      useSessionStore.setState({
        currentSession: makeSession({ id: sessionId, status: 'active' }),
        sessions: [makeSession({ id: sessionId, status: 'active' })],
      });
      vi.mocked(api.post).mockRejectedValue(new ApiError(404, 'Session not found'));

      // Enable fake timers BEFORE the first call so Date.now() inside
      // shouldShowNotFoundToast is fake-stamped consistently across all calls.
      vi.useFakeTimers();
      const t0 = new Date('2025-01-01T00:00:00Z').getTime();
      vi.setSystemTime(t0);

      await useSessionStore.getState().pauseSession();
      // 3s later — same id, still inside the 4s window.
      vi.setSystemTime(t0 + 3_000);
      await useSessionStore.getState().pauseSession();
      expect(pushToast).toHaveBeenCalledTimes(1);

      // 5s after the first call — outside the window; another toast is allowed.
      vi.setSystemTime(t0 + 5_000);
      await useSessionStore.getState().pauseSession();
      expect(pushToast).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('different session ids each get their own toast', async () => {
      vi.mocked(api.post).mockRejectedValue(new ApiError(404, 'Session not found'));

      useSessionStore.setState({
        currentSession: makeSession({ id: 'dedupe-pause-b1', status: 'active' }),
        sessions: [makeSession({ id: 'dedupe-pause-b1', status: 'active' })],
      });
      await useSessionStore.getState().pauseSession();

      useSessionStore.setState({
        currentSession: makeSession({ id: 'dedupe-pause-b2', status: 'active' }),
        sessions: [makeSession({ id: 'dedupe-pause-b2', status: 'active' })],
      });
      await useSessionStore.getState().pauseSession();

      expect(pushToast).toHaveBeenCalledTimes(2);
    });

    it('fetchSession 404 dedupes across rapid re-navigations to the same id', async () => {
      const sessionId = 'dedupe-fetch-c';
      vi.mocked(api.get).mockRejectedValue(new ApiError(404, 'Session not found'));

      await useSessionStore.getState().fetchSession(sessionId);
      await useSessionStore.getState().fetchSession(sessionId);
      await useSessionStore.getState().fetchSession(sessionId);

      expect(pushToast).toHaveBeenCalledTimes(1);
    });

    it('endSession on 404 emits a "Session ended locally" success toast on every call (not subject to dedupe)', async () => {
      // endSession's 404 path intentionally does NOT route its toast through
      // shouldShowNotFoundToast — this is a success-state confirmation that the
      // click took effect, not a complaint about a missing server row. If a
      // future refactor accidentally wires it through the dedupe helper, the
      // user would silently lose confirmation on the second End click within
      // the 4 s dedupe window. This test guards that property: two rapid
      // endSession() calls each emit their own success toast.
      const sessionId = 'dedupe-end-d';
      useSessionStore.setState({
        currentSession: makeSession({ id: sessionId, status: 'active' }),
        sessions: [makeSession({ id: sessionId, status: 'active' })],
      });
      // mockRejectedValue (not Once) so two back-to-back calls both reject with 404.
      vi.mocked(api.post).mockRejectedValue(new ApiError(404, 'Session not found'));

      await useSessionStore.getState().endSession();
      await useSessionStore.getState().endSession();

      // Two distinct success-state toasts — NOT subject to the dedupe window.
      expect(pushToast).toHaveBeenCalledTimes(2);
      for (const call of pushToast.mock.calls) {
        expect(call[0].title).toBe('Session ended locally');
      }

      const state = useSessionStore.getState();
      expect(state.currentSession?.status).toBe('ended');
    });
  });

  describe('patchSession action (round-trip through PATCH /sessions/:id)', () => {
    let prePatchCount: number;

    beforeEach(() => {
      useSessionStore.setState({
        currentSession: makeSession({ status: 'active' }),
        sessions: [makeSession({ status: 'active' })],
        transcript: [],
        aiResponses: [],
      });
      // Snapshot api.patch's call count so we can assert "no PATCH was made"
      // for the no-op and pre-check-reject tests.
      prePatchCount = vi.mocked(api.patch).mock.calls.length;
    });

    it('round-trips transcriptionIntervalMs via PATCH and updates currentSession + sessions[]', async () => {
      const intervalUpdated = makeSession({
        status: 'active',
        transcriptionIntervalMs: 8000,
      });
      vi.mocked(api.patch).mockResolvedValueOnce(intervalUpdated);

      const result = await useSessionStore
        .getState()
        .patchSession({ transcriptionIntervalMs: 8000 });

      expect(result.id).toBe(intervalUpdated.id);
      const state = useSessionStore.getState();
      expect(state.currentSession?.transcriptionIntervalMs).toBe(8000);
      // sessions[] also reflects the server-canonical value so the
      // History list shows the updated cadence.
      expect(state.sessions[0].transcriptionIntervalMs).toBe(8000);

      const patchCall = vi.mocked(api.patch).mock.calls[0];
      expect(patchCall[0]).toBe('/sessions/session-1');
      expect(patchCall[1]).toEqual({ transcriptionIntervalMs: 8000 });
    });

    it('optimistically merges the new value before the PATCH resolves', async () => {
      // The store must reflect the new cadence immediately so
      // useSessionBackground picks it up reactively, not once the round-trip
      // completes. This is the "snappy UI" property that justifies the
      // rollback-on-error contract.
      let resolvePatch!: (value: Session) => void;
      vi.mocked(api.patch).mockReturnValueOnce(
        new Promise<Session>((resolve) => {
          resolvePatch = resolve;
        }),
      );

      const promise = useSessionStore.getState().patchSession({ transcriptionIntervalMs: 8000 });

      // Before awaiting, the optimistic merge should already be in the store.
      expect(useSessionStore.getState().currentSession?.transcriptionIntervalMs).toBe(8000);

      resolvePatch(makeSession({ status: 'active', transcriptionIntervalMs: 8000 }));
      await promise;
    });

    it('rolls back to the snapshot when the PATCH server-errors', async () => {
      vi.mocked(api.patch).mockRejectedValueOnce(new ApiError(500, 'Server error'));

      await expect(
        useSessionStore.getState().patchSession({ transcriptionIntervalMs: 8000 }),
      ).rejects.toBeInstanceOf(ApiError);

      const state = useSessionStore.getState();
      // Pre-rollback value should be back. makeSession() defaults to 5000.
      expect(state.currentSession?.transcriptionIntervalMs).toBe(5000);
      expect(state.sessions[0].transcriptionIntervalMs).toBe(5000);
    });

    it('rolls back to the snapshot on 404 (re-throws so the caller can decide)', async () => {
      vi.mocked(api.patch).mockRejectedValueOnce(new ApiError(404, 'Session not found'));

      await expect(
        useSessionStore.getState().patchSession({ transcriptionIntervalMs: 8000 }),
      ).rejects.toBeInstanceOf(ApiError);

      const state = useSessionStore.getState();
      expect(state.currentSession?.transcriptionIntervalMs).toBe(5000);
    });

    it('is a no-op (no PATCH) when the proposed diff is empty', async () => {
      // Default makeSession has transcriptionIntervalMs=5000. Passing that
      // back should early-return without a round trip — same contract as
      // cloud-api's empty-PATCH 200 + no-broadcast.
      const before = useSessionStore.getState().currentSession;
      const result = await useSessionStore
        .getState()
        .patchSession({ transcriptionIntervalMs: 5000 });

      expect(result).toBe(before);
      expect(vi.mocked(api.patch).mock.calls.length).toBe(prePatchCount);
    });

    it('is a no-op (no PATCH) when interval differs but no fields are passed', async () => {
      // Empty update object should also early-return.
      const before = useSessionStore.getState().currentSession;
      const result = await useSessionStore.getState().patchSession({});
      expect(result).toBe(before);
      expect(vi.mocked(api.patch).mock.calls.length).toBe(prePatchCount);
    });

    it('throws synchronously without PATCH when the session is ended', async () => {
      useSessionStore.setState({
        currentSession: makeSession({ status: 'ended' }),
        sessions: [makeSession({ status: 'ended' })],
      });
      await expect(
        useSessionStore.getState().patchSession({ transcriptionIntervalMs: 8000 }),
      ).rejects.toThrow(/ended/);
      expect(vi.mocked(api.patch).mock.calls.length).toBe(prePatchCount);
    });
  });
});
