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
import { api, ApiError } from '../lib/api';
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
  /**
   * PATCH /api/sessions/:id for any combination of fields — currently
   * `transcriptionIntervalMs` (driven by AudioCaptureControls) and
   * `sessionType` (already exposed via reclassifySession, kept here for
   * callers that want a single general-purpose entry point).
   *
   * Optimistic update with full-snapshot rollback on any error. No-op
   * (no API call) when `updates` doesn't actually change anything — this
   * matches cloud-api's empty-PATCH 200 + no-broadcast contract and
   * avoids spurious WS echoes.
   *
   * Throws on ended-session pre-check and on API errors; the caller
   * decides whether to swallow (e.g. transcript-interval cadence is a
   * UX preference and a 404 doesn't justify throwing back at the user).
   */
  patchSession: (updates: {
    transcriptionIntervalMs?: number;
    sessionType?: SessionType;
  }) => Promise<Session>;
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

// Dedupe window for the "Session not on server" toast. Without this, rapid
// Pause/Resume clicks or repeated navigation into a dead session would queue
// identical toasts on top of each other. We cache the last-shown timestamp
// per session id so each session gets at most one toast per 4s.
const NOT_FOUND_TOAST_TTL_MS = 4_000;
const lastNotFoundToastAtMs = new Map<string, number>();

/**
 * Returns true if a "Session not on server" toast for `sessionId` should be
 * shown right now. Side effect: records the current timestamp so a second
 * call within NOT_FOUND_TOAST_TTL_MS will return false.
 *
 * Intentionally module-scoped (not in the zustand store) — this is purely a
 * toast-rendering dedupe, not domain state, and it must be lost on app
 * restart. The Map's growth is bounded by the number of distinct session
 * ids encountered during the app's lifetime, which is small.
 *
 * Tests rely on per-test UNIQUE session ids to isolate state — there is no
 * exported reset helper so the production module surface stays clean.
 */
function shouldShowNotFoundToast(sessionId: string): boolean {
  const now = Date.now();
  const lastShown = lastNotFoundToastAtMs.get(sessionId);
  if (lastShown !== undefined && now - lastShown < NOT_FOUND_TOAST_TTL_MS) {
    return false;
  }
  lastNotFoundToastAtMs.set(sessionId, now);
  return true;
}

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
        const id = currentSession.id;
        try {
          const updated = await api.post<Session>(`/sessions/${id}/end`);
          set((state) => ({
            currentSession: updated,
            status: updated.status,
            sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
          }));
        } catch (err) {
          // 404 from cloud-api means this session row no longer exists on the
          // server. This commonly happens after a DB reset (e.g. after the
          // PROJECT_ROOT DB path fix in apps/cloud-api/src/db/index.ts
          // resolved the DB to a different file) or after the cloud row was
          // cleaned up. The user's intent — "end this session" — should be
          // honoured locally so the page stops showing it as active. The
          // session remains in localStorage as ended (and in the History
          // list), preserving the persisted-state rehydration contract.
          if (err instanceof ApiError && err.status === 404) {
            const endedAt = currentSession.endedAt || new Date().toISOString();
            const endedSession: Session = { ...currentSession, status: 'ended', endedAt };
            set((state) => {
              // Defensive: only flip the live currentSession if the user
              // hasn't navigated to a different session during the in-flight
              // POST. The `sessions` list still gets the tombstone so it
              // shows correctly in History.
              const stillSame =
                state.currentSession !== null && state.currentSession.id === endedSession.id;
              return {
                currentSession: stillSame ? endedSession : state.currentSession,
                status: stillSame ? 'ended' : state.status,
                sessions: state.sessions.map((s) => (s.id === endedSession.id ? endedSession : s)),
              };
            });
            // Confirm to the user that the click HAD an effect — without this
            // the user sees their "Active" badge flip and may wonder if
            // anything happened. NOT routed through shouldShowNotFoundToast:
            // this is a success-state notification, not a complaint about a
            // missing row, so it should always surface.
            useToastStore.getState().pushToast({
              title: 'Session ended locally',
              description:
                'The server had no record of this session. The session is now marked ended in your local view.',
              variant: 'default',
              durationMs: 5000,
            });
            return;
          }
          throw err;
        }
      },

      pauseSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        try {
          const updated = await api.post<Session>(`/sessions/${currentSession.id}/pause`);
          set((state) => ({
            currentSession: updated,
            status: updated.status,
            sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
          }));
        } catch (err) {
          // 404 — the cloud doesn't know this session. Don't attempt to
          // transition the local capture state (pause is reversible; end is
          // the correct escape hatch). Quietly toast a hint instead, but
          // dedupe per session id so spam-clicks don't stack identical toasts.
          if (err instanceof ApiError && err.status === 404) {
            if (shouldShowNotFoundToast(currentSession.id)) {
              useToastStore.getState().pushToast({
                title: 'Session not on server',
                description:
                  'Pause is unavailable — the session was not found. Click End to clear it locally.',
                variant: 'warning',
                durationMs: 6000,
              });
            }
            return;
          }
          throw err;
        }
      },

      resumeSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        try {
          const updated = await api.post<Session>(`/sessions/${currentSession.id}/resume`);
          set((state) => ({
            currentSession: updated,
            status: updated.status,
            sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
          }));
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            if (shouldShowNotFoundToast(currentSession.id)) {
              useToastStore.getState().pushToast({
                title: 'Session not on server',
                description:
                  'Resume is unavailable — the session was not found. Click End to clear it locally.',
                variant: 'warning',
                durationMs: 6000,
              });
            }
            return;
          }
          throw err;
        }
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

      patchSession: async (updates) => {
        const { currentSession } = get();
        if (!currentSession) {
          throw new Error('No active session to patch.');
        }
        if (currentSession.status === 'ended') {
          throw new Error('Cannot patch an ended session.');
        }

        // No-op when the proposed updates don't actually change the live
        // values. This mirrors cloud-api's empty-PATCH contract (200 + no
        // broadcast, no UPDATE issued) and protects the WS broadcast path
        // from spurious echoes.
        const hasSessionTypeChange =
          updates.sessionType !== undefined && updates.sessionType !== currentSession.sessionType;
        const hasIntervalChange =
          updates.transcriptionIntervalMs !== undefined &&
          updates.transcriptionIntervalMs !== currentSession.transcriptionIntervalMs;
        if (!hasSessionTypeChange && !hasIntervalChange) {
          return currentSession;
        }

        // Full-snapshot for rollback. ReclassifySession only rolls back the
        // single field it touched; patchSession must restore the entire session
        // shape because it can move multiple fields in one round trip.
        const previousSession = currentSession;

        // Per-field optimistic value. We can't spread `...updates` because
        // `transcriptionIntervalMs: undefined` would clobber the field, and
        // an accidental `status: ...` on the caller side would overwrite the
        // authoritative SessionStatus. Pull the candidate values up so we can
        // also use them in the rollback equality check below.
        const optimisticTranscriptionIntervalMs =
          updates.transcriptionIntervalMs !== undefined
            ? updates.transcriptionIntervalMs
            : currentSession.transcriptionIntervalMs;
        const optimisticSessionType =
          updates.sessionType !== undefined ? updates.sessionType : currentSession.sessionType;
        const optimistic: Session = {
          ...currentSession,
          transcriptionIntervalMs: optimisticTranscriptionIntervalMs,
          sessionType: optimisticSessionType,
        };
        set({ currentSession: optimistic });

        try {
          const updated = await api.patch<Session>(`/sessions/${currentSession.id}`, updates);
          set((state) => ({
            currentSession: updated,
            status: updated.status,
            sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
          }));
          return updated;
        } catch (err) {
          // Rollback the optimistic flip ONLY if the live state still holds
          // exactly the optimistic values this request set. If a newer
          // patchSession call already moved the store forward, leaving this
          // request's optimistic value behind, we MUST NOT clobber the newer
          // request's progress. This protects against a real race:
          // user picks 5s → picks 10s; the 5s PATCH fails AFTER the 10s
          // PATCH succeeded; without this guard the rollback would silently
          // revert the user's 10s intent.
          //
          // MAINTENANCE: if you add a new patchable field to patchSession's
          // `updates` parameter, ALSO add the corresponding equality check
          // below (next to `intervalMatches` and `sessionTypeMatches`).
          // Otherwise the rollback may false-positive — the old fields still
          // match while a newer request's success lives in an uncompared
          // field, and this catch would revert it. The fields enumerated here
          // MUST stay in sync with the optimistic merge above.
          set((state) => {
            const live = state.currentSession;
            const sameId = live !== null && live.id === currentSession.id;
            const intervalMatches =
              live?.transcriptionIntervalMs === optimisticTranscriptionIntervalMs;
            const sessionTypeMatches = live?.sessionType === optimisticSessionType;
            if (!sameId || !intervalMatches || !sessionTypeMatches) {
              // A newer request pre-empted us (or the user navigated away).
              // Leave the live state alone. The newer request owns the
              // outcome of its own success/failure path.
              return state;
            }
            return {
              currentSession: previousSession,
              sessions: state.sessions.map((s) =>
                s.id === previousSession.id ? previousSession : s,
              ),
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
          // Merge the server's sessions with any locally-cached sessions the
          // server hasn't acknowledged. Without this merge, a server 200 with
          // `{ sessions: [] }` (e.g. JWT points at a different DB, fresh user
          // account, server DB was reset, or GET happened while the user's
          // POST /sessions was still in flight on another tab) would wipe the
          // entire local history. The History page would flash empty, AND the
          // `persist` middleware below would write `[]` to localStorage,
          // permanently losing the cache until the user manually seeds it.
          //
          // Server is authoritative for sessions it knows about (server wins
          // for matching ids, preserving updated_at / status from cloud-api's
          // canonical row). Local-only entries — sessions that should have
          // synced but haven't yet, or that predate a server DB reset — are
          // preserved so the user doesn't lose access to what they previously
          // created. The merge is also the natural place for future WS
          // `session.created` echoes to converge without overwriting local
          // additions.
          set((state) => {
            // Defensive: a malformed server payload (e.g. { sessions: null }
            // or { sessions: undefined }) must not crash the merge and must
            // not wipe the local cache. Coerce to [] so we hit the
            // local-preserving branch instead of throwing inside set().
            const safeServerSessions = Array.isArray(res?.sessions) ? res.sessions : [];
            // Defensive: drop falsy ids from serverIds. A single legacy or
            // malformed server row with no id would otherwise put `undefined`
            // into the set, and the test `serverIds.has(id) === true` would
            // silently drop ANY local row that also lacks an id.
            const serverIds = new Set(safeServerSessions.map((s) => s.id).filter(Boolean));
            const localOnly = state.sessions.filter((s) => !serverIds.has(s.id));
            // Sort the merged list by startedAt DESC so the History page
            // displays an intuitive order: a freshly-created local-only
            // session (not yet round-tripped to the server) appears in the
            // correct chronological position rather than being appended after
            // the response tail. cloud-api already orders server rows by
            // started_at DESC; sorting the union is cheap (≤50 rows after
            // the cloud LIMIT) and defends against the server changing its
            // ordering without consumers noticing.
            const merged = [...safeServerSessions, ...localOnly].sort((a, b) => {
              const at = new Date(a.startedAt).getTime();
              const bt = new Date(b.startedAt).getTime();
              return bt - at;
            });
            return {
              sessions: merged,
              isLoading: false,
            };
          });
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
        } catch (err) {
          set({ isLoading: false });
          // Differentiate the 404 case (session row is gone from the server)
          // from a transient network blip (server unreachable, 5xx, etc.).
          // The 404 message guides the user to the End-button escape hatch;
          // the generic warning keeps the existing "using cached data" tail.
          // Dedupe the 404 toast per session id so re-navigation into the
          // same dead session doesn't stack identical toasts.
          const isNotFound = err instanceof ApiError && err.status === 404;
          if (!isNotFound || shouldShowNotFoundToast(id)) {
            useToastStore.getState().pushToast({
              title: isNotFound ? 'Session not on server' : 'Session unavailable',
              description: isNotFound
                ? 'This session is no longer on the server. Click End to clear it from your local view.'
                : 'Could not load session from server. Using locally cached data — changes may not be saved.',
              variant: 'warning',
              durationMs: 8000,
            });
          }
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
