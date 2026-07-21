import type {
  RuleHit,
  ContextMemory,
  DetectionResult,
  QuestionCategory,
  SessionMode,
} from './types';

/**
 * Layer 3 — Context memory.
 *
 * Maintains a rolling window of recent transcript segments and their
 * detection outcomes. This is what lets us recognise follow-ups like
 * "Can you elaborate?" or "What do you mean?" as questions even though
 * they have no interrogative content on their own — they refer back to
 * the previous question.
 *
 * No network calls. <5 ms.
 */

const FOLLOWUP_PHRASES: string[] = [
  'elaborate',
  'elaborate on that',
  'elaborate on',
  'tell me more',
  'tell me more about',
  'go on',
  'continue',
  'and then',
  'what do you mean',
  'what do you mean by',
  'what does that mean',
  'how so',
  'why is that',
  'can you be more specific',
  'be more specific',
  'in what way',
  'how do you mean',
  'expand on',
  'expand on that',
  'elaborate further',
  'give me an example',
  'for instance',
  'like what',
  'such as',
  'why',
  'how come',
  'really',
  'interesting',
  'go deeper',
  'more detail',
  'can you explain further',
];

/**
 * Decide whether the current segment is a follow-up to a previous question.
 * Returns the rule hit if so.
 */
export function contextCheck(text: string, context: ContextMemory): RuleHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // We only treat a short segment as a follow-up if the previous detection
  // was a question. Otherwise the segment is just normal conversation.
  const previousWasQuestion = context.recentDetections.some((d) => d.isQuestion);
  if (!previousWasQuestion) return null;

  // Follow-up must be short — long segments are usually new content
  if (lower.length > 120) return null;

  for (const phrase of FOLLOWUP_PHRASES) {
    if (lower.includes(phrase)) {
      return {
        layer: 'context',
        rule: `followup:${phrase}`,
        weight: 0.7,
        category: 'Follow-up',
        raw: phrase,
      };
    }
  }

  // Very short fragments after a question are usually follow-ups too
  // e.g. "Why?" / "How so?" / "What about security?"
  if (lower.length <= 24) {
    if (/^(why|how|what|where|when|who|which)\b/.test(lower)) {
      return {
        layer: 'context',
        rule: 'followup:short-interrogative',
        weight: 0.65,
        category: 'Follow-up',
      };
    }
  }

  return null;
}

/**
 * Infer the current session mode from the rolling window of detection
 * outcomes. Each recent detection "votes" for a session mode based on the
 * categories observed. The most-voted mode wins; ties go to the first.
 */
export function inferSessionMode(
  context: ContextMemory,
  recentCategories: Array<QuestionCategory | undefined>,
): SessionMode {
  if (recentCategories.length === 0) return context.sessionMode;

  // Map categories to session-mode candidates with weights
  const modeScores = new Map<SessionMode, number>();
  const bump = (mode: SessionMode, n: number) => {
    modeScores.set(mode, (modeScores.get(mode) ?? 0) + n);
  };

  for (const cat of recentCategories) {
    if (!cat) continue;
    switch (cat) {
      case 'Behavioral':
        bump('Behavioral Interview', 1);
        bump('Interview', 0.5);
        break;
      case 'Coding':
        bump('Coding Assessment', 1);
        bump('Technical Interview', 0.4);
        break;
      case 'System Design':
      case 'Architecture':
        bump('System Design Interview', 1);
        bump('Technical Interview', 0.4);
        break;
      case 'Technical':
        bump('Technical Interview', 1);
        bump('Interview', 0.3);
        break;
      case 'Meeting Action':
      case 'Meeting Discussion':
      case 'Meeting Summary Request':
      case 'Decision Request':
        bump('Meeting', 1);
        break;
      case 'Brainstorming':
        bump('Brainstorming', 1);
        break;
      case 'Presentation':
        bump('Presentation', 1);
        break;
    }
  }

  if (modeScores.size === 0) return context.sessionMode;

  let best: SessionMode = context.sessionMode;
  let bestScore = -1;
  for (const [mode, score] of modeScores) {
    if (score > bestScore) {
      bestScore = score;
      best = mode;
    }
  }
  return best;
}
