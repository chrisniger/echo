import { useState } from 'react';
import { Edit3, Check, X } from 'lucide-react';
import type { TranscriptSegment } from '@echo-gpt/shared-types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const speakerColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500',
];

function getSpeakerColor(speakerId: string): string {
  let hash = 0;
  for (let i = 0; i < speakerId.length; i++) {
    hash = speakerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return speakerColors[Math.abs(hash) % speakerColors.length];
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'bg-emerald-500';
  if (confidence >= 0.7) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatTimestamp(startTime: number): string {
  const totalSeconds = Math.floor(startTime);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

interface TranscriptProps {
  segment: TranscriptSegment;
}

export default function Transcript({ segment }: TranscriptProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);

  const handleSave = () => {
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(segment.text);
    setIsEditing(false);
  };

  return (
    <div className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="mb-2 flex items-center gap-2">
        <div className={cn('h-2.5 w-2.5 rounded-full', getConfidenceColor(segment.confidence))} />
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white',
            getSpeakerColor(segment.speakerId),
          )}
        >
          {segment.speakerLabel}
        </span>
        <span className="text-xs text-zinc-500">{formatTimestamp(segment.startTime)}</span>
        {segment.isEdited && <span className="text-xs text-zinc-500 italic">(edited)</span>}
        <div className="flex-1" />
        {!isEditing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={() => setIsEditing(true)}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{segment.text}</p>
      )}
    </div>
  );
}
