import type { ChatMessage } from '@echo-gpt/shared-types';

export class TokenCounter {
  private readonly charsPerToken = 4;

  count(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  truncateToLimit(text: string, limit: number): string {
    const maxChars = limit * this.charsPerToken;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars);
  }

  countMessages(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.count(msg.content);
      total += 4;
    }
    return total;
  }

  truncateMessages(messages: ChatMessage[], limit: number): ChatMessage[] {
    const current = this.countMessages(messages);
    if (current <= limit) return messages;

    const result: ChatMessage[] = [];
    let total = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const tokens = this.count(msg.content) + 4;
      if (total + tokens > limit) {
        const remaining = limit - total;
        const remainingChars = remaining * this.charsPerToken;
        result.unshift({
          ...msg,
          content: msg.content.slice(-remainingChars),
        });
        break;
      }
      result.unshift(msg);
      total += tokens;
    }

    return result;
  }
}
