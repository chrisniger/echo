import { useState, useRef, useEffect } from 'react';
import { Send, StopCircle, Bot, User as UserIcon } from 'lucide-react';
import { useSettingsStore } from '../stores/settings';
import { useSessionStore } from '../stores/session';
import { gatewayApi } from '../lib/api';
import { buildContextMessages } from '../lib/context';
import { getWsClient } from '../hooks/useWebSocket';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type AssistSession = {
  cvContent?: string;
  documents?: Array<{ id?: string; name: string; content: string }>;
  additionalContext?: string;
} | null;

function buildContextChips(session: AssistSession): Array<{ label: string; active: boolean }> {
  const docs = session?.documents?.length ?? 0;
  return [
    { label: 'CV', active: !!session?.cvContent },
    { label: docs > 0 ? `Documents (${docs})` : 'Documents', active: docs > 0 },
    { label: 'Additional Context', active: !!session?.additionalContext },
    { label: 'Transcript', active: true },
  ];
}

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-zinc-800 rounded-md p-3 my-2 overflow-x-auto text-sm"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1.5 py-0.5 rounded text-sm">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>')
    .replace(/\n/g, '<br />');
}

export default function AIAssistance() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your Echo assistant. I can help answer questions based on the current session context.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settings = useSettingsStore((s) => s.settings);
  const { currentSession, transcript } = useSessionStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const session = currentSession;
      const conversationHistory = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // Build the baseline context (CV + documents + additionalContext) via
      // the Gateway's ContextAssembler so every AI call has a uniform system
      // prompt rooted in the candidate's CV and the user's instructions.
      const baseMessages = await buildContextMessages({
        cv: session?.cvContent,
        customContext: session?.additionalContext,
        documents: session?.documents,
        language: session?.language,
        sessionType: session?.sessionType,
      });

      console.log('[AIAssistance] Sending chat request to AI Gateway...');
      console.log('[AIAssistance] Model:', session?.aiModel || settings.defaultAiModel);
      console.log('[AIAssistance] Base context messages:', baseMessages.length);
      console.log('[AIAssistance] History:', conversationHistory.length);

      const response = await gatewayApi.post<{
        content: string;
        model: string;
        provider: string;
        tokensUsed: { prompt: number; completion: number; total: number };
      }>('/chat', {
        model: session?.aiModel || settings.defaultAiModel,
        messages: [
          ...baseMessages,
          ...conversationHistory,
          { role: 'user' as const, content: input.trim() },
        ],
        stream: false,
        temperature: 0.7,
        maxTokens: 2000,
        sessionId: session?.id,
      });

      console.log('[AIAssistance] Received response:', response);

      const responseId = crypto.randomUUID();
      const aiMessage: Message = {
        id: responseId,
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (currentSession) {
        useSessionStore.getState().addAiResponse({
          id: responseId,
          sessionId: currentSession.id,
          query: input.trim(),
          response: response.content,
          model: response.model,
          provider: response.provider,
          tokensUsed: response.tokensUsed.total,
          createdAt: new Date().toISOString(),
        });

        // Broadcast AI response to Companion via WebSocket
        const wsClient = getWsClient();
        wsClient.send({
          action: 'ai.response',
          data: {
            sessionId: currentSession.id,
            content: response.content,
            isFinal: true,
            finishReason: response.tokensUsed ? 'stop' : undefined,
            tokensUsed: response.tokensUsed,
            query: input.trim(),
            responseId,
          },
        });
      }
    } catch (error) {
      console.error('[AIAssistance] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = error instanceof Error && 'body' in error ? JSON.stringify((error as any).body) : '';

      const message: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}${errorDetails ? `\n\nDetails: ${errorDetails}` : ''}\n\nPlease ensure:\n1. The AI Gateway is running (cd apps/ai-gateway && npm run dev)\n2. Your DeepSeek API key is configured in apps/ai-gateway/.env\n3. The Cloud API is running (cd apps/cloud-api && npm run dev)`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {[...messages].reverse().map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-3',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                msg.role === 'user' ? 'bg-indigo-600' : 'bg-zinc-700',
              )}
            >
              {msg.role === 'user' ? (
                <UserIcon className="h-4 w-4 text-white" />
              ) : (
                <Bot className="h-4 w-4 text-indigo-400" />
              )}
            </div>
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-4 py-2',
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-300',
              )}
            >
              <div
                className="text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
              <p className="mt-1 text-xs opacity-50">
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700">
              <Bot className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="rounded-lg bg-zinc-800 px-4 py-2">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '0.1s' }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-800 p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          {buildContextChips(currentSession).map((chip) => (
            <span
              key={chip.label}
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                chip.active
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'bg-zinc-800 text-zinc-500',
              )}
            >
              {chip.label} {chip.active && '✓'}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Echo..."
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            rows={2}
            disabled={isLoading}
          />
          <div className="flex flex-col gap-1">
            {isLoading ? (
              <Button size="icon" variant="destructive" onClick={() => setIsLoading(false)}>
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-xs text-zinc-500">
              Better
              <br />
              Answer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
