import { v4 as uuid } from 'uuid';
import type { ChatRequest, ChatResponse, ChatChunk, AiModel } from '@echo-gpt/shared-types';
import { BaseProvider } from './index.js';
import { config } from '../config.js';

const OPENROUTER_MODELS: AiModel[] = ['openrouter/auto'];

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter' as const;
  readonly models: AiModel[] = OPENROUTER_MODELS;

  protected getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${config.openrouter.apiKey}` };
  }

  async chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const start = Date.now();
    const response = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'HTTP-Referer': 'https://echo-gpt.app',
        'X-Title': 'Echo GPT',
      },
      body: JSON.stringify({
        model: this.resolveModel(request.model),
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${error}`);
    }

    const data = (await response.json()) as {
      id: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      id: data.id,
      model: request.model,
      provider: this.name,
      content: data.choices[0]?.message.content ?? '',
      finishReason: data.choices[0]?.finish_reason ?? 'stop',
      tokensUsed: {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
    };
  }

  async *chatStream(
    request: ChatRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<ChatChunk> {
    const response = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'HTTP-Referer': 'https://echo-gpt.app',
        'X-Title': 'Echo GPT',
      },
      body: JSON.stringify({
        model: this.resolveModel(request.model),
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: true,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    const responseId = `openrouter_${uuid()}`;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as {
            choices: Array<{
              delta: { content?: string };
              finish_reason: string | null;
            }>;
            usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
          };

          const choice = parsed.choices?.[0];
          yield {
            id: responseId,
            model: request.model,
            provider: this.name,
            content: choice?.delta?.content ?? '',
            finishReason: choice?.finish_reason ?? null,
            tokensUsed: parsed.usage
              ? {
                  prompt: parsed.usage.prompt_tokens,
                  completion: parsed.usage.completion_tokens,
                  total: parsed.usage.total_tokens,
                }
              : null,
          };
        } catch {}
      }

      if (options?.signal?.aborted) break;
    }
  }

  protected extractStreamContent(
    parsed: unknown,
  ): { content: string; finishReason?: string } | null {
    const data = parsed as {
      choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
    };
    const choice = data.choices?.[0];
    if (!choice) return null;
    return {
      content: choice.delta?.content ?? '',
      finishReason: choice.finish_reason,
    };
  }

  private resolveModel(model: AiModel): string {
    if (model === 'openrouter/auto') return 'auto';
    return model;
  }
}
