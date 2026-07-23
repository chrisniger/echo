import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from './gateway.js';

describe('gateway constants', () => {
  it('caps a single image part at exactly 4 MB', () => {
    // 4 MB raw is chosen so that the base64-encoded payload (~5.3 MB)
    // stays under the AI gateway's express.json({ limit: '10mb' })
    // body ceiling once surrounding context messages are subtracted.
    // Pinned here so refactors cannot silently drift the cap.
    expect(MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024);
  });

  it('exports a positive byte count', () => {
    // Defensive: catch accidental zeroing or negative literals.
    expect(MAX_IMAGE_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_IMAGE_BYTES)).toBe(true);
  });
});
