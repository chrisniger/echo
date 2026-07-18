/**
 * Core types for Echo's Question Detection Engine.
 *
 * The engine runs every captured transcript segment through a multi-layer
 * pipeline and produces a single DetectionResult. The pipeline combines:
 *
 *   - Fast rule engine (Layer 1)
 *   - Interview pattern recognition (Layer 2, configurable)
 *   - Context memory (Layer 3, rolling window)
 *   - Semantic AI classifier (Layer 4, provider-independent)
 *
 * All results are logged and the engine only triggers an AI answer when the
 * final confidence exceeds the configured threshold.
 */

export type QuestionCategory =
  | 'Behavioral'
  | 'Technical'
  | 'Coding'
  | 'System Design'
  | 'SQL'
  | 'Architecture'
  | 'DevOps'
  | 'Cloud'
  | 'Security'
  | 'Networking'
  | 'Database'
  | 'Project Management'
  | 'Leadership'
  | 'Communication'
  | 'Meeting Action'
  | 'Meeting Discussion'
  | 'Meeting Summary Request'
  | 'Decision Request'
  | 'Brainstorming'
  | 'Presentation'
  | 'General Discussion'
  | 'Follow-up'
  | 'Clarification'
  | 'Greeting'
  | 'Small Talk'
  | 'Unknown';

export const QUESTION_CATEGORIES: readonly QuestionCategory[] = [
  'Behavioral', 'Technical', 'Coding', 'System Design', 'SQL', 'Architecture',
  'DevOps', 'Cloud', 'Security', 'Networking', 'Database', 'Project Management',
  'Leadership', 'Communication', 'Meeting Action', 'Meeting Discussion',
  'Meeting Summary Request', 'Decision Request', 'Brainstorming', 'Presentation',
  'General Discussion', 'Follow-up', 'Clarification', 'Greeting', 'Small Talk', 'Unknown',
] as const;

export type SessionMode =
  | 'Interview'
  | 'Technical Interview'
  | 'Behavioral Interview'
  | 'Coding Assessment'
  | 'System Design Interview'
  | 'Meeting'
  | 'Presentation'
  | 'Training'
  | 'Sales Call'
  | 'Support Call'
  | 'Consultation'
  | 'Brainstorming'
  | 'Code Review'
  | 'Architecture Review'
  | 'Unknown';

export const SESSION_MODES: readonly SessionMode[] = [
  'Interview', 'Technical Interview', 'Behavioral Interview', 'Coding Assessment',
  'System Design Interview', 'Meeting', 'Presentation', 'Training', 'Sales Call',
  'Support Call', 'Consultation', 'Brainstorming', 'Code Review',
  'Architecture Review', 'Unknown',
] as const;

export type DetectionLayer = 'fast' | 'pattern' | 'context' | 'classifier';

export interface RuleHit {
  layer: DetectionLayer;
  rule: string;
  weight: number;
  category?: QuestionCategory;
  raw?: string;
}

export interface ContextMemory {
  recentSegments: string[];
  recentDetections: Pick<DetectionResult, 'isQuestion' | 'category' | 'sessionMode'>[];
  sessionMode: SessionMode;
  topicHint?: string;
}

export interface ClassifierOutput {
  isQuestion: boolean;
  confidence: number;
  category: QuestionCategory;
  sessionMode: SessionMode;
  topic?: string;
  reasoning?: string;
}

export interface DetectionResult {
  segment: string;
  isQuestion: boolean;
  confidence: number;
  category: QuestionCategory;
  sessionMode: SessionMode;
  ruleHit?: RuleHit;
  classifier?: ClassifierOutput;
  matchedLayer?: DetectionLayer;
  processingTimeMs: number;
  timestamp: number;
}

export interface EngineConfig {
  enabled: boolean;
  threshold: number;
  responseDelayMs: number;
  contextWindowSize: number;
  enableFastRules: boolean;
  enablePatterns: boolean;
  enableContextMemory: boolean;
  enableClassifier: boolean;
  customPatterns: string[];
  classifierModel?: string;
  gatewayUrl: string;
  getAccessToken: () => string | null;
}
