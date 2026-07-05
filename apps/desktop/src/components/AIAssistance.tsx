import { useState, useRef, useEffect } from 'react';
import { Send, StopCircle, Bot, User as UserIcon } from 'lucide-react';
import { useSettingsStore } from '../stores/settings';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const contextChips = [
  { label: 'CV', active: true },
  { label: 'Transcript', active: true },
  { label: 'Screenshot', active: false },
];

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

    setTimeout(() => {
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'This is a simulated response. The AI gateway integration will be connected in a future phase.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
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
        {messages.map((msg) => (
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
          {contextChips.map((chip) => (
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
