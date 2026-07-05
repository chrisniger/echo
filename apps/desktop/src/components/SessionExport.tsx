import { useState } from 'react';
import { Download, FileJson, FileText, FileCode, Subtitles, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Switch } from './ui/switch';
import { Label } from './ui/label';

type ExportFormat = 'json' | 'pdf' | 'txt' | 'srt';

interface IncludeOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  defaultEnabled: boolean;
}

const formats: { value: ExportFormat; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'json', label: 'JSON', icon: <FileJson className="h-4 w-4" />, description: 'Machine-readable format' },
  { value: 'pdf', label: 'PDF', icon: <FileText className="h-4 w-4" />, description: 'Document format' },
  { value: 'txt', label: 'TXT', icon: <FileCode className="h-4 w-4" />, description: 'Plain text' },
  { value: 'srt', label: 'SRT', icon: <Subtitles className="h-4 w-4" />, description: 'Subtitle format for transcripts' },
];

const includeOptions: IncludeOption[] = [
  { key: 'transcript', label: 'Transcript', icon: <Subtitles className="h-4 w-4" />, defaultEnabled: true },
  { key: 'responses', label: 'AI Responses', icon: <FileCode className="h-4 w-4" />, defaultEnabled: true },
  { key: 'screenshots', label: 'Screenshots', icon: <FileText className="h-4 w-4" />, defaultEnabled: false },
  { key: 'summary', label: 'Summary', icon: <FileText className="h-4 w-4" />, defaultEnabled: true },
];

interface SessionExportProps {
  sessionName?: string;
  sessionData?: Record<string, unknown>;
}

export default function SessionExport({ sessionName = 'session-export' }: SessionExportProps) {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includes, setIncludes] = useState<Record<string, boolean>>(
    Object.fromEntries(includeOptions.map((opt) => [opt.key, opt.defaultEnabled])),
  );
  const [open, setOpen] = useState(false);

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      format,
      includes: Object.entries(includes)
        .filter(([, v]) => v)
        .map(([k]) => k),
      content: {
        session: sessionName,
        transcript: includes.transcript ? 'Session transcript content...' : undefined,
        responses: includes.responses ? 'AI responses...' : undefined,
        summary: includes.summary ? 'Session summary...' : undefined,
      },
    };

    let mimeType = 'application/json';
    let extension = '.json';
    let content = '';

    switch (format) {
      case 'json':
        content = JSON.stringify(data, null, 2);
        break;
      case 'txt':
        mimeType = 'text/plain';
        extension = '.txt';
        content = Object.entries(data.content)
          .filter(([, v]) => v)
          .map(([key, val]) => `=== ${key.toUpperCase()} ===\n${val}`)
          .join('\n\n');
        break;
      case 'pdf':
        mimeType = 'application/pdf';
        extension = '.pdf';
        content = 'PDF export placeholder - use server-side rendering for full PDF support.';
        break;
      case 'srt':
        mimeType = 'text/plain';
        extension = '.srt';
        content = '1\n00:00:00,000 --> 00:00:05,000\nSession transcript placeholder\n';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName.replace(/\s+/g, '_')}${extension}`;
    a.click();
    URL.revokeObjectURL(url);

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Session</DialogTitle>
          <DialogDescription>
            Choose format and content to include in the export
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {formats.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-3 text-left transition-colors',
                    format === f.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700',
                  )}
                >
                  <div className={cn(format === f.value ? 'text-indigo-500' : 'text-zinc-400')}>
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{f.label}</p>
                    <p className="text-xs text-zinc-500">{f.description}</p>
                  </div>
                  {format === f.value && (
                    <Check className="ml-auto h-4 w-4 text-indigo-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Include</Label>
            <div className="space-y-2">
              {includeOptions.map((opt) => (
                <div key={opt.key} className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">{opt.icon}</span>
                    <span className="text-sm text-zinc-300">{opt.label}</span>
                  </div>
                  <Switch
                    checked={includes[opt.key]}
                    onCheckedChange={(v) =>
                      setIncludes((prev) => ({ ...prev, [opt.key]: v }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
