import { useState, useRef, useCallback } from 'react';
import { Bot, Minus, Maximize2, X, MessageSquare, Subtitles } from 'lucide-react';
import { useSettingsStore } from '../stores/settings';
import { useSessionStore } from '../stores/session';
import { cn } from '../lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import AIAssistance from './AIAssistance';
import Transcript from './Transcript';

interface FloatingAssistantProps {
  onClose: () => void;
}

export default function FloatingAssistant({ onClose }: FloatingAssistantProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const opacity = useSettingsStore((s) => s.settings.floatingAssistantOpacity);
  const transcript = useSessionStore((s) => s.transcript);
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
              {transcript.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Subtitles className="h-12 w-12 text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-500">No transcript yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Start a session to see the transcript</p>
                </div>
              ) : (
                transcript.map((seg) => (
                  <Transcript key={seg.id} segment={seg} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
