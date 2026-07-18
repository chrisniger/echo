import type { RuleHit, QuestionCategory } from './types';

/**
 * Layer 1 — Fast rule engine.
 *
 * Runs synchronously against a single segment. Returns the strongest
 * matching hit (or null). Designed to be <5 ms.
 *
 * The classic 5W1H, modals, imperatives — anything that almost always
 * implies a question/request.
 */

const STRONG_PREFIXES: Array<{ prefix: string; weight: number; category?: QuestionCategory }> = [
  // 5W1H + extended
  { prefix: 'what ', weight: 0.9, category: 'Technical' },
  { prefix: 'why ', weight: 0.92, category: 'Technical' },
  { prefix: 'how ', weight: 0.9, category: 'Technical' },
  { prefix: 'when ', weight: 0.88, category: 'General Discussion' },
  { prefix: 'where ', weight: 0.88, category: 'General Discussion' },
  { prefix: 'who ', weight: 0.85, category: 'General Discussion' },
  { prefix: 'which ', weight: 0.85 },
  { prefix: 'whose ', weight: 0.85 },
  { prefix: 'whom ', weight: 0.85 },

  // Modal questions
  { prefix: 'can you', weight: 0.88 },
  { prefix: 'could you', weight: 0.88 },
  { prefix: 'would you', weight: 0.88 },
  { prefix: 'will you', weight: 0.85 },
  { prefix: 'should we', weight: 0.88 },
  { prefix: 'should i', weight: 0.85 },
  { prefix: 'can we', weight: 0.85 },
  { prefix: 'could we', weight: 0.85 },
  { prefix: 'would we', weight: 0.85 },

  // Inversion patterns
  { prefix: 'are you', weight: 0.82 },
  { prefix: 'is it', weight: 0.82 },
  { prefix: 'is there', weight: 0.85 },
  { prefix: 'are there', weight: 0.85 },
  { prefix: 'was it', weight: 0.78 },
  { prefix: 'were you', weight: 0.78 },
  { prefix: 'do you', weight: 0.85 },
  { prefix: 'does it', weight: 0.82 },
  { prefix: 'did you', weight: 0.82 },
  { prefix: 'have you', weight: 0.82 },
  { prefix: 'has it', weight: 0.78 },
  { prefix: 'had it', weight: 0.72 },
  { prefix: 'do we', weight: 0.78 },
  { prefix: 'does that', weight: 0.78 },
  { prefix: 'did that', weight: 0.72 },

  // Imperative — strong request for explanation
  { prefix: 'tell me', weight: 0.9, category: 'Behavioral' },
  { prefix: 'explain ', weight: 0.92, category: 'Technical' },
  { prefix: 'describe ', weight: 0.9, category: 'Behavioral' },
  { prefix: 'walk me through', weight: 0.95, category: 'Behavioral' },
  { prefix: 'walk through', weight: 0.9, category: 'Behavioral' },
  { prefix: 'show me', weight: 0.88 },
  { prefix: 'teach me', weight: 0.88 },
  { prefix: 'help me', weight: 0.85 },
  { prefix: 'give me', weight: 0.82 },
  { prefix: 'name ', weight: 0.78 },
  { prefix: 'list ', weight: 0.78 },
  { prefix: 'outline ', weight: 0.85 },

  // Phrasal intros
  { prefix: 'i wonder', weight: 0.85 },
  { prefix: "i'd like to know", weight: 0.88 },
  { prefix: 'i want to know', weight: 0.85 },
  { prefix: 'i need to know', weight: 0.85 },
  { prefix: 'how about', weight: 0.85 },
  { prefix: 'what about', weight: 0.85 },
  { prefix: 'how come', weight: 0.82 },
  { prefix: 'what if', weight: 0.85 },
  { prefix: 'in your opinion', weight: 0.88 },
  { prefix: 'do you think', weight: 0.9 },
  { prefix: 'what do you', weight: 0.88 },
  { prefix: 'how do you', weight: 0.88 },
  { prefix: 'give me an example', weight: 0.92 },
  { prefix: 'give me some', weight: 0.82 },
  { prefix: 'tell us about', weight: 0.88 },
  { prefix: 'show us', weight: 0.85 },

  // Coding-specific imperatives
  { prefix: 'write a', weight: 0.88, category: 'Coding' },
  { prefix: 'implement a', weight: 0.92, category: 'Coding' },
  { prefix: 'design a', weight: 0.92, category: 'System Design' },
  { prefix: 'design an', weight: 0.92, category: 'System Design' },
  { prefix: 'refactor', weight: 0.88, category: 'Coding' },
  { prefix: 'optimize', weight: 0.85, category: 'Coding' },
  { prefix: 'debug', weight: 0.82, category: 'Coding' },
  { prefix: 'reverse', weight: 0.7, category: 'Coding' },
  { prefix: 'build a', weight: 0.85, category: 'Coding' },
  { prefix: 'create a', weight: 0.85, category: 'Coding' },
  { prefix: 'code a', weight: 0.88, category: 'Coding' },
  { prefix: 'solve ', weight: 0.78 },
];

const STRONG_PHRASES: Array<{ phrase: string; weight: number; category?: QuestionCategory }> = [
  // Top-level question phrases anywhere in text
  { phrase: 'walk me through', weight: 0.95, category: 'Behavioral' },
  { phrase: 'walk through', weight: 0.85, category: 'Behavioral' },
  { phrase: 'tell me about', weight: 0.9, category: 'Behavioral' },
  { phrase: 'tell me how', weight: 0.88, category: 'Technical' },
  { phrase: 'tell me why', weight: 0.88, category: 'Technical' },
  { phrase: 'tell me what', weight: 0.85 },
  { phrase: 'explain how', weight: 0.92, category: 'Technical' },
  { phrase: 'explain why', weight: 0.9, category: 'Technical' },
  { phrase: 'explain what', weight: 0.88, category: 'Technical' },
  { phrase: 'explain the', weight: 0.85, category: 'Technical' },
  { phrase: 'show me how', weight: 0.9, category: 'Technical' },
  { phrase: 'show me what', weight: 0.85 },
  { phrase: 'how do you', weight: 0.88 },
  { phrase: 'how can you', weight: 0.85 },
  { phrase: 'how would you', weight: 0.88 },
  { phrase: 'how should', weight: 0.82 },
  { phrase: 'what do you', weight: 0.85 },
  { phrase: 'what would you', weight: 0.85 },
  { phrase: 'what can you', weight: 0.82 },
  { phrase: 'what does', weight: 0.82 },
  { phrase: 'do you think', weight: 0.88 },
  { phrase: 'do you mean', weight: 0.82 },
  { phrase: 'are you sure', weight: 0.85 },
  { phrase: 'can you tell', weight: 0.88 },
  { phrase: 'could you tell', weight: 0.88 },
  { phrase: 'would you tell', weight: 0.85 },
  { phrase: 'give me an example', weight: 0.9 },
  { phrase: 'for example', weight: 0.55 }, // weak — often a statement
  { phrase: 'in your opinion', weight: 0.85 },
  { phrase: 'from your perspective', weight: 0.82 },
  { phrase: 'i wonder', weight: 0.82 },
  { phrase: "i'd like to know", weight: 0.85 },
  { phrase: 'i want to know', weight: 0.82 },
  { phrase: 'i need to know', weight: 0.82 },
  { phrase: 'how about', weight: 0.8 },
  { phrase: 'what about', weight: 0.8 },

  // System design / architecture triggers
  { phrase: 'how would you design', weight: 0.95, category: 'System Design' },
  { phrase: 'how would you scale', weight: 0.95, category: 'System Design' },
  { phrase: 'how would you build', weight: 0.92, category: 'System Design' },
  { phrase: 'design a system', weight: 0.95, category: 'System Design' },
  { phrase: 'design an api', weight: 0.92, category: 'System Design' },
  { phrase: 'architect', weight: 0.6, category: 'System Design' },

  // Coding triggers
  { phrase: 'write a function', weight: 0.95, category: 'Coding' },
  { phrase: 'write code', weight: 0.92, category: 'Coding' },
  { phrase: 'implement this', weight: 0.92, category: 'Coding' },
  { phrase: 'solve this', weight: 0.85 },
  { phrase: 'reverse a linked list', weight: 0.95, category: 'Coding' },
  { phrase: 'reverse this', weight: 0.88, category: 'Coding' },
  { phrase: 'big o of', weight: 0.85, category: 'Coding' },
  { phrase: 'time complexity', weight: 0.82, category: 'Coding' },
  { phrase: 'space complexity', weight: 0.82, category: 'Coding' },

  // SQL triggers
  { phrase: 'write a query', weight: 0.95, category: 'SQL' },
  { phrase: 'write sql', weight: 0.95, category: 'SQL' },
  { phrase: 'sql query', weight: 0.7, category: 'SQL' },
  { phrase: 'how would you query', weight: 0.92, category: 'SQL' },

  // DevOps / Cloud
  { phrase: 'how would you deploy', weight: 0.92, category: 'DevOps' },
  { phrase: 'ci/cd', weight: 0.5, category: 'DevOps' },
  { phrase: 'docker container', weight: 0.6, category: 'DevOps' },
  { phrase: 'kubernetes', weight: 0.5, category: 'DevOps' },

  // Behavioral
  { phrase: 'tell me about a time', weight: 0.95, category: 'Behavioral' },
  { phrase: 'tell me about yourself', weight: 0.95, category: 'Behavioral' },
  { phrase: 'greatest weakness', weight: 0.92, category: 'Behavioral' },
  { phrase: 'why should we hire', weight: 0.95, category: 'Behavioral' },
  { phrase: 'why do you want', weight: 0.9, category: 'Behavioral' },
  { phrase: 'where do you see', weight: 0.88, category: 'Behavioral' },
  { phrase: 'a time when you', weight: 0.85, category: 'Behavioral' },
  { phrase: 'tell me about yourself', weight: 0.95, category: 'Behavioral' },
];

const STRONG_TAGS: string[] = [
  'right?', 'yeah?', "isn't it?", "doesn't it?", "won't it?",
  'do you?', 'can you?', 'could you?', 'would you?',
  "aren't you?", "don't you?", "haven't you?",
];

/**
 * Returns the strongest matching rule hit, or null if no rule matched.
 */
export function fastRuleCheck(text: string): RuleHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Hard rule: ends with "?"
  if (trimmed.endsWith('?')) {
    return { layer: 'fast', rule: 'ends-with-?', weight: 0.95 };
  }

  const lower = trimmed.toLowerCase();

  // Strong prefix
  for (const { prefix, weight, category } of STRONG_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return {
        layer: 'fast',
        rule: `prefix:${prefix.trim()}`,
        weight,
        category,
        raw: prefix,
      };
    }
  }

  // Strong phrase anywhere
  for (const { phrase, weight, category } of STRONG_PHRASES) {
    if (lower.includes(phrase)) {
      return {
        layer: 'fast',
        rule: `phrase:${phrase}`,
        weight,
        category,
        raw: phrase,
      };
    }
  }

  // Suffix question tag
  for (const tag of STRONG_TAGS) {
    if (lower.endsWith(tag)) {
      return { layer: 'fast', rule: `tag:${tag}`, weight: 0.78, raw: tag };
    }
  }

  return null;
}
