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
} from 'lucide-react';
import type { UserSettings } from '@echo-gpt/shared-types';
import { useSettingsStore } from '../stores/settings';
import { useAuthStore } from '../stores/auth';
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
  SelectItem,
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

const models = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus' },
];

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
      <h1 className="text-3xl font-bold text-zinc-100">Settings</h1>

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
              {models.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
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
            className="w-full h-2 rounded-full appearance-none bg-zinc-800 cursor-pointer accent-indigo-500"
          />
        </div>
      </Section>

      <Section title="Shortcuts" icon={<Keyboard className="h-5 w-5 text-emerald-500" />}>
        <div className="space-y-2">
          {Object.entries<string>(settings.globalShortcuts).map(([action, key]) => (
            <div
              key={action}
              className="flex items-center justify-between rounded-md bg-zinc-800 px-4 py-2"
            >
              <span className="text-sm text-zinc-300 capitalize">{action.replace(/-/g, ' ')}</span>
              <kbd className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 font-mono">
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

        <div className="border-t border-zinc-800 pt-4 mt-4">
          <p className="text-sm font-medium text-zinc-300 mb-4">Change Password</p>
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
        <DeviceManagement />
      </Section>
    </div>
  );
}
