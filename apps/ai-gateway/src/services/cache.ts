import { createHash } from 'crypto';
import type { ChatMessage } from '@echo-gpt/shared-types';

interface CacheEntry {
  messages: ChatMessage[];
  createdAt: number;
  hitCount: number;
}

export class PromptCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries = 100, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(systemPrompt: string, contextPayload: Record<string, unknown>): ChatMessage[] | null {
    const key = this.buildKey(systemPrompt, contextPayload);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hitCount++;
    return entry.messages;
  }

  set(
    systemPrompt: string,
    contextPayload: Record<string, unknown>,
    messages: ChatMessage[],
  ): void {
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const key = this.buildKey(systemPrompt, contextPayload);
    this.cache.set(key, {
      messages,
      createdAt: Date.now(),
      hitCount: 0,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { size: number; maxEntries: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      totalHits,
    };
  }

  private buildKey(systemPrompt: string, payload: Record<string, unknown>): string {
    const hash = createHash('sha256');
    hash.update(systemPrompt);
    hash.update(JSON.stringify(payload, Object.keys(payload).sort()));
    return hash.digest('hex');
  }

  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}
