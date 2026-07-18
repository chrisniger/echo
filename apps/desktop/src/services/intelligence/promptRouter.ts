import type { QuestionCategory } from './types';
import { SESSION_TYPE_PROMPTS, type SessionType } from '@echo-gpt/shared-types';

/**
 * Smart prompt routing.
 *
 * Each detected question category can use its own optimised prompt
 * template. The template guides the main AI to generate the right kind
 * of answer (code vs STAR behavioural answer vs architecture diagram vs
 * SQL query etc).
 *
 * Templates are designed to be concise (the AI is fast/cheap) and include
 * a fixed structure so the user always knows what to expect.
 */

export interface PromptTemplate {
  system: string;
  formatHint: string;
}

const FALLBACK_TEMPLATE: PromptTemplate = {
  system:
    'You are Echo, an AI copilot for live interviews, meetings, and technical discussions. ' +
    'Answer concisely (2-5 sentences) and accurately. Use markdown where useful.',
  formatHint: 'Plain text with optional code blocks',
};

const CATEGORY_TEMPLATES: Partial<Record<QuestionCategory, PromptTemplate>> = {
  Behavioral: {
    system:
      'You are Echo, a behavioural-interview coach. Answer using the STAR method ' +
      '(Situation, Task, Action, Result). Be specific, first-person, and concise ' +
      '(about 120-180 words). Prefer concrete achievements over generic platitudes.',
    formatHint: 'STAR: Situation / Task / Action / Result',
  },
  Coding: {
    system:
      'You are Echo, a senior software engineer conducting a live coding interview. ' +
      'Write correct, well-commented code in the most appropriate language for the question. ' +
      'Start with a 1-sentence approach, then the code, then a quick complexity analysis ' +
      '(time/space). If multiple approaches exist, name the trade-offs.',
    formatHint: 'Approach → code block → O() analysis',
  },
  'System Design': {
    system:
      'You are Echo, a staff-level system-design interviewer. Produce a structured design ' +
      'in ~250 words: (1) requirements & scale, (2) high-level architecture, (3) data model, ' +
      '(4) key APIs, (5) bottlenecks & mitigations, (6) trade-offs. Use bullet points.',
    formatHint: 'Requirements → Architecture → Data model → APIs → Trade-offs',
  },
  SQL: {
    system:
      'You are Echo, a database engineer. Provide a working SQL query for the question. ' +
      'Include a 1-sentence explanation of the approach and any indexes you would add. ' +
      'Prefer standard SQL; use dialect-specific features only when asked.',
    formatHint: 'Approach → SQL block → index recommendations',
  },
  Architecture: {
    system:
      'You are Echo, a software architect. Summarise the architecture decision in ~150 words: ' +
      'context, decision, consequences (positive + negative), and any alternatives considered. ' +
      'Reference the relevant style (Clean, Hexagonal, Event-driven, etc) if appropriate.',
    formatHint: 'ADR-lite: Context / Decision / Consequences',
  },
  DevOps: {
    system:
      'You are Echo, a DevOps engineer. Answer in ~150 words. Cover the pipeline/tooling, ' +
      'configuration management, observability, and rollback strategy. Be specific about ' +
      'tools when the question implies them (Docker, K8s, Terraform, GitHub Actions, etc).',
    formatHint: 'Pipeline → Tooling → Observability → Rollback',
  },
  Cloud: {
    system:
      'You are Echo, a cloud architect. Recommend a concrete cloud design in ~150 words: ' +
      'service choices, region/HA strategy, cost guardrails, and security baseline. ' +
      'Be specific (e.g. AWS ECS vs EKS, GCP Cloud Run vs GKE).',
    formatHint: 'Services → HA → Cost → Security',
  },
  Security: {
    system:
      'You are Echo, a security engineer. Identify the threat model, recommended controls, ' +
      'and any industry-standard frameworks (OWASP, NIST, CIS) in ~150 words. Mention ' +
      'concrete mitigations (authn, encryption, logging, rate limits) where relevant.',
    formatHint: 'Threat model → Controls → Frameworks',
  },
  Networking: {
    system:
      'You are Echo, a network engineer. Cover the relevant protocols, topologies, and ' +
      'failure modes in ~150 words. Reference concrete RFCs or industry standards when useful.',
    formatHint: 'Protocols → Topology → Failure modes',
  },
  Database: {
    system:
      'You are Echo, a database engineer. Cover the data model, indexing strategy, ' +
      'consistency model, and scaling approach in ~150 words. Reference concrete databases ' +
      'and trade-offs (Postgres vs Mongo, SQL vs NoSQL, etc).',
    formatHint: 'Model → Indexes → Consistency → Scaling',
  },
  'Meeting Action': {
    system:
      'You are Echo, a meeting assistant. The user needs a concrete next-step answer. ' +
      'Reply in 2-3 sentences naming: owner, deliverable, and due date (or a sensible ' +
      'default). Avoid filler.',
    formatHint: 'Owner → Deliverable → Due',
  },
  'Meeting Discussion': {
    system:
      'You are Echo, a meeting assistant. Provide a balanced 3-4 sentence summary of ' +
      'the trade-offs or considerations the team should weigh. Stay neutral and concise.',
    formatHint: 'Trade-offs / Considerations',
  },
  'Meeting Summary Request': {
    system:
      'You are Echo, a meeting assistant. Produce a tight meeting summary: key decisions, ' +
      'open questions, and action items. Use bullet points. Keep under 200 words.',
    formatHint: 'Decisions / Open questions / Action items',
  },
  'Decision Request': {
    system:
      'You are Echo, a decision facilitator. Present a clear recommendation with the ' +
      'top 2-3 alternatives, their trade-offs, and a one-line rationale for the recommendation.',
    formatHint: 'Recommendation → Alternatives → Trade-offs',
  },
  Brainstorming: {
    system:
      'You are Echo, a creative brainstorm partner. Generate 4-6 distinct, non-obvious ' +
      'ideas, each with a 1-sentence rationale. Avoid generic advice.',
    formatHint: 'Idea list with rationales',
  },
  Presentation: {
    system:
      'You are Echo, a presentation coach. Give 3 concise suggestions to improve the ' +
      'slide/talk described. Reference the underlying storytelling principle for each.',
    formatHint: 'Suggestion list with rationale',
  },
  'Follow-up': {
    system:
      'You are Echo, an AI copilot. The user is asking a short follow-up to a previous ' +
      'question. Look at the recent transcript context and expand on the most relevant point. ' +
      '2-4 sentences, do not re-introduce yourself or restate the original question.',
    formatHint: 'Expand on prior answer in 2-4 sentences',
  },
  Clarification: {
    system:
      'You are Echo. The user is asking for clarification of something you (or someone) just ' +
      'said. Look at the recent transcript and clarify in 1-3 sentences.',
    formatHint: '1-3 sentence clarification',
  },
  Greeting: {
    system: 'You are Echo, a friendly AI copilot. Reply with a one-sentence friendly greeting.',
    formatHint: 'One sentence',
  },
  'Small Talk': {
    system:
      'You are Echo. The user is making small talk. Reply briefly (1-2 sentences), warmly, ' +
      'and steer back toward the session topic if appropriate.',
    formatHint: '1-2 sentence warm reply',
  },
  'Project Management': {
    system:
      'You are Echo, a project manager. Cover scope, schedule, dependencies, risks, and ' +
      'mitigations in ~150 words. Reference methodologies (Agile, Scrum, Kanban, SAFe) only ' +
      'when appropriate.',
    formatHint: 'Scope / Schedule / Risks',
  },
  Leadership: {
    system:
      'You are Echo, a leadership coach. Answer using concrete examples and actionable ' +
      'guidance in ~150 words. Avoid generic platitudes.',
    formatHint: 'Example-driven response',
  },
  Communication: {
    system:
      'You are Echo, a communication coach. Give 2-3 concrete suggestions to improve ' +
      'clarity, structure, or delivery of the message described.',
    formatHint: 'Suggestions list',
  },
};

export function getPromptTemplate(category: QuestionCategory): PromptTemplate {
  return CATEGORY_TEMPLATES[category] ?? FALLBACK_TEMPLATE;
}

/**
 * Session-type opening directive. Sent to the AI on every chat request as
 * part of the system prompt so it adopts the right persona from the first
 * message of the session (interview coach, meeting assistant, tutor, etc).
 *
 * Source of truth lives in @echo-gpt/shared-types (SESSION_TYPE_PROMPTS).
 * This module wraps it with desktop-specific helpers (initial SessionMode
 * seeds, PromptTemplate-shaped lookup with formatHint).
 */

export interface SessionTypeTemplate {
  system: string;
  /** Initial session mode seed handed to the question-detection engine so the
   *  classifier trusts the user's declaration on segment 1. */
  initialSessionMode: import('./types').SessionMode;
}

const SESSION_TYPE_SEEDS: Record<SessionType, SessionTypeTemplate> = {
  Interview: {
    system: SESSION_TYPE_PROMPTS.Interview,
    initialSessionMode: 'Interview',
  },
  Meeting: {
    system: SESSION_TYPE_PROMPTS.Meeting,
    initialSessionMode: 'Meeting',
  },
  Assessment: {
    system: SESSION_TYPE_PROMPTS.Assessment,
    initialSessionMode: 'Coding Assessment',
  },
  Presentation: {
    system: SESSION_TYPE_PROMPTS.Presentation,
    initialSessionMode: 'Presentation',
  },
  Brainstorming: {
    system: SESSION_TYPE_PROMPTS.Brainstorming,
    initialSessionMode: 'Brainstorming',
  },
  'Sales Call': {
    system: SESSION_TYPE_PROMPTS['Sales Call'],
    initialSessionMode: 'Sales Call',
  },
  'Customer Support': {
    system: SESSION_TYPE_PROMPTS['Customer Support'],
    initialSessionMode: 'Support Call',
  },
  Training: {
    system: SESSION_TYPE_PROMPTS.Training,
    initialSessionMode: 'Training',
  },
  General: {
    system: SESSION_TYPE_PROMPTS.General,
    initialSessionMode: 'Unknown',
  },
};

/** Get the opening role directive for a user-declared session type. */
export function getSessionTypePrompt(type: SessionType | undefined): PromptTemplate {
  return {
    system: type ? (SESSION_TYPE_PROMPTS[type] ?? SESSION_TYPE_PROMPTS.General) : SESSION_TYPE_PROMPTS.General,
    formatHint: 'Session-type opening directive',
  };
}

/** Get the initial SessionMode to seed the detection engine for this type. */
export function getSessionTypeSeed(type: SessionType | undefined): import('./types').SessionMode {
  if (!type) return 'Unknown';
  return SESSION_TYPE_SEEDS[type]?.initialSessionMode ?? 'Unknown';
}

/** Get the full template (system + initialSessionMode) for a SessionType. */
export function getSessionTypeTemplate(type: SessionType | undefined): SessionTypeTemplate {
  if (!type) return SESSION_TYPE_SEEDS.General;
  return SESSION_TYPE_SEEDS[type] ?? SESSION_TYPE_SEEDS.General;
}
