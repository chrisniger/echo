export * from './types';
export { fastRuleCheck } from './fastRules';
export { DEFAULT_INTERVIEW_PATTERNS, parseCustomPatterns, patternCheck } from './patterns';
export { contextCheck, inferSessionMode } from './contextMemory';
export { classifyWithAi, buildClassifierRequest } from './aiClassifier';
export {
  getPromptTemplate,
  getSessionTypePrompt,
  getSessionTypeSeed,
  getSessionTypeTemplate,
} from './promptRouter';
export { createQuestionDetectionEngine } from './engine';
export type { QuestionDetectionEngine, DetectLog } from './engine';

/**
 * User-facing defaults for the simpler "Question Triggers" feature that
 * still lives in the desktop Settings UI. Re-exported here so we have a
 * single source of truth.
 */
export const DEFAULT_QUESTION_TRIGGERS: string[] = [
  "i'm wondering about",
  'walk me through',
  'tell me about',
  'i was wondering',
  'curious about',
  'your thoughts on',
  'how would you',
  'what would you do',
  'talk to me about',
];
