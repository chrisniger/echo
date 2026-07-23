import { v4 as uuid } from 'uuid';
import type { ChatRequest, ChatResponse, ChatChunk, AiModel } from '@echo-gpt/shared-types';
import { BaseProvider } from './index.js';
import { config } from '../config.js';

/**
 * DashScope (Alibaba Cloud) provider — OpenAI-compatible chat completions
 * endpoint at `https://dashscope.aliyuncs.com/compatible-mode/v1`.
 *
 * Why this looks almost identical to the OpenAI / DeepSeek / OpenRouter
 * providers: DashScope's compatible-mode emits the same SSE stream shape
 * and accepts the same `messages[].content` (string OR
 * `[{type:'text'| 'image_url', …}]` array) that OpenAI does. So no
 * per-vendor transform function is needed — `request.messages` is passed
 * through verbatim and `extractStreamContent` mirrors OpenAI.
 *
 * Auth: `Authorization: Bearer ${DASHSCOPE_API_KEY}`.
 *
 * Models in scope today: the six Qwen-VL / Qwen2.5-VL / Qwen3-VL variants
 * declared in `PROVIDER_DEFAULTS.dashscope.models` (see
 * `packages/shared-config/src/providers.ts`). The AiModel string is sent
 * to DashScope verbatim — no client-side ID translation.
 */
export class DashScopeProvider extends BaseProvider {
  readonly name = 'dashscope' as const;
  readonly models: AiModel[] = [
    'qwen-vl-max',
    'qwen-vl-plus',
    'qwen2.5-vl-72b-instruct',
    'qwen2.5-vl-7b-instruct',
    'qwen3-vl-235b-a22b-instruct',
    'qwen3-vl-plus',
  ];

  protected getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${config.dashscope.apiKey}` };
  }

  async chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const start = Date.now();
    const response = await fetch(`${config.dashscope.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DashScope API error ${response.status}: ${error}`);
    }

    const data = (await response.json()) as {
      id: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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
    const response = await fetch(`${config.dashscope.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: true,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DashScope API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    const responseId = `dashscope_${uuid()}`;

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
}
