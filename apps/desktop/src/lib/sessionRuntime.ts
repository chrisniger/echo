import type { Session } from '@echo-gpt/shared-types';

/**
 * Phase 5: the cloud-api attaches additional fields to the Session
 * row that the shared-types `Session` interface does not model
 * (additionalContext, legacy `context`, cvContent, documents).
 *
 * The desktop reads those fields at the boundary where it composes
 * the `askAssistant` payload — see useSessionBackground.ts and
 * useWebSocket.ts. Rather than `as any`-cast the Session at every
 * read site, we declare the augmentation here and intersect it with
 * Session via `RuntimeSession`.
 *
 * `RuntimeSession = Session & SessionRuntimeFields` keeps the shared
 * type intact (no upstream ripple) while letting the desktop type
 * its access exactly once, at the boundary. The union is structural:
 * if a future field is added on the cloud side, extend this interface
 * and both hook call sites pick it up.
 */
export interface SessionRuntimeFields {
  /** User-supplied additional context (preferred over `context`). */
  additionalContext?: string;
  /** Legacy alias for `additionalContext`, kept for back-compat. */
  context?: string;
  /** Cached CV raw_text snapshot at session creation time. */
  cvContent?: string;
  /** Additional documents attached to the session. */
  documents?: Array<{ name: string; content: string }>;
}

export type RuntimeSession = Session & SessionRuntimeFields;

/**
 * Narrow a possibly-null Session into the RuntimeSession view.
 * Use at the boundary (after `useSessionStore.getState().currentSession`)
 * rather than at every property access.
 */
export function asRuntimeSession(session: Session | null | undefined): RuntimeSession | null {
  return session ?? null;
}
