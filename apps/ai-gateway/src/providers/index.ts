import type { ChatRequest, ChatResponse, ChatChunk, AiModel, AiProvider as ProviderName } from '@echo-gpt/shared-types';

export interface AiProvider {
  readonly name: ProviderName;
  readonly models: AiModel[];
  chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse>;
  chatStream(request: ChatRequest, options?: { signal?: AbortSignal }): AsyncGenerator<ChatChunk>;
  isAvailable(): Promise<boolean>;
}

export abstract class BaseProvider implements AiProvider {
  abstract readonly name: ProviderName;
  abstract readonly models: AiModel[];

  abstract chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse>;
  abstract chatStream(request: ChatRequest, options?: { signal?: AbortSignal }): AsyncGenerator<ChatChunk>;

  async isAvailable(): Promise<boolean> {
    try {
      await this.chat({
        model: this.models[0],
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
    };
  }

  protected abstract getAuthHeaders(): Record<string, string>;

  protected async parseSSE(
    response: Response,
    signal?: AbortSignal,
  ): Promise<{ content: string; finishReason: string }> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let finishReason = 'stop';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const extracted = this.extractStreamContent(parsed);
            if (extracted) {
              fullContent += extracted.content;
              if (extracted.finishReason) {
                finishReason = extracted.finishReason;
              }
            }
          } catch {}
        }
      }
      if (signal?.aborted) break;
    }

    return { content: fullContent, finishReason };
  }

  protected abstract extractStreamContent(parsed: unknown): {
    content: string;
    finishReason?: string;
  } | null;
}
