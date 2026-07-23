import { v4 as uuid } from 'uuid';
import type { ChatRequest, ChatResponse, ChatChunk, AiModel } from '@echo-gpt/shared-types';
import { BaseProvider } from './index.js';
import { config } from '../config.js';
import { buildGeminiParts } from '../services/multimodal.js';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini' as const;
  readonly models: AiModel[] = ['gemini-2.0-flash', 'gemini-2.0-pro'];

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  private getModelId(model: AiModel): string {
    const map: Record<string, string> = {
      'gemini-2.0-flash': 'gemini-2.0-flash',
      'gemini-2.0-pro': 'gemini-2.0-pro-exp-02-05',
    };
    return map[model] ?? model;
  }

  async chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const start = Date.now();
    const modelId = this.getModelId(request.model);
    const url = `${config.gemini.baseUrl}/models/${modelId}:generateContent?key=${config.gemini.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: buildGeminiParts(request.messages) }],
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 4096,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const candidate = data.candidates?.[0];
    return {
      id: `gemini_${uuid()}`,
      model: request.model,
      provider: this.name,
      content: candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      finishReason: candidate?.finishReason ?? 'stop',
      tokensUsed: {
        prompt: data.usageMetadata?.promptTokenCount ?? 0,
        completion: data.usageMetadata?.candidatesTokenCount ?? 0,
        total: data.usageMetadata?.totalTokenCount ?? 0,
      },
      latencyMs: Date.now() - start,
    };
  }

  async *chatStream(
    request: ChatRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<ChatChunk> {
    const modelId = this.getModelId(request.model);
    const url = `${config.gemini.baseUrl}/models/${modelId}:streamGenerateContent?key=${config.gemini.apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: buildGeminiParts(request.messages) }],
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 4096,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    const responseId = `gemini_${uuid()}`;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              finishReason?: string;
            }>;
          };

          const candidate = parsed.candidates?.[0];
          const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
          if (text) {
            yield {
              id: responseId,
              model: request.model,
              provider: this.name,
              content: text,
              finishReason: candidate?.finishReason ?? null,
              tokensUsed: null,
            };
          }
        } catch {}
      }

      if (options?.signal?.aborted) break;
    }
  }

  protected extractStreamContent(
    parsed: unknown,
  ): { content: string; finishReason?: string } | null {
    const data = parsed as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    };
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) return null;
    return { content: text, finishReason: candidate?.finishReason };
  }
}
