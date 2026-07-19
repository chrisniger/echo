import { v4 as uuid } from 'uuid';
import type {
  ChatRequest,
  ChatResponse,
  ChatChunk,
  AiModel,
  ChatMessage,
} from '@echo-gpt/shared-types';
import { contentToString } from '@echo-gpt/shared-types';
import { BaseProvider } from './index.js';
import { config } from '../config.js';

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic' as const;
  readonly models: AiModel[] = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];

  private modelMap: Record<string, string> = {
    'claude-3-opus': 'claude-3-opus-20240229',
    'claude-3-sonnet': 'claude-3-sonnet-20240229',
    'claude-3-haiku': 'claude-3-haiku-20240307',
  };

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private toAnthropicMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
    return messages
      .filter((m: ChatMessage) => m.role !== 'system')
      .map((m: ChatMessage) => ({ role: m.role, content: contentToString(m.content) }));
  }

  async chat(request: ChatRequest, options?: { signal?: AbortSignal }): Promise<ChatResponse> {
    const start = Date.now();
    const systemMsg = request.messages.find((m: ChatMessage) => m.role === 'system');
    const messages = this.toAnthropicMessages(request.messages);

    const body: Record<string, unknown> = {
      model: this.modelMap[request.model] ?? request.model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: false,
    };
    if (systemMsg) body.system = contentToString(systemMsg.content);

    const response = await fetch(`${config.anthropic.baseUrl}/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    const data = (await response.json()) as {
      id: string;
      content: Array<{ text: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      id: data.id,
      model: request.model,
      provider: this.name,
      content: data.content.map((c: { text: string }) => c.text).join(''),
      finishReason: data.stop_reason ?? 'stop',
      tokensUsed: {
        prompt: data.usage?.input_tokens ?? 0,
        completion: data.usage?.output_tokens ?? 0,
        total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      latencyMs: Date.now() - start,
    };
  }

  async *chatStream(
    request: ChatRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<ChatChunk> {
    const systemMsg = request.messages.find((m: ChatMessage) => m.role === 'system');
    const messages = this.toAnthropicMessages(request.messages);

    const body: Record<string, unknown> = {
      model: this.modelMap[request.model] ?? request.model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };
    if (systemMsg) body.system = contentToString(systemMsg.content);

    const response = await fetch(`${config.anthropic.baseUrl}/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    const responseId = `anthropic_${uuid()}`;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data) as {
            type: string;
            delta?: { text?: string };
            content_block?: { text?: string };
            stop_reason?: string;
            message?: { usage?: { input_tokens: number; output_tokens: number } };
          };

          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield {
              id: responseId,
              model: request.model,
              provider: this.name,
              content: parsed.delta.text,
              finishReason: null,
              tokensUsed: null,
            };
          } else if (parsed.type === 'message_stop' && parsed.message?.usage) {
            yield {
              id: responseId,
              model: request.model,
              provider: this.name,
              content: '',
              finishReason: 'stop',
              tokensUsed: {
                prompt: parsed.message.usage.input_tokens,
                completion: parsed.message.usage.output_tokens,
                total: parsed.message.usage.input_tokens + parsed.message.usage.output_tokens,
              },
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
    const data = parsed as { type: string; delta?: { text?: string }; stop_reason?: string };
    if (data.type === 'content_block_delta' && data.delta?.text) {
      return { content: data.delta.text };
    }
    return null;
  }
}
