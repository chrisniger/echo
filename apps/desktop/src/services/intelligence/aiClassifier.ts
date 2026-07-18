import { gatewayApi } from '../../lib/api';
import type { ClassifierOutput, ContextMemory, QuestionCategory, SessionMode } from './types';

export interface ClassifierRequest {
  segment: string;
  recentContext: string[];
  recentCategories: string[];
  currentSessionMode: SessionMode;
  fastRuleHit: { matched: boolean; rule?: string; category?: string } | null;
}

export interface ClassifierResponse {
  isQuestion: boolean;
  confidence: number;
  category: QuestionCategory;
  sessionMode: SessionMode;
  topic?: string;
  reasoning?: string;
  provider: string;
  model: string;
  processingTimeMs: number;
}

/**
 * Layer 4 — Semantic AI classifier.
 *
 * Calls the AI gateway's /api/classify/question endpoint, which runs a
 * small fast model (Groq or whatever is configured) to decide whether
 * the segment is a question and to classify it.
 *
 * Target latency: <300 ms.
 */

const SYSTEM_PROMPT = `You are Echo's question-detection classifier. Given a transcript segment, decide whether the speaker is REQUESTING information from the user (or asking them to do/describe/build something). Return JSON only.

Schema:
{
  "isQuestion": boolean,
  "confidence": number,           // 0..1
  "category": "Behavioral" | "Technical" | "Coding" | "System Design" | "SQL" | "Architecture" | "DevOps" | "Cloud" | "Security" | "Networking" | "Database" | "Project Management" | "Leadership" | "Communication" | "Meeting Action" | "Meeting Discussion" | "Meeting Summary Request" | "Decision Request" | "Brainstorming" | "Presentation" | "General Discussion" | "Follow-up" | "Clarification" | "Greeting" | "Small Talk" | "Unknown",
  "topic": string | null,        // e.g. "Laravel", "Linked lists", null if unclear
  "reasoning": string            // 1 short sentence explaining the call
}

Rules:
- A request for explanation, description, walkthrough, design, code, opinion, clarification, or action = isQuestion=true
- A statement, acknowledgement, or small talk = isQuestion=false
- Short follow-ups (e.g. "elaborate", "go on", "and?") AFTER a question = isQuestion=true with category="Follow-up"
- If the segment is a greeting or small talk, isQuestion=false, category="Greeting" or "Small Talk"
- Default confidence: high (>=0.85) for clear questions, low (<0.4) for clear non-questions
- Use the most specific category that fits; "Unknown" only if none apply`;

export async function classifyWithAi(
  req: ClassifierRequest,
  signal?: AbortSignal,
): Promise<ClassifierResponse> {
  const userPrompt = [
    `Current segment: """${req.segment}"""`,
    '',
    'Recent conversation context (oldest → newest):',
    ...req.recentContext.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    `Recent question categories: ${req.recentCategories.join(', ') || 'none'}`,
    `Current session mode: ${req.currentSessionMode}`,
    `Fast-rule engine hint: ${req.fastRuleHit?.matched ? `MATCHED (${req.fastRuleHit.rule}, ${req.fastRuleHit.category ?? 'no category'})` : 'no match'}`,
    '',
    'Return JSON only. No prose, no markdown.',
  ].join('\n');

  const res = await gatewayApi.post<{
    isQuestion: boolean;
    confidence: number;
    category: QuestionCategory;
    sessionMode: SessionMode;
    topic?: string;
    reasoning?: string;
    provider: string;
    model: string;
    processingTimeMs: number;
  }>('/classify/question', {
    system: SYSTEM_PROMPT,
    user: userPrompt,
    temperature: 0,
    maxTokens: 220,
    signal: signal ? undefined : undefined,
  });

  return res as ClassifierResponse;
}

/** Build a ClassifierRequest from a context memory snapshot. */
export function buildClassifierRequest(
  segment: string,
  context: ContextMemory,
  fastRuleHit: { matched: boolean; rule?: string; category?: string } | null,
): ClassifierRequest {
  return {
    segment,
    recentContext: context.recentSegments.slice(-12),
    recentCategories: context.recentDetections
      .map((d) => d.category)
      .filter(Boolean)
      .slice(-8),
    currentSessionMode: context.sessionMode,
    fastRuleHit,
  };
}
