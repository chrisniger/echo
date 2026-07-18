import { useState } from 'react';
import { Download, FileJson, FileText, FileCode, Subtitles, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import type { Session, TranscriptSegment, AiResponse } from '@echo-gpt/shared-types';

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
  session: Session;
  transcript?: TranscriptSegment[];
  aiResponses?: AiResponse[];
}

export default function SessionExport({ session, transcript = [], aiResponses = [] }: SessionExportProps) {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includes, setIncludes] = useState<Record<string, boolean>>(
    Object.fromEntries(includeOptions.map((opt) => [opt.key, opt.defaultEnabled])),
  );
  const [open, setOpen] = useState(false);

  const formatTimestamp = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const generateSrtContent = (): string => {
    if (!transcript || transcript.length === 0) {
      return 'No transcript available';
    }

    return transcript
      .map((segment, index) => {
        const startTime = formatTimestamp(segment.startTime);
        const endTime = formatTimestamp(segment.endTime);
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.speakerLabel}: ${segment.text}\n`;
      })
      .join('\n');
  };

  const generateTxtContent = (): string => {
    const sections: string[] = [];

    sections.push(`=== SESSION: ${session.name} ===\n`);
    sections.push(`Date: ${new Date(session.startedAt).toLocaleString()}\n`);
    sections.push(`Duration: ${session.duration} minutes\n`);
    sections.push(`Model: ${session.aiModel}\n`);

    if (includes.summary && session.summary) {
      sections.push('\n=== SUMMARY ===\n');
      sections.push(session.summary);
    }

    if (includes.transcript && transcript.length > 0) {
      sections.push('\n=== TRANSCRIPT ===\n');
      transcript.forEach((segment) => {
        sections.push(`[${segment.speakerLabel}] ${segment.text}\n`);
      });
    }

    if (includes.responses && aiResponses.length > 0) {
      sections.push('\n=== AI RESPONSES ===\n');
      aiResponses.forEach((response) => {
        sections.push(`Query: ${response.query}\n`);
        sections.push(`Response: ${response.response}\n`);
        sections.push(`Model: ${response.model}\n`);
        sections.push('---\n');
      });
    }

    return sections.join('\n');
  };

  const generateJsonContent = (): string => {
    const data: any = {
      session: {
        id: session.id,
        name: session.name,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        duration: session.duration,
        aiModel: session.aiModel,
        responseStyle: session.responseStyle,
        language: session.language,
      },
      exportedAt: new Date().toISOString(),
    };

    if (includes.summary && session.summary) {
      data.summary = session.summary;
    }

    if (includes.transcript && transcript.length > 0) {
      data.transcript = transcript.map((seg) => ({
        speaker: seg.speakerLabel,
        text: seg.text,
        startTime: seg.startTime,
        endTime: seg.endTime,
        confidence: seg.confidence,
      }));
    }

    if (includes.responses && aiResponses.length > 0) {
      data.aiResponses = aiResponses.map((resp) => ({
        query: resp.query,
        response: resp.response,
        model: resp.model,
        provider: resp.provider,
        tokensUsed: resp.tokensUsed,
        createdAt: resp.createdAt,
      }));
    }

    return JSON.stringify(data, null, 2);
  };

  const generatePdfContent = async (): Promise<Blob> => {
    // For PDF, we'll create an HTML document and convert it
    // In production, use a library like jsPDF or html2pdf
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${session.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #333; }
          .section { margin-bottom: 30px; }
          .transcript { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          .speaker { font-weight: bold; color: #667eea; }
        </style>
      </head>
      <body>
        <h1>${session.name}</h1>
        <p><strong>Date:</strong> ${new Date(session.startedAt).toLocaleString()}</p>
        <p><strong>Duration:</strong> ${session.duration} minutes</p>
        <p><strong>Model:</strong> ${session.aiModel}</p>
        
        ${includes.summary && session.summary ? `
          <div class="section">
            <h2>Summary</h2>
            <p>${session.summary}</p>
          </div>
        ` : ''}
        
        ${includes.transcript && transcript.length > 0 ? `
          <div class="section">
            <h2>Transcript</h2>
            <div class="transcript">
              ${transcript.map(seg => `<p><span class="speaker">${seg.speakerLabel}:</span> ${seg.text}</p>`).join('')}
            </div>
          </div>
        ` : ''}
        
        ${includes.responses && aiResponses.length > 0 ? `
          <div class="section">
            <h2>AI Responses</h2>
            ${aiResponses.map(resp => `
              <div style="margin-bottom: 20px;">
                <p><strong>Query:</strong> ${resp.query}</p>
                <p><strong>Response:</strong> ${resp.response}</p>
                <p><small>Model: ${resp.model} | Tokens: ${resp.tokensUsed}</small></p>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </body>
      </html>
    `;

    return new Blob([htmlContent], { type: 'text/html' });
  };

  const handleExport = async () => {
    let blob: Blob;
    let extension: string;
    let mimeType: string;

    switch (format) {
      case 'json':
        blob = new Blob([generateJsonContent()], { type: 'application/json' });
        extension = '.json';
        mimeType = 'application/json';
        break;
      case 'txt':
        blob = new Blob([generateTxtContent()], { type: 'text/plain' });
        extension = '.txt';
        mimeType = 'text/plain';
        break;
      case 'srt':
        blob = new Blob([generateSrtContent()], { type: 'text/plain' });
        extension = '.srt';
        mimeType = 'text/plain';
        break;
      case 'pdf':
        blob = await generatePdfContent();
        extension = '.html'; // Changed to .html since we're generating HTML
        mimeType = 'text/html';
        break;
      default:
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name.replace(/\s+/g, '_')}${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
