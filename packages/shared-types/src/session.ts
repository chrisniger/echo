export type SessionStatus = 'active' | 'paused' | 'ended';
export type AudioSource = 'microphone' | 'system' | 'mixed';
export type ResponseStyle = 'concise' | 'detailed' | 'creative';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko' | 'pt' | 'ar' | 'ru';

/**
 * User-declared session type. Set at session creation time and used to seed
 * the AI prompt and the detection engine. Distinct from `SessionMode`
 * (which is inferred at runtime from the transcript) — SessionType is a
 * static declaration of intent; SessionMode is dynamic detection.
 */
export type SessionType =
  | 'Interview'
  | 'Meeting'
  | 'Assessment'
  | 'Presentation'
  | 'Brainstorming'
  | 'Sales Call'
  | 'Customer Support'
  | 'Training'
  | 'General';

export const SESSION_TYPES: readonly SessionType[] = [
  'Interview',
  'Meeting',
  'Assessment',
  'Presentation',
  'Brainstorming',
  'Sales Call',
  'Customer Support',
  'Training',
  'General',
] as const;

/**
 * Per-session-type role directives. Sent as the FIRST segment of the AI's
 * system prompt when the user declares a session type, so the model adopts
 * the right persona from the first message of the session (interview coach,
 * meeting assistant, sales co-pilot, tutor, etc).
 *
 * This is the single source of truth used by:
 *   - apps/desktop (lib/context fallback, promptRouter helpers)
 *   - apps/ai-gateway (ContextAssembler prepends this before SYSTEM_PROMPT_BASE)
 *   - apps/cloud-api (could be surfaced in the user-facing session summary)
 *
 * Edit here and both apps pick up the change without further wiring.
 */
export const SESSION_TYPE_PROMPTS: Record<SessionType, string> = {
  Interview:
    'You are Echo conducting a job interview in real time. The user is the candidate. ' +
    'Listen carefully to each interviewer question, then answer on the candidate\'s behalf using their CV ' +
    'and any context they supplied. Match the formality of the interviewer. ' +
    'Stay first-person, specific, and concise. Never volunteer score-based judgments.',
  Meeting:
    'You are Echo, an in-meeting executive assistant. The user is a participant in an active meeting. ' +
    'When the meeting requests a decision, summary, or action item, produce it crisply. ' +
    'Stay neutral on contested topics. Address the user by name when known. Keep outputs board-ready.',
  Assessment:
    'You are Echo proctoring a live coding/technical assessment. The user is being evaluated. ' +
    'Produce correct, well-commented code or a clear technical answer in the language implied by the question. ' +
    'Show complexity, edge cases, and trade-offs. Do not editorialize on fairness or difficulty.',
  Presentation:
    'You are Echo coaching a presenter in real time. The user is giving a talk. ' +
    'Generate short, actionable suggestions about structure, pacing, narrative arc, and audience engagement ' +
    'when the presenter prompts you. Reference storytelling principles by name.',
  Brainstorming:
    'You are Echo as a creative brainstorm partner. The user is generating ideas. ' +
    'Produce 4-6 distinct, non-obvious ideas per prompt, each with a one-sentence rationale. ' +
    'Avoid generic advice. Build on prior ideas in the session and don\'t repeat them.',
  'Sales Call':
    'You are Echo as a real-time sales co-pilot. The user is a sales rep on a call. ' +
    'When asked, surface discovery questions, objection responses, competitive differentiators, and next steps. ' +
    'Match the prospect\'s tone. Stay compliant and avoid making promises.',
  'Customer Support':
    'You are Echo assisting a support agent in real time. The user is handling a customer ticket. ' +
    'Surface troubleshooting steps, KB articles, empathy statements, and escalation criteria as prompted. ' +
    'Stay accurate and de-escalating. Never invent specific product behaviours.',
  Training:
    'You are Echo as a tutor. The user is learning a new skill or attending a training session. ' +
    'Explain concepts progressively from simple to complex, use concrete examples, ' +
    'and end each answer with a one-line recap or a single follow-up question when appropriate.',
  General:
    'You are Echo, the user\'s AI copilot for live conversations. The session is uncategorised. ' +
    'Adapt to whatever the user is doing: interview, meeting, technical discussion, casual chat, or note-taking. ' +
    'Stay helpful, concise, and grounded in any context the user supplied.',
};

/**
 * Lookup table for runtime validation. Built once at module load.
 * `ReadonlySet<string>` instead of `Set<SessionType>` because we want to accept
 * raw strings (from SQLite columns, request bodies, AI-gateway payloads) and
 * narrow them ourselves.
 */
export const VALID_SESSION_TYPES: ReadonlySet<string> = new Set(SESSION_TYPES);

/** Type guard: narrows `unknown` to `SessionType` without an `as` cast. */
export function isSessionType(value: unknown): value is SessionType {
  return typeof value === 'string' && VALID_SESSION_TYPES.has(value);
}

/**
 * Safely coerce an unknown value (e.g. a SQLite column read, an AI-gateway
 * payload) into a known SessionType. Returns 'General' for null, undefined,
 * garbage, or any value that no longer maps to a current enum member
 * (handles forward compatibility / future enum removal).
 */
export function coerceSessionType(value: unknown): SessionType {
  return isSessionType(value) ? value : 'General';
}

export interface NewSessionRequest {
  name: string;
  cvId?: string;
  context?: string;
  documentIds?: string[];
  aiModel: string;
  responseStyle: ResponseStyle;
  recordSession: boolean;
  enableTranscript: boolean;
  transcriptionIntervalMs: number;
  audioSource: AudioSource;
  language: Language;
  /** User-declared session type (e.g. 'Interview', 'Meeting'). Defaults to 'General'. */
  sessionType?: SessionType;
}

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  aiModel: string;
  responseStyle: ResponseStyle;
  language: Language;
  audioSource: AudioSource;
  transcriptionIntervalMs: number;
  /**
   * User-declared session type. Persisted on the session row so the cloud-api
   * can echo it back to the desktop without re-deriving it from heuristics.
   */
  sessionType: SessionType;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  transcriptCount: number;
  aiResponseCount: number;
  screenshotCount: number;
  tags: string[];
  summary: string | null;
  /** Server-side reference to the linked CV row in `cv_library`. */
  cvId?: string;
  /**
   * Snapshot of the CV raw text captured at session creation. Persisted on the
   * session so the desktop doesn't have to re-fetch from `cv_library` for
   * every AI request — and so deleting the source CV later doesn't break
   * ongoing sessions.
   */
  cvContent?: string;
  /** User-supplied "Additional Context" — always prefixed to every AI call. */
  additionalContext?: string;
  /** Additional documents uploaded with the session, captured as {name, content}. */
  documents?: Array<{ id?: string; name: string; content: string }>;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerLabel: string;
  text: string;
  confidence: number;
  startTime: number;
  endTime: number;
  isEdited: boolean;
  createdAt: string;
}

export interface AiResponse {
  id: string;
  sessionId: string;
  query: string;
  response: string;
  model: string;
  provider: string;
  tokensUsed: number;
  createdAt: string;
}

export interface CvDocument {
  id: string;
  name: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  parsedText: string | null;
  isDefault: boolean;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDocument {
  id: string;
  sessionId: string;
  name: string;
  type: 'document' | 'screenshot' | 'image';
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}
