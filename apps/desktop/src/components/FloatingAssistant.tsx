import { useState, useRef, useCallback } from 'react';
import { Bot, Minus, Maximize2, X, MessageSquare, Subtitles } from 'lucide-react';
import { useSettingsStore } from '../stores/settings';
import { cn } from '../lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import AIAssistance from './AIAssistance';
import Transcript from './Transcript';
import type { TranscriptSegment } from '@echo-gpt/shared-types';

const mockSegments: TranscriptSegment[] = [
  {
    id: '1',
    sessionId: 'mock',
    speakerId: 'speaker-1',
    speakerLabel: 'Speaker 1',
    text: 'Let me explain the architecture of the system we are building.',
    confidence: 0.95,
    startTime: 0,
    endTime: 5,
    isEdited: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    sessionId: 'mock',
    speakerId: 'speaker-2',
    speakerLabel: 'Interviewer',
    text: 'That sounds great. How does the authentication flow work?',
    confidence: 0.82,
    startTime: 6,
    endTime: 12,
    isEdited: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    sessionId: 'mock',
    speakerId: 'speaker-1',
    speakerLabel: 'Speaker 1',
    text: 'We use JWT tokens with refresh rotation.',
    confidence: 0.65,
    startTime: 13,
    endTime: 17,
    isEdited: false,
    createdAt: new Date().toISOString(),
  },
];

interface FloatingAssistantProps {
  onClose: () => void;
}

export default function FloatingAssistant({ onClose }: FloatingAssistantProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const opacity = useSettingsStore((s) => s.settings.floatingAssistantOpacity);
  const dragRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={dragRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={cn(
        'fixed z-50 flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl transition-all',
        isMaximized ? 'inset-4' : 'right-4 bottom-4 w-96',
        isMinimized ? 'h-auto' : 'max-h-[600px]',
      )}
      style={{
        opacity,
        transform: position.x !== 0 || position.y !== 0
          ? `translate(${position.x}px, ${position.y}px)`
          : undefined,
      }}
    >
      <div
        className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <Bot className="h-5 w-5 text-indigo-500" />
        <span className="text-sm font-medium text-zinc-100 flex-1">Echo Assistant</span>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="rounded p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => setIsMaximized(!isMaximized)}
          className="rounded p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isMinimized && (
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="assistance" className="h-full flex flex-col">
            <div className="px-4 pt-2">
              <TabsList className="w-full">
                <TabsTrigger value="assistance" className="flex-1 gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Assistance
                </TabsTrigger>
                <TabsTrigger value="transcript" className="flex-1 gap-2">
                  <Subtitles className="h-4 w-4" />
                  Transcript
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="assistance" className="flex-1 flex flex-col mt-0 data-[state=active]:flex-1 overflow-hidden">
              <AIAssistance />
            </TabsContent>

            <TabsContent value="transcript" className="flex-1 overflow-y-auto mt-0 p-4 space-y-3">
              {mockSegments.map((seg) => (
                <Transcript key={seg.id} segment={seg} />
              ))}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
