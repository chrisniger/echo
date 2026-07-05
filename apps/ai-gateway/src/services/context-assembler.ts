import type { ContextPayload, ChatMessage } from '@echo-gpt/shared-types';

const SYSTEM_PROMPT_BASE = 'You are Echo, an AI assistant for professional interviews, meetings, and coding assessments. You help users by providing real-time assistance during sessions. You are knowledgeable, concise, and professional.';

export class ContextAssembler {
  private readonly charsPerToken = 4;

  assemble(payload: ContextPayload, maxTokens: number = 8000): ChatMessage[] {
    const messages: ChatMessage[] = [];
    let totalChars = 0;

    const systemParts: string[] = [SYSTEM_PROMPT_BASE];

    if (payload.language && payload.language !== 'en') {
      const langNames: Record<string, string> = {
        es: 'Spanish', fr: 'French', de: 'German', zh: 'Chinese',
        ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ar: 'Arabic', ru: 'Russian',
      };
      systemParts.push(`Respond in ${langNames[payload.language] || payload.language}.`);
    }

    if (payload.customContext) {
      systemParts.push(`Additional context from user: ${payload.customContext}`);
    }

    const systemMsg = systemParts.join('\n\n');
    messages.push({ role: 'system', content: systemMsg });
    totalChars += systemMsg.length;

    if (payload.cv) {
      const cvSection = `\n[Candidate CV]:\n${payload.cv}`;
      const cvMsg: ChatMessage = { role: 'system', content: cvSection };
      messages.push(cvMsg);
      totalChars += cvSection.length;
    }

    if (payload.jobDescription) {
      const jdSection = `\n[Job Description]:\n${payload.jobDescription}`;
      const jdMsg: ChatMessage = { role: 'system', content: jdSection };
      messages.push(jdMsg);
      totalChars += jdSection.length;
    }

    if (payload.documents && payload.documents.length > 0) {
      const docsSection = payload.documents
        .map((d: { name: string; content: string }) => `[Document: ${d.name}]\n${d.content}`)
        .join('\n\n');
      const docsMsg: ChatMessage = { role: 'system', content: docsSection };
      messages.push(docsMsg);
      totalChars += docsSection.length;
    }

    if (payload.transcript && payload.transcript.length > 0) {
      const transcriptText = payload.transcript
        .map((t: { speaker: string; timestamp: number; text: string }) => `[${t.speaker} at ${this.formatTime(t.timestamp)}]: ${t.text}`)
        .join('\n');

      const maxTranscriptChars = Math.min(
        transcriptText.length,
        Math.max(0, (maxTokens * this.charsPerToken) - totalChars - 500),
      );

      const truncated = transcriptText.slice(-maxTranscriptChars);
      const transcriptMsg: ChatMessage = {
        role: 'user',
        content: `[Session Transcript]:\n${truncated}`,
      };
      messages.push(transcriptMsg);
      totalChars += truncated.length;
    }

    if (payload.conversationHistory && payload.conversationHistory.length > 0) {
      const history = payload.conversationHistory.slice(-10);
      for (const msg of history) {
        messages.push(msg);
        totalChars += msg.content.length;
      }
    }

    return messages;
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
