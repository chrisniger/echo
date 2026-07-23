import type { AiModel, ChatRequest, ChatResponse, ChatChunk } from '@echo-gpt/shared-types';
import type { AiProvider } from '../providers/index.js';

interface CircuitState {
  failures: number;
  lastFailureAt: number;
  isOpen: boolean;
}

interface LoadBalanceState {
  requestCount: number;
  lastUsedAt: number;
}

export class AiRouter {
  private providers: Map<string, AiProvider> = new Map();
  private circuitBreakers: Map<string, CircuitState> = new Map();
  private loadBalancers: Map<string, LoadBalanceState> = new Map();
  private readonly maxFailures = 3;
  private readonly cooldownMs = 30000;
  private loadBalanceMode: 'failover' | 'round-robin' | 'least-loaded' = 'failover';

  setLoadBalanceMode(mode: 'failover' | 'round-robin' | 'least-loaded'): void {
    this.loadBalanceMode = mode;
  }

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
    this.circuitBreakers.set(provider.name, {
      failures: 0,
      lastFailureAt: 0,
      isOpen: false,
    });
    this.loadBalancers.set(provider.name, {
      requestCount: 0,
      lastUsedAt: 0,
    });
  }

  private getAvailableForModel(model: AiModel): AiProvider[] {
    return Array.from(this.providers.values()).filter((p) => {
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
    });
  }

  getPreferredProvider(model: AiModel): AiProvider {
    const available = this.getAvailableForModel(model);

    if (available.length === 0) {
      throw new Error(`No available provider for model: ${model}`);
    }

    if (this.loadBalanceMode === 'failover') {
      return available.sort((a, b) => {
        const priority: Record<string, number> = {
          openai: 1,
          anthropic: 2,
          gemini: 3,
          deepseek: 4,
          dashscope: 5,
          openrouter: 6,
          ollama: 7,
        };
        return (priority[a.name] ?? 99) - (priority[b.name] ?? 99);
      })[0];
    }

    if (this.loadBalanceMode === 'round-robin') {
      const sorted = [...available].sort((a, b) => {
        const stateA = this.loadBalancers.get(a.name);
        const stateB = this.loadBalancers.get(b.name);
        return (stateA?.requestCount ?? 0) - (stateB?.requestCount ?? 0);
      });

      const chosen = sorted[0];
      this.incrementLoad(chosen.name);
      return chosen;
    }

    // least-loaded
    const sorted = [...available].sort((a, b) => {
      const stateA = this.loadBalancers.get(a.name);
      const stateB = this.loadBalancers.get(b.name);
      return (stateA?.requestCount ?? 0) - (stateB?.requestCount ?? 0);
    });

    const chosen = sorted[0];
    this.incrementLoad(chosen.name);
    return chosen;
  }

  private incrementLoad(providerName: string): void {
    const state = this.loadBalancers.get(providerName);
    if (state) {
      state.requestCount++;
      state.lastUsedAt = Date.now();
    }
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const primary = this.getPreferredProvider(request.model);
    const errors: Error[] = [];

    const providers = [
      primary,
      ...Array.from(this.providers.values()).filter((p) => p.name !== primary.name),
    ];

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
    const providers = [
      primary,
      ...Array.from(this.providers.values()).filter((p) => p.name !== primary.name),
    ];
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

  getLoadStats(): Record<string, { requestCount: number; failures: number; isOpen: boolean }> {
    const stats: Record<string, { requestCount: number; failures: number; isOpen: boolean }> = {};
    for (const [name] of this.providers) {
      const lb = this.loadBalancers.get(name);
      const cb = this.circuitBreakers.get(name);
      stats[name] = {
        requestCount: lb?.requestCount ?? 0,
        failures: cb?.failures ?? 0,
        isOpen: cb?.isOpen ?? false,
      };
    }
    return stats;
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
