import { useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Languages,
  Sparkles,
  Eye,
  Keyboard,
  Shield,
  User,
  Save,
  Plus,
  X,
  HelpCircle,
  Brain,
  Zap,
  GitBranch,
  ListTree,
  Layers,
} from 'lucide-react';
import type { UserSettings } from '@echo-gpt/shared-types';
// Shared-config model roster for the Default Model dropdown (Phase 4):
// data-driven so NewSession.tsx and Settings.tsx stay in lockstep, and the
// Phase 3 DashScope / Qwen-VL rows appear here without a parallel edit.
import { getProviderModelGroups } from '@echo-gpt/shared-config';
import { useSettingsStore } from '../stores/settings';
import { DEFAULT_QUESTION_TRIGGERS } from '../services/questionDetection';
import {
  DEFAULT_INTERVIEW_PATTERNS,
  type QuestionCategory,
  SESSION_MODES,
  type SessionMode,
} from '../services/intelligence';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
} from '../components/ui/select';
import { DeviceManagement } from '../components/DeviceManagement';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
];

/**
 * Phase 4: the Default Model dropdown is data-driven from the shared
 * registry so the Phase 3 DashScope / Qwen-VL rows appear automatically
 * and any future union addition ripples into both NewSession and Settings
 * without a parallel edit.
 */
const aiModelGroups = getProviderModelGroups();

const responseStyles = [
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'creative', label: 'Creative' },
];

const deletePolicies = [
  { value: 'never', label: 'Never' },
  { value: '30d', label: 'After 30 days' },
  { value: '60d', label: 'After 60 days' },
  { value: '90d', label: 'After 90 days' },
];

const recordingQualities = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export default function Settings() {
  const { settings, updateSetting } = useSettingsStore();
  const { user, updateProfile } = useAuthStore();

  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleThemeChange = (theme: UserSettings['theme']) => {
    updateSetting('theme', theme);
  };

  const handleProfileSave = async () => {
    await updateProfile({ name: profileName, email: profileEmail });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>

      <Section title="General" icon={<Sun className="h-5 w-5 text-amber-500" />}>
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <div className="flex gap-2">
            <Button
              variant={settings.theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleThemeChange('light')}
              className="gap-2"
            >
              <Sun className="h-4 w-4" />
              Light
            </Button>
            <Button
              variant={settings.theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleThemeChange('dark')}
              className="gap-2"
            >
              <Moon className="h-4 w-4" />
              Dark
            </Button>
            <Button
              variant={settings.theme === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleThemeChange('system')}
              className="gap-2"
            >
              <Monitor className="h-4 w-4" />
              System
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select value={settings.language} onValueChange={(v) => updateSetting('language', v)}>
            <SelectTrigger className="w-48">
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
      </Section>

      <Section title="AI" icon={<Sparkles className="h-5 w-5 text-indigo-500" />}>
        <div className="space-y-1.5">
          <Label>Default Model</Label>
          <Select
            value={settings.defaultAiModel}
            onValueChange={(v) => updateSetting('defaultAiModel', v)}
          >
            <SelectTrigger className="w-48">
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
          <Label>Default Audio Source</Label>
          <p className="text-xs text-zinc-500 -mt-1">
            Pre-selected in the New Session form. Can be overridden per session, and changed
            mid-session from the Capture tab.
          </p>
          <Select
            value={settings.defaultAudioSource ?? 'system'}
            onValueChange={(v) =>
              updateSetting('defaultAudioSource', v as UserSettings['defaultAudioSource'])
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System Audio (recommended)</SelectItem>
              <SelectItem value="microphone">Microphone</SelectItem>
              <SelectItem value="mixed">Mixed (Mic + System)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Default Response Style</Label>
          <Select
            value={settings.defaultResponseStyle}
            onValueChange={(v) =>
              updateSetting('defaultResponseStyle', v as UserSettings['defaultResponseStyle'])
            }
          >
            <SelectTrigger className="w-48">
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
      </Section>

      <Section title="Question Detection" icon={<Brain className="h-5 w-5 text-fuchsia-500" />}>
        <QuestionDetectionSettings />
      </Section>

      <Section title="Question Triggers" icon={<HelpCircle className="h-5 w-5 text-amber-500" />}>
        <QuestionTriggersEditor />
      </Section>

      <Section title="Assistant" icon={<Eye className="h-5 w-5 text-cyan-500" />}>
        <div className="space-y-1.5">
          <Label>Opacity: {Math.round(settings.floatingAssistantOpacity * 100)}%</Label>
          <input
            type="range"
            min="0.3"
            max="1.0"
            step="0.05"
            value={settings.floatingAssistantOpacity}
            onChange={(e) => updateSetting('floatingAssistantOpacity', parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none bg-zinc-100 dark:bg-zinc-800 cursor-pointer accent-indigo-500"
          />
        </div>
      </Section>

      <Section title="Shortcuts" icon={<Keyboard className="h-5 w-5 text-emerald-500" />}>
        <div className="space-y-2">
          {Object.entries<string>(settings.globalShortcuts).map(([action, key]) => (
            <div
              key={action}
              className="flex items-center justify-between rounded-md bg-zinc-100 dark:bg-zinc-800 px-4 py-2"
            >
              <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">
                {action.replace(/-/g, ' ')}
              </span>
              <kbd className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Privacy" icon={<Shield className="h-5 w-5 text-rose-500" />}>
        <div className="space-y-1.5">
          <Label>Auto-delete Policy</Label>
          <Select
            value={settings.autoDeletePolicy}
            onValueChange={(v) =>
              updateSetting('autoDeletePolicy', v as UserSettings['autoDeletePolicy'])
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deletePolicies.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Recording Quality</Label>
          <Select
            value={settings.recordingQuality}
            onValueChange={(v) =>
              updateSetting('recordingQuality', v as UserSettings['recordingQuality'])
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recordingQualities.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Speaker Diarization</Label>
            <p className="text-xs text-zinc-500">Identify different speakers</p>
          </div>
          <Switch
            checked={settings.enableSpeakerDiarization}
            onCheckedChange={(v) => updateSetting('enableSpeakerDiarization', v)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Auto Summaries</Label>
            <p className="text-xs text-zinc-500">Generate session summaries</p>
          </div>
          <Switch
            checked={settings.enableAutoSummaries}
            onCheckedChange={(v) => updateSetting('enableAutoSummaries', v)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Cloud Sync</Label>
            <p className="text-xs text-zinc-500">Sync data across devices</p>
          </div>
          <Switch
            checked={settings.enableCloudSync}
            onCheckedChange={(v) => updateSetting('enableCloudSync', v)}
          />
        </div>
      </Section>

      <Section title="Account" icon={<User className="h-5 w-5 text-blue-500" />}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
            />
          </div>
          <Button onClick={handleProfileSave} className="gap-2">
            <Save className="h-4 w-4" />
            Save Profile
          </Button>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
            Change Password
          </p>
          <div className="space-y-3">
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                label="Confirm Password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>
            <Button variant="secondary" className="gap-2">
              <Save className="h-4 w-4" />
              Update Password
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Devices" icon={<Monitor className="h-5 w-5 text-purple-500" />}>
        <div className="flex items-center justify-between">
          <div>
            <Label>Advertise on LAN (mDNS)</Label>
            <p className="text-xs text-zinc-500">
              Let companion apps auto-discover this desktop on the local network.
            </p>
          </div>
          <Switch
            checked={settings.enableMdnsAdvertisement}
            onCheckedChange={async (v) => {
              try {
                await api.post('/settings/mdns', { enabled: v });
                updateSetting('enableMdnsAdvertisement', v);
              } catch {
                useToastStore.getState().pushToast({
                  title: 'mDNS toggle failed',
                  description: 'Could not update LAN advertisement on the Cloud API.',
                  variant: 'warning',
                  durationMs: 5000,
                });
              }
            }}
          />
        </div>
        <DeviceManagement />
      </Section>
    </div>
  );
}

function QuestionTriggersEditor() {
  const { settings, updateSetting } = useSettingsStore();
  const phrases = settings.questionTriggerPhrases ?? DEFAULT_QUESTION_TRIGGERS;
  const [draft, setDraft] = useState('');

  const commit = (next: string[]) => {
    updateSetting('questionTriggerPhrases', next);
  };

  const addPhrase = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (phrases.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    commit([...phrases, trimmed]);
    setDraft('');
  };

  const removePhrase = (phrase: string) => {
    commit(phrases.filter((p) => p !== phrase));
  };

  const resetToDefaults = () => {
    commit([...DEFAULT_QUESTION_TRIGGERS]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Extra phrases (matched anywhere in a transcript segment) that should be treated as questions
        and forwarded to the AI. The built-in detector already recognises "what", "why", "how",
        "walk me through", "tell me about", "right?" and more — add anything specific to your
        interviews.
      </p>

      <div className="flex flex-wrap gap-2">
        {phrases.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300 border border-amber-500/30"
          >
            {p}
            <button
              type="button"
              onClick={() => removePhrase(p)}
              className="ml-1 text-amber-300/70 hover:text-amber-200"
              aria-label={`Remove ${p}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {phrases.length === 0 && (
          <span className="text-xs text-zinc-500 italic">
            No custom phrases — only the built-in patterns apply.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addPhrase();
            }
          }}
          placeholder='e.g. "i was wondering"'
          className="flex h-10 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <Button type="button" onClick={addPhrase} className="gap-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
        <Button type="button" variant="ghost" onClick={resetToDefaults}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function QuestionDetectionSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const qd = settings.questionDetection ?? {
    enabled: true,
    threshold: 0.7,
    responseDelayMs: 0,
    cooldownMs: 15000,
    contextWindowSize: 30,
    enableFastRules: true,
    enablePatterns: true,
    enableContextMemory: true,
    enableClassifier: false,
    questionPatterns: [],
    classifierModel: undefined,
  };

  const set = <K extends keyof typeof qd>(key: K, value: (typeof qd)[K]) => {
    updateSetting('questionDetection', { ...qd, [key]: value });
  };

  const addPattern = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const list = qd.questionPatterns ?? [];
    if (list.includes(trimmed)) return;
    set('questionPatterns', [...list, trimmed]);
  };

  const removePattern = (p: string) => {
    const list = (qd.questionPatterns ?? []).filter((x) => x !== p);
    set('questionPatterns', list);
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500">
        The detection engine runs every captured transcript segment through a four-layer pipeline
        and only triggers an AI answer when confidence exceeds the threshold.
      </p>

      <div className="flex items-center justify-between">
        <div>
          <Label className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-fuchsia-400" /> Enable AI Question Detection
          </Label>
          <p className="text-xs text-zinc-500">Master switch. Off = no auto-answer.</p>
        </div>
        <Switch checked={qd.enabled} onCheckedChange={(v) => set('enabled', v)} />
      </div>

      <div className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
        <div>
          <Label className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" /> Interview Mode Force-Send
          </Label>
          <p className="text-xs text-zinc-500">
            In Interview sessions, send every flushed utterance to the AI even when no question is
            detected.
          </p>
        </div>
        <Switch
          checked={settings.enableInterviewForceSend}
          onCheckedChange={(v) => updateSetting('enableInterviewForceSend', v)}
        />
      </div>

      <div className="space-y-2">
        <Label>Confidence Threshold: {Math.round(qd.threshold * 100)}%</Label>
        <input
          type="range"
          min="0.4"
          max="0.95"
          step="0.05"
          value={qd.threshold}
          onChange={(e) => set('threshold', parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none bg-zinc-100 dark:bg-zinc-800 cursor-pointer accent-fuchsia-500"
        />
        <p className="text-xs text-zinc-500">
          Segments below this confidence are ignored. Default 70% balances precision and recall.
        </p>
      </div>

      <div className="space-y-2">
        <Label>AI Cooldown: {((qd.cooldownMs ?? 15000) / 1000).toFixed(0)}s</Label>
        <input
          type="range"
          min="5000"
          max="60000"
          step="5000"
          value={qd.cooldownMs ?? 15000}
          onChange={(e) => set('cooldownMs', parseInt(e.target.value, 10))}
          className="w-full h-2 rounded-full appearance-none bg-zinc-100 dark:bg-zinc-800 cursor-pointer accent-fuchsia-500"
        />
        <p className="text-xs text-zinc-500">
          Minimum wait between AI responses. Default 15s prevents spam; shorter values feel more
          responsive but cost more tokens.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Context Window: {qd.contextWindowSize} segments</Label>
        <input
          type="range"
          min="8"
          max="60"
          step="1"
          value={qd.contextWindowSize}
          onChange={(e) => set('contextWindowSize', parseInt(e.target.value, 10))}
          className="w-full h-2 rounded-full appearance-none bg-zinc-100 dark:bg-zinc-800 cursor-pointer accent-fuchsia-500"
        />
        <p className="text-xs text-zinc-500">
          How many previous transcript segments the engine keeps in memory. Larger = better
          follow-up detection.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LayerToggle
          icon={<Zap className="h-4 w-4 text-emerald-400" />}
          title="Layer 1: Fast Rules"
          description="Instant 5W1H + modal + imperative matchers. ~1ms."
          checked={qd.enableFastRules}
          onChange={(v) => set('enableFastRules', v)}
        />
        <LayerToggle
          icon={<ListTree className="h-4 w-4 text-cyan-400" />}
          title="Layer 2: Pattern Recognition"
          description="Configurable interview / coding / system-design patterns."
          checked={qd.enablePatterns}
          onChange={(v) => set('enablePatterns', v)}
        />
        <LayerToggle
          icon={<GitBranch className="h-4 w-4 text-purple-400" />}
          title="Layer 3: Context Memory"
          description="Recognises follow-ups like 'elaborate' or 'tell me more'."
          checked={qd.enableContextMemory}
          onChange={(v) => set('enableContextMemory', v)}
        />
        <LayerToggle
          icon={<Brain className="h-4 w-4 text-fuchsia-400" />}
          title="Layer 4: AI Classifier"
          description="Calls the AI gateway to decide. +200-400ms per segment. Off by default to avoid surprise API spend."
          checked={qd.enableClassifier}
          onChange={(v) => set('enableClassifier', v)}
        />
      </div>

      {qd.enableClassifier && (
        <div className="space-y-2 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
          <Label>Classifier Model Override (optional)</Label>
          <Input
            value={qd.classifierModel ?? ''}
            onChange={(e) => set('classifierModel', e.target.value || undefined)}
            placeholder="e.g. llama-3.1-8b-instant (Groq) or gpt-4o-mini (OpenAI)"
          />
          <p className="text-xs text-zinc-500">
            Provider fallback is automatic: Groq → OpenAI → DeepSeek. Set this to force a specific
            model.
          </p>
        </div>
      )}

      {qd.enablePatterns && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" /> Custom Patterns
            <span className="text-xs font-normal text-zinc-500">
              ({DEFAULT_INTERVIEW_PATTERNS.length} built-in + your additions)
            </span>
          </Label>
          <p className="text-xs text-zinc-500">
            Add any phrase (lowercased) that should always be treated as a question trigger. Format:{' '}
            <code className="text-amber-300">category:Behavioral: tell me about a time</code> to
            attach a category hint, or just a bare phrase.
          </p>
          <div className="flex flex-wrap gap-2">
            {(qd.questionPatterns ?? []).map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300 border border-cyan-500/30"
              >
                {p}
                <button
                  type="button"
                  onClick={() => removePattern(p)}
                  className="ml-1 text-cyan-300/70 hover:text-cyan-200"
                  aria-label={`Remove ${p}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {qd.questionPatterns?.length === 0 && (
              <span className="text-xs text-zinc-500 italic">
                No custom patterns — only the built-in {DEFAULT_INTERVIEW_PATTERNS.length} apply.
              </span>
            )}
          </div>
          <PatternDraftInput onAdd={addPattern} />
        </div>
      )}
    </div>
  );
}

function LayerToggle({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {icon} {title}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function PatternDraftInput({ onAdd }: { onAdd: (raw: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (draft.trim()) {
              onAdd(draft.trim());
              setDraft('');
            }
          }
        }}
        placeholder='e.g. "walk me through" or "category:Technical: how does X work"'
        className="flex h-10 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      <Button
        type="button"
        onClick={() => {
          if (draft.trim()) {
            onAdd(draft.trim());
            setDraft('');
          }
        }}
        className="gap-1"
      >
        <Plus className="h-4 w-4" /> Add
      </Button>
    </div>
  );
}
