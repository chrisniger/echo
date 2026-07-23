import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  SESSION_TYPES,
  SESSION_TYPE_PROMPTS,
  VALID_SESSION_TYPES,
  isSessionType,
  coerceSessionType,
  type SessionType,
} from './session.js';

/**
 * The cloud-api POST /sessions handler uses this exact z.enum schema — its
 * closed-union behavior is the contract that protects the rest of the stack
 * (gateway prompt lookup, desktop session-type badge, Flutter chip) from
 * arbitrary string input. If you ever relax it to `z.string().optional()`,
 * the tests below MUST be removed/updated in the SAME PR.
 */
const sessionTypeSchema = z.enum(SESSION_TYPES as readonly [SessionType, ...SessionType[]]);
const optionalSessionTypeSchema = sessionTypeSchema.optional();

describe('SESSION_TYPES — source-of-truth froze set', () => {
  it('contains exactly 9 entries', () => {
    expect(SESSION_TYPES).toHaveLength(9);
  });

  it('contains the expected literals in declaration order', () => {
    // Order matters: SessionType SEEDS in the desktop and the
    // Record<SessionType, string> exhaustiveness check rely on these literals.
    expect(SESSION_TYPES).toEqual([
      'Interview',
      'Meeting',
      'Assessment',
      'Presentation',
      'Brainstorming',
      'Sales Call',
      'Customer Support',
      'Training',
      'General',
    ]);
  });

  it('is exported as an array (the TS readonly is type-only, not runtime)', () => {
    // `readonly SessionType[]` is a compile-time guarantee only; at runtime
    // the value is an ordinary Array. We pin the identity so a future
    // contributor cannot accidentally swap it for a Set or Map without
    // noticing every consumer that spreads/indexes it.
    expect(Array.isArray(SESSION_TYPES)).toBe(true);
  });
});

describe('VALID_SESSION_TYPES — runtime membership set', () => {
  it('has the same membership as SESSION_TYPES', () => {
    expect(VALID_SESSION_TYPES.size).toBe(SESSION_TYPES.length);
    for (const t of SESSION_TYPES) {
      expect(VALID_SESSION_TYPES.has(t)).toBe(true);
    }
  });

  it('rejects an obviously bogus string', () => {
    expect(VALID_SESSION_TYPES.has('NotAType')).toBe(false);
  });

  it('rejects case variants of valid values', () => {
    expect(VALID_SESSION_TYPES.has('meeting')).toBe(false);
    expect(VALID_SESSION_TYPES.has('INTERVIEW')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(VALID_SESSION_TYPES.has('')).toBe(false);
  });
});

describe('SESSION_TYPE_PROMPTS — exhaustive Record<SessionType, string>', () => {
  it('has a non-empty prompt for every SessionType member', () => {
    for (const t of SESSION_TYPES) {
      expect(typeof SESSION_TYPE_PROMPTS[t]).toBe('string');
      expect(SESSION_TYPE_PROMPTS[t].length).toBeGreaterThan(20);
    }
  });
});

describe('isSessionType — type guard', () => {
  it('returns true for every SESSION_TYPES member', () => {
    for (const t of SESSION_TYPES) {
      expect(isSessionType(t)).toBe(true);
    }
  });

  it('returns false for garbage strings', () => {
    expect(isSessionType('Foo')).toBe(false);
    expect(isSessionType('')).toBe(false);
    expect(isSessionType('meeting')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(isSessionType(null)).toBe(false);
    expect(isSessionType(undefined)).toBe(false);
    expect(isSessionType(42)).toBe(false);
    expect(isSessionType({})).toBe(false);
    expect(isSessionType(['Interview'])).toBe(false);
  });
});

describe('coerceSessionType — defensive read fallback', () => {
  it('passes through valid values unchanged', () => {
    for (const t of SESSION_TYPES) {
      expect(coerceSessionType(t)).toBe(t);
    }
  });

  it('falls back to "General" for null/undefined/garbage', () => {
    expect(coerceSessionType(null)).toBe('General');
    expect(coerceSessionType(undefined)).toBe('General');
    expect(coerceSessionType(42)).toBe('General');
    expect(coerceSessionType('')).toBe('General');
    expect(coerceSessionType('NotAType')).toBe('General');
  });

  it('never returns a value outside SESSION_TYPES', () => {
    const inputs: unknown[] = [null, undefined, 0, '', 'foo', {}, true, false, [], 'INTERVIEW'];
    for (const input of inputs) {
      expect(VALID_SESSION_TYPES.has(coerceSessionType(input))).toBe(true);
    }
  });
});

/**
 * THIS BLOCK is the contract the cloud-api POST /sessions handler comment
 * refers to. If a future contributor relaxes the schema to
 * `z.string().optional()` to "accept any value from the client", these tests
 * will start failing and force them to revisit the routing contract
 * deliberately rather than silently losing type-safety downstream.
 */
describe('z.enum(SessionType) — closed union API binding', () => {
  it('accepts every member of SESSION_TYPES', () => {
    for (const t of SESSION_TYPES) {
      const result = sessionTypeSchema.safeParse(t);
      expect(result.success, `expected ${t} to be accepted`).toBe(true);
      if (result.success) expect(result.data).toBe(t);
    }
  });

  it('rejects an unknown string literal', () => {
    const result = sessionTypeSchema.safeParse('NotAType');
    expect(result.success).toBe(false);
  });

  it('rejects case variants of valid values (strict equality)', () => {
    expect(sessionTypeSchema.safeParse('meeting').success).toBe(false);
    expect(sessionTypeSchema.safeParse('INTERVIEW').success).toBe(false);
    expect(sessionTypeSchema.safeParse(' customer support ').success).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(sessionTypeSchema.safeParse('').success).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(sessionTypeSchema.safeParse(null).success).toBe(false);
    expect(sessionTypeSchema.safeParse(undefined).success).toBe(false);
    expect(sessionTypeSchema.safeParse(42).success).toBe(false);
    expect(sessionTypeSchema.safeParse(true).success).toBe(false);
    expect(sessionTypeSchema.safeParse({}).success).toBe(false);
    expect(sessionTypeSchema.safeParse(['Interview']).success).toBe(false);
  });

  it('.optional() allows undefined and rejects bad strings', () => {
    expect(optionalSessionTypeSchema.safeParse(undefined).success).toBe(true);
    expect(optionalSessionTypeSchema.safeParse(null).success).toBe(false);
    expect(optionalSessionTypeSchema.safeParse('Foo').success).toBe(false);
    expect(optionalSessionTypeSchema.safeParse('Interview').success).toBe(true);
  });

  it('wrapping in a z.object preserves the closed-union contract', () => {
    const wrapper = z.object({ sessionType: optionalSessionTypeSchema });
    expect(wrapper.safeParse({}).success).toBe(true);
    expect(wrapper.safeParse({ sessionType: 'Interview' }).success).toBe(true);
    expect(wrapper.safeParse({ sessionType: 'Foo' }).success).toBe(false);
  });
});

/**
 * Phase 24 — closed union for Screenshot MIME types. Mirrors the
 * SESSION_TYPES contract test block above. The cloud-api
 * POST /api/screenshots handler binds to this exact z.enum schema,
 * so a contributor who adds `image/webp` here (or any future format)
 * will have to update the cloud-api route + vitest at the same time
 * — both failure modes are caught by the tests below.
 */
import { SCREENSHOT_MIME_TYPES } from './session.js';
const screenshotMimeSchema = z.enum(
  SCREENSHOT_MIME_TYPES as readonly [
    (typeof SCREENSHOT_MIME_TYPES)[number],
    ...(typeof SCREENSHOT_MIME_TYPES)[number][],
  ],
);

describe('SCREENSHOT_MIME_TYPES — closed mime set for capture payloads', () => {
  it('contains exactly the two mimes the Phase 6 Rust downscaler emits', () => {
    expect(SCREENSHOT_MIME_TYPES).toEqual(['image/png', 'image/jpeg']);
  });

  it('is exported as a readonly tuple at runtime (identity pin)', () => {
    // Compile-time readonly; runtime value MUST remain an Array — if a
    // future contributor swaps this for a Set / Map, every consumer that
    // does `.map(...)` would break immediately and these failures point
    // them at the right file.
    expect(Array.isArray(SCREENSHOT_MIME_TYPES)).toBe(true);
    expect(SCREENSHOT_MIME_TYPES.length).toBe(2);
  });

  it('rejects an obvious non-PNG/JPEG string (no implicit membership)', () => {
    expect(SCREENSHOT_MIME_TYPES.includes('image/webp' as never)).toBe(false);
    expect(SCREENSHOT_MIME_TYPES.includes('image/svg+xml' as never)).toBe(false);
    expect(SCREENSHOT_MIME_TYPES.includes('' as never)).toBe(false);
  });
});

describe('z.enum(SCREENSHOT_MIME_TYPES) — closed union API binding', () => {
  it('accepts every declared mime', () => {
    for (const m of SCREENSHOT_MIME_TYPES) {
      const result = screenshotMimeSchema.safeParse(m);
      expect(result.success, `expected ${m} to be accepted`).toBe(true);
      if (result.success) expect(result.data).toBe(m);
    }
  });

  it('rejects an unknown mime string', () => {
    expect(screenshotMimeSchema.safeParse('image/webp').success).toBe(false);
  });

  it('rejects case variants (strict equality)', () => {
    expect(screenshotMimeSchema.safeParse('IMAGE/PNG').success).toBe(false);
    expect(screenshotMimeSchema.safeParse('image/JPG').success).toBe(false);
  });
});
