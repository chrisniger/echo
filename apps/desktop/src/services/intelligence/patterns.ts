import type { RuleHit, QuestionCategory } from './types';

/**
 * Layer 2 — Interview / meeting / coding pattern recognition.
 *
 * Unlike Layer 1, this layer is fully configurable: the pattern list lives
 * in UserSettings.questionPatterns and can be edited from the Settings UI
 * without touching source code.
 *
 * Each pattern is a lowercase phrase. We use simple substring matching
 * (anywhere in the segment). Patterns can optionally carry a category hint
 * via the structured format "category:Technical: walk me through" but the
 * default UI uses bare phrases.
 */

export const DEFAULT_INTERVIEW_PATTERNS: Array<{ phrase: string; weight: number; category?: QuestionCategory }> = [
  // Behavioral
  { phrase: 'tell me about a time', weight: 0.95, category: 'Behavioral' },
  { phrase: 'tell me about yourself', weight: 0.95, category: 'Behavioral' },
  { phrase: 'a time when you', weight: 0.9, category: 'Behavioral' },
  { phrase: 'a situation where', weight: 0.88, category: 'Behavioral' },
  { phrase: 'greatest strength', weight: 0.9, category: 'Behavioral' },
  { phrase: 'greatest weakness', weight: 0.9, category: 'Behavioral' },
  { phrase: 'why should we hire', weight: 0.92, category: 'Behavioral' },
  { phrase: 'why do you want', weight: 0.9, category: 'Behavioral' },
  { phrase: 'where do you see yourself', weight: 0.9, category: 'Behavioral' },
  { phrase: 'why are you leaving', weight: 0.88, category: 'Behavioral' },
  { phrase: 'describe a challenge', weight: 0.88, category: 'Behavioral' },
  { phrase: 'describe a conflict', weight: 0.88, category: 'Behavioral' },
  { phrase: 'tell me about a project', weight: 0.92, category: 'Behavioral' },
  { phrase: 'what motivates you', weight: 0.88, category: 'Behavioral' },

  // Technical
  { phrase: 'how does', weight: 0.55, category: 'Technical' },
  { phrase: 'what is the difference', weight: 0.88, category: 'Technical' },
  { phrase: 'compare', weight: 0.45, category: 'Technical' },
  { phrase: 'pros and cons', weight: 0.88, category: 'Technical' },
  { phrase: 'trade-offs', weight: 0.6, category: 'Technical' },
  { phrase: 'when would you use', weight: 0.85, category: 'Technical' },

  // System design
  { phrase: 'how would you design', weight: 0.95, category: 'System Design' },
  { phrase: 'design twitter', weight: 0.95, category: 'System Design' },
  { phrase: 'design url shortener', weight: 0.95, category: 'System Design' },
  { phrase: 'design netflix', weight: 0.95, category: 'System Design' },
  { phrase: 'design uber', weight: 0.95, category: 'System Design' },
  { phrase: 'design a scalable', weight: 0.95, category: 'System Design' },
  { phrase: 'design a distributed', weight: 0.95, category: 'System Design' },
  { phrase: 'high availability', weight: 0.5, category: 'System Design' },
  { phrase: 'load balancer', weight: 0.55, category: 'System Design' },
  { phrase: 'eventual consistency', weight: 0.7, category: 'System Design' },
  { phrase: 'consensus algorithm', weight: 0.78, category: 'System Design' },
  { phrase: 'message queue', weight: 0.55, category: 'System Design' },

  // Coding
  { phrase: 'reverse a linked list', weight: 0.95, category: 'Coding' },
  { phrase: 'reverse a string', weight: 0.92, category: 'Coding' },
  { phrase: 'fizz buzz', weight: 0.92, category: 'Coding' },
  { phrase: 'palindrome', weight: 0.5, category: 'Coding' },
  { phrase: 'binary tree', weight: 0.5, category: 'Coding' },
  { phrase: 'sort an array', weight: 0.85, category: 'Coding' },
  { phrase: 'find the duplicate', weight: 0.78, category: 'Coding' },
  { phrase: 'merge two sorted', weight: 0.85, category: 'Coding' },
  { phrase: 'two sum', weight: 0.85, category: 'Coding' },
  { phrase: 'big o', weight: 0.5, category: 'Coding' },
  { phrase: 'time complexity of', weight: 0.82, category: 'Coding' },
  { phrase: 'space complexity of', weight: 0.82, category: 'Coding' },
  { phrase: 'dynamic programming', weight: 0.5, category: 'Coding' },
  { phrase: 'recursion', weight: 0.45, category: 'Coding' },

  // SQL
  { phrase: 'second highest', weight: 0.85, category: 'SQL' },
  { phrase: 'find duplicates', weight: 0.7, category: 'SQL' },
  { phrase: 'join vs', weight: 0.55, category: 'SQL' },
  { phrase: 'normalization', weight: 0.55, category: 'SQL' },
  { phrase: 'indexing', weight: 0.5, category: 'SQL' },

  // Generic requests that demand a response
  { phrase: 'let\'s talk about', weight: 0.55 },
  { phrase: 'let\'s discuss', weight: 0.55 },
  { phrase: 'i want to hear', weight: 0.6 },
  { phrase: 'what are your thoughts', weight: 0.88 },
  { phrase: 'your thoughts on', weight: 0.85 },
  { phrase: 'what do you think about', weight: 0.88 },
  { phrase: 'opinion on', weight: 0.7 },
  { phrase: 'feedback on', weight: 0.55 },
  { phrase: 'can you give me', weight: 0.88 },
  { phrase: 'could you give me', weight: 0.88 },

  // Meeting
  { phrase: 'action item', weight: 0.6, category: 'Meeting Action' },
  { phrase: 'next step', weight: 0.45, category: 'Meeting Action' },
  { phrase: 'who owns', weight: 0.6, category: 'Meeting Action' },
  { phrase: 'what\'s the deadline', weight: 0.85, category: 'Meeting Action' },
  { phrase: 'by when', weight: 0.55, category: 'Meeting Action' },
  { phrase: 'can we agree on', weight: 0.7, category: 'Decision Request' },
  { phrase: 'are we aligned', weight: 0.7, category: 'Decision Request' },
  { phrase: 'decision on', weight: 0.55, category: 'Decision Request' },
];

/**
 * Parse a user-supplied patterns list. Each entry can be either:
 *   - A bare phrase:  "walk me through"
 *   - A structured entry:  "category:Technical: walk me through"
 */
export function parseCustomPatterns(
  raw: string[],
): Array<{ phrase: string; weight: number; category?: QuestionCategory }> {
  const out: Array<{ phrase: string; weight: number; category?: QuestionCategory }> = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const match = /^category:([A-Za-z][A-Za-z ]+):\s*(.+)$/.exec(trimmed);
    if (match) {
      const cat = match[1].trim() as QuestionCategory;
      out.push({ phrase: match[2].trim().toLowerCase(), weight: 0.82, category: cat });
    } else {
      out.push({ phrase: trimmed.toLowerCase(), weight: 0.82 });
    }
  }
  return out;
}

/**
 * Run the configured pattern list against a segment. Returns the strongest
 * matching hit, or null. Phrases that match but with very low base weight
 * (< 0.4) are filtered out — those are usually false positives.
 */
export function patternCheck(
  text: string,
  patterns: Array<{ phrase: string; weight: number; category?: QuestionCategory }>,
): RuleHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  let best: RuleHit | null = null;
  for (const { phrase, weight, category } of patterns) {
    if (weight < 0.4) continue;
    if (lower.includes(phrase)) {
      const hit: RuleHit = {
        layer: 'pattern',
        rule: `pattern:${phrase}`,
        weight,
        category,
        raw: phrase,
      };
      if (!best || hit.weight > best.weight) best = hit;
    }
  }
  return best;
}
