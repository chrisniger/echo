import { v4 as uuid } from 'uuid';
import type { ChatRequest, ChatResponse, ChatChunk, AiModel, ChatMessage } from '@echo-gpt/shared-types';
import { BaseProvider } from './index.js';
import { config } from '../config.js';

export class OllamaProvider extends BaseProvider {
  readonly name = 'ollama' as const;
  readonly models: AiModel[] = ['ollama/llama3', 'ollama/mixtral'];

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  private toOllamaModel(model: AiModel): string {
    return model.replace('ollama/', '');
  }

  private toOllamaMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
    return messages.map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));
  }

  async chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const start = Date.now();
    const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.toOllamaModel(request.model),
        messages: this.toOllamaMessages(request.messages),
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 4096,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${error}`);
    }

    const data = await response.json() as {
      message: { content: string };
      done: boolean;
      total_duration?: number;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      id: `ollama_${uuid()}`,
      model: request.model,
      provider: this.name,
      content: data.message?.content ?? '',
      finishReason: data.done ? 'stop' : 'unknown',
      tokensUsed: {
        prompt: data.prompt_eval_count ?? 0,
        completion: data.eval_count ?? 0,
        total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      latencyMs: Date.now() - start,
    };
  }

  async *chatStream(request: ChatRequest, options?: { signal?: AbortSignal }): AsyncGenerator<ChatChunk> {
    const response = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.toOllamaModel(request.model),
        messages: this.toOllamaMessages(request.messages),
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 4096,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    const responseId = `ollama_${uuid()}`;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as {
            message?: { content: string };
            done: boolean;
            total_duration?: number;
            prompt_eval_count?: number;
            eval_count?: number;
          };

          yield {
            id: responseId,
            model: request.model,
            provider: this.name,
            content: parsed.message?.content ?? '',
            finishReason: parsed.done ? 'stop' : null,
            tokensUsed: parsed.done && parsed.eval_count ? {
              prompt: parsed.prompt_eval_count ?? 0,
              completion: parsed.eval_count ?? 0,
              total: (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0),
            } : null,
          };
        } catch {}
      }

      if (options?.signal?.aborted) break;
    }
  }

  protected extractStreamContent(parsed: unknown): { content: string; finishReason?: string } | null {
    const data = parsed as { message?: { content: string }; done?: boolean };
    if (!data.message?.content) return null;
    return { content: data.message.content, finishReason: data.done ? 'stop' : undefined };
  }
}
