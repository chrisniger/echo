import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, Loader2, AlertTriangle, Briefcase, Eye } from 'lucide-react';
import type { AudioSource, ResponseStyle, Language, SessionType } from '@echo-gpt/shared-types';
import { SESSION_TYPES } from '@echo-gpt/shared-types';
import { getProviderModelGroups } from '@echo-gpt/shared-config';
import { useSettingsStore } from '../stores/settings';
import { useSessionStore } from '../stores/session';
import { useCvStore } from '../stores/cv';
import { TRANSCRIPTION_INTERVAL_OPTIONS } from '../lib/transcriptionIntervals';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
} from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';

/**
 * Phase 4: the dropdown options come from the shared registry (`getProviderModelGroups`)
 * so the Phase 3 DashScope / Qwen-VL rows appear automatically and any future
 * union addition ripples into both this page and Settings without a parallel edit.
 * Every line below the `<SelectValue />` is now data-driven; we keep no local
 * model list. Cached at module load — the registry is a static const tree.
 */
const aiModelGroups = getProviderModelGroups();

const responseStyles: { value: ResponseStyle; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'creative', label: 'Creative' },
];

const audioSources: { value: AudioSource; label: string }[] = [
  { value: 'system', label: 'System Audio' },
  { value: 'microphone', label: 'Microphone' },
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

const sessionTypeDescriptions: Record<SessionType, string> = {
  Interview: 'Job interview coaching. STAR answers, code, system design on demand.',
  Meeting: 'In-meeting executive assistant. Decisions, summaries, action items.',
  Assessment: 'Live coding/technical assessment proctor. Correct, well-commented code.',
  Presentation: 'Presenter coaching. Structure, pacing, narrative arc.',
  Brainstorming: 'Creative partner. Distinct, non-obvious ideas with rationales.',
  'Sales Call': 'Real-time sales co-pilot. Discovery, objection handling, next steps.',
  'Customer Support': 'Support agent assistant. Troubleshooting, empathy, escalation.',
  Training: 'Tutor mode. Concepts from simple to complex with concrete examples.',
  General: 'Uncategorised live conversation. Adaptive to context.',
};

export default function NewSession() {
  const navigate = useNavigate();
  const defaultSettings = useSettingsStore((s) => s.settings);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const endSession = useSessionStore((s) => s.endSession);

  const [name, setName] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('Interview');
  const [context, setContext] = useState('');
  const [aiModel, setAiModel] = useState(defaultSettings.defaultAiModel);
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>(
    defaultSettings.defaultResponseStyle,
  );
  const [recordSession, setRecordSession] = useState(true);
  const [enableTranscript, setEnableTranscript] = useState(true);
  const [transcriptionIntervalMs, setTranscriptionIntervalMs] = useState(5000);
  const [audioSource, setAudioSource] = useState<AudioSource>(
    (defaultSettings.defaultAudioSource ?? 'system') as AudioSource,
  );
  const [language, setLanguage] = useState<Language>(defaultSettings.language as Language);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [additionalDocs, setAdditionalDocs] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeSessionGuard, setActiveSessionGuard] = useState<{
    name: string;
    id: string;
  } | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const cvList = useCvStore((s) => s.cvList);

  // Load the user's existing CVs so the Documents card can offer a
  // "select from library" option alongside the upload zone.
  useEffect(() => {
    void useCvStore.getState().fetchCvs();
  }, []);

  // Refresh sessions list on mount so we can detect an active session the
  // user may have started on another desktop window.
  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleActiveSessionFound = async () => {
    if (!activeSessionGuard) return;
    try {
      await endSession();
      setActiveSessionGuard(null);
    } catch (err) {
      console.error('[NewSession] Failed to end previous session:', err);
    }
  };

  const handleDismissGuard = () => {
    navigate('/history');
  };

  const handleCvDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.type.includes('text'))) {
      setCvFile(file);
      setSelectedCvId(null);
    }
  }, []);

  const handleCvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCvFile(file);
      setSelectedCvId(null);
    }
  };

  const handleExistingCvSelect = (cvId: string) => {
    setSelectedCvId(cvId);
    setCvFile(null);
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

    // Guard: if there's already an active session, force the user to end
    // it before creating a new one. (Only one session can be capturing
    // audio at a time — running two would fight over the same mic.)
    const active = useSessionStore.getState().currentSession;
    if (active && active.status === 'active') {
      setActiveSessionGuard({ name: active.name, id: active.id });
      return;
    }

    setIsLoading(true);

    try {
      // Upload CV (if any) → get cvId. The cloud-api parses the file and
      // stores raw_text in cv_library; we keep the id so the session row can
      // capture a snapshot of the CV content at creation time.
      //
      // We use the return value of uploadCv rather than reading `currentCv`
      // afterwards: a failed upload leaves a stale CV in the store, which
      // could otherwise disguise itself as a successful CV link for this
      // session.
      let cvId: string | undefined;
      let cvUploadError: string | null = null;
      if (cvFile) {
        const uploaded = await useCvStore.getState().uploadCv(cvFile);
        if (uploaded) {
          cvId = uploaded.id;
        } else {
          cvUploadError =
            'CV upload was rejected by the server. Check the file type (PDF / DOCX / TXT / Markdown) and size (≤10 MB).';
        }
      } else if (selectedCvId) {
        cvId = selectedCvId;
      }

      // Upload each additional document. We reuse /cv/upload because the
      // cloud-api already parses PDFs/DOCX/TXT into cv_library rows; we tag
      // each row's id as a documentId so the session captures them too.
      const documentIds: string[] = [];
      for (const doc of additionalDocs) {
        const uploaded = await useCvStore.getState().uploadCv(doc);
        if (uploaded?.id) documentIds.push(uploaded.id);
      }

      if (cvUploadError) {
        setError(cvUploadError);
        setIsLoading(false);
        return;
      }

      const session = await useSessionStore.getState().createSession({
        name: name.trim(),
        sessionType,
        aiModel,
        responseStyle,
        audioSource,
        language,
        recordSession,
        enableTranscript,
        transcriptionIntervalMs,
        context: context.trim() || undefined,
        cvId,
        documentIds: documentIds.length > 0 ? documentIds : undefined,
      });

      navigate(`/sessions/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-100">New Session</h1>

      {activeSessionGuard && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/10">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Another session is currently active
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  "<span className="text-zinc-200">{activeSessionGuard.name}</span>" is still
                  capturing audio. Only one session can run at a time, so please end it before
                  starting a new one.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleActiveSessionFound} disabled={isLoading}>
                {isLoading ? 'Ending…' : 'End current session'}
              </Button>
              <Button variant="outline" onClick={handleDismissGuard} disabled={isLoading}>
                Go to existing session
              </Button>
              <Button
                variant="ghost"
                onClick={() => setActiveSessionGuard(null)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <section className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Session Details
          </h2>
          <Input
            label="Session Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Technical Interview Prep"
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-indigo-400" />
                <Label>
                  Session Type <span className="text-red-400">*</span>
                </Label>
              </div>
              <p className="text-xs text-zinc-500">Tells the AI what to expect</p>
            </div>
            <p className="text-xs text-zinc-500 -mt-1">{sessionTypeDescriptions[sessionType]}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {SESSION_TYPES.map((t) => {
                const selected = sessionType === t;
                return (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors ${selected ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40' : 'border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-zinc-900/40'}`}
                  >
                    <input
                      type="radio"
                      name="sessionType"
                      value={t}
                      checked={selected}
                      onChange={() => setSessionType(t)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-500"
                      aria-label={t}
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium ${selected ? 'text-indigo-100' : 'text-zinc-100'}`}
                      >
                        {t}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Additional Context</Label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Provide any additional context for the AI..."
              className="flex min-h-[100px] w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Documents</h2>

          <div className="space-y-1.5">
            <Label>CV / Resume</Label>
            {cvList.length > 0 && (
              <div className="space-y-2">
                <Select
                  value={selectedCvId || 'upload-new'}
                  onValueChange={(value) =>
                    value === 'upload-new' ? setSelectedCvId(null) : handleExistingCvSelect(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upload-new">Upload a new CV / Resume</SelectItem>
                    {cvList.map((cv) => (
                      <SelectItem key={cv.id} value={cv.id}>
                        {cv.name} {cv.isDefault && '(default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500">
                  Choose an existing CV or upload a new one for this session.
                </p>
              </div>
            )}

            {(!selectedCvId || cvList.length === 0) && (
              <div
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                  isDragOver
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
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
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {cvFile.name}
                      </p>
                      <p className="text-xs text-zinc-500">{(cvFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCvFile(null);
                      }}
                      className="rounded-full p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-zinc-500" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Drop your CV here or click to browse
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">PDF, DOC, DOCX, TXT</p>
                  </>
                )}
              </div>
            )}

            {selectedCvId && (
              <div className="flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 truncate">
                  {cvList.find((cv) => cv.id === selectedCvId)?.name}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCvId(null)}
                  className="rounded-full p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Additional Documents</Label>
            <div
              className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
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
              <span className="text-sm text-zinc-500 dark:text-zinc-400">Add documents</span>
            </div>
            {additionalDocs.length > 0 && (
              <div className="space-y-2 mt-2">
                {additionalDocs.map((doc, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-2"
                  >
                    <FileText className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                    <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">
                      {doc.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDoc(i)}
                      className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            AI Configuration
          </h2>

          <div className="space-y-1.5">
            <Label>AI Model</Label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aiModelGroups.map((group) => (
                  <SelectGroup key={group.provider}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.models.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>{m.label}</span>
                          {m.vision && (
                            <Eye
                              className="h-3 w-3 text-indigo-400 dark:text-indigo-300"
                              aria-label="Vision-capable"
                            />
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Response Style</Label>
            <Select
              value={responseStyle}
              onValueChange={(v) => setResponseStyle(v as ResponseStyle)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {responseStyles.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Recording Settings
          </h2>

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
            <Label>Transcription Interval</Label>
            <Select
              value={String(transcriptionIntervalMs)}
              onValueChange={(v) => setTranscriptionIntervalMs(Number(v))}
              disabled={!recordSession || !enableTranscript}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSCRIPTION_INTERVAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-zinc-500">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">
              How often Echo checks the captured audio for transcript updates.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Audio Source</Label>
            <Select value={audioSource} onValueChange={(v) => setAudioSource(v as AudioSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audioSources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
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
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
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
