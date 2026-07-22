import { useState, useRef, useCallback } from 'react';
import {
  ListChecks,
  Target,
  Clock,
  Sparkles,
  Plus,
  CheckCircle2,
  Circle,
  Timer,
  FileText,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';

interface AgendaItem {
  id: string;
  text: string;
  completed: boolean;
}

interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  completed: boolean;
  autoExtracted: boolean;
}

interface DecisionEntry {
  id: string;
  text: string;
  timestamp: number;
}

export default function MeetingMode() {
  const [agenda, setAgenda] = useState<AgendaItem[]>([
    { id: '1', text: 'Review project progress', completed: false },
    { id: '2', text: 'Discuss sprint goals', completed: false },
  ]);
  const [actions, setActions] = useState<ActionItem[]>([
    {
      id: 'a1',
      text: 'Update the API documentation',
      assignee: 'Alex',
      completed: false,
      autoExtracted: true,
    },
    { id: 'a2', text: 'Schedule follow-up meeting', completed: false, autoExtracted: true },
  ]);
  const [decisions, setDecisions] = useState<DecisionEntry[]>([
    { id: 'd1', text: 'Move to bi-weekly sprint reviews', timestamp: Date.now() - 300000 },
  ]);
  const [newAgenda, setNewAgenda] = useState('');
  const [newAction, setNewAction] = useState('');
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleAgenda = (id: string) => {
    setAgenda((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)),
    );
  };

  const toggleAction = (id: string) => {
    setActions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)),
    );
  };

  const addAgendaItem = () => {
    if (!newAgenda.trim()) return;
    setAgenda((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: newAgenda.trim(), completed: false },
    ]);
    setNewAgenda('');
  };

  const addActionItem = () => {
    if (!newAction.trim()) return;
    setActions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: newAction.trim(), completed: false, autoExtracted: false },
    ]);
    setNewAction('');
  };

  const startTimer = useCallback(() => {
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    setTimerRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setTimerSeconds(0);
  }, [stopTimer]);

  const formatTimer = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsGenerating(false);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-indigo-500" />
          Meeting Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            <span className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100">
              {formatTimer(timerSeconds)}
            </span>
          </div>
          <div className="flex gap-2">
            {!timerRunning ? (
              <Button size="sm" variant="secondary" onClick={startTimer}>
                <Clock className="mr-1 h-4 w-4" />
                Start
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={stopTimer}>
                <Clock className="mr-1 h-4 w-4" />
                Stop
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={resetTimer}>
              Reset
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Agenda</span>
          </div>
          <div className="space-y-1">
            {agenda.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleAgenda(item.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <span
                  className={cn(
                    'text-sm',
                    item.completed
                      ? 'text-zinc-500 line-through'
                      : 'text-zinc-700 dark:text-zinc-300',
                  )}
                >
                  {item.text}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newAgenda}
              onChange={(e) => setNewAgenda(e.target.value)}
              placeholder="Add agenda item..."
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addAgendaItem()}
            />
            <Button size="sm" variant="ghost" onClick={addAgendaItem}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Action Items
            </span>
          </div>
          <div className="space-y-1">
            {actions.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleAction(item.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <span
                  className={cn(
                    'flex-1 text-sm',
                    item.completed
                      ? 'text-zinc-500 line-through'
                      : 'text-zinc-700 dark:text-zinc-300',
                  )}
                >
                  {item.text}
                </span>
                {item.autoExtracted && (
                  <Badge variant="warning" className="text-xs">
                    Auto
                  </Badge>
                )}
                {item.assignee && <span className="text-xs text-zinc-500">@{item.assignee}</span>}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              placeholder="Add action item..."
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addActionItem()}
            />
            <Button size="sm" variant="ghost" onClick={addActionItem}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Decisions Log
            </span>
          </div>
          <div className="space-y-1">
            {decisions.length === 0 ? (
              <p className="text-sm text-zinc-500 px-3 py-2">No decisions recorded yet</p>
            ) : (
              decisions.map((d) => (
                <div key={d.id} className="flex items-start gap-2 rounded-md px-3 py-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{d.text}</p>
                    <p className="text-xs text-zinc-500">{formatTime(d.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleGenerateSummary} disabled={isGenerating} className="w-full gap-2">
          <Sparkles className="h-4 w-4" />
          {isGenerating ? 'Generating...' : 'Generate Summary'}
        </Button>
      </CardFooter>
    </Card>
  );
}
