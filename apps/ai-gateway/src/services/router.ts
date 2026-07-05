import type { AiModel, ChatRequest, ChatResponse, ChatChunk } from '@echo-gpt/shared-types';
import { AiProvider } from '../providers/index.js';

interface CircuitState {
  failures: number;
  lastFailureAt: number;
  isOpen: boolean;
}

export class AiRouter {
  private providers: Map<string, AiProvider> = new Map();
  private circuitBreakers: Map<string, CircuitState> = new Map();
  private readonly maxFailures = 3;
  private readonly cooldownMs = 30000;

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
    this.circuitBreakers.set(provider.name, {
      failures: 0,
      lastFailureAt: 0,
      isOpen: false,
    });
  }

  getPreferredProvider(model: AiModel): AiProvider {
    const available = Array.from(this.providers.values())
      .filter((p) => {
        if (!p.models.includes(model)) return false;
        const cb = this.circuitBreakers.get(p.name);
        if (!cb) return true;
        if (cb.isOpen) {
          if (Date.now() - cb.lastFailureAt > this.cooldownMs) {
            cb.isOpen = false;
            cb.failures = 0;
            return true;
          }
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const priority: Record<string, number> = {
          openai: 1, anthropic: 2, gemini: 3, deepseek: 4, openrouter: 5, ollama: 6,
        };
        return (priority[a.name] ?? 99) - (priority[b.name] ?? 99);
      });

    if (available.length === 0) {
      throw new Error(`No available provider for model: ${model}`);
    }

    return available[0];
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const primary = this.getPreferredProvider(request.model);
    const errors: Error[] = [];

    const providers = [primary, ...Array.from(this.providers.values()).filter((p) => p.name !== primary.name)];

    for (const provider of providers) {
      if (!provider.models.includes(request.model)) continue;

      try {
        const response = await provider.chat(request, { signal });
        this.recordSuccess(provider.name);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);
        this.recordFailure(provider.name);
      }
    }

    throw new Error(`All providers failed. Last error: ${errors[errors.length - 1]?.message}`);
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
    const primary = this.getPreferredProvider(request.model);
    const providers = [primary, ...Array.from(this.providers.values()).filter((p) => p.name !== primary.name)];
    let lastError: Error | null = null;

    for (const provider of providers) {
      if (!provider.models.includes(request.model)) continue;

      try {
        const stream = provider.chatStream(request, { signal });
        for await (const chunk of stream) {
          yield chunk;
        }
        this.recordSuccess(provider.name);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.recordFailure(provider.name);
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  private recordSuccess(providerName: string): void {
    const cb = this.circuitBreakers.get(providerName);
    if (cb) {
      cb.failures = 0;
      cb.isOpen = false;
    }
  }

  private recordFailure(providerName: string): void {
    const cb = this.circuitBreakers.get(providerName);
    if (cb) {
      cb.failures++;
      cb.lastFailureAt = Date.now();
      if (cb.failures >= this.maxFailures) {
        cb.isOpen = true;
      }
    }
  }

  getAvailableModels(): Array<{ provider: string; models: string[] }> {
    return Array.from(this.providers.values()).map((p) => ({
      provider: p.name,
      models: p.models,
    }));
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const [name, provider] of this.providers) {
      try {
        result[name] = await provider.isAvailable();
      } catch {
        result[name] = false;
      }
    }
    return result;
  }
}
