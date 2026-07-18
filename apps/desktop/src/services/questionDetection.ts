/**
 * Backward-compatibility shim. The original `looksLikeQuestion` /
 * `questionRuleMatched` helpers were simple keyword matchers. They are
 * superseded by the multi-layer `intelligence` engine (Layer 1 fast rules
 * + Layer 2 patterns + Layer 3 context + Layer 4 AI classifier). This
 * shim re-exports the Layer-1 fast rules under the old names so any
 * older code that imports them keeps working, and exposes the same
 * default trigger phrases the Settings UI uses.
 */

import { fastRuleCheck } from './intelligence';
import { DEFAULT_QUESTION_TRIGGERS as _DEFAULT_QUESTION_TRIGGERS } from './intelligence';

export { DEFAULT_QUESTION_TRIGGERS } from './intelligence';
export { _DEFAULT_QUESTION_TRIGGERS as _DEFAULT_QUESTION_TRIGGERS };

/**
 * @deprecated Use the full engine via `services/intelligence`. Kept for
 * backward compatibility with any callers.
 */
export function looksLikeQuestion(text: string, extraPhrases: string[] = []): boolean {
  // Merge fast rule with custom phrases (anywhere-in-text)
  const lower = text.trim().toLowerCase();
  if (fastRuleCheck(text)) return true;
  for (const phrase of extraPhrases) {
    const p = phrase.trim().toLowerCase();
    if (p && lower.includes(p)) return true;
  }
  return false;
}

/**
 * @deprecated Use `engine.detect(text)` for richer information.
 */
export function questionRuleMatched(text: string, extraPhrases: string[] = []): string | null {
  const hit = fastRuleCheck(text);
  if (hit) return hit.rule;
  const lower = text.trim().toLowerCase();
  for (const phrase of extraPhrases) {
    const p = phrase.trim().toLowerCase();
    if (p && lower.includes(p)) return `custom:${p}`;
  }
  return null;
}
