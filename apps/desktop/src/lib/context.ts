import type { ChatMessage, SessionType } from '@echo-gpt/shared-types';
import { gatewayApi } from './api';
import { getSessionTypePrompt } from '../services/intelligence';

export interface BuildContextOptions {
  cv?: string;
  customContext?: string;
  documents?: Array<{ name: string; content: string }>;
  transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
  language?: string;
  jobDescription?: string;
  /**
   * User-declared session type. Forwarded to the gateway's /chat/context
   * endpoint AND inlined in the fallback prompt so the AI adopts the right
   * persona from the first message regardless of which code path ran.
   */
  sessionType?: SessionType;
}

/**
 * Build a baseline messages array for an AI request by calling the AI Gateway's
 * `/chat/context` endpoint. The Gateway runs the payload through the
 * `ContextAssembler`, which:
 *   - sets the system role to the Echo baseline
 *   - prepends the language directive
 *   - prepends `[Candidate CV]: ...` from `cv`
 *   - prepends `[Job Description]: ...` from `jobDescription`
 *   - prepends `[Document: name]: ...` per entry in `documents`
 *   - slices the latest `transcript` into a single `[Session Transcript]` user message
 *   - appends the last N entries from `conversationHistory` (we handle history
 *     on the desktop side, so we leave it empty here)
 *
 * The Gateway also hashes the payload into a `PromptCache` lookup, so repeat
 * calls during the same session (same CV + same additional context + same
 * rolling transcript tail) hit the cache and return instantly.
 *
 * On any failure we return a fallback system message that inlines everything
 * the user supplied (cv, additionalContext, documents, transcript) so the AI
 * still grounds its answer in the user's context rather than losing it.
 */
export async function buildContextMessages(opts: BuildContextOptions): Promise<ChatMessage[]> {
  try {
    const res = await gatewayApi.post<{ messages: ChatMessage[] }>(
      '/chat/context',
      {
        cv: opts.cv,
        customContext: opts.customContext,
        documents: opts.documents,
        transcript: opts.transcript,
        language: opts.language,
        jobDescription: opts.jobDescription,
        sessionType: opts.sessionType,
      },
    );
    if (Array.isArray(res?.messages) && res.messages.length > 0) {
      return res.messages;
    }
  } catch (err) {
    console.warn('[context] /chat/context failed, falling back to inline prompt:', err);
  }

  return [
    {
      role: 'system',
      content: buildFallbackSystemPrompt(opts),
    },
  ];
}

function buildFallbackSystemPrompt(opts: BuildContextOptions): string {
  // Session-type role directive (first, before anything else, so the AI
  // adopts the right persona immediately).
  const sessionTypePrompt = getSessionTypePrompt(opts.sessionType).system;

  const parts: string[] = [
    sessionTypePrompt,
    'Base persona: You are Echo, an AI assistant for professional interviews, meetings, and coding assessments. ' +
      'Apply the session-type persona above. Be concise, knowledgeable, and professional. ' +
      'Ground every answer in the candidate\'s CV and the user-supplied context below.',
  ];

  if (opts.language && opts.language !== 'en') {
    const langNames: Record<string, string> = {
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      pt: 'Portuguese',
      ar: 'Arabic',
      ru: 'Russian',
    };
    parts.push(`Respond in ${langNames[opts.language] ?? opts.language}.`);
  }

  if (opts.customContext && opts.customContext.trim()) {
    parts.push(`User-supplied additional context / instructions:\n${opts.customContext.trim()}`);
  }

  if (opts.cv && opts.cv.trim()) {
    parts.push(`[Candidate CV]:\n${opts.cv.trim()}`);
  }

  if (opts.documents && opts.documents.length > 0) {
    parts.push(
      '[Uploaded Documents]:\n' +
        opts.documents
          .map((d) => `[Document: ${d.name}]\n${(d.content ?? '').trim()}`)
          .filter((section) => section.length > '[Document: ]\n'.length)
          .join('\n\n'),
    );
  }

  if (opts.transcript && opts.transcript.length > 0) {
    parts.push(
      '[Session Transcript]:\n' +
        opts.transcript
          .map((t) => `[${t.speaker} @${Math.floor((t.timestamp ?? 0) / 1000)}s]: ${t.text}`)
          .join('\n'),
    );
  }

  return parts.join('\n\n');
}
