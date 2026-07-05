import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import type { AudioSource, ResponseStyle, Language } from '@echo-gpt/shared-types';
import { useSettingsStore } from '../stores/settings';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';

const aiModels = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
];

const responseStyles: { value: ResponseStyle; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'creative', label: 'Creative' },
];

const audioSources: { value: AudioSource; label: string }[] = [
  { value: 'microphone', label: 'Microphone' },
  { value: 'system', label: 'System Audio' },
  { value: 'mixed', label: 'Mixed' },
];

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' },
];

export default function NewSession() {
  const navigate = useNavigate();
  const defaultSettings = useSettingsStore((s) => s.settings);

  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [aiModel, setAiModel] = useState(defaultSettings.defaultAiModel);
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>(defaultSettings.defaultResponseStyle);
  const [recordSession, setRecordSession] = useState(true);
  const [enableTranscript, setEnableTranscript] = useState(true);
  const [audioSource, setAudioSource] = useState<AudioSource>('microphone');
  const [language, setLanguage] = useState<Language>(defaultSettings.language as Language);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [additionalDocs, setAdditionalDocs] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const cvInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const handleCvDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.type.includes('text'))) {
      setCvFile(file);
    }
  }, []);

  const handleCvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCvFile(file);
  };

  const handleDocsSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAdditionalDocs((prev) => [...prev, ...files]);
  };

  const removeDoc = (index: number) => {
    setAdditionalDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Session name is required');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      navigate('/dashboard');
    }, 1500);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-8 text-3xl font-bold text-zinc-100">New Session</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Session Details</h2>
          <Input
            label="Session Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Technical Interview Prep"
          />
          <div className="space-y-1.5">
            <Label>Additional Context</Label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Provide any additional context for the AI..."
              className="flex min-h-[100px] w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Documents</h2>

          <div className="space-y-1.5">
            <Label>CV / Resume</Label>
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700 hover:border-zinc-600'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleCvDrop}
              onClick={() => cvInputRef.current?.click()}
            >
              <input
                ref={cvInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={handleCvSelect}
              />
              {cvFile ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{cvFile.name}</p>
                    <p className="text-xs text-zinc-500">{(cvFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCvFile(null); }}
                    className="rounded-full p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-8 w-8 text-zinc-500" />
                  <p className="text-sm text-zinc-400">Drop your CV here or click to browse</p>
                  <p className="mt-1 text-xs text-zinc-600">PDF, DOC, DOCX, TXT</p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Additional Documents</Label>
            <div
              className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-700 p-4 hover:border-zinc-600 transition-colors"
              onClick={() => docInputRef.current?.click()}
            >
              <input
                ref={docInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md"
                className="hidden"
                onChange={handleDocsSelect}
              />
              <Upload className="mr-2 h-5 w-5 text-zinc-500" />
              <span className="text-sm text-zinc-400">Add documents</span>
            </div>
            {additionalDocs.length > 0 && (
              <div className="space-y-2 mt-2">
                {additionalDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2">
                    <FileText className="h-4 w-4 text-zinc-400" />
                    <span className="flex-1 text-sm text-zinc-300 truncate">{doc.name}</span>
                    <button
                      type="button"
                      onClick={() => removeDoc(i)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">AI Configuration</h2>

          <div className="space-y-1.5">
            <Label>AI Model</Label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aiModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Response Style</Label>
            <Select value={responseStyle} onValueChange={(v) => setResponseStyle(v as ResponseStyle)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {responseStyles.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Recording Settings</h2>

          <div className="flex items-center justify-between">
            <div>
              <Label>Record Session</Label>
              <p className="text-xs text-zinc-500">Capture audio during the session</p>
            </div>
            <Switch checked={recordSession} onCheckedChange={setRecordSession} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Transcript</Label>
              <p className="text-xs text-zinc-500">Generate real-time transcripts</p>
            </div>
            <Switch checked={enableTranscript} onCheckedChange={setEnableTranscript} />
          </div>

          <div className="space-y-1.5">
            <Label>Audio Source</Label>
            <Select value={audioSource} onValueChange={(v) => setAudioSource(v as AudioSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audioSources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="flex gap-4">
          <Button type="submit" className="flex-1" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Starting...' : 'Start Session'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
